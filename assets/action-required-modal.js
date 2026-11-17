/**
 * Role Rover - Action Required Disruptive Modal Engine
 * Intercepts the user when an employer requires missing input (DOB, PC specs,
 * video intro, typing test, etc.) so the candidate can act or drop.
 */

(function () {
    let currentUser = null;
    let currentProfile = null;
    let supabase = null;
    let blockedQueue = [];
    let isModalOpen = false;
    let activeJob = null;
    let selectedFile = null;

    const REDRIVE_WEBHOOK_URL = 'https://n8n.leadscompass.ai/webhook/redrive-application';

    // Requirements definition helper
    function classifyRequirement(job) {
        const reason = (job.failure_reason || '').toLowerCase();
        
        // 1. Date of Birth
        if (reason.includes('date of birth') || reason.includes('dob')) {
            return {
                type: 'dob',
                title: 'Date of Birth Required',
                description: 'This employer requires your Date of Birth to complete and submit your application.',
                inputType: 'date',
                fieldKey: 'date_of_birth',
                isPermanent: true,
                checkboxLabel: 'Save to my profile so future applications apply automatically'
            };
        }

        // 2. PC / Hardware Specs Screenshot
        if (reason.includes('computer specifications') || reason.includes('pc specs') || (reason.includes('screenshot') && (reason.includes('spec') || reason.includes('computer')))) {
            return {
                type: 'pc_specs',
                title: 'PC Specs Screenshot Required',
                description: 'This employer requires a screenshot of your PC / computer specifications (RAM, CPU, OS) to verify remote-readiness.',
                inputType: 'file',
                accept: 'image/png, image/jpeg, image/jpg, application/pdf',
                fieldKey: 'pc_specs_url',
                isPermanent: true,
                checkboxLabel: 'Save to my profile for future remote applications'
            };
        }

        // 3. Video Recording / Introduction
        if (reason.includes('video') || reason.includes('record a video') || reason.includes('video intro')) {
            return {
                type: 'video',
                title: 'Video Recording Required',
                description: 'This employer requires a short video introduction or video answer to submit your application.',
                inputType: 'video_or_link',
                accept: 'video/mp4, video/webm, video/quicktime',
                fieldKey: 'company_video_url',
                isPermanent: false,
                checkboxLabel: 'Also save as my default video introduction for other applications'
            };
        }

        // 4. Typing Test and/or Voice Sample URL (Dual or Single)
        const hasTyping = reason.includes('typing') || reason.includes('typingtest');
        const hasVoice = reason.includes('vocaroo') || reason.includes('voice') || reason.includes('audio');

        if (hasTyping && hasVoice) {
            return {
                type: 'typing_and_voice',
                title: 'Typing Test & Voice Intro Required',
                description: 'Catch Creation requires a 1-minute typing test link from https://www.typingtest.com and a short voice introduction link recorded via https://vocaroo.com/. Click the buttons below to open each site, complete them, and paste your links.',
                inputType: 'typing_and_voice',
                fieldKey: 'typing_and_voice',
                isPermanent: true,
                checkboxLabel: 'Save both to my profile so future applications apply automatically'
            };
        }

        if (hasTyping) {
            return {
                type: 'typing_test',
                title: 'Typing Test Result URL Required',
                description: 'This employer requires your 1-minute typing test score link (e.g. from TypingTest.com).',
                inputType: 'url',
                label: 'Typing Test Result URL',
                placeholder: 'https://www.typingtest.com/...',
                fieldKey: 'typing_test_url',
                isPermanent: true,
                checkboxLabel: 'Save to my profile for future applications'
            };
        }

        if (hasVoice) {
            return {
                type: 'voice_sample',
                title: 'Voice Sample / Intro URL Required',
                description: 'This employer requires a voice introduction link (e.g. recorded via Vocaroo.com).',
                inputType: 'url',
                label: 'Voice Intro Link (Vocaroo / Audio URL)',
                placeholder: 'https://vocaroo.com/...',
                fieldKey: 'default_voice_sample_url',
                isPermanent: true,
                checkboxLabel: 'Save to my profile for future applications'
            };
        }

        // 5. Generic screening question requirement or multi-item checklist
        const multiItems = parseRequirementItems(job.failure_reason);
        if (multiItems.length > 1) {
            return {
                type: 'multi_checklist',
                title: 'Screening Questions',
                description: 'The employer requires your answers to the following questions before submitting:',
                items: multiItems,
                inputType: 'checklist',
                fieldKey: 'screening_answers',
                isPermanent: false,
                checkboxLabel: 'Save my responses'
            };
        }

        if (multiItems.length === 1 && getQuestionType(multiItems[0]) === 'yes_no') {
            return {
                type: 'multi_checklist',
                title: 'Screening Question',
                description: 'The employer requires your confirmation on this question before submitting:',
                items: multiItems,
                inputType: 'checklist',
                fieldKey: 'screening_answers',
                isPermanent: false,
                checkboxLabel: 'Save my responses'
            };
        }

        return {
            type: 'generic',
            title: 'Additional Information Required',
            description: cleanTechnicalReason(job.failure_reason),
            inputType: 'text',
            placeholder: 'Enter your answer...',
            fieldKey: 'custom_answer',
            isPermanent: false,
            checkboxLabel: 'Save to my profile'
        };
    }

    function getQuestionType(text) {
        const t = (text || '').toLowerCase();
        if (t.includes('location') || t.includes('city') || t.includes('state') || t.includes('preferred branch') || t.includes('where are you') || t.includes('address') || t.includes('where do you live') || t.includes('country')) {
            return 'location';
        }
        if (t.includes('salary') || t.includes('compensation') || t.includes('pay expectation') || t.includes('notice period') || t.includes('how many years') || t.includes('current ctc') || t.includes('expected ctc')) {
            return 'text';
        }
        return 'yes_no';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function parseRequirementItems(rawReason) {
        if (!rawReason) return [];
        let clean = rawReason.replace(/rec-form_\w+/g, '').replace(/rec-easyresume_\w+/g, '');
        clean = clean.replace(/Field\(s\) rejected by the form:?/i, '');
        clean = clean.replace(/Pre-submit gate stopped the bot because required fields were still empty:?/i, '');
        clean = clean.replace(/Application not submitted -?/i, '');
        clean = clean.replace(/["“”]/g, '').trim();

        const ignoredPatterns = [
            /form stayed on screen/i,
            /no confirmation message/i,
            /validation error/i,
            /execution context/i,
            /target page/i,
            /browser.*closed/i,
            /aborting submit/i,
            /stopped the bot/i,
            /application not submitted/i,
            /candidate profile has no/i,
            /never fabricating or guessing/i
        ];

        // Split by semicolons, asterisks, or newlines
        let parts = clean.split(/;\s*|\n+/).map(p => p.trim()).filter(Boolean);
        return parts
            .map(p => p.replace(/^\*\s*/, '').replace(/^[•-]\s*/, '').trim())
            .filter(p => p.length > 2 && !ignoredPatterns.some(regex => regex.test(p)));
    }

    function urlify(text) {
        if (!text) return '';
        const urlPattern = /(https?:\/\/[^\s<>"']+)/g;
        return text.replace(urlPattern, (url) => {
            const clean = url.replace(/[.,;:)\]]+$/, '');
            return `<a href="${clean}" target="_blank" rel="noopener noreferrer" style="color: #0d9488; font-weight: 700; text-decoration: underline;">${clean} ↗</a>`;
        });
    }

    function cleanTechnicalReason(rawReason) {
        if (!rawReason) return 'This employer requires additional details before your application can be submitted.';
        // Strip DOM selectors, JSON, or stack traces
        let clean = rawReason.replace(/rec-form_\w+/g, '').replace(/rec-easyresume_\w+/g, '');
        clean = clean.replace(/Field\(s\) rejected by the form:?/i, '');
        clean = clean.replace(/Pre-submit gate stopped the bot because required fields were still empty:?/i, '');
        clean = clean.replace(/Application not submitted -/i, '');
        clean = clean.replace(/["“”]/g, '').trim();
        clean = clean.replace(/^\*\s*/, '');
        if (clean.length < 10) return 'This employer requires additional information to complete your application.';
        return `Employer requirement: ${clean}`;
    }

    // Check if an error should trigger the action modal
    function isActionableBlockedJob(job) {
        if (!job || job.status !== 'blocked') return false;
        if (job.blocked_user_label === 'Candidate declined requirement') return false;
        
        const r = (job.failure_reason || '').toLowerCase();
        // Ignore pure bot infra/technical errors (these auto-retry or are internal diagnostics, never candidate prompts)
        if (
            r.includes('no longer available') ||
            r.includes('captcha') ||
            r.includes('turnstile') ||
            r.includes('tunnel_connection_failed') ||
            r.includes('timeout') ||
            r.includes('form stayed on screen') ||
            r.includes('no confirmation message') ||
            r.includes('validation error') ||
            r.includes('execution context') ||
            r.includes('browser has been closed') ||
            r.includes('target page') ||
            r.includes('bot crashed') ||
            r.includes('locator.') ||
            r.includes('element not found') ||
            r.includes('security code email') ||
            r.includes('otp')
        ) {
            return false;
        }

        // Ignore historical false-positive blocks that were actually successful submissions or duplicate notices
        if (r.includes('success!') || r.includes('thanks for your application') || r.includes('thank you!.') || r.includes('someone from our team will reach out') || r.includes('duplicate application alert')) {
            return false;
        }

        return true;
    }

    function injectModalDOM() {
        if (document.getElementById('action-req-backdrop')) return;

        const container = document.createElement('div');
        container.id = 'action-req-backdrop';
        container.className = 'action-req-backdrop';
        container.innerHTML = `
            <div class="action-req-card" role="dialog" aria-modal="true">
                <div class="action-req-header">
                    <div class="action-req-meta-row">
                        <span class="action-req-badge">
                            <span class="action-req-badge-dot"></span>
                            Action Required
                        </span>
                        <span class="action-req-queue-pill" id="action-req-queue-pill">1 of 1</span>
                    </div>
                    <h2 class="action-req-job-title" id="action-req-job-title">Job Title</h2>
                    <div class="action-req-company" id="action-req-company">Company Name</div>
                </div>

                <div class="action-req-body">
                    <div class="action-req-prompt-box">
                        <div class="action-req-prompt-title" id="action-req-prompt-title">Requirement</div>
                        <p class="action-req-prompt-desc" id="action-req-prompt-desc">Description</p>
                    </div>

                    <div id="action-req-field-container"></div>

                    <label class="action-req-checkbox-row" id="action-req-checkbox-row">
                        <input type="checkbox" class="action-req-checkbox" id="action-req-checkbox" checked />
                        <span class="action-req-checkbox-label" id="action-req-checkbox-label">Save to my profile</span>
                    </label>
                </div>

                <div class="action-req-footer">
                    <button type="button" class="action-req-btn-submit" id="action-req-btn-submit">
                        <span id="action-req-submit-text">Submit & Re-Drive Application</span>
                    </button>
                    <button type="button" class="action-req-btn-skip" id="action-req-btn-skip">
                        I'm Not Willing — Skip & Drop Application
                    </button>
                </div>
            </div>
        `;

        if (document.body) {
            document.body.appendChild(container);
        } else {
            window.addEventListener('DOMContentLoaded', () => document.body.appendChild(container));
        }

        // Bind buttons
        const submitBtn = container.querySelector('#action-req-btn-submit');
        const skipBtn = container.querySelector('#action-req-btn-skip');
        if (submitBtn) submitBtn.addEventListener('click', onReDriveClicked);
        if (skipBtn) skipBtn.addEventListener('click', onSkipClicked);
    }

    function renderCurrentJob() {
        if (!blockedQueue.length) {
            closeModal();
            return;
        }

        activeJob = blockedQueue[0];
        selectedFile = null;
        const meta = classifyRequirement(activeJob);

        // Header
        document.getElementById('action-req-queue-pill').textContent = `${blockedQueue.length} ${blockedQueue.length === 1 ? 'Job' : 'Jobs'} Paused`;
        document.getElementById('action-req-job-title').textContent = activeJob.title || 'Role Application';
        document.getElementById('action-req-company').textContent = activeJob.companyName || 'Employer';
        document.getElementById('action-req-prompt-title').textContent = meta.title;

        // Checkbox
        const checkboxRow = document.getElementById('action-req-checkbox-row');
        const checkbox = document.getElementById('action-req-checkbox');
        const checkboxLabel = document.getElementById('action-req-checkbox-label');

        if (meta.type === 'multi_checklist') {
            document.getElementById('action-req-prompt-desc').innerHTML = `
                The employer requires your answers to <strong>${meta.items.length} required questions</strong> before submitting. Please review and confirm your responses below:
            `;
            if (checkboxRow) checkboxRow.style.display = 'none';
        } else {
            document.getElementById('action-req-prompt-desc').innerHTML = urlify(meta.description);
            if (checkboxRow) {
                checkboxRow.style.display = 'flex';
                checkboxLabel.textContent = meta.checkboxLabel;
                checkbox.checked = meta.isPermanent;
            }
        }

        // Render input widget
        const fieldContainer = document.getElementById('action-req-field-container');
        fieldContainer.innerHTML = '';

        if (meta.inputType === 'date') {
            const group = document.createElement('div');
            group.className = 'action-req-field-group';
            group.innerHTML = `
                <label class="action-req-label">Select Date of Birth</label>
                <input type="date" class="action-req-input" id="action-req-input-date" required />
            `;
            fieldContainer.appendChild(group);
        } else if (meta.inputType === 'file') {
            const group = document.createElement('div');
            group.className = 'action-req-field-group';
            group.innerHTML = `
                <label class="action-req-label">Upload File / Screenshot</label>
                <div class="action-req-dropzone" id="action-req-dropzone">
                    <span class="action-req-dropzone-icon">📎</span>
                    <div class="action-req-dropzone-text">Click to browse or drag file here</div>
                    <div class="action-req-dropzone-hint">PNG, JPG, or PDF (Max 15MB)</div>
                    <input type="file" id="action-req-file-hidden" accept="${meta.accept}" style="display: none;" />
                </div>
                <div class="action-req-file-preview" id="action-req-file-preview">
                    <span class="action-req-file-name" id="action-req-file-name">filename.png</span>
                    <button type="button" class="action-req-file-remove" id="action-req-file-remove">Remove</button>
                </div>
            `;
            fieldContainer.appendChild(group);
            bindDropzone(group.querySelector('#action-req-dropzone'), group.querySelector('#action-req-file-hidden'), meta.accept);
        } else if (meta.inputType === 'video_or_link') {
            const group = document.createElement('div');
            group.className = 'action-req-field-group';
            group.innerHTML = `
                <label class="action-req-label">Upload Video or Paste Link</label>
                <div class="action-req-dropzone" id="action-req-dropzone" style="margin-bottom: 0.85rem;">
                    <span class="action-req-dropzone-icon">🎥</span>
                    <div class="action-req-dropzone-text">Click to upload video file</div>
                    <div class="action-req-dropzone-hint">MP4, WEBM, MOV (Max 50MB)</div>
                    <input type="file" id="action-req-file-hidden" accept="${meta.accept}" style="display: none;" />
                </div>
                <div class="action-req-file-preview" id="action-req-file-preview" style="margin-bottom: 0.85rem;">
                    <span class="action-req-file-name" id="action-req-file-name">video.mp4</span>
                    <button type="button" class="action-req-file-remove" id="action-req-file-remove">Remove</button>
                </div>
                <label class="action-req-label">Or Paste Video URL (Loom, YouTube, Drive)</label>
                <input type="url" class="action-req-input" id="action-req-input-link" placeholder="https://www.loom.com/share/..." />
            `;
            fieldContainer.appendChild(group);
            bindDropzone(group.querySelector('#action-req-dropzone'), group.querySelector('#action-req-file-hidden'), meta.accept);
        } else if (meta.inputType === 'typing_and_voice') {
            const group = document.createElement('div');
            group.className = 'action-req-field-group';
            group.innerHTML = `
                <div style="margin-bottom: 1.25rem;">
                    <div style="background: rgba(13, 148, 136, 0.08); border: 1px solid rgba(13, 148, 136, 0.25); border-radius: 10px; padding: 0.6rem 0.85rem; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-size: 0.82rem; font-weight: 700; color: #0f172a;">1. Typing Test Result</span>
                        <a href="https://www.typingtest.com" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 0.25rem; background: #0d9488; color: #ffffff; padding: 0.35rem 0.75rem; border-radius: 8px; font-size: 0.78rem; font-weight: 700; text-decoration: none;">
                            Open TypingTest.com ↗
                        </a>
                    </div>
                    <input type="url" class="action-req-input" id="action-req-input-typing" placeholder="Paste your result link (e.g. https://www.typingtest.com/...)" required />
                </div>
                <div>
                    <div style="background: rgba(13, 148, 136, 0.08); border: 1px solid rgba(13, 148, 136, 0.25); border-radius: 10px; padding: 0.6rem 0.85rem; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-size: 0.82rem; font-weight: 700; color: #0f172a;">2. Voice Introduction</span>
                        <a href="https://vocaroo.com" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 0.25rem; background: #0d9488; color: #ffffff; padding: 0.35rem 0.75rem; border-radius: 8px; font-size: 0.78rem; font-weight: 700; text-decoration: none;">
                            Open Vocaroo.com ↗
                        </a>
                    </div>
                    <input type="url" class="action-req-input" id="action-req-input-voice" placeholder="Paste your voice note link (e.g. https://vocaroo.com/...)" required />
                </div>
            `;
            fieldContainer.appendChild(group);
        } else if (meta.inputType === 'url') {
            const group = document.createElement('div');
            group.className = 'action-req-field-group';
            group.innerHTML = `
                <label class="action-req-label">${meta.label || 'Enter Assessment / Voice URL'}</label>
                <input type="url" class="action-req-input" id="action-req-input-link" placeholder="${meta.placeholder}" required />
            `;
            fieldContainer.appendChild(group);
        } else if (meta.inputType === 'checklist') {
            const listGroup = document.createElement('div');
            listGroup.className = 'action-req-questions-list';

            const defaultCandidateLoc = (currentProfile && [currentProfile.city, currentProfile.state, currentProfile.country].filter(Boolean).join(', ')) || (currentProfile && currentProfile.target_location) || 'Ikeja, Lagos, Nigeria';

            meta.items.forEach((item, idx) => {
                const qType = getQuestionType(item);
                const qCard = document.createElement('div');
                qCard.className = 'action-req-question-card';
                qCard.dataset.idx = idx;
                qCard.dataset.question = item;
                qCard.dataset.type = qType;

                if (qType === 'yes_no') {
                    qCard.innerHTML = `
                        <div class="action-req-question-label">
                            <span class="action-req-req-star">*</span> ${escapeHtml(item)}
                        </div>
                        <div class="action-req-choice-group">
                            <button type="button" class="action-req-choice-btn active yes-btn" data-value="Yes">YES</button>
                            <button type="button" class="action-req-choice-btn no-btn" data-value="No">NO</button>
                        </div>
                    `;

                    const yesBtn = qCard.querySelector('.yes-btn');
                    const noBtn = qCard.querySelector('.no-btn');

                    yesBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        yesBtn.classList.add('active');
                        noBtn.classList.remove('active');
                    });
                    noBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        noBtn.classList.add('active');
                        yesBtn.classList.remove('active');
                    });
                } else if (qType === 'location') {
                    qCard.innerHTML = `
                        <div class="action-req-question-label">
                            <span class="action-req-req-star">*</span> ${escapeHtml(item)}
                        </div>
                        <input type="text" class="action-req-input action-req-question-location" value="${escapeHtml(defaultCandidateLoc)}" placeholder="e.g. Ikeja, Lagos, Nigeria" />
                    `;
                } else {
                    qCard.innerHTML = `
                        <div class="action-req-question-label">
                            <span class="action-req-req-star">*</span> ${escapeHtml(item)}
                        </div>
                        <input type="text" class="action-req-input action-req-question-text" placeholder="Enter your answer..." />
                    `;
                }

                listGroup.appendChild(qCard);
            });

            fieldContainer.appendChild(listGroup);
        } else {
            const group = document.createElement('div');
            group.className = 'action-req-field-group';
            group.innerHTML = `
                <label class="action-req-label">Your Response</label>
                <textarea class="action-req-input" id="action-req-input-text" rows="3" placeholder="${meta.placeholder}"></textarea>
            `;
            fieldContainer.appendChild(group);
        }

        // Open modal
        openModal();
    }

    function bindDropzone(dropzone, fileInput, accept) {
        if (!dropzone || !fileInput) return;

        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files.length) {
                handleFilePicked(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files.length) {
                handleFilePicked(fileInput.files[0]);
            }
        });
    }

    function handleFilePicked(file) {
        selectedFile = file;
        const preview = document.getElementById('action-req-file-preview');
        const fileNameEl = document.getElementById('action-req-file-name');
        const removeBtn = document.getElementById('action-req-file-remove');

        if (preview && fileNameEl) {
            fileNameEl.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
            preview.classList.add('active');
        }

        if (removeBtn) {
            removeBtn.onclick = () => {
                selectedFile = null;
                if (preview) preview.classList.remove('active');
                const fileInput = document.getElementById('action-req-file-hidden');
                if (fileInput) fileInput.value = '';
            };
        }
    }

    function openModal() {
        const backdrop = document.getElementById('action-req-backdrop');
        if (backdrop) {
            backdrop.classList.add('active');
            isModalOpen = true;
        }
    }

    function closeModal() {
        const backdrop = document.getElementById('action-req-backdrop');
        if (backdrop) {
            backdrop.classList.remove('active');
            isModalOpen = false;
            activeJob = null;
            selectedFile = null;
        }
    }

    async function onReDriveClicked() {
        if (!activeJob) return;
        const meta = classifyRequirement(activeJob);
        const submitBtn = document.getElementById('action-req-btn-submit');
        const submitText = document.getElementById('action-req-submit-text');
        const saveToProfile = document.getElementById('action-req-checkbox')?.checked ?? false;

        let valueProvided = null;

        // Gather value
        if (meta.inputType === 'date') {
            const input = document.getElementById('action-req-input-date');
            if (!input || !input.value) {
                alert('Please select your Date of Birth before submitting.');
                return;
            }
            valueProvided = input.value;
        } else if (meta.inputType === 'file') {
            if (!selectedFile) {
                alert('Please attach or drop the required screenshot file.');
                return;
            }
        } else if (meta.inputType === 'video_or_link') {
            const linkInput = document.getElementById('action-req-input-link');
            if (selectedFile) {
                // file picked
            } else if (linkInput && linkInput.value.trim()) {
                valueProvided = linkInput.value.trim();
            } else {
                alert('Please upload a video file or paste a video link.');
                return;
            }
        } else if (meta.inputType === 'typing_and_voice') {
            const typingInput = document.getElementById('action-req-input-typing');
            const voiceInput = document.getElementById('action-req-input-voice');
            const typingVal = typingInput ? typingInput.value.trim() : '';
            const voiceVal = voiceInput ? voiceInput.value.trim() : '';

            if (!typingVal) {
                alert('Please enter your Typing Test result link.');
                return;
            }
            if (!voiceVal) {
                alert('Please enter your Vocaroo voice introduction link.');
                return;
            }
            valueProvided = { typing_test_url: typingVal, vocaroo_url: voiceVal };
        } else if (meta.inputType === 'url') {
            const input = document.getElementById('action-req-input-link');
            if (!input || !input.value.trim()) {
                alert('Please enter the required link.');
                return;
            }
            valueProvided = input.value.trim();
        } else if (meta.inputType === 'checklist') {
            const questionCards = document.querySelectorAll('.action-req-question-card');
            const answersMap = {};
            const answersArray = [];

            questionCards.forEach(card => {
                const qText = card.dataset.question;
                const activeBtn = card.querySelector('.action-req-choice-btn.active');
                const locInput = card.querySelector('.action-req-question-location');
                const txtInput = card.querySelector('.action-req-question-text');

                let ans = 'Yes';
                if (activeBtn) {
                    ans = activeBtn.getAttribute('data-value') || 'Yes';
                } else if (locInput) {
                    ans = locInput.value.trim() || 'Ikeja, Lagos, Nigeria';
                } else if (txtInput) {
                    ans = txtInput.value.trim() || 'Yes';
                }

                answersMap[qText] = ans;
                answersArray.push({ question: qText, answer: ans });
            });

            valueProvided = {
                answers: answersMap,
                list: answersArray,
                summary: answersArray.map(a => `${a.question}: ${a.answer}`).join('; ')
            };
        } else {
            const input = document.getElementById('action-req-input-text');
            valueProvided = input ? input.value.trim() : '';
        }

        // Start loading
        submitBtn.disabled = true;
        submitText.textContent = selectedFile ? 'Uploading File...' : 'Submitting Application...';

        try {
            // Upload file if selected
            let uploadedUrl = null;
            if (selectedFile) {
                const cleanName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const filePath = `attachments/${currentUser.id}_${Date.now()}_${cleanName}`;
                const { data: uploadData, error: uploadErr } = await supabase.storage.from('resumes').upload(filePath, selectedFile, { upsert: true });
                if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

                const { data: urlData } = supabase.storage.from('resumes').getPublicUrl(filePath);
                uploadedUrl = urlData.publicUrl;
                valueProvided = uploadedUrl;
            }

            submitText.textContent = 'Updating Application...';

            // 1. Permanent save to profiles if applicable
            if (saveToProfile || meta.isPermanent) {
                const profileUpdate = {};
                if (meta.type === 'dob') profileUpdate.date_of_birth = valueProvided;
                if (meta.type === 'pc_specs') profileUpdate.pc_specs_url = valueProvided;
                if (meta.type === 'video') profileUpdate.default_intro_video_url = valueProvided;
                if (meta.type === 'typing_test') profileUpdate.typing_test_url = valueProvided;
                if (meta.type === 'voice_sample') profileUpdate.default_voice_sample_url = valueProvided;
                if (meta.type === 'typing_and_voice') {
                    profileUpdate.typing_test_url = valueProvided.typing_test_url;
                    profileUpdate.default_voice_sample_url = valueProvided.vocaroo_url;
                }

                if (Object.keys(profileUpdate).length > 0) {
                    await supabase.from('profiles').update(profileUpdate).eq('id', currentUser.id);
                }
            }

            // 2. Temporal save to job_applications
            const currentAttachments = activeJob.attachments || {};
            let updatedAttachments = { ...currentAttachments };
            if (meta.type === 'typing_and_voice') {
                updatedAttachments.typing_test_url = valueProvided.typing_test_url;
                updatedAttachments.vocaroo_url = valueProvided.vocaroo_url;
            } else if (meta.type === 'multi_checklist') {
                updatedAttachments.screening_answers = valueProvided.answers;
                updatedAttachments.screening_summary = valueProvided.summary;
                updatedAttachments.screening_list = valueProvided.list;
            } else {
                updatedAttachments[meta.fieldKey] = valueProvided;
            }

            await supabase.from('job_applications').update({
                attachments: updatedAttachments,
                status: 'In Queue',
                failure_reason: null
            }).eq('id', activeJob.id);

            // 3. Trigger Re-Drive via direct Supabase RPC
            submitText.textContent = 'Re-Driving Application...';
            try {
                const { data: rpcRes, error: rpcErr } = await supabase.rpc('redrive_application', { p_application_id: activeJob.id });
                if (rpcErr) {
                    console.warn('[ActionModal] RPC redrive warning:', rpcErr);
                } else {
                    console.log('[ActionModal] RPC redrive success:', rpcRes);
                }
            } catch (rpcErr) {
                console.warn('[ActionModal] RPC redrive exception:', rpcErr);
            }

            // Advance queue
            blockedQueue.shift();
            renderCurrentJob();
        } catch (err) {
            console.error('Error during re-drive submission:', err);
            alert(`Could not submit application: ${err.message}`);
        } finally {
            submitBtn.disabled = false;
            submitText.textContent = 'Submit & Re-Drive Application';
        }
    }

    async function onSkipClicked() {
        if (!activeJob) return;

        const confirmSkip = confirm(`Are you sure you want to drop this application for "${activeJob.companyName}"?\n\nThis will withdraw this application and you will not be charged any credit.`);
        if (!confirmSkip) return;

        const skipBtn = document.getElementById('action-req-btn-skip');
        skipBtn.disabled = true;

        try {
            await supabase.from('job_applications').update({
                status: 'rejected',
                failure_reason: 'Application dropped by candidate: unwilling to provide required item.'
            }).eq('id', activeJob.id);

            // Advance queue
            blockedQueue.shift();
            renderCurrentJob();
        } catch (err) {
            console.error('Failed to skip application:', err);
            alert('Could not drop application. Please try again.');
        } finally {
            skipBtn.disabled = false;
        }
    }

    // Public Initializer
    window.initActionRequiredModal = async function (user, profile, client) {
        if (!user || !client) return;

        currentUser = user;
        currentProfile = profile;
        supabase = client;

        injectModalDOM();

        // 1. Initial query for any existing blocked jobs needing candidate action
        try {
            const { data: jobs, error } = await supabase
                .from('job_applications')
                .select('*')
                .eq('user_id', user.id)
                .eq('status', 'blocked')
                .order('created_at', { ascending: false });

            if (!error && jobs) {
                console.log('[ActionModal] Found blocked jobs count:', jobs.length);
                blockedQueue = jobs.filter(isActionableBlockedJob);
                console.log('[ActionModal] Actionable blocked jobs in queue:', blockedQueue.length);
                if (blockedQueue.length > 0) {
                    renderCurrentJob();
                }
            } else if (error) {
                console.error('[ActionModal] Error fetching blocked jobs:', error);
            }
        } catch (err) {
            console.error('Failed to fetch initial blocked jobs:', err);
        }

        // 2. Realtime listener: triggers instantly when a job enters blocked status
        try {
            supabase.channel('action-required-listener')
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'job_applications',
                    filter: `user_id=eq.${user.id}`
                }, payload => {
                    const row = payload.new;
                    if (row && isActionableBlockedJob(row)) {
                        const exists = blockedQueue.some(j => j.id === row.id);
                        if (!exists) {
                            blockedQueue.push(row);
                            if (!isModalOpen) {
                                renderCurrentJob();
                            } else {
                                // Update queue pill count if already viewing one
                                const pill = document.getElementById('action-req-queue-pill');
                                if (pill) pill.textContent = `${blockedQueue.length} ${blockedQueue.length === 1 ? 'Job' : 'Jobs'} Paused`;
                            }
                        }
                    }
                })
                .subscribe();
        } catch (err) {
            console.error('Failed to subscribe to action required realtime channel:', err);
        }
    };

    // Auto-check on load if supabaseClient already exists
    async function autoInit() {
        if (typeof supabaseClient !== 'undefined' && supabaseClient.auth) {
            try {
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (user) {
                    const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', user.id).maybeSingle();
                    window.initActionRequiredModal(user, profile, supabaseClient);
                }
            } catch (e) {
                console.warn('Action modal autoInit check:', e);
            }
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(autoInit, 500);
    } else {
        window.addEventListener('DOMContentLoaded', () => setTimeout(autoInit, 500));
    }
})();
