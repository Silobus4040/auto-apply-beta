# Handoff to Claude: RoleRover Supabase Cloud -> Hetzner Migration

**Date:** November 4, 2026  
**Primary Goal:** Complete migration of RoleRover from paid Supabase Cloud (`ahpvdcdpwtdeoiatjvnq`, $71.08/mo) to self-hosted Supabase on Hetzner Bare-Metal (`135.181.120.33`) with **$0 monthly added cost**.  
**Soak Period:** Nov 3 to Nov 17, 2026. Keep Supabase Cloud 100% frozen and untouched as an instant fallback until Nov 17.

---

## 1. Quick Reference: Credentials & Endpoints

### 1.1 Hetzner Server
* **Host:** `135.181.120.33` (root)
* **SSH Key:** `c:\Users\pc\.ssh\id_ed25519_hetzner`
* **SSH Command:** `ssh -i c:\Users\pc\.ssh\id_ed25519_hetzner -o StrictHostKeyChecking=no root@135.181.120.33`

### 1.2 URLs & API Keys
* **Public Backend API Gateway:** `https://core-ffnrirrrrnwoo3837q2b9x.myrolerover.com`
* **Production Frontend:** `https://myrolerover.com` (Cloudflare Pages from `github.com/Silobus4040/auto-apply-beta`)
* **Anon Key (Hetzner):** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkzNjM1MjQxLCJleHAiOjE5NTEzMTUyNDF9.fBMO3bKfgpe2o-Y87baP1PHbgN14BBosx75QdAAQL0k`
* **Postgres Superuser:** `supabase_admin` (Note: user `postgres` is non-superuser in Supabase self-hosted)
* **Postgres Internal Port:** `5433` inside `supabase-db` container (or `5432` mapped via Supavisor pooler)
* **Storage Admin Role:** `supabase_storage_admin` (required when altering `storage.*` tables)

### 1.3 Key File Locations on Hetzner
* **Docker Compose Root:** `/root/supabase-docker/`
* **Docker `.env`:** `/root/supabase-docker/.env`
* **Edge Functions Volume:** `/root/supabase-docker/volumes/functions/`
* **Embedding Daemon Service:** `/root/embed-daemon/embed_service.mjs` (PM2 name: `local-embed-api`, port: `5150`)
* **Caddy Reverse Proxy:** `/etc/caddy/Caddyfile`

---

## 2. Status of All Components (What Was Done)

### 2.1 Storage Policies
* Storage RLS on `storage.objects` previously had 0 policies, blocking resume uploads.
* Applied 12 RLS policies granting public read/insert on `resumes`, `tailored-resumes`, `cover-letters`, `live_application`, and owner-only access on private buckets.
* Verified live upload of resumes (`.pdf`, `.docx`, `.txt`) over the public internet.

### 2.2 Local Embedding Microservice (`local-embed-api`)
* Hetzner Edge Runtime (`supabase/edge-runtime:v1.77.4`) does not have the proprietary in-process `Supabase.ai` model bundled.
* Built `/root/embed-daemon/embed_service.mjs` using `@huggingface/transformers` running `Supabase/gte-small` (384-dimensional fp32 vectors).
* Bound to `0.0.0.0:5150` under PM2 process `local-embed-api` (~300MB RAM, ~30ms latency).
* Edge functions reach it inside Docker via the bridge IP: `http://172.18.0.1:5150/embed`.

### 2.3 Edge Functions (All 7 Production Functions Deployed)
All production functions are live in `/root/supabase-docker/volumes/functions/`:
1. `match-pool-jobs`: Generates swipe deck candidates; serves `swipe.html` and `dashboard.html`.
2. `suggest-std-roles`: Fast role suggestions for onboarding; verified alias hit for "GTM Strategy" -> `Sales Operations / RevOps`.
3. `public-job-search`: Anonymous job search for `job-for-you.html`.
4. `count-available-jobs`: User profile job counter.
5. `compute-profile-embedding`: Updates candidate profile embedding using `local-embed-api`.
6. `bot-job-search`: Telegram and automated search endpoint.
7. `unsubscribe`: Email unsubscribe handler.

