/**
 * Role Rover PWA & Web Push Engine
 * - Handles Service Worker registration (/sw.js)
 * - Guides iOS Safari users cleanly through "Add to Home Screen"
 * - Subscribes iOS PWA, Android, and Desktop browsers to Web Push (VAPID)
 * - Persists subscriptions in public.push_subscriptions and offers 1-tap test push
 */
(function () {
    const VAPID_PUBLIC_KEY = 'BNWJQJNlr0AV0Nmznfo3kwRuwZm-idpeyEnTgHylL0OFKDDk_BiP_Mr819dPACAY4WTdJDQ5B_CwFuV2g5bPeCY';
    const PUSH_NOTIFY_FN_URL = 'https://core-ffnrirrrrnwoo3837q2b9x.myrolerover.com/functions/v1/push-notify';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkzNjM1MjQxLCJleHAiOjE5NTEzMTUyNDF9.fBMO3bKfgpe2o-Y87baP1PHbgN14BBosx75QdAAQL0k';
    const DISMISS_KEY = 'rr_push_prompt_dismissed_until';

    let _sb = null;
    let _userId = null;
    let _swReg = null;
    let _initialized = false;
    let _slideTimer = null;

    function isIos() {
        return /iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function isIosChrome() {
        return isIos() && /CriOS/i.test(navigator.userAgent || '');
    }

    function isIosInApp() {
        return isIos() && /FBAN|FBAV|Instagram|LinkedInApp|Snapchat|BytedanceWebview|Twitter/i.test(navigator.userAgent || '');
    }

    function isAndroid() {
        return /Android/i.test(navigator.userAgent || '');
    }

    function isStandalone() {
        return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
            window.navigator.standalone === true;
    }

    function getPlatform() {
        if (isIos()) {
            if (isStandalone()) return 'ios-pwa';
            if (isIosChrome()) return 'ios-chrome';
            return 'ios-safari';
        }
        if (isAndroid()) return isStandalone() ? 'android-pwa' : 'android';
        return isStandalone() ? 'desktop-pwa' : 'desktop';
    }

    function supportsPush() {
        return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    function arrayBufferToBase64(buffer) {
        if (!buffer) return '';
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    function isDismissed() {
        try {
            const until = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
            return Date.now() < until;
        } catch (e) {
            return false;
        }
    }

    function dismissForHours(hours) {
        try {
            localStorage.setItem(DISMISS_KEY, String(Date.now() + hours * 3600 * 1000));
        } catch (e) {}
    }

    function injectStyles() {
        if (document.getElementById('rr-pwa-push-styles')) return;
        const style = document.createElement('style');
        style.id = 'rr-pwa-push-styles';
        style.textContent = `
            #rr-push-banner {
                position: fixed;
                bottom: 16px;
                left: 50%;
                transform: translateX(-50%) translateY(130%);
                width: calc(100% - 28px);
                max-width: 440px;
                background: #FFFFFF;
                border: 1.5px solid rgba(0, 255, 204, 0.7);
                border-radius: 16px;
                box-shadow: 0 18px 45px rgba(0, 0, 0, 0.16), 0 0 0 1px rgba(0, 0, 0, 0.04);
                padding: 1rem 1.1rem;
                z-index: 99990;
                opacity: 0;
                transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                color: #0A0A0A;
            }
            #rr-push-banner.rr-visible {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
            }
            .rr-push-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 0.75rem;
            }
            .rr-push-icon-badge {
                width: 40px;
                height: 40px;
                border-radius: 11px;
                background: #E6FBF6;
                border: 1px solid rgba(0, 255, 204, 0.55);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                overflow: hidden;
            }
            .rr-push-icon-badge img {
                width: 30px;
                height: 30px;
                object-fit: contain;
                border-radius: 6px;
            }
            .rr-push-title {
                font-size: 0.92rem;
                font-weight: 800;
                color: #0A0A0A;
                line-height: 1.25;
                margin-bottom: 3px;
            }
            .rr-push-sub {
                font-size: 0.78rem;
                color: #52525B;
                line-height: 1.4;
            }
            .rr-push-close {
                background: none;
                border: none;
                color: #71717A;
                font-size: 1.25rem;
                line-height: 1;
                padding: 2px 4px;
                cursor: pointer;
                flex-shrink: 0;
            }
            .rr-ios-steps {
                margin-top: 0.75rem;
                background: #F8FAFC;
                border: 1px solid #E2E8F0;
                border-radius: 11px;
                padding: 0.65rem 0.8rem;
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }
            .rr-ios-step {
                display: flex;
                align-items: center;
                gap: 0.55rem;
                font-size: 0.78rem;
                color: #18181B;
                font-weight: 600;
                line-height: 1.35;
            }
            .rr-step-num {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: #0A0A0A;
                color: #00FFCC;
                font-size: 0.7rem;
                font-weight: 800;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }
            .rr-inline-chip {
                display: inline-flex;
                align-items: center;
                gap: 3px;
                background: #FFFFFF;
                border: 1px solid #CBD5E1;
                border-radius: 6px;
                padding: 1px 6px;
                font-size: 0.74rem;
                font-weight: 700;
                color: #0F172A;
                vertical-align: middle;
            }
            .rr-push-actions {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                margin-top: 0.8rem;
            }
            .rr-btn-primary {
                flex: 1;
                background: #00FFCC;
                color: #000000;
                border: none;
                border-radius: 10px;
                padding: 0.65rem 0.9rem;
                font-size: 0.82rem;
                font-weight: 800;
                cursor: pointer;
                text-align: center;
                transition: transform 0.12s ease, opacity 0.15s ease;
            }
            .rr-btn-primary:active { transform: scale(0.98); }
            .rr-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
            .rr-btn-ghost {
                background: #F4F4F5;
                color: #52525B;
                border: none;
                border-radius: 10px;
                padding: 0.65rem 0.85rem;
                font-size: 0.78rem;
                font-weight: 700;
                cursor: pointer;
            }
            #rr-push-banner.rr-has-bottom-arrow {
                bottom: 48px;
                overflow: visible;
            }
            .rr-dots-arrow-callout {
                position: absolute;
                right: 10px;
                bottom: -38px;
                display: inline-flex;
                align-items: center;
                gap: 5px;
                background: #0A0A0A;
                color: #00FFCC;
                border: 1.5px solid #00FFCC;
                border-radius: 999px;
                padding: 4px 10px;
                font-size: 0.72rem;
                font-weight: 800;
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
                pointer-events: none;
                animation: rrBounceDown 1s infinite ease-in-out;
                white-space: nowrap;
            }
            @keyframes rrBounceDown {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(5px); }
            }
            @keyframes rrPulseRing {
                0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(0, 255, 204, 0.7); }
                50% { transform: scale(1.08); box-shadow: 0 0 0 5px rgba(0, 255, 204, 0); }
            }
            .rr-ios-slide-player {
                margin-top: 0.65rem;
                background: #F8FAFC;
                border: 1px solid #E2E8F0;
                border-radius: 12px;
                padding: 7px;
            }
            .rr-trust-strip {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 4px 8px;
                margin-top: 5px;
                font-size: 0.68rem;
                font-weight: 700;
                color: #0F766E;
            }
            .rr-slide-tabs {
                display: grid;
                grid-template-columns: repeat(5, 1fr);
                gap: 4px;
                margin-bottom: 6px;
            }
            .rr-slide-tab {
                background: #FFFFFF;
                border: 1px solid #CBD5E1;
                border-radius: 8px;
                padding: 4px 2px;
                font-size: 0.64rem;
                font-weight: 700;
                color: #475569;
                cursor: pointer;
                text-align: center;
                transition: all 0.2s ease;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .rr-slide-tab.active {
                background: #0A0A0A;
                border-color: #00FFCC;
                color: #00FFCC;
            }
            .rr-slide-stage {
                position: relative;
                width: 100%;
                aspect-ratio: 473 / 300;
                height: auto;
                max-height: 195px;
                border-radius: 9px;
                overflow: hidden;
                background: #FFFFFF;
                border: 1px solid #E2E8F0;
            }
            .rr-slide-img {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                object-fit: cover;
                opacity: 0;
                transition: opacity 0.35s ease;
                pointer-events: none;
            }
            .rr-slide-img.active {
                opacity: 1;
            }
            .rr-slide-caption-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                margin-top: 7px;
                padding: 0 2px;
            }
            #rr-slide-caption {
                font-size: 0.76rem;
                font-weight: 700;
                color: #0F172A;
                line-height: 1.3;
                flex: 1;
                min-width: 0;
            }
            @media (max-width: 768px) {
                #rr-push-banner {
                    bottom: 12px;
                    padding: 0.85rem 0.95rem;
                }
                #rr-push-banner.rr-has-bottom-arrow {
                    bottom: 44px;
                }
                .rr-ios-steps {
                    margin-top: 0.55rem;
                    padding: 0.55rem 0.7rem;
                    gap: 0.4rem;
                }
                .rr-push-actions {
                    margin-top: 0.6rem;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function removeBanner() {
        if (_slideTimer) {
            clearInterval(_slideTimer);
            _slideTimer = null;
        }
        const el = document.getElementById('rr-push-banner');
        if (el) {
            el.classList.remove('rr-visible');
            setTimeout(() => el.remove(), 320);
        }
    }

    async function ensureServiceWorker() {
        if (!('serviceWorker' in navigator)) return null;
        if (_swReg) return _swReg;
        try {
            _swReg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            await navigator.serviceWorker.ready;
            return _swReg;
        } catch (err) {
            console.warn('[PWA] Service worker registration failed:', err);
            return null;
        }
    }

    async function saveSubscriptionToSupabase(sub) {
        if (!_sb || !_userId || !sub) return false;
        const json = typeof sub.toJSON === 'function' ? sub.toJSON() : {};
        const p256dh = json.keys?.p256dh || arrayBufferToBase64(sub.getKey && sub.getKey('p256dh'));
        const auth = json.keys?.auth || arrayBufferToBase64(sub.getKey && sub.getKey('auth'));
        if (!sub.endpoint || !p256dh || !auth) return false;

        const { error } = await _sb
            .from('push_subscriptions')
            .upsert({
                user_id: _userId,
                endpoint: sub.endpoint,
                p256dh,
                auth,
                platform: getPlatform(),
                user_agent: (navigator.userAgent || '').slice(0, 240),
                is_active: true,
                updated_at: new Date().toISOString()
            }, { onConflict: 'endpoint' });

        if (error) {
            console.warn('[PWA] Failed to save push subscription:', error);
            return false;
        }
        return true;
    }

    async function subscribeAndSync(sendTestAfter) {
        const reg = await ensureServiceWorker();
        if (!reg || !reg.pushManager) {
            throw new Error('Push messaging is not supported in this browser mode.');
        }

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
        }

        const saved = await saveSubscriptionToSupabase(sub);
        if (!saved) {
            throw new Error('Could not save notification subscription.');
        }

        updateSidebarAlertButton();

        if (sendTestAfter) {
            await sendTestPush();
        }
        return sub;
    }

    async function sendTestPush() {
        if (!_sb) return { ok: false };
        try {
            const { data: { session } } = await _sb.auth.getSession();
            const token = session?.access_token;
            if (!token) return { ok: false, error: 'Not signed in' };

            const res = await fetch(PUSH_NOTIFY_FN_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ action: 'test' })
            });
            return await res.json();
        } catch (err) {
            console.warn('[PWA] Test push failed:', err);
            return { ok: false, error: err.message };
        }
    }

    function updateSidebarAlertButton() {
        const btn = document.getElementById('sidebar-push-alerts-btn');
        const pill = document.getElementById('sidebar-push-alerts-pill');
        if (!btn) return;

        if (isIos() && !isStandalone()) {
            btn.style.display = 'flex';
            if (pill) {
                pill.textContent = 'Install';
                pill.style.background = '#FEF3C7';
                pill.style.color = '#92400E';
            }
            return;
        }

        if (!supportsPush()) {
            btn.style.display = 'none';
            return;
        }

        btn.style.display = 'flex';
        const perm = Notification.permission;
        if (pill) {
            if (perm === 'granted') {
                pill.textContent = 'On';
                pill.style.background = '#E6FBF6';
                pill.style.color = '#0F766E';
            } else if (perm === 'denied') {
                pill.textContent = 'Blocked';
                pill.style.background = '#FEE2E2';
                pill.style.color = '#991B1B';
            } else {
                pill.textContent = 'Off';
                pill.style.background = '#00FFCC';
                pill.style.color = '#000000';
            }
        }
    }

    function showIosInstallBanner(forceShow) {
        if (!forceShow && isDismissed()) return;
        const founderToast = document.getElementById('founder-signin-toast');
        if (founderToast) founderToast.remove();
        injectStyles();
        const existing = document.getElementById('rr-push-banner');
        if (existing) existing.remove();

        const shareChip = `<span class="rr-inline-chip"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> Share</span>`;
        const showBottomArrow = !isIosChrome() && !isIosInApp();

        const trustStripHtml = `<div class="rr-trust-strip"><span>✓ Official iOS Web App</span><span>·</span><span>✓ 0 MB Storage</span><span>·</span><span>✓ No App Store Needed</span></div>`;
        let subText = `Get faster access and turn on alerts for <strong>New Jobs</strong>, <strong>Recruiter Emails</strong>, and <strong>Updates</strong>.${trustStripHtml}`;
        let step1Html = '';
        let step2Html = '';
        let hintHtml = '';

        if (isIosChrome()) {
            subText = `Get faster access and turn on alerts for <strong>New Jobs</strong>, <strong>Recruiter Emails</strong>, and <strong>Updates</strong>. Add via Chrome:${trustStripHtml}`;
            step1Html = `Tap ${shareChip} at the <strong>top-right</strong> next to Chrome's address bar`;
            step2Html = `Scroll down, tap <span class="rr-inline-chip">+ Add to Home Screen</span> → tap <strong>Add</strong>`;
            hintHtml = `Start by tapping <strong>Share</strong> at top-right`;
        } else if (isIosInApp()) {
            subText = `Get faster access and turn on alerts for <strong>New Jobs</strong>, <strong>Recruiter Emails</strong>, and <strong>Updates</strong>. Open in Safari first:${trustStripHtml}`;
            step1Html = `Tap <span class="rr-inline-chip">•••</span> or the Safari icon → <strong>Open in Safari</strong>`;
            step2Html = `In Safari, tap ${shareChip} → <span class="rr-inline-chip">+ Add to Home Screen</span>`;
            hintHtml = `Tap <strong>Open in Safari</strong> first`;
        }

        const slideCaptions = [
            'Step 1 of 5: Tap ••• at bottom-right of Safari',
            'Step 2 of 5: Tap Share in the menu',
            'Step 3 of 5: Tap + Add to Home Screen',
            'Step 4 of 5: Tap Add at top-right',
            'Step 5 of 5: Open Role Rover on your Home Screen'
        ];

        const bodyContentHtml = showBottomArrow
            ? `
                <div class="rr-ios-slide-player" aria-label="Step-by-step visual walkthrough">
                    <div class="rr-slide-tabs">
                        <button type="button" class="rr-slide-tab active" data-rr-slide="0">1. •••</button>
                        <button type="button" class="rr-slide-tab" data-rr-slide="1">2. Share</button>
                        <button type="button" class="rr-slide-tab" data-rr-slide="2">3. + Home</button>
                        <button type="button" class="rr-slide-tab" data-rr-slide="3">4. Add</button>
                        <button type="button" class="rr-slide-tab" data-rr-slide="4">5. Open</button>
                    </div>
                    <div class="rr-slide-stage">
                        <img class="rr-slide-img active" src="/assets/ios-guide-1.jpg?v=3" alt="Step 1: Tap the 3-dots menu button in Safari">
                        <img class="rr-slide-img" src="/assets/ios-guide-2.jpg?v=3" alt="Step 2: Tap Share">
                        <img class="rr-slide-img" src="/assets/ios-guide-3.jpg?v=3" alt="Step 3: Tap Add to Home Screen">
                        <img class="rr-slide-img" src="/assets/ios-guide-4.jpg?v=3" alt="Step 4: Tap Add">
                        <img class="rr-slide-img" src="/assets/ios-guide-5.jpg?v=3" alt="Step 5: Open Role Rover on your Home Screen">
                    </div>
                    <div class="rr-slide-caption-row">
                        <span id="rr-slide-caption">${slideCaptions[0]}</span>
                        <button type="button" class="rr-btn-ghost" style="padding:0.35rem 0.65rem; font-size:0.72rem;" onclick="window.rrDismissPushBanner(72)">Later</button>
                    </div>
                </div>
            `
            : `
                <div class="rr-ios-steps">
                    <div class="rr-ios-step">
                        <span class="rr-step-num">1</span>
                        <span>${step1Html}</span>
                    </div>
                    <div class="rr-ios-step">
                        <span class="rr-step-num">2</span>
                        <span>${step2Html}</span>
                    </div>
                    <div class="rr-ios-step">
                        <span class="rr-step-num">3</span>
                        <span>Open the <strong>Role Rover</strong> icon on your Home Screen &amp; tap <strong>Get Instant Alerts</strong></span>
                    </div>
                </div>
                <div class="rr-push-actions" style="justify-content: space-between;">
                    <span style="font-size:0.74rem; font-weight:700; color:#0F766E;">${hintHtml}</span>
                    <button type="button" class="rr-btn-ghost" onclick="window.rrDismissPushBanner(72)">Later</button>
                </div>
            `;

        const bottomArrowHtml = showBottomArrow
            ? `<div class="rr-dots-arrow-callout" aria-hidden="true"><span>Tap ••• here</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00FFCC" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="4" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></div>`
            : '';

        if (_slideTimer) {
            clearInterval(_slideTimer);
            _slideTimer = null;
        }

        const banner = document.createElement('div');
        banner.id = 'rr-push-banner';
        if (showBottomArrow) banner.classList.add('rr-has-bottom-arrow');
        banner.innerHTML = `
            <div class="rr-push-header">
                <div style="display:flex; align-items:flex-start; gap:0.7rem;">
                    <div class="rr-push-icon-badge">
                        <img src="/assets/pwa-icon-192.png" alt="Role Rover">
                    </div>
                    <div>
                        <div class="rr-push-title">Use myrolerover.com Like an App</div>
                        <div class="rr-push-sub">${subText}</div>
                    </div>
                </div>
                <button type="button" class="rr-push-close" aria-label="Close" onclick="window.rrDismissPushBanner(48)">&times;</button>
            </div>
            ${bodyContentHtml}
            ${bottomArrowHtml}
        `;
        document.body.appendChild(banner);

        if (showBottomArrow) {
            let activeIdx = 0;
            const tabs = banner.querySelectorAll('.rr-slide-tab');
            const imgs = banner.querySelectorAll('.rr-slide-img');
            const captionEl = banner.querySelector('#rr-slide-caption');
            const setSlide = (idx) => {
                activeIdx = idx;
                tabs.forEach((t, i) => t.classList.toggle('active', i === idx));
                imgs.forEach((img, i) => img.classList.toggle('active', i === idx));
                if (captionEl) captionEl.textContent = slideCaptions[idx] || slideCaptions[0];
            };
            const startCycle = () => {
                if (_slideTimer) clearInterval(_slideTimer);
                _slideTimer = setInterval(() => {
                    if (!document.body.contains(banner)) {
                        clearInterval(_slideTimer);
                        _slideTimer = null;
                        return;
                    }
                    setSlide((activeIdx + 1) % imgs.length);
                }, 2400);
            };
            tabs.forEach((tab, idx) => {
                tab.onclick = () => {
                    setSlide(idx);
                    startCycle();
                };
            });
            startCycle();
        }

        requestAnimationFrame(() => {
            setTimeout(() => banner.classList.add('rr-visible'), 60);
        });
    }

    function showEnablePushBanner(forceShow) {
        if (!supportsPush()) return;
        if (!forceShow && isDismissed()) return;
        const perm = Notification.permission;
        if (perm === 'denied' && !forceShow) return;

        const founderToast = document.getElementById('founder-signin-toast');
        if (founderToast) founderToast.remove();
        injectStyles();
        const existing = document.getElementById('rr-push-banner');
        if (existing) existing.remove();

        const isGranted = perm === 'granted';
        const isBlocked = perm === 'denied';
        const banner = document.createElement('div');
        banner.id = 'rr-push-banner';

        if (isBlocked) {
            banner.innerHTML = `
                <div class="rr-push-header">
                    <div style="display:flex; align-items:flex-start; gap:0.7rem;">
                        <div class="rr-push-icon-badge"><img src="/assets/pwa-icon-192.png" alt="Role Rover"></div>
                        <div>
                            <div class="rr-push-title">Notifications Are Blocked</div>
                            <div class="rr-push-sub">Notifications were previously blocked in your browser or device settings. Enable them in Settings to get instant alerts for New Jobs, Recruiter Emails, and Important Updates.</div>
                        </div>
                    </div>
                    <button type="button" class="rr-push-close" aria-label="Close" onclick="window.rrDismissPushBanner(24)">&times;</button>
                </div>
                <div class="rr-push-actions">
                    <button type="button" class="rr-btn-primary" onclick="window.rrDismissPushBanner(24)">Okay</button>
                </div>
            `;
        } else if (isGranted) {
            banner.innerHTML = `
                <div class="rr-push-header">
                    <div style="display:flex; align-items:flex-start; gap:0.7rem;">
                        <div class="rr-push-icon-badge"><img src="/assets/pwa-icon-192.png" alt="Role Rover"></div>
                        <div>
                            <div class="rr-push-title">Phone Alerts Are Active</div>
                            <div class="rr-push-sub">You'll receive instant lock-screen alerts for New Jobs, Recruiter Emails, and Important Updates.</div>
                        </div>
                    </div>
                    <button type="button" class="rr-push-close" aria-label="Close" onclick="window.rrDismissPushBanner(0)">&times;</button>
                </div>
                <div class="rr-push-actions">
                    <button type="button" class="rr-btn-primary" id="rr-send-test-push-btn" onclick="window.rrSendTestPushFromBanner()">Send Test Notification</button>
                    <button type="button" class="rr-btn-ghost" onclick="window.rrDismissPushBanner(0)">Done</button>
                </div>
            `;
        } else {
            banner.innerHTML = `
                <div class="rr-push-header">
                    <div style="display:flex; align-items:flex-start; gap:0.7rem;">
                        <div class="rr-push-icon-badge"><img src="/assets/pwa-icon-192.png" alt="Role Rover"></div>
                        <div>
                            <div class="rr-push-title">Be First to Reply &amp; Apply</div>
                            <div class="rr-push-sub">Instant lock-screen alerts for <strong>New Jobs</strong>, <strong>Recruiter Emails</strong>, and <strong>Important Updates</strong> so you never apply or reply late.</div>
                        </div>
                    </div>
                    <button type="button" class="rr-push-close" aria-label="Close" onclick="window.rrDismissPushBanner(48)">&times;</button>
                </div>
                <div class="rr-push-actions">
                    <button type="button" class="rr-btn-primary" id="rr-enable-push-btn" onclick="window.rrEnablePushAlerts()">Get Instant Alerts</button>
                    <button type="button" class="rr-btn-ghost" onclick="window.rrDismissPushBanner(72)">Later</button>
                </div>
            `;
        }

        document.body.appendChild(banner);
        requestAnimationFrame(() => {
            setTimeout(() => banner.classList.add('rr-visible'), 60);
        });
    }

    window.rrShouldDeferFounderToast = function () {
        if (isDismissed()) return false;
        if (isIos() && !isStandalone()) return true;
        return supportsPush() && Notification.permission === 'default';
    };

    window.rrDismissPushBanner = function (hours) {
        if (hours > 0) dismissForHours(hours);
        removeBanner();
        if (typeof window.maybeShowDeferredFounderToast === 'function') {
            setTimeout(() => window.maybeShowDeferredFounderToast(), 400);
        }
    };

    window.rrOpenPushSetup = function () {
        if (isIos() && !isStandalone()) {
            showIosInstallBanner(true);
            return;
        }
        showEnablePushBanner(true);
    };

    window.rrEnablePushAlerts = async function () {
        const btn = document.getElementById('rr-enable-push-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Enabling...';
        }
        try {
            // Must run directly inside click handler for iOS 16.4+ PWA compatibility
            const permission = await Notification.requestPermission();
            updateSidebarAlertButton();

            if (permission !== 'granted') {
                showEnablePushBanner(true);
                return;
            }

            await subscribeAndSync(true);
            if (btn) {
                btn.textContent = 'Alerts Enabled! Test Sent';
            }
            setTimeout(() => {
                removeBanner();
                if (typeof window.maybeShowDeferredFounderToast === 'function') {
                    setTimeout(() => window.maybeShowDeferredFounderToast(), 400);
                }
            }, 1800);
        } catch (err) {
            console.warn('[PWA] Enable push error:', err);
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Try Again';
            }
        }
    };

    window.rrSendTestPushFromBanner = async function () {
        const btn = document.getElementById('rr-send-test-push-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Sending...';
        }
        try {
            await subscribeAndSync(false);
            const res = await sendTestPush();
            if (btn) {
                if (res && res.sent > 0) {
                    btn.textContent = 'Sent! Check Lock Screen';
                } else {
                    btn.textContent = 'Synced! Try Again';
                    btn.disabled = false;
                }
            }
        } catch (err) {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Retry';
            }
        }
    };

    window.initRoleRoverPush = async function (supabaseClient, userId) {
        if (!supabaseClient || !userId) return;
        _sb = supabaseClient;
        _userId = userId;

        if (_initialized) return;
        _initialized = true;

        await ensureServiceWorker();
        updateSidebarAlertButton();

        if (supportsPush() && Notification.permission === 'granted') {
            subscribeAndSync(false).catch(() => {});
            return;
        }

        // Prioritize Phone Alerts setup on load when pending; Founder toast defers cleanly
        setTimeout(() => {
            if (document.getElementById('rr-push-banner')) return;
            if (isIos() && !isStandalone()) {
                showIosInstallBanner(false);
            } else if (supportsPush() && Notification.permission === 'default') {
                showEnablePushBanner(false);
            }
        }, 1200);
    };
})();
