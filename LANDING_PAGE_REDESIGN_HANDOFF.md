# Handoff: Landing Page Redesign (branch `claude/react-migration-html-9f2a7c`)

**Date:** November 6, 2026
**Status:** Built and staged. **Not merged to `main`. Not live on `myrolerover.com`.**
**Live preview:** https://rolerover-staging.davidobus4040.workers.dev (separate Cloudflare Worker, same backend as production, zero effect on production)

---

## 1. Why this branch exists

Started as "is React worth switching to," became a full redesign of `index.html` done in place (no framework change — that's still a separate, later decision, deliberately parked until after the Nov 3–17 Supabase→Hetzner soak period). Design direction, decisions and the full token system are written up in `DESIGN_SPEC.md`.

## 2. What's in this branch

| File | What changed |
|---|---|
| `index.html` | Full landing page redesign: nav, hero (real swipe-deck UI in a phone frame), "How it works" rebuilt as 6 steps with working visual demos, new "Jobs sourced from two decks" explanation, "Track every application" section, dedicated-inbox demo, countries/careers sections cleaned up. Old hero video and its ~500 lines of dead code removed. |
| `assets/tokens.css` | New file. The whole design system: colors, type scale, spacing, radii, component styles. Linked from `index.html` only — no other page links it yet. |
| `dashboard.html` | 2-line fix: removed `text-transform: uppercase` from `.table-btn` and `.status-pill` (the application-tracker buttons and status pill were all-caps; role titles and small stat labels were already correct and untouched). |
| `BRAND.md` | Updated: teal is now the single UI accent; lime is logo-only. |
| `DESIGN_SPEC.md` | New. The design system reference — tokens, rules, decisions, open questions. |
| `assets/demo-jobs.json` | New. Real postings pulled from the `public-job-search` function, used as the source for the landing page's demo job cards (Moniepoint, Wikimedia, Figma, Canonical). Not wired into any live code — reference only. |

**Untouched:** `login.html`, `signup.html`, `onboarding.html`, `swipe.html`, `verify.html`, and every other page. None of them link `tokens.css` and none have been restyled.

## 3. Open items — check these before merging to `main`

1. ~~**Social Hiring Posts promise vs. reality.**~~ **Resolved 2026-11-06.** The founder confirmed the staging/testing period on `mosco`'s account is over and the workflow works correctly; the founder-only gate has been lifted in `swipe.html` so it is now general for every user: `checkSocialHiringAccess()` no longer restricts the feature/nav to the founder id or a `feature_access` opt-in row, the `apply`-decision draft-generation branch (previously `isFounderAccount`-gated, ~old line 4162) now runs for everyone, and the Drafts inbox tab + badge (previously `isFounderTestAccount`-gated) is now shown to every user. The landing copy now matches reality. (Left untouched, deliberately: the QA-only `isFounderOverride` raw-lead bypass at ~`swipe.html` line 3939 — that one disables quality filtering for the founder's test account and would degrade match quality for real users if lifted; and the unrelated demo-dashboard display overrides for `mosco`'s pitch account, e.g. portal/stat counts.)
2. ~~**1-Click Verify report modal — not built.**~~ **Built 2026-11-06.** `index.html`'s Social Hiring Posts demo card now has a working "1-Click Verify" button that opens a static example report (the same 5 checks as the real `swipe.html` dossier), restyled to the teal design system in `assets/tokens.css`.
3. **TLS certificate.** GitHub Pages reports `myrolerover.com`'s cert as `bad_authz`, expiring **2026-11-13**. Site works today over HTTPS, but this isn't caused by or fixed by this branch — flag to whoever owns Pages settings.
4. **Real-device test.** Everything here was checked in emulated desktop/mobile viewports only. Not yet opened on an actual phone.
5. **Unverified page-wide claims, left as-is:** "100k+ career pages watched" / "24/7" appear in the proof strip, comparison table and final CTA. Could not verify from the frontend; "50 countries" **was** verified (counts exactly against the real location list `job-for-you.html` uses).

## 4. How to preview

Staging mirrors `index.html` + `assets/tokens.css` + `dashboard.html` on a separate Cloudflare Worker (`rolerover-staging`), **same live Supabase backend as production** — so logging in there uses your real account. It has no connection to GitHub Pages / `main` / production; redeploying it never touches `myrolerover.com`.

## 5. How to ship this to `main` when ready (not done yet — explicitly on hold per founder, 2026-11-06)

1. Resolve the open items in §3, at least #1.
2. Review the diff (`git diff main...claude/react-migration-html-9f2a7c`).
3. Merge the PR for this branch into `main`.
4. GitHub Pages auto-rebuilds `main` — that's the only moment production changes.
5. Smoke-test `myrolerover.com` immediately after: confirm `assets/tokens.css` loads (no 404), no console errors, hero/sections render.

## 6. Rollback, if ever needed

- Git tag `backup-before-redesign-2026-11-04` points at the last commit before any of this work (`87997f6`).
- Full zip of the pre-redesign site: `C:\Users\pc\Documents\auto-apply-beta-backups\rolerover-before-redesign-2026-11-04.zip`.
- A `git revert` of the eventual merge commit is the cleanest undo once this does go to `main`.
