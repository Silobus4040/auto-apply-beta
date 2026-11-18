# Role Rover Mobile UX, PWA Web Push & Bug Report Progress Log

**Date:** November 18, 2026  
**Project:** RoleRover (`auto-apply-beta`)  
**Repository:** `c:\Users\pc\Documents\auto-apply-beta` (branch `main`, deployed to `https://myrolerover.com`)  
**Live Backend:** Self-hosted Supabase v2 on Hetzner (`135.181.120.33`, stack `supabase2-*`, gateway `https://core-ffnrirrrrnwoo3837q2b9x.myrolerover.com`)  
**Test Account (Founder UX & Bug Report Gate):** Jeroid (`f1432095-6987-4838-a71b-7ed4bd61818f`, `jeroid*` / `jeriod*` email match)

---

## 1. Objectives Covered

1. **Founder Chat Discoverability & Sign-In Alerts (`28eb85e`, `9ba65ed`)**
   - Add a clearer **`☰ Menu`** label + unread badge on mobile so users recognize the drawer button.
   - Surface an immediate slide-down sign-in toast + badge count when unread Founder messages exist.
2. **Zero Horizontal Overflow & Mobile Fit (`8fa9904`)**
   - Prevent accidental left-to-right panning on mobile browsers and ensure the Founder Chat header/close (`×`) button fits cleanly on every screen width.
3. **Zero-Cost PWA & Native Web Push Notifications (`55a35ec`, `851050d`, `680db63`, `d3f5ad4`)**
   - Allow Role Rover to install onto iPhone and Android Home Screens as a standalone full-screen app (no browser URL bar) and receive real lock-screen push notifications at **\$0/month** via direct Apple APNs & Google FCM delivery.
4. **Standalone Bug Report Flow + Screenshot/Document Upload (`2dd433d`)**
   - Decouple **"🐞 Report Bug / Error (+20 Free Credits)"** from Message Founder so bug reports do not clutter Founder Chat or require immediate chat replies.

---

## 2. Implemented Changes

