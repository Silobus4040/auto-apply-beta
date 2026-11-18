/**
 * Role Rover - Standalone Bug Report Modal
 * Writes directly to public.bug_reports + uploads optional screenshots/documents
 * to the 'bug-reports' Supabase Storage bucket without cluttering Founder Chat.
 */
(function () {
    const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
    let _selectedFile = null;
    let _previewUrl = null;

    function injectStyles() {
        if (document.getElementById('rr-bug-modal-styles')) return;
        const style = document.createElement('style');
        style.id = 'rr-bug-modal-styles';
        style.textContent = `
            #rr-bug-modal-overlay {
                display: none;
                position: fixed;
                inset: 0;
                width: 100vw;
                height: 100dvh;
                background: rgba(15, 23, 42, 0.62);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 99980;
                align-items: center;
                justify-content: center;
                padding: 0.75rem;
                box-sizing: border-box;
                overflow-x: hidden;
                overflow-y: auto;
            }
            #rr-bug-modal-overlay.active {
                display: flex;
            }
            .rr-bug-card {
                background: #FFFFFF;
                width: 100%;
                max-width: min(460px, calc(100vw - 1.5rem));
                max-height: calc(100dvh - 1.5rem);
                border-radius: 20px;
                border: 1px solid rgba(0, 0, 0, 0.08);
                box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.28);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-sizing: border-box;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                color: #0A0A0A;
                animation: rrBugPop 0.22s cubic-bezier(0.16, 1, 0.3, 1);
            }
            @keyframes rrBugPop {
                from { opacity: 0; transform: scale(0.96) translateY(8px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
            }
            .rr-bug-header {
                padding: 1rem 1.15rem;
                border-bottom: 1px solid #F1F5F9;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 0.65rem;
                flex-shrink: 0;
                min-width: 0;
            }
            .rr-bug-title-wrap {
                min-width: 0;
                flex: 1;
            }
            .rr-bug-title {
                font-size: 1rem;
                font-weight: 800;
                color: #09090B;
                line-height: 1.25;
            }
            .rr-bug-close {
                background: #F4F4F5;
                border: none;
                border-radius: 50%;
                width: 34px;
                height: 34px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.25rem;
                color: #52525B;
                cursor: pointer;
                flex-shrink: 0;
                line-height: 1;
            }
            .rr-bug-close:hover {
                background: #E4E4E7;
                color: #09090B;
            }
            .rr-bug-body {
                padding: 1rem 1.15rem 1.15rem;
                overflow-y: auto;
                overflow-x: hidden;
                display: flex;
                flex-direction: column;
                gap: 0.85rem;
            }
            .rr-bug-bounty-note {
                background: #E6FBF6;
                border: 1px solid rgba(0, 255, 204, 0.55);
                border-radius: 11px;
                padding: 0.65rem 0.8rem;
                font-size: 0.8rem;
                line-height: 1.4;
                color: #115E59;
                font-weight: 500;
            }
            .rr-bug-label {
                display: block;
                font-size: 0.78rem;
                font-weight: 700;
                color: #3F3F46;
                margin-bottom: 0.35rem;
            }
            .rr-bug-textarea {
                width: 100%;
                min-height: 108px;
                padding: 0.75rem 0.85rem;
                border: 1.5px solid #E4E4E7;
                border-radius: 12px;
                font-family: inherit;
                font-size: 16px;
                line-height: 1.45;
                color: #0A0A0A;
                background: #FAFAFA;
                resize: vertical;
                outline: none;
                box-sizing: border-box;
                transition: border-color 0.15s, background 0.15s;
            }
            .rr-bug-textarea:focus {
                border-color: #0A0A0A;
                background: #FFFFFF;
            }
            .rr-bug-upload-box {
                border: 1.5px dashed #CBD5E1;
                border-radius: 12px;
                padding: 0.8rem;
                background: #F8FAFC;
                text-align: center;
                cursor: pointer;
                transition: border-color 0.15s, background 0.15s;
            }
            .rr-bug-upload-box:hover {
                border-color: #0D9488;
                background: #F0FDFA;
            }
            .rr-bug-file-preview {
                display: none;
                align-items: center;
                justify-content: space-between;
                gap: 0.65rem;
                padding: 0.55rem 0.75rem;
                background: #F4F4F5;
                border: 1px solid #E4E4E7;
                border-radius: 10px;
                margin-top: 0.5rem;
            }
            .rr-bug-file-preview.active {
                display: flex;
            }
            .rr-bug-file-meta {
                display: flex;
                align-items: center;
                gap: 0.55rem;
                min-width: 0;
                flex: 1;
            }
            .rr-bug-thumb {
                width: 38px;
                height: 38px;
                border-radius: 7px;
                object-fit: cover;
                border: 1px solid #D4D4D8;
                flex-shrink: 0;
            }
            .rr-bug-file-name {
                font-size: 0.78rem;
                font-weight: 700;
                color: #18181B;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .rr-bug-file-size {
                font-size: 0.7rem;
                color: #71717A;
            }
            .rr-bug-remove-file {
                background: none;
                border: none;
                color: #DC2626;
                font-size: 0.75rem;
                font-weight: 700;
                cursor: pointer;
                flex-shrink: 0;
                padding: 4px 6px;
            }
            .rr-bug-error {
                display: none;
                font-size: 0.78rem;
                font-weight: 600;
                color: #DC2626;
                background: #FEF2F2;
                border: 1px solid #FECACA;
                border-radius: 9px;
                padding: 0.55rem 0.75rem;
            }
            .rr-bug-submit {
                width: 100%;
                background: #0A0A0A;
                color: #FFFFFF;
                border: none;
                border-radius: 12px;
                padding: 0.85rem 1rem;
                font-size: 0.9rem;
                font-weight: 800;
                cursor: pointer;
                transition: opacity 0.15s, transform 0.1s;
            }
            .rr-bug-submit:active { transform: scale(0.99); }
            .rr-bug-submit:disabled { opacity: 0.6; cursor: not-allowed; }
            .rr-bug-success {
                text-align: center;
                padding: 1.25rem 0.5rem 0.5rem;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 0.65rem;
            }
            .rr-bug-success-icon {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: #E6FBF6;
                border: 1.5px solid #00FFCC;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.4rem;
            }
        `;
        document.head.appendChild(style);
    }

    function ensureModalDOM() {
        injectStyles();
        if (document.getElementById('rr-bug-modal-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'rr-bug-modal-overlay';
        overlay.onclick = function (e) {
            if (e.target === overlay) closeBugReportModal();
        };
        overlay.innerHTML = `
            <div class="rr-bug-card" role="dialog" aria-modal="true" aria-labelledby="rr-bug-modal-title">
                <div class="rr-bug-header">
                    <div class="rr-bug-title-wrap">
                        <div class="rr-bug-title" id="rr-bug-modal-title">🐞 Report Bug / Error</div>
                    </div>
                    <button type="button" class="rr-bug-close" onclick="window.closeBugReportModal()" aria-label="Close">&times;</button>
                </div>
                <div class="rr-bug-body" id="rr-bug-body"></div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function clearSelectedFile() {
        _selectedFile = null;
        if (_previewUrl) {
            URL.revokeObjectURL(_previewUrl);
            _previewUrl = null;
        }
        const input = document.getElementById('rr-bug-file-input');
        if (input) input.value = '';
        const prev = document.getElementById('rr-bug-file-preview');
        if (prev) {
            prev.classList.remove('active');
            prev.innerHTML = '';
        }
    }

    function renderForm() {
        clearSelectedFile();
        const body = document.getElementById('rr-bug-body');
        if (!body) return;

        body.innerHTML = `
            <div class="rr-bug-bounty-note">
                Help us make Role Rover better for you and other job seekers — report any bug or error found and get <strong>20 free Application credits</strong> once verified.
            </div>
            <div>
                <label class="rr-bug-label" for="rr-bug-desc">What went wrong?</label>
                <textarea id="rr-bug-desc" class="rr-bug-textarea" placeholder="Describe the bug or error you saw and what you clicked..."></textarea>
            </div>
            <div>
                <label class="rr-bug-label">Screenshot or Document (Optional)</label>
                <div class="rr-bug-upload-box" onclick="document.getElementById('rr-bug-file-input').click()">
                    <div style="font-size:0.82rem; font-weight:700; color:#0F172A;">📎 Tap to upload screenshot or document</div>
                    <div style="font-size:0.72rem; color:#64748B; margin-top:2px;">PNG, JPG, PDF, TXT, or DOCX (max 10 MB)</div>
                </div>
                <input type="file" id="rr-bug-file-input" style="display:none;" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,.pdf,.txt,.doc,.docx">
                <div class="rr-bug-file-preview" id="rr-bug-file-preview"></div>
            </div>
            <div class="rr-bug-error" id="rr-bug-error"></div>
            <button type="button" class="rr-bug-submit" id="rr-bug-submit-btn" onclick="window.submitBugReport()">Submit Bug Report</button>
        `;

        const fileInput = document.getElementById('rr-bug-file-input');
        if (fileInput) {
            fileInput.onchange = handleFileSelected;
        }
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function showError(msg) {
        const el = document.getElementById('rr-bug-error');
        if (!el) return;
        if (!msg) {
            el.style.display = 'none';
            el.textContent = '';
            return;
        }
        el.textContent = msg;
        el.style.display = 'block';
    }

    function handleFileSelected(e) {
        showError('');
        const file = e.target.files && e.target.files[0];
        if (!file) {
            clearSelectedFile();
            return;
        }
        if (file.size > MAX_FILE_BYTES) {
            clearSelectedFile();
            showError('File is larger than 10 MB. Please choose a smaller screenshot or document.');
            return;
        }

        _selectedFile = file;
        if (_previewUrl) URL.revokeObjectURL(_previewUrl);
        const isImg = (file.type || '').startsWith('image/');
        _previewUrl = isImg ? URL.createObjectURL(file) : null;

        const prev = document.getElementById('rr-bug-file-preview');
        if (!prev) return;
        const thumbHtml = isImg
            ? `<img class="rr-bug-thumb" src="${_previewUrl}" alt="Preview">`
            : `<div class="rr-bug-thumb" style="display:flex;align-items:center;justify-content:center;background:#E2E8F0;font-size:1rem;">📄</div>`;

        prev.innerHTML = `
            <div class="rr-bug-file-meta">
                ${thumbHtml}
                <div style="min-width:0; flex:1;">
                    <div class="rr-bug-file-name"></div>
                    <div class="rr-bug-file-size">${formatBytes(file.size)}</div>
                </div>
            </div>
            <button type="button" class="rr-bug-remove-file" id="rr-bug-remove-file-btn">Remove</button>
        `;
        const nameEl = prev.querySelector('.rr-bug-file-name');
        if (nameEl) nameEl.textContent = file.name;
        const rmBtn = document.getElementById('rr-bug-remove-file-btn');
        if (rmBtn) rmBtn.onclick = clearSelectedFile;
        prev.classList.add('active');
    }

    window.openBugReportModal = function () {
        ensureModalDOM();
        renderForm();
        const overlay = document.getElementById('rr-bug-modal-overlay');
        if (overlay) overlay.classList.add('active');
        if (window.innerWidth > 768) {
            setTimeout(() => {
                const ta = document.getElementById('rr-bug-desc');
                if (ta) ta.focus();
            }, 80);
        }
    };

    window.closeBugReportModal = function () {
        const overlay = document.getElementById('rr-bug-modal-overlay');
        if (overlay) overlay.classList.remove('active');
        clearSelectedFile();
    };

    window.submitBugReport = async function () {
        showError('');
        const descEl = document.getElementById('rr-bug-desc');
        const btn = document.getElementById('rr-bug-submit-btn');
        const description = (descEl ? descEl.value : '').trim();

        if (!description) {
            showError('Please describe the bug or error you noticed.');
            return;
        }

        if (typeof supabaseClient === 'undefined' || !supabaseClient) {
            showError('Session not ready. Please refresh the page and try again.');
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Submitting...';
        }

        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user || !user.id) {
                throw new Error('Please sign in again before submitting a bug report.');
            }

            let attachmentUrl = null;
            let attachmentName = null;
            let attachmentType = null;

            if (_selectedFile) {
                if (btn) btn.textContent = 'Uploading attachment...';
                const safeName = _selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const storagePath = `${user.id}/${Date.now()}_${safeName}`;
                const { error: upErr } = await supabaseClient.storage
                    .from('bug-reports')
                    .upload(storagePath, _selectedFile, {
                        contentType: _selectedFile.type || 'application/octet-stream',
                        upsert: false
                    });
                if (upErr) throw upErr;

                const { data: pubData } = supabaseClient.storage
                    .from('bug-reports')
                    .getPublicUrl(storagePath);
                attachmentUrl = pubData?.publicUrl || storagePath;
                attachmentName = _selectedFile.name;
                attachmentType = _selectedFile.type || 'application/octet-stream';
            }

            if (btn) btn.textContent = 'Saving report...';
            const userEmail = (typeof currentUserEmail !== 'undefined' && currentUserEmail) ||
                user.email ||
                (typeof userProfile !== 'undefined' && (userProfile?.Application_email || userProfile?.email)) ||
                null;

            const { error: insErr } = await supabaseClient
                .from('bug_reports')
                .insert([{
                    user_id: user.id,
                    email: userEmail,
                    page_url: window.location.pathname + window.location.search,
                    user_agent: (navigator.userAgent || '').slice(0, 240),
                    description,
                    attachment_url: attachmentUrl,
                    attachment_name: attachmentName,
                    attachment_type: attachmentType,
                    status: 'pending'
                }]);

            if (insErr) throw insErr;

            clearSelectedFile();
            const body = document.getElementById('rr-bug-body');
            if (body) {
                body.innerHTML = `
                    <div class="rr-bug-success">
                        <div class="rr-bug-success-icon">✅</div>
                        <div style="font-size:1rem; font-weight:800; color:#09090B;">Bug Report Submitted!</div>
                        <div style="font-size:0.84rem; color:#52525B; line-height:1.45;">
                            Thanks for helping make Role Rover better. Once our team verifies this report, <strong>20 free Application credits</strong> will be added to your account.
                        </div>
                        <button type="button" class="rr-bug-submit" style="margin-top:0.5rem;" onclick="window.closeBugReportModal()">Done</button>
                    </div>
                `;
            }
        } catch (err) {
            console.error('[BugReport] Submit error:', err);
            showError(err?.message || 'Could not submit bug report. Please try again.');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Submit Bug Report';
            }
        }
    };
})();
