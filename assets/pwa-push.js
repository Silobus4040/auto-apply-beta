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

    function isIos() {
        return /iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function isAndroid() {
        return /Android/i.test(navigator.userAgent || '');
    }

    function isStandalone() {
        return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
            window.navigator.standalone === true;
    }

    function getPlatform() {
        if (isIos()) return isStandalone() ? 'ios-pwa' : 'ios-safari';
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
            @media (max-width: 768px) {
                #rr-push-banner {
                    bottom: 12px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function removeBanner() {
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
        injectStyles();
        const existing = document.getElementById('rr-push-banner');
        if (existing) existing.remove();

        const banner = document.createElement('div');
        banner.id = 'rr-push-banner';
        banner.innerHTML = `
            <div class="rr-push-header">
                <div style="display:flex; align-items:flex-start; gap:0.7rem;">
                    <div class="rr-push-icon-badge">
                        <img src="/assets/pwa-icon-192.png" alt="Role Rover">
                    </div>
                    <div>
                        <div class="rr-push-title">Install Role Rover for Phone Alerts</div>
                        <div class="rr-push-sub">iPhone only sends lock-screen alerts once added to your Home Screen. Do these 3 steps using Safari's bar below:</div>
                    </div>
                </div>
                <button type="button" class="rr-push-close" aria-label="Close" onclick="window.rrDismissPushBanner(48)">&times;</button>
            </div>
            <div class="rr-ios-steps">
                <div class="rr-ios-step">
                    <span class="rr-step-num">1</span>
                    <span>Tap <span class="rr-inline-chip">•••</span> (bottom-right of Safari) → tap <span class="rr-inline-chip"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> Share</span> <span style="color:#64748B; font-weight:500;">(or Share directly if shown)</span></span>
                </div>
                <div class="rr-ios-step">
                    <span class="rr-step-num">2</span>
                    <span>Scroll down, tap <span class="rr-inline-chip">+ Add to Home Screen</span> → tap <strong>Add</strong></span>
                </div>
                <div class="rr-ios-step">
                    <span class="rr-step-num">3</span>
                    <span>Open the <strong>Role Rover</strong> icon on your Home Screen &amp; tap <strong>Enable Alerts</strong></span>
                </div>
            </div>
            <div class="rr-push-actions" style="justify-content: space-between;">
                <span style="font-size:0.74rem; font-weight:700; color:#0F766E;">Start by tapping <strong>•••</strong> below ↘</span>
                <button type="button" class="rr-btn-ghost" onclick="window.rrDismissPushBanner(72)">Later</button>
            </div>
        `;
        document.body.appendChild(banner);
        requestAnimationFrame(() => {
            setTimeout(() => banner.classList.add('rr-visible'), 60);
        });
    }

    function showEnablePushBanner(forceShow) {
        if (!supportsPush()) return;
        if (!forceShow && isDismissed()) return;
        const perm = Notification.permission;
        if (perm === 'denied' && !forceShow) return;

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
                            <div class="rr-push-sub">Notifications were previously blocked in your browser/device settings. Enable notifications for Role Rover in your device Settings to receive instant interview &amp; founder alerts.</div>
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
                            <div class="rr-push-sub">You'll receive instant alerts for Founder messages, employer emails, and applications needing your input.</div>
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
                            <div class="rr-push-title">Never Miss a Reply or Job Alert</div>
                            <div class="rr-push-sub">Turn on push alerts so you know right away when Obruche messages you, an employer replies, or an app needs input.</div>
                        </div>
                    </div>
                    <button type="button" class="rr-push-close" aria-label="Close" onclick="window.rrDismissPushBanner(48)">&times;</button>
                </div>
                <div class="rr-push-actions">
                    <button type="button" class="rr-btn-primary" id="rr-enable-push-btn" onclick="window.rrEnablePushAlerts()">Enable Alerts</button>
                    <button type="button" class="rr-btn-ghost" onclick="window.rrDismissPushBanner(72)">Later</button>
                </div>
            `;
        }

        document.body.appendChild(banner);
        requestAnimationFrame(() => {
            setTimeout(() => banner.classList.add('rr-visible'), 60);
        });
    }

    window.rrDismissPushBanner = function (hours) {
        if (hours > 0) dismissForHours(hours);
        removeBanner();
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
            setTimeout(() => removeBanner(), 1800);
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

        // Delay banner slightly so it doesn't collide with page boot / Founder toast
        setTimeout(() => {
            if (document.getElementById('rr-push-banner')) return;
            if (isIos() && !isStandalone()) {
                showIosInstallBanner(false);
            } else if (supportsPush() && Notification.permission === 'default') {
                showEnablePushBanner(false);
            }
        }, 2800);
    };
})();