### A. Mobile Responsiveness & Zero Sideways Scroll (`8fa9904`)
- **Viewport Overflow Containment** ([dashboard.html](file:///C:/Users/pc/Documents/auto-apply-beta/dashboard.html), [swipe.html](file:///C:/Users/pc/Documents/auto-apply-beta/swipe.html), [index.html](file:///C:/Users/pc/Documents/auto-apply-beta/index.html), [jobs.html](file:///C:/Users/pc/Documents/auto-apply-beta/jobs.html)):
  - Applied `overflow-x: hidden; overflow-x: clip; overscroll-behavior-x: none;` and full width constraints to `html, body`.
- **Anti-Zoom on iOS Inputs (`<= 768px`)**:
  - Enforced `font-size: 16px !important` across mobile `input`, `textarea`, and `select` elements so Safari does not auto-zoom sideways when focusing inputs.
- **Founder Chat Modal Fix (`#feedback-modal` / `.founder-chat-card`)**:
  - Centered `#feedback-modal` on mobile with `max-width: calc(100vw - 1.5rem)`, added `min-width: 0` + text truncation on `.founder-chat-profile` and `flex-shrink: 0` on `.founder-chat-close`, and stopped `openFounderChat()` from auto-focusing the text box on mobile (`window.innerWidth <= 768`).

---

### B. PWA App Mode & Web Push Notifications (`55a35ec` → `d3f5ad4`)

#### Frontend Files
- **[manifest.json](file:///C:/Users/pc/Documents/auto-apply-beta/manifest.json)**: Standalone PWA configuration (`display: "standalone"`, `start_url: "/dashboard.html"`, `192×192` & `512×512` PNG icons).
- **[sw.js](file:///C:/Users/pc/Documents/auto-apply-beta/sw.js)**: Service Worker handling `push` (system notification + app icon badge via `setAppBadge`) and `notificationclick` (clears badge and deep-links to target URL such as `?open=founder-chat` or `?open=mailbox`), without aggressive HTML caching.
- **Generated PNG Icons** (from [favicon.svg](file:///C:/Users/pc/Documents/auto-apply-beta/assets/favicon.svg) on solid `#FFFFFF`):
  - [apple-touch-icon.png](file:///C:/Users/pc/Documents/auto-apply-beta/assets/apple-touch-icon.png) (`180×180`)
  - [pwa-icon-192.png](file:///C:/Users/pc/Documents/auto-apply-beta/assets/pwa-icon-192.png) (`192×192`)
  - [pwa-icon-512.png](file:///C:/Users/pc/Documents/auto-apply-beta/assets/pwa-icon-512.png) (`512×512`)
- **[assets/pwa-push.js](file:///C:/Users/pc/Documents/auto-apply-beta/assets/pwa-push.js)** (included in [dashboard.html](file:///C:/Users/pc/Documents/auto-apply-beta/dashboard.html) & [swipe.html](file:///C:/Users/pc/Documents/auto-apply-beta/swipe.html); `<head>` manifest/icon tags also added to [index.html](file:///C:/Users/pc/Documents/auto-apply-beta/index.html) & [login.html](file:///C:/Users/pc/Documents/auto-apply-beta/login.html)):
  - **Platform Detection (`getPlatform()`)**: Distinguishes `ios-safari`, `ios-chrome` (`CriOS`), iOS in-app browsers (`isIosInApp()`), `ios-pwa` (Home Screen standalone), `android` / `android-pwa`, and `desktop`.
  - **Tailored Opt-In Flows**:
    - *iPhone Safari*: Step 1 guides to `•••` (bottom-right) → `Share` → `+ Add to Home Screen`.
    - *iPhone Chrome*: Step 1 guides to `Share` at top-right next to address bar → `+ Add to Home Screen`.
    - *iPhone In-App Browsers*: Prompts user to tap `Open in Safari` first.
    - *Android / iOS Home Screen App / Desktop*: Skips install guide and shows 1-tap **`Get Instant Alerts`** CTA (`Notification.requestPermission()` triggered directly inside click handler), saves `PushSubscription` to Supabase, and dispatches an immediate test lock-screen push.
  - **Sidebar Control (`#sidebar-push-alerts-btn`)**: Displays live alert status pill (`Install` / `Off` / `On` / `Blocked`) and opens setup or sends a test push on tap.
  - **Approved Banner Copy (Format 3)**: *"Be First to Reply & Apply — Instant lock-screen alerts for New Jobs, Recruiter Emails, and Important Updates so you never apply or reply late."*

#### Hetzner Server & Database Infrastructure (`supabase2-*`)
- **Table `public.push_subscriptions`** (created on `supabase2-db`):
  - Columns: `id`, `user_id`, `endpoint` (`UNIQUE`), `p256dh`, `auth`, `platform`, `user_agent`, `created_at`, `updated_at`, `last_push_at`, `is_active`.
  - RLS policy: `"Users can manage own push subscriptions"` (`auth.uid() = user_id`), allowing multi-device push per account while reassigning an `endpoint` cleanly if a different user signs in on the same device.
- **Postgres Real-Time Triggers (`public.notify_push_event()` → `pg_notify('push_event', ...)`)**:
  - `trg_feedback_push_event` (`feedback`, `sender = 'founder'`) → deep-links `/dashboard.html?open=founder-chat`.
  - `trg_emails_push_event` (`emails`, `type = 'inbound'`) → deep-links `/dashboard.html?open=mailbox`.
  - `trg_job_applications_push_event` (`job_applications`, `status = 'blocked'`) → alerts user when candidate action is needed.
- **Push Daemon (`/root/push-daemon/push_service.mjs`, PM2 process `push-service`)**:
  - Connects directly to `supabase2-db` (`port: 5433`, dynamically resolved container IP) for `LISTEN push_event`.
  - Exposes HTTP server on `0.0.0.0:5160` (`/health`, `/send`) with persistent VAPID keys in `/root/push-daemon/vapid.json` (using `web-push`).
  - Automatically marks `404`/`410` expired push endpoints `is_active = false`.
  - Opened UFW firewall rule for Docker bridge `172.16.0.0/12` → port `5160`.
- **Supabase Edge Function (`/root/supabase-docker-v2/volumes/functions/push-notify/index.ts`)**:
  - Supports `action: 'vapid-key'`, authenticated `action: 'test'` (verified user JWT), and `action: 'send'` (verified `SERVICE_ROLE_KEY`, supporting targeted `user_id` or `broadcast`).

---

### C. Standalone Bug Report Modal & File Uploads (`2dd433d`)
- **Database & Storage (`supabase2-db`)**:
  - Created `public.bug_reports` (`id`, `user_id`, `email`, `page_url`, `user_agent`, `description`, `attachment_url`, `attachment_name`, `attachment_type`, `status` (`'pending'`), `credits_awarded`, `created_at`, `updated_at`) with per-user `INSERT` & `SELECT` RLS policies.
  - Created public Storage bucket `bug-reports` (`10 MB` size limit; allows PNG, JPG, WEBP, GIF, PDF, TXT, DOC, DOCX) with owner-scoped upload (`(storage.foldername(name))[1] = auth.uid()::text`) and public read policy.
- **Frontend ([assets/bug-report-modal.js](file:///C:/Users/pc/Documents/auto-apply-beta/assets/bug-report-modal.js))**:
  - Standalone modal (`openBugReportModal()` / `closeBugReportModal()`) wired from `#sidebar-report-bug-item` in [dashboard.html](file:///C:/Users/pc/Documents/auto-apply-beta/dashboard.html) and [swipe.html](file:///C:/Users/pc/Documents/auto-apply-beta/swipe.html).
  - Supports bug description (`16px` textarea) + optional screenshot/document upload with instant thumbnail/filename preview.
  - Removed bug bounty bubble & redirect from `#feedback-modal` so Message Founder remains separate.

---

## 3. Verification Status
- **Backend (`push-service`, `push-notify`, Postgres)**: Verified `push-service` online in PM2 (`LISTEN push_event`), `push-notify` returning live VAPID public key over HTTPS, `public.push_subscriptions`, `public.bug_reports`, storage bucket `bug-reports`, and all 3 `pg_notify` triggers created in `supabase2-db`.
- **Frontend**: Validated JS syntax via `node --check` on [pwa-push.js](file:///C:/Users/pc/Documents/auto-apply-beta/assets/pwa-push.js), [sw.js](file:///C:/Users/pc/Documents/auto-apply-beta/sw.js), and [bug-report-modal.js](file:///C:/Users/pc/Documents/auto-apply-beta/assets/bug-report-modal.js); validated [manifest.json](file:///C:/Users/pc/Documents/auto-apply-beta/manifest.json); verified all 3 PNG icon dimensions (`180×180`, `192×192`, `512×512`). Tested end-to-end on iPhone Safari + Home Screen PWA by user (*"its done and perfect"*).

---

## 4. Next / Pending Items
1. **Public Rollout of Sidebar Updates**: When approved, remove `isFounderTestAccount(userId)` gate so **`☰ Menu`** label, sign-in Founder toast, and **`🐞 Report Bug / Error`** show for all users (currently gated to Jeroid's account in [dashboard.html](file:///C:/Users/pc/Documents/auto-apply-beta/dashboard.html) & [swipe.html](file:///C:/Users/pc/Documents/auto-apply-beta/swipe.html)).
2. **New Jobs Push Trigger (n8n / Scraper Hook)**: Call `POST https://core-ffnrirrrrnwoo3837q2b9x.myrolerover.com/functions/v1/push-notify` with `SERVICE_ROLE_KEY` (`{ action: 'send', user_id, title, body, url: '/swipe.html' }`) from the job-matching/scraper workflow whenever a user's fresh job batch completes.
3. **Optional Enhancements**:
   - Deactivate current device's push subscription on explicit `logout()` if shared-device privacy is desired.
   - Add Android `beforeinstallprompt` install button or a Founder Broadcast / Bug Verification admin action to award the 20 credits in 1 click.
