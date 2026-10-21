# Manual Mode (Job Board) & Automation Integration Handoff Log

**Date:** October 21, 2026  
**Project:** RoleRover (`auto-apply-beta`)  
**Repository:** `c:\Users\pc\Documents\auto-apply-beta` (branch `main`, remote `origin/main`, deployed via GitHub Pages to `myrolerover.com`)  
**Supabase Project ID:** `ahpvdcdpwtdeoiatjvnq` (`Job Automation`, region `sa-east-1`)  
**Test Account:** `mosco@leadscompass.ai` (User UUID: `cbc2ad35-f715-466d-a9e3-e8ee4d60058e`)  

---

## 1. What We Are Trying to Achieve (Product Objective)

### The Vision
Free users receive 10 free automated applications (with AI fit scoring, resume tailoring, and automatic ATS submission). Previously, when free credits ran out, users encountered a paywall / upgrade barrier with nowhere else to go.

We are introducing a **Manual Mode (Job Board)** that exists alongside the automated swipe deck:
1. **Unscored, Raw Job Board (`jobs.html`)**:
   - Free users can browse live jobs from the 350k+ job pool (`job_pool`).
   - They read the full job descriptions themselves (no AI fit scoring, no automated CV tailoring).
   - They click **"Apply on company site ↗"** to manually fill out applications on the employer's career page (Greenhouse, Lever, Workable, etc.).
   - The user experiences the manual application grind (filling out repetitive forms, tailoring their own CVs), creating natural appreciation and urgency for the paid/credit automation.
2. **The Only Free Automation Benefit on the Manual Board**:
   - The user's assigned **RoleRover Application Email** (`Application_email` on `profiles`) is displayed in an optional tip box with a 1-click **Copy** button.
   - If the user chooses to paste this email into the company's application form, employer replies (interview invites, acknowledgments) automatically appear in their dashboard mailbox (`emails` table).
   - Users are completely free to use their personal email if they prefer; we do not track or spy on manual applications.
3. **Credit Counter & 0-Credit State**:
   - The credit balance (`credits / limit`) remains visible in Manual Mode so users remember their automation allowance.
   - If credits hit 0, an informative banner appears: *"Out of credits? You can still browse every job for free and apply yourself on the employer site!"* alongside an Upgrade CTA.
4. **Seamless Switching**:
   - Top header toggle: **`⚡ Automation | 📋 Manual Mode`**.
   - Left sidebar navigation item: **`Job Board (Manual)`**.
   - Automation deck (`swipe.html`) and Dashboard (`dashboard.html`) remain completely intact.

---

## 2. Testing & Gating Strategy (Crucial)

To ensure live paying and free users do not see this feature until it is confirmed stable:
- The feature is gated via a database table `public.feature_access` with Row-Level Security (`RLS`).
- Currently, only the test account `cbc2ad35-f715-466d-a9e3-e8ee4d60058e` (`mosco@leadscompass.ai`) has `manual_mode = true`.
- In `dashboard.html`, `swipe.html`, and `jobs.html`, the switcher and sidebar links only render for authorized test users. Unauthorized users navigating directly to `jobs.html` are redirected to `dashboard.html`.

---

## 3. What Has Been Implemented So Far

### A. Database Changes (`ahpvdcdpwtdeoiatjvnq`)
1. **`public.feature_access` Table Created**:
   ```sql
   create table public.feature_access (
     user_id uuid not null references auth.users(id) on delete cascade,
     feature text not null,
     enabled boolean not null default true,
     note text,
     created_at timestamptz not null default now(),
     primary key (user_id, feature)
   );
   alter table public.feature_access enable row level security;
   create policy "Users read own feature access" on public.feature_access
     for select to authenticated using ((select auth.uid()) = user_id);
   ```
   - Seeded with:
     - `user_id`: `cbc2ad35-f715-466d-a9e3-e8ee4d60058e`
     - `feature`: `'manual_mode'`
     - `enabled`: `true`