*Historical note:* Cloud had 7 extra functions (`backfill-title-embeddings`, `backfill-job-match-embeddings`, `backfill-hidden-job-embeddings`, `backfill-job-match-embeddings-scoped`, `embed-std-roles`, `temp-embed-text`, `temp-madrid-check`). These were one-off migration/debug scripts from Sept/Oct 2026 and are NOT used in production.

### 2.4 Database Schema & Type Alignment
* Converted `public.std_roles.id` and `public.std_role_aliases.role_id` from `text` to `uuid`. This eliminated the recurring `operator does not exist: text = uuid` error that was crashing `bot_resolve_roles_v1` and the `role-backfill` daemon.
* Created missing tables:
  - `public.job_level` (unblocked `bot_search_jobs_v1` and trigger `trg_job_pool_upsert_level`).
  - `public.onboarding_progress` and function `public.save_onboarding_progress` (for onboarding step persistence).
  - `public.ops_heartbeats` (for background daemon telemetry).
* Added critical missing indexes to `job_pool`:
  - `job_pool_title_norm_v2_active_idx ON public.job_pool (title_norm_v2(title)) WHERE is_active` (stopped statement timeouts in `claim_title_labels_v1`).
  - `job_pool_created_at_idx` and `job_pool_apply_url_idx`.
* Added 9 alias mappings linking "GTM Strategy" and "Revenue Operations & GTM Execution" to `Sales Operations / RevOps`.

### 2.5 Frontend Hardening (`onboarding.html`, Commit `b4223d0`)
* Updated `onboarding.html` to:
  - Un-hide `#resume-status` so that any unsupported file or parse issue displays clearly in amber/red.
  - Added on-demand `getSession()` fallback in `btn-resume-continue` if `currentUserId` was null.
  - Cached `selectedResumeFile` reference to prevent file drop on DOM re-renders.
  - Added anti-trap auto-navigation: If storage upload experiences any client delay, it advances to `onboarding.html?step=details` after 1.5 seconds.

---

## 3. How to Test & Verify Current Health

### 3.1 Test Edge Functions from CLI (PowerShell or Bash)
```powershell
$headers = @{
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkzNjM1MjQxLCJleHAiOjE5NTEzMTUyNDF9.fBMO3bKfgpe2o-Y87baP1PHbgN14BBosx75QdAAQL0k"
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkzNjM1MjQxLCJleHAiOjE5NTEzMTUyNDF9.fBMO3bKfgpe2o-Y87baP1PHbgN14BBosx75QdAAQL0k"
    "Content-Type" = "application/json"
}

# 1. Test suggest-std-roles
$body = @{ title = "GTM Strategy" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://core-ffnrirrrrnwoo3837q2b9x.myrolerover.com/functions/v1/suggest-std-roles" -Method Post -Headers $headers -Body $body

# 2. Test public-job-search
$body = @{ query = "Software Engineer" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://core-ffnrirrrrnwoo3837q2b9x.myrolerover.com/functions/v1/public-job-search" -Method Post -Headers $headers -Body $body
```

### 3.2 Check Hetzner PM2 Daemons
```bash
ssh -i c:\Users\pc\.ssh\id_ed25519_hetzner root@135.181.120.33 "pm2 status"
```
Ensure `local-embed-api`, `embed-daemon`, and `role-backfill` are all `online` with 0 crash loops.

---

## 4. Fallback Instructions (If Needed During Soak Period)
If an emergency requires switching back to Supabase Cloud before Nov 17, 2026:
* In `C:\Users\pc\Documents\auto-apply-beta`:
  Run `.\switch_to_supabase_cloud.ps1`
  Then `git commit -am "revert: switch back to cloud"` and `git push origin main`.
* To switch back to Hetzner:
  Run `.\switch_to_hetzner.ps1`
  Then `git commit -am "feat: switch to hetzner"` and `git push origin main`.