2. **Policy on `public.job_pool`**:
   - Executed: `create policy "Authenticated users read active jobs" on public.job_pool for select to authenticated using (is_active = true);`
   - *Note on RLS:* By default `job_pool` had RLS enabled and direct browser queries using the Supabase publishable `anon` key returned empty arrays `[]`.

### B. Frontend Code Changes
1. **`jobs.html` (Newly Created)**:
   - Full 2-pane layout (left: job card feed with search input & workplace filter; right: sticky detail panel with company info, tags, application email copy box, external apply button, and full job description).
   - Shows credit balance in header.
   - Includes top banner with a CTA to return to the Job Deck (`swipe.html`).
   - Logs `manual_apply_click` via `supabaseClient.rpc('log_upgrade_event', ...)` for funnel analytics.
2. **`dashboard.html`**:
   - Injected `checkManualModeAccess(user.id)`.
   - Injects the `⚡ Automation | 📋 Manual Mode` pill into `.page-header` for the test user.
   - Injects `Job Board (Manual)` link into `.app-sidebar .sidebar-nav`.
3. **`swipe.html`**:
   - Injected `checkManualModeAccess(user.id)`.
   - Injects mode switcher into `.page-header` and `Job Board (Manual)` into the sidebar.

### C. Git Commits & Deployment
- `06c177f`: *feat: add gated Manual Mode Job Board (steps 1-3) for test account*
- `976fe2c`: *fix: ensure test user ID cbc2ad35 always displays Manual Mode*
- Both committed and pushed to `origin/main` (GitHub Pages live at `myrolerover.com`).

---

## 4. Current Pipeline Investigation: How Automation Searches Jobs

In response to the user's issue: **"why did searching for 'Backend Engineer' return 0 jobs on `jobs.html`?"**

We investigated the actual search engine used by the automation in the backend edge functions:
1. **The Edge Function: `match-pool-jobs` (v76)**:
   - When the user opens `swipe.html`, it calls `supabaseClient.functions.invoke('match-pool-jobs')`.
   - It connects via Postgres directly (`npm:postgres@3.4.4`) with service-level DB permissions.
   - It reads the user's `profiles.target_job_titles` (e.g. `'Backend Engineer, Backend Software Engineer'`) and `profiles.target_role_family` (e.g. `'Backend Engineering'`), plus `profile_role_families` mapping.
   - It expands the roles using the DB helper function:
     ```sql
     select public.profile_role_family_terms(userId, target_job_titles, target_role_family)
     ```
   - It queries `public.job_pool` matching active jobs using:
     ```sql
     public.role_family_matches(familyMatchInput, jp.title)
     ```
   - Candidates are inserted into `job_queue_assignments` for the user, scored by the AI scorer model (`claude-haiku-4.5-role-aware-v4`), stored in `job_fit_scores`, and returned to the swipe deck.

2. **Why `jobs.html` returned 0 jobs for "Backend Engineer"**:
   - In `jobs.html`, the search currently executes directly in the browser:
     ```javascript
     supabaseClient
       .from('job_pool')
       .select('id, title, company_name, company, location, workplace_type, apply_url, created_at, salary_range')
       .eq('is_active', true)
       .neq('source_ats', 'ashby')
       .textSearch('title_tsv', keywordInput, { type: 'websearch' })
       .order('created_at', { ascending: false })
       .limit(30)
     ```
   - **Root Cause 1: `title_tsv` websearch syntax**: `textSearch('title_tsv', 'Backend Engineer')` in PostgREST requires both tokens to match depending on TSV language configuration or stemming, whereas titles in `job_pool` often contain `Backend Software Engineer`, `Senior Backend Engineer`, etc.
   - **Root Cause 2: RLS session token vs Anon key**: If `supabaseClient.auth.getSession()` token isn't propagated or if RLS policy on `job_pool` evaluates to empty for the current request, PostgREST returns `200 []` without throwing an error.
   - **Root Cause 3: The Automation uses `role_family_matches` or `ilike`**:
     Testing in SQL confirmed that:
     ```sql
     where is_active = true and (title ilike '%Backend%' or title ilike '%Engineer%')
     ```
     instantly returns hundreds of high-quality active jobs in `job_pool`.

---

## 5. Immediate Next Steps for Claude

1. **Fix Job Search in `jobs.html`**:
   - Replace the brittle `textSearch('title_tsv', ...)` with an `or` ILIKE or a dedicated RPC function.
   - For example:
     - When the user searches `Backend Engineer`, split keywords and construct `.or(`title.ilike.%${k1}%,title.ilike.%${k2}%`)`.
     - Or even better, create a simple database function `public.search_board_jobs(search_query text, filter_wp text, page_limit int, page_offset int)` that returns active jobs from `job_pool` using `public.role_family_matches` or ILIKE fallback.
   - Ensure `jobs.html` passes the user's `session.access_token` so that authenticated RLS policies are satisfied, or have the RPC run as `security definer` accessible to `authenticated` users.

2. **Verify with User**:
   - Test `jobs.html` under `mosco@leadscompass.ai` with `"Backend Engineer"` and verify that relevant backend roles (from Affirm, Asana, FairMoney, Roblox, etc.) appear instantly in the left feed.
   - Verify that clicking a job loads the full `description_text` in the right pane.
   - Verify that clicking "Apply on company site ↗" opens the employer's ATS URL.
   - Verify that clicking "Copy" on the application email copies `mosco@careermailing.com` to the clipboard.

3. **Check n8n Daily Digest (Step 5)**:
   - Workflow for daily manual job digest is planned to remain inactive until full public rollout.

---

## 6. Search Fix Applied — October 21, 2026 (commit `84402cb`)

**Root-cause re-check (Supabase docs + live SQL, project `ahpvdcdpwtdeoiatjvnq`):**
Full Text Search guide: https://supabase.com/docs/guides/database/full-text-search

- **Root Cause 1 (websearch syntax) — NOT the actual bug.** Ran the exact production query
  directly in SQL: `title_tsv @@ websearch_to_tsquery('english', 'Backend Engineer')` already
  matches `'Senior Backend Software Engineer'` (Wing), `'Golang Backend Engineer - Nigeria'`
  (FairMoney), etc. — `websearch_to_tsquery` ANDs stemmed lexemes regardless of word order, so
  it does *not* require an exact phrase match. `title_tsv` is a generated column
  (`to_tsvector('english', title || ' ' || company_name)`) with a GIN index
  (`job_pool_title_tsv_idx`), configured correctly.
- **Root Cause 2 (RLS / session token) — confirmed real, and already fixed by the policy in §3.A.2.**
  Reproduced directly: querying `job_pool` with only the publishable key (no authenticated
  session Bearer token) returns `200 []` — the `"Authenticated users read active jobs"` policy
  is scoped `to authenticated`, so an anon-role request is correctly blocked. `jobs.html` already
  follows the same `createClient` + `getSession()` pattern as `dashboard.html` (which performs
  authenticated `job_pool` reads successfully today), so no code change was needed here — the
  originally-reported 0-results likely predated this policy existing.
- **Root Cause 3 (automation's ILIKE approach) — adopted.** Confirmed in SQL that
  `title ilike '%Backend%' and title ilike '%Engineer%'` (AND, not OR — broader OR would surface
  irrelevant "Engineer"-only titles) returns the exact four companies named in testing (Affirm,
  Asana, FairMoney, Roblox) and is index-accelerated via the existing
  `job_pool_title_trgm_idx` (pg_trgm GIN index) — `EXPLAIN ANALYZE` showed ~30ms for a two-word
  search over 170k+ active rows, no new index needed.

**Change shipped:** `jobs.html` `loadJobs()` now splits the keyword input on whitespace and
chains `.ilike('title', '%word%')` once per word (AND semantics) instead of
`.textSearch('title_tsv', ..., {type:'websearch'})`. No RPC was needed.

**Not yet verified:** end-to-end browser login as `mosco@leadscompass.ai` (no stored password for
the test account in this environment, and minting a session token server-side was blocked by this
session's own safety controls as credential-adjacent). The DB-level predicate the UI now runs has
been verified directly against the live table to return the expected rows. **Next session/human
should log in as the test account and visually confirm** the feed populates for "Backend Engineer"
and other free-text terms, per §5.2 above.
