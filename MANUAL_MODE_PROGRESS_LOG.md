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

---

## 7. Live Bug Found While Testing (founder session, same day) — commit `e20ca86`

Founder opened `jobs.html` locally (already authenticated via a prior local session) and the page
hung forever on the static "Loading jobs from pool..." placeholder — not the `loadJobs()` "Searching
live job pool..." state, meaning it never got that far.

**Root cause:** the `init()` IIFE had **no error handling at all**. If `getSession()`, the
`feature_access` check, or the `profiles` fetch returned an error or an unexpected shape (e.g.
`profile` ending up `null`), the subsequent code (`profile.applications_limit`, etc.) threw, the
async IIFE rejected silently, and `loadJobs()` was never reached — leaving the user on an
indistinguishable-from-"still loading" blank state forever, with no error visible anywhere
(not even the browser console affects what the user sees).

**Fix:** wrapped `init()` in try/catch, check `.error` on every Supabase call explicitly, and on
any failure render the real error message directly in `#job-list-container` instead of leaving the
placeholder frozen.

**Also found + fixed while investigating:** `public.feature_access` had RLS **enabled with zero
policies** (verified via `pg_policies` — the "Users read own feature access" policy described in
§3.A.1 was never actually applied to the live DB, despite being in this log). This didn't affect
`mosco@leadscompass.ai` (bypasses the check via the hardcoded UUID in code), but would have
silently denied manual-mode access to any *other* test user granted via `feature_access.enabled =
true`. Applied the missing policy via migration `feature_access_read_own_policy`:
```sql
create policy "Users read own feature access" on public.feature_access
  for select to authenticated using ((select auth.uid()) = user_id);
```
Confirmed live via `pg_policies`.

**Still open:** the underlying trigger for the founder's specific hang (which Supabase call
actually failed/returned null) was not captured — the try/catch will surface it on next reload if
it recurs. Founder to confirm after refreshing whether the Job Board now loads or shows a specific
error.

**Resolved:** founder tested after the fix — Job Board loaded correctly (credits 50/70, feed
populated). No recurrence of the hang.

---

## 8. Search rebuilt to match automation's taxonomy+embeddings system — commit `33b1b1f`

Founder flagged that automation's job-matching system has moved on since this doc's §4 was
written (which described `role_family_matches`/an edge function — now defunct) and asked whether
Manual Mode's search uses the same system. It did not. Traced the **current, live** system by
reading function definitions directly off the DB (not assuming from old docs):

**How automation matches jobs today (fully rolled out, 102/102 profiles on "matching_v2"):**
- `profile_target_roles` maps each user to one or more `std_role_id`s (a 163-row standardized
  taxonomy in `std_roles`).
- `std_role_aliases` (472 rows) resolves free-text titles/phrases to a `std_role_id` — an **exact**
  alias match is instant (`enqueue_title_labels_v1`'s fast path).
- For titles with no exact alias hit, `claim_title_labels_v1` builds a shortlist by cosine-distance
  (`<=>`) over `std_roles.embedding` vs that job's `job_pool.job_match_embedding` (generated by an
  always-on external daemon on the Hetzner box, `pm2` process `embed-daemon`, tracked in
  `pipeline_heartbeat`/`embedding_health()`), merged with alias candidates, then an LLM judge
  ("JEV", see `jev_prompt_test_cases`) picks the final role from that shortlist via
  `save_title_label_v1`. Result cached once per distinct normalized title in `job_title_labels`
  (95,821 of 170,377 active jobs classified as of today, ~56%).
- `std_role_neighbors` (654 rows) broadens a role to "nearby" roles for extra candidates.
  **Verified live that `std_role_neighbors.distance` IS precomputed embedding cosine distance**
  between the two roles' `std_roles.embedding` vectors (checked a sample: stored distance matches
  a live `embedding <=> embedding` calculation to 6 decimal places) — so this table is literally
  where the embeddings signal lives for retrieval purposes.
- The live swipe-deck query itself (`deck_candidates_v3`, called by `find_matching_jobs`) does
  **not** recompute anything — it just reads `job_title_labels.role_id` + `std_role_neighbors`.
  The embedding work already happened upstream, once, when the title was classified.

**Shipped:** new Postgres function `public.search_board_jobs_v1(p_query, p_workplace_type,
p_limit)` (migration `search_board_jobs_v1` on project `ahpvdcdpwtdeoiatjvnq`). Resolves the
keyword via exact `std_role_aliases` match, then a fallback where every word of the query is a
token of some alias/role name; broadens via `std_role_neighbors`; queries `job_title_labels` ->
`job_pool`. Falls back to the previous per-word ILIKE title browse only when nothing resolves
(company names, typos) or the search box is empty, so the board is never empty-for-no-reason.
Deliberately does **not** import `deck_candidates_v3`'s 48h-freshness / workplace_type-not-null /
salary_claimed_at-not-null gates — those are specific to the curated swipe deck, not Manual Mode's
"browse everything" design intent (§1).

**Verified against the live DB before shipping** (not just assumed): comparing the new resolver's
"Backend Engineer" results against the old ILIKE approach found 511 real backend-engineering jobs
the old ILIKE search could never find (e.g. "Application Programmer (EBS)" at Horizon Industries,
"Staff Software Engineer-ClickHouse Committer" at edb, "OCaml Developer" at Ahrefs — all correctly
taxonomy-classified as Backend Engineer despite the title containing neither "backend" nor
"engineer"). Verified live in a real authenticated browser session (founder logged in) — search
populated correctly, and the "Application Programmer (EBS)" card opened with a working detail
panel, apply link, and email-copy box.

Docs referenced: https://supabase.com/docs/guides/database/full-text-search (confirmed this new
function doesn't need it — PostgREST filters can't express the alias/neighbor-join logic, hence an
RPC, same pattern the docs' own "Extending functionality with RPC" section recommends).

---

## 9. Country / remote-scope geo-eligibility added to Manual Mode — commits `918d8cd`

Founder asked for the same country/global-remote eligibility mechanics automation uses. Traced
automation's gate (`job_gate_v3` -> `geo_gate_v2`, reading `profiles.country/state/city/
remote_scope`, `job_pool.remote_geo_scope/remote_geo_regions`, cached per-country verdicts in
`job_geo_checks`) and extended `search_board_jobs_v1` (migrations `search_board_jobs_v1_add_geo`,
then `search_board_jobs_v1_drop_old_overload` to remove a stale 3-arg overload `create or replace`
left behind — Postgres treats a different parameter list as a new overload, not a replacement)
with `p_country`, `p_remote_scope` ('local'/'global'/'both'), `p_hide_closed`. Builds the same
`geo_gate_v2` inputs (`resolve_country_iso2`, `get_country_region`, `get_country_continent`,
`get_country_match_terms`) from a plain country string since Manual Mode has no city/state field.

`jobs.html` gained: a country text input, a remote-scope select, and a "Hide geo-closed" checkbox
— both country and scope prefill from `profiles.country`/`profiles.remote_scope` (same fields
automation reads). Each card now shows an Open / Check eligibility / Likely closed badge; closed
jobs stay visible by default (Manual Mode's "see everything" ethos) and are only hidden when the
checkbox is ticked.

No new Supabase product/feature is introduced here (same Postgres functions/RPC pattern as §8), so
no additional doc link beyond the one already logged there.

**Verified live, not just assumed:**
- A job with `remote_geo_scope='anywhere'` (e.g. "Staff Software Engineer" at B12, location
  "Anywhere") returns `geo_status='open'` regardless of country.
- A job with `remote_geo_scope='restricted'`, `remote_geo_regions=['US']` returns `'open'` for
  country="United States" and `'closed'` for country="Nigeria".
- An on-site job correctly gates on its `location` text against the country, not on
  `remote_geo_scope` (a stale/irrelevant field for on-site rows).
- End-to-end in mosco's real authenticated session (country=Nigeria, scope=global, prefilled
  correctly from his profile): "Hide geo-closed" surfaced real Nigeria-eligible roles — e.g.
  OpenFn's "Staff Software Engineer (Back-End)" which explicitly lists Nigeria in its location
  text — and hid country-restricted ones (Affirm's Remote-Canada/Remote-US/Remote-Poland/
  Remote-Spain postings, Toronto/Gurgaon/Bucharest on-site roles, etc.).
- For mosco's actual profile settings (Backend Engineer, Nigeria, global scope) the honest count
  across the full 5,721-job taxonomy pool: **87 open, 60 check, 5,574 closed.** Automation's own
  `job_gate_v3` independently agrees at the same order of magnitude (47 total candidates survive
  its combined freshness+workplace+level+role+geo gates, all landing in `'check'`, zero `'open'`)
  — the two numbers aren't identical (automation also requires 48h freshness, workplace_type/
  salary enrichment completion, and dedup against swipes/applications that Manual Mode
  deliberately skips), but they agree on the underlying geo picture: very few backend-engineering
  remote jobs in the pool right now are confidently open to a Nigeria-based, global-scope
  applicant. Worth the founder's attention separately from this search work.

---

## 10. Workplace-type filter rebuilt to match automation + researched Indeed live — commit `73f12a9`

Founder asked (a) to keep the location/country field separate from workplace type, and (b) to use
"the workplace type we use on automation" instead of a single-select Remote/Hybrid/On-site
dropdown. Traced `dashboard.html` (lines ~2275, ~2550): `profiles.workplace_type` is a
**comma-separated multi-select** ("Remote,Hybrid"), and the dashboard's own pref-chip rendering
further expands "Remote" into **"Remote (Global)" / "Remote (Local)"** chips based on
`profiles.remote_scope` — it does not use a separate standalone scope dropdown either.

Rebuilt `jobs.html`'s filter bar to match exactly: On-site / Hybrid / Remote checkboxes
(multi-select, not single dropdown), with Remote (Global) / Remote (Local) sub-checkboxes that
only appear once Remote is checked — same labels, same data source (`profiles.workplace_type`,
`profiles.remote_scope`), same prefill. `search_board_jobs_v1` updated to take
`p_workplace_types text[]` (was a single `text`) — migration `search_board_jobs_v1_multiselect_
workplace`, same "drop the old overload" step as before.

Separately, founder asked to research how Indeed does job search rather than reinvent our own
design ("enter the internet and find out"). Went to `ng.indeed.com` and `www.indeed.com` directly
(no official API exists — a web search turns up only third-party scrapers) and tested live:
- Indeed uses **one combined location box** ("City, state, zip code, or 'remote'"), not separate
  country/scope controls — the founder's separate-location instruction above overrides copying
  this specific part.
- When location is ambiguous, Indeed shows a one-time **Yes/No disambiguation prompt**
  ("Showing jobs in Nigeria. Want remote only?") rather than a persistent scope dropdown.
- Indeed's "Remote" filter is a **plain workplace-type checkbox** (Remote vs Hybrid), with no
  local/global distinction — that distinction lives in a separate "Residency Requirement" facet
  (US states on the main site) that works as a **silent filter**, never a visible per-card badge.
- Job cards on Indeed show no eligibility/residency info at all.

Applied the one directly-portable lesson: **dropped the Open/Check/Closed per-card badges and the
separate "Hide geo-closed" checkbox.** Country is now a quiet filter — geo-closed postings are
simply excluded from the result set once a country is set, exactly like Indeed's Residency
Requirement facet, with no visible label. Verified live in mosco's session: Remote (Global)
prefills checked / Remote (Local) unchecked (matches his `remote_scope='global'`), country
prefills "Nigeria", and the list is Remote-only with no geo-closed postings and no badges.

---

## 11. Bigger text + one-time email nudge — commit `155bbd8`

Two founder-reported UX issues from testing live:

1. **Text too small** — bumped font sizes across the board (search box, filter checkboxes,
   country field, job card title/company/meta pills, detail-pane title/company, description
   text, Apply button) to roughly match Indeed's scale, checked directly against the
   `indeed.com`/`ng.indeed.com` screenshots from §10's research. Job titles especially (`.card-title`
   1.05rem -> 1.3rem, `.detail-title` 1.35rem -> 1.6rem) were noticeably smaller than Indeed's
   before this.

2. **Email nudge box disrupting the view** — it re-rendered inside every job's detail pane on
   every card click. Added `profiles.has_seen_manual_email_nudge` (migration
   `profiles_add_manual_email_nudge_seen`) and an "Understood" button, mirroring the exact
   `has_seen_inbox_intro` pattern `dashboard.html` already uses for its own one-time inbox intro
   (localStorage for instant dismiss + a profiles column for cross-device durability). Verified
   live: dismissing it removes the box immediately, it does not reappear when selecting a
   different job, and it stays gone after a full page reload — confirmed
   `has_seen_manual_email_nudge = true` in the DB for mosco afterward.

---

## 12. Total result count shown — commit `2725034`

Founder asked for the number of jobs found to be visible (Indeed-style), not just the 30-row page.
`search_board_jobs_v1` now returns `total_count` via `count(*) over()` (migration
`search_board_jobs_v1_add_total_count`) — correct because a window function sees every qualifying
row before `LIMIT` trims the result set, so it's the true match count, computed in the same query
(no second round trip). `jobs.html` renders `"N jobs found (showing 30)"` above the list.

Verified live: Backend/Remote/Nigeria/Global search showed "119 jobs found (showing 30)", matching
the independently-run SQL count from §9/§10's testing exactly.

---

## 13. Pagination instead of an automation-style cap — commits `068b7c4`, `c8c53ca`

Founder pointed out automation intentionally caps around ~150 jobs shown per user, to limit paid
AI fit-scoring calls (`assign_pending_matches_v2`'s `score-deck` webhook), and asked how Manual
Mode balances that same cost concern. Answer: it doesn't need to. Manual Mode is a plain indexed
Postgres query over data that's already classified/embedded offline — there is zero marginal AI
cost per job shown, so capping it the same way would hide the pool for no reason.

Added `p_offset` to `search_board_jobs_v1` (migration `search_board_jobs_v1_add_offset`, same
drop-old-overload step as every prior signature change) and a "Load more (N remaining)" button so
users can page through the **full** matching pool rather than being stuck on the first page while
the count display claimed more existed. Verified live: page 1 (30 rows) and page 2 (30 rows) have
zero id overlap, an offset landing mid-pool correctly returns the remaining partial page, and
`total_count` stays identical (119) across every page. Page size was then tweaked from 30 -> 10 per
the founder's follow-up ask.

---

## 14. "Related" pill was half-finished — commit `3b93ab3`

Founder caught two real problems with the §9 "Related: X" pill (shown when a job matched via a
`std_role_neighbors` broaden rather than the user's direct target role): its tooltip said "via a
nearby role in our taxonomy" — internal terminology leaking to end users — and it was styled like a
tag/chip (implying clickability) but had no click handler at all, a dead end.

Fixed both: relabeled to "Similar role: X" with a plain tooltip ("See more X jobs"), and gave it a
real function — clicking it now sets the search box to that role name and re-runs the search, via a
delegated click listener on `#job-list-container` (survives card re-renders; `stopPropagation` so
it doesn't also select the underlying card). Verified by dispatching a synthetic click on a test
pill and confirming it set `filter-keyword` and triggered a new search.

---

## 15. Job age label removed — commit `2b43388`

Founder asked where the "1mo ago"/"Today" label on each card came from. Checked directly:
`job_pool.created_at` defaults to `now()` and is set when our pipeline **first discovers/ingests**
a posting — not the employer's actual posting date (which we generally don't capture; the only
exception is an unparsed, raw `zoho_date_opened` for Zoho-sourced jobs). Confirmed with a live
sample (an Elastic posting with `created_at` 92 days before `last_seen_at` = today) that the label
was really "how long we've tracked it," not "posted X ago" — a real risk of misleading users.
Founder decided to just remove it rather than relabel. Dropped the `card-time` span, the now-unused
`timeAgo()` helper, and its CSS rule.

---

## 16. "JWT expired" root cause fixed — commit `20ca335`

Founder hit the try/catch error message added in §7 ("profile fetch failed: JWT expired") — that
error-surfacing worked as designed (no more infinite spinner), but the underlying cause was real:
`getSession()` only reads whatever's cached in `localStorage`; it doesn't validate against the
server. A tab left open/asleep long enough (supabase-js's background auto-refresh timer doesn't
run while backgrounded or the machine is asleep) ends up with a genuinely stale access token by the
time the next query fires.

Fixed: right after `getSession()`, check `session.expires_at` and force a `refreshSession()` only
when the cached token is within 60s of (or past) expiry; if that refresh itself fails, send the
user back to `login.html` instead of showing an error. Deliberately conditional — an unconditional
refresh-every-load version was tried first and risked racing supabase-js's own background refresh
(refresh tokens are single-use under rotation, so a redundant call can get rejected). Verified a
normal session (63 min remaining) loads cleanly with the refresh correctly skipped.

Also investigated a recurring `"status 400"` console error seen during this testing: traced it
(via a temporary fetch-hook, then removed) to the Cloudflare Insights analytics beacon's CORS
fallback getting rejected by Cloudflare because `localhost` isn't a registered site with them —
unrelated to this app, local-testing-only noise, no fix needed.

---

## 17. Workplace-type filter race condition — commit `65508c0`

Founder reported on the live production site: checking "On-site" only still showed Remote jobs
mixed in. First ruled out the obvious suspects — fetched `jobs.html` fresh from `myrolerover.com`
with `cache: 'no-store'` and confirmed production had every one of today's fixes already deployed
(not a stale-cache issue), and confirmed `search_board_jobs_v1` itself filters correctly when
called directly with the exact same params (SQL and a manual `supabaseClient.rpc()` call both
returned 7 correct On-site-only rows).

Reproduced the real bug via actual UI clicks on the local copy (not synthetic value-setting):
check On-site -> uncheck Remote -> click Search. Every checkbox change fires its own independent
`loadJobs()` call without awaiting or cancelling the previous one — the click on On-site fired a
search that captured `workplace_types=['On-site','Remote']` (both still checked at that instant,
before Remote was unchecked a moment later), and whichever response happened to land last on the
wire overwrote `loadedJobs`, regardless of which request was actually the most recent.

Fixed with a monotonic `searchSeq` counter: each `loadJobs()` call captures its own sequence number
at the start and only applies its response if it's still the latest call issued by the time the
response arrives; anything superseded by a newer search is silently discarded. Verified with the
exact reported repro — reliably shows 7 On-site-only jobs now, no Remote jobs mixed in.

---

## 18. On-site matching was continent-wide, not country-wide — migration `search_board_jobs_v1_fix_onsite_country_scope`

Founder then caught a second, real bug in the SAME On-site+Nigeria search: it still showed on-site
jobs physically located in Cape Town and Johannesburg, **South Africa**. Traced directly:
`get_country_match_terms('Nigeria')` returns `["Africa", "EMEA", "NG", "NGA", "Nigeria"]` — and
§9/§10's `search_board_jobs_v1` reused that SAME broad term list to build `v_onsite` (the pattern
list `geo_gate_v2` matches an on-site job's location text against). "Africa"/"EMEA" are correct
inclusion terms for REMOTE-eligibility (a "Remote - EMEA" posting genuinely is open to someone in
Nigeria), but wrong for physical on-site location — being on the same continent doesn't mean
someone can commute there. Automation's own `job_gate_v3` never has this problem because its
`v_onsite` is built only from the profile's literal `city/state/country` (+ `target_location`),
never from region/continent terms — a narrower input Manual Mode's country-only field doesn't have
on hand, so it needs its own fix.

Fixed by building a separate, narrower term list for on-site matching — `v_country_only_terms`,
pulled directly from `country_regions.iso2/iso3/canonical_name/variants` for the resolved country,
explicitly excluding `region`/continent — and using that for `v_onsite` instead of the full
`v_country_terms`. `v_local`/`v_global` (the remote-eligibility matching) are untouched and still
use the full region-inclusive term list, since that behavior was correct.

Verified: the Nigeria/On-site/Backend search dropped from 7 rows (including 2 South Africa jobs)
to 1 (only the genuine Lekki, Lagos, Nigeria posting). Confirmed remote region-matching is
unaffected — Backend Engineer/Remote/Nigeria/global still returns the same 59 open / 60 check
split as before this fix. Verified live via the exact reported repro in the browser.

---

## 19. Manual Mode rebuilt as a true deck on `find_matching_jobs` — commit `8ca8de9`

Founder decided Manual Mode should be "on deck just like automation": same candidate-selection
query automation's swipe deck uses, buttons just Pass / Apply-on-company-site, only skipping AI
scoring and CV/cover-letter/auto-submit. This superseded the entire §8-18 search-board design
(`search_board_jobs_v1`, keyword/country/workplace filters) — founder confirmed via two explicit
choices: Pass/Apply write to `user_job_swipes` (shared dedup with automation, not separate), and
the search bar is removed entirely (pure deck, no override).

Replaced the whole filter UI and RPC with a single-card deck calling `find_matching_jobs` (->
`deck_candidates_v3`) directly as the authenticated user — the **exact** function automation's
`match-pool-jobs` edge function calls server-side (that edge function also does paid AI
fit-scoring before queueing into `job_queue_assignments`; Manual Mode skips that step and
everything downstream of it, read straight from the edge function's own deployed source, fetched
via `get_edge_function`). Same profile-driven matching (target roles, country, workplace type,
remote scope), same geo/level gating, same dedup against past activity — no client-side prefill
needed since `find_matching_jobs(p_user_id, ...)` reads the profile server-side itself.

Pass and Apply both write to `user_job_swipes` with the same `decision` values (`'skip'`/`'apply'`)
and the same upsert shape (`onConflict: 'user_id,job_pool_id'`) automation's `swipe.html` uses
(`finishSwipe`/`submitApplyForJob`) — so a job seen in either mode won't reappear in the other.
Unlike automation's own Apply swipe, `applyCurrentJob()` never calls the AI-tailoring/auto-submit
webhook and never touches `applications_limit`/`application_credit_used`.

**Required real backend fixes to make this callable at all**, not just a frontend change:
automation has only ever invoked `find_matching_jobs`/`deck_candidates_v3` server-side with a
service-role key, which bypasses RLS. Verified via an impersonated-authenticated-role SQL call
(`set local role authenticated; set local request.jwt.claims = ...`) before touching the
frontend, and found `job_title_labels`/`std_role_neighbors`/`country_regions`/`job_geo_checks`/
`location_names_v2`/`location_patterns_v2` all had RLS enabled with **zero policies** (same bug
pattern as the earlier `feature_access` incident), and `job_level` lacked even a table grant —
every one of these would have silently (`job_title_labels`) or loudly (`job_level`: hard
permission-denied error) blocked a real end-user call. Added read-only policies/grants for
`authenticated` on all of them (reference/lookup data, nothing user-specific), plus `EXECUTE` on
`geo_gate_v2` (migrations `allow_authenticated_read_deck_matching_reference_tables`,
`allow_authenticated_read_job_level`).

Verified live end-to-end as mosco (real authenticated session, not superuser): deck loaded
matching the impersonated-SQL candidate count exactly; Pass recorded `decision='skip'` in
`user_job_swipes` for the right `job_pool_id` and advanced to card 2; Apply recorded
`decision='apply'` for the right job and left `application_credit_used` unchanged (confirmed
before and after).

---

## 20. Deck visibility parity fixed: `p_include_check` must be `false` — commit `292dbdc`

The §19 rebuild shipped with `p_include_check: true`, which asks `find_matching_jobs` for
ambiguous (`geo_status='check'`) jobs too, rendering them with an "Eligibility: please verify"
badge. Founder pushed back hard on this specific badge showing on a real card, which led to
reading `match-pool-jobs`'s actual deployed source (fetched via `get_edge_function`, not assumed):
its final query is `job_gate_v3(...) where g.eligible`, and `eligible` requires
`geo_status = 'open'` specifically — automation **never** shows a `'check'` job to a real user, it
silently withholds it until a background worker resolves it one way or the other. For "the full
job calling must be same" to actually hold, Manual Mode can't show more than the real deck does
either.

Set `p_include_check: false` and dropped the now-dead badge (`geo_status` can no longer be
`'check'` on any row `find_matching_jobs` returns with that flag false). Verified live after the
separate geo-check pipeline fix landed (see founder's Run 202 in the main `stagehand_poc`
`PROGRESS_LOG.md`, fetched from `origin/master` directly since the local worktree copy was two
weeks stale — queue drained 640 -> 0, model migrated `typesafe/jev-router` ->
`cf-llama-3.3-70b-jev-v1` on Cloudflare): mosco's deck correctly shows "Job 1 of 8", matching the
live open-candidate count verified independently via an impersonated-role SQL call, no badge.

**Standing lesson from this whole thread, worth repeating:** this session's own understanding of
`deck_candidates_v3`/`job_gate_v3` went stale mid-session (the 48-hour freshness window was
removed system-wide in master's Run 201, between when this thread first read those functions and
when it re-read them days later) — always re-fetch live function definitions and check
`origin/master`'s `PROGRESS_LOG.md`/`TRACKER.md` before trusting cached understanding of a
fast-moving shared system, not just this session's own earlier tool results.

## 21. Naming settled on "Free Job Deck"; mobile sidebar close bug fixed — commit `b323736`

Founder picked **"Free Job Deck"** as the final name (rejected "Job Board (Manual)" and "Free Job
Search"). Renamed every user-facing occurrence: `jobs.html`'s `<title>`, sidebar nav link, `<h1>`,
mode-toggle pill, and the deck-load error message; plus the parallel mode-switcher injection code
that `dashboard.html` and `swipe.html` each carry their own copy of (their pill label and the
dynamically-inserted sidebar link text). Internal JS variable/comment names still say "manual" in
places — cosmetic only, left as-is.

Founder also reported a real mobile bug: tapping outside the open sidebar menu did nothing, the
only way to close it was tapping a nav item. Checked the actual CSS/JS (`grep` for
`toggleSidebar|app-sidebar`) and confirmed there was genuinely no backdrop/overlay element at
all — `.app-sidebar.open` was just a bare CSS transform with zero outside-click handling. Added a
`.sidebar-backdrop` div (fixed, full-viewport, semi-transparent, `display: none` until
`@media (max-width: 900px) .open`) wired to call the existing `toggleSidebar()` on click, and added
an `Escape`-key listener that does the same. Verified live in the browser pane at 375x812 (mobile
preset): opened the menu via the hamburger button, confirmed via DOM inspection
(`app-sidebar`/`sidebar-backdrop` `.open` classes) that clicking the backdrop closes it, reopened,
confirmed Escape closes it too. Only `jobs.html` has this issue/fix — `dashboard.html`/`swipe.html`
were not checked for the same gap and may need the identical treatment later if reported.

Founder asked whether "Dedicated mailbox" and "Dashboard" should stay visible to Free Job Deck
users, given automation doesn't log manual applications into `job_applications`. Answered: keep
both. The mailbox/inbox is Resend-based tracking of *incoming* email tied to the profile's
dedicated address — it works independently of `job_applications` and benefits a manual-mode user
exactly the same way (replies to applications they made by hand on a company's career page still
land there). "Dashboard" is the account home/settings hub, not purely an automation-stats page, so
hiding it would just make it harder to get back to settings/credits — no actual data collision
either way since nothing here writes a fake automation-tracked application.

## 22. Free Job Deck timeout: logged-in limit 8s -> 15s; mosco moved to New York for testing (2026-10-28)

**Problem (proven):** the deck's search (`find_matching_jobs`) is called straight from the browser as
role `authenticated`, which Supabase limits to 8s. For mosco it was being cancelled (code 57014).
Automation reaches the same function through `match-pool-jobs` with a 15s limit.

**Change:** migration `authenticated_statement_timeout_15s` =
`alter role authenticated set statement_timeout = '15s'; notify pgrst, 'reload config';`
Docs: https://supabase.com/docs/guides/database/postgres/timeouts#role-level
Verified in `pg_roles`: authenticated=15s (anon 3s, authenticator 8s unchanged). Affects every
logged-in browser request. Rollback: set it back to '8s' and `notify pgrst, 'reload config'`.

**Test persona:** mosco (`cbc2ad35-...`) city/state/country changed Lagos/Lagos/Nigeria ->
New York/New York/United States so the deck has jobs to test. (Standing default is Nigeria: revert after testing.)

**Result (browser, real call):** Nigeria: 0 jobs, 5.5-7.0s, no error. New York: 100 jobs;
first call took 8.06s with no error (over the old 8s cap), second 5.9s. Page shows "Job 1 of 100".
Still open: why the call slowed since 2026-10-27; routing the deck via the server path automation uses.

## 23. Free Job Deck: mobile description overflow, parity with automation's card, "next job" feedback (2026-10-28)

Founder report: description ran endlessly on mobile, the deck didn't look like automation's, and
there was no visible way to tell the deck moved to the next company after clicking Apply.

**Root causes (confirmed in code):**
- Mobile media query dropped the card's own `max-height` entirely (`max-height: none`), and
  `.desc-text` had no clamp, so the whole raw posting dictated the card's (and page's) height.
- The card was a plain static box, not swipe.html's actual card/description-popup component.
- `applyCurrentJob()` opens the company page in a new tab and silently re-renders the card
  underneath with no animation or confirmation, so returning to the tab looked like nothing moved.

**Fix (jobs.html only, swipe.html/dashboard.html untouched):**
- `.desc-text` now clamps to 5 lines (`-webkit-line-clamp`); a "Read full description" button opens
  a popup reusing swipe.html's own `#desc-modal` pattern (same CSS shape, same behavior).
- Mobile `.job-detail-pane` keeps a real `max-height` (`calc(100dvh - 1.5rem)`) instead of none.
- `passCurrentJob`/`applyCurrentJob` now call `renderCurrentCard(true)` (slide-up/fade-in on the new
  card) and show a toast ("Passed" / "Marked as applied — next job ready").

**Verified (browser, mobile viewport 375x812, mosco/New York test persona):** description
`scrollHeight` 6328px but visible `clientHeight` 135px (clamped); card height 543px, no endless growth.
"Read full description" opens the popup with full text, closes on the X, Escape, and backdrop click.
Clicking Pass advanced from "Job 1 of 100" to "Job 2 of 100" with the fade-in and toast firing.
Not committed yet.

## 24. Free Job Deck: dropped inline description text, added "Skip for now", matched automation's button bar (2026-10-28)

Founder, after seeing §23's fix live: remove the inline description paragraph under the buttons,
no visible way to move to the next job without Pass/Apply, and button size must match automation exactly.

**Checked against swipe.html before changing anything:**
- Its card (`.swipe-card-readmore`, swipe.html:4072) never prints any of the posting's raw text --
  only a plain "Job Description →" link that opens the popup. The clipped 5-line preview jobs.html
  added in §23 was an extra step automation doesn't have; removed, link-only now.
- Its action bar (swipe.html:2110-2112, current CSS ~1735-1764) is 3 buttons, not 2: Decline / **Skip
  for now** / Apply, grid columns 1fr/1.32fr/1fr, 50px-tall pills. "Skip for now" (`skipJobForNow` in
  swipe.html) writes nothing to `user_job_swipes` -- it just moves the job to the end of the deck for
  this session. jobs.html had no equivalent, which is what read as a missing "next" affordance.

**Applied to jobs.html:**
- `.action-row` is now the same 3-column grid; buttons use automation's own `.swipe-btn`/`.swipe-btn-icon`
  classes and sizing (50px height, pill radius, same icons: x / chevrons-right / check). Not copied:
  swipe.html's frosted-glass blur, which is tied to its fixed bottom dock -- this page isn't docked,
  so buttons keep jobs.html's flat surface color instead. Everything else (height, shape, grid ratio,
  labels, icons) matches.
- Added `skipJobForNow()`: splices the current job out of `deckJobs` and pushes it to the end (same
  non-destructive behavior as automation), no `user_job_swipes` write, toast "Skipped for now".
- Description: dropped the clipped-preview `<div>` entirely; only the "Job Description →" link remains
  (same popup from §23).

**Verified (browser, mobile 375x812, mosco/New York):** card shows Decline / Skip for now / Apply as
three equal-height pill buttons, no inline description text, "Job Description →" link present.
Clicking Skip for now moved the card to a different job while the counter stayed "Job 1 of 100"
(job requeued, not consumed) and showed the "Skipped for now" toast. Not committed yet.

## 25. Free Job Deck: collapsed back to 2 buttons -- Next / Apply on Career Page (2026-10-28)

Founder decided 2 buttons beats 3: "Next and Apply on company career page should be the only two
buttons." Removed Decline/Skip-for-now distinction from §24, replaced with one neutral "Next".

- `nextJob()` (renamed from passCurrentJob) still records 'skip' in `user_job_swipes` -- same
  shared-history table/decision automation's own Pass writes, so a job moved past here still won't
  resurface in either deck. Only the label and button count changed, not that behavior.
- `skipJobForNow()` (§24's non-destructive requeue) removed -- no longer reachable from the UI.
- Apply button relabeled "Apply Manually" (icon: external-link, not automation's check -- this
  one actually leaves the app to a different site, automation's doesn't) per founder's ask for
  wording that's shorter than "Apply on company site" but still says where it goes.
- `.action-row` grid back to 2 equal columns; "Next" styled neutral gray (not the red Decline color).

Verified (browser, mobile 375x812): two pill buttons, clicking Next advanced "Job 1 of 100" -> "Job 2
of 100" with the "Next job" toast. Not committed yet.

## 26. Free Job Deck: added "Back" (3 buttons again), fixed a real RLS gap it exposed (2026-10-28)

Founder: "should also be able to go back after they click next"; then "maybe 3 buttons, name the
back properly if back isn't the best name." Went with "Back" (standard, pairs with an arrow-left
icon, same meaning as a browser's own Back). Buttons are now Back / Next / Apply Manually, 3 equal
columns, same pill sizing as before.

- `previousJob()`: decrements `deckIndex` (deckJobs is a stable fetched list, no refetch needed) and
  calls a new `deleteSwipe(job)` to remove that job's row from `user_job_swipes` -- otherwise Back
  would only change what the UI shows while the SHARED table (same one automation reads) still
  called the job skipped/applied underneath.
- **Found and fixed a real gap while verifying this**: `user_job_swipes` had RLS policies for INSERT
  and SELECT only, no DELETE -- confirmed via `pg_policy`. Table-level GRANT DELETE already existed
  for `authenticated`, so the delete call didn't error, it silently removed 0 rows. First test proved
  this: clicked Next then Back, UI went back to the right job, but the DB still showed `decision:
  skip` for it. Added policy `allow_authenticated_delete_own_job_swipes`:
  `create policy "Users can delete their own swipes" on public.user_job_swipes for delete to
  authenticated using ( (select auth.uid()) = user_id );` -- same `(select auth.uid()) = user_id`
  pattern as the existing policies, per https://supabase.com/docs/guides/database/postgres/row-level-security#delete-policies.

**Verified (browser console calls + direct DB read, mosco/New York):** called `nextJob()` then
`previousJob()` on a real job (GitLab, id `69b4101a-...`) -- landed back on the same job, and a direct
`select ... where job_pool_id = '69b4101a-...'` came back empty, confirming the swipe row is really
gone, not just hidden in the UI. Not committed yet.

## 27. Free Job Deck: apply-click tracking via myrolerover.com/go (Cloudflare Worker), no expiry (2026-10-28)

Founder decision: drop the expiring-link idea, but build the redirect purely for tracking + tamper
resistance, and confirmed `myrolerover.com` is really on Cloudflare before any of this (verified via
the Cloudflare account connected to this session: zone `myrolerover.com`, status active, owned by
davidobus4040@gmail.com's account, Free plan -- not inferred from HTTP headers alone).

**Why "Apply Manually" used to be untracked:** the button linked straight to `job.apply_url`
(the real employer link, already present in the bulk `find_matching_jobs`/`job_pool` payload) --
nothing ever touched our server on a real click, so there was no way to log an apply or notice a
scraping pattern on this specific action.

**What's live:**
- Supabase: migration `apply_click_redirect_tracking`.
  - `vault.create_secret(...)` generates the HMAC signing key server-side (raw value never left
    the database, never printed/logged). Docs: https://supabase.com/docs/guides/database/vault
  - `public.job_apply_clicks` (user_id, job_pool_id, clicked_at) -- one row per real resolved
    click; RLS lets a user read only their own rows.
  - `public.rr_sign_apply_click(p_job_id)` -- SECURITY DEFINER, `to authenticated`. Mints
    `https://myrolerover.com/go?job=<id>&uid=<auth.uid()>&t=<hmac>`. **No timestamp in the
    signature** (founder: "no expiry") -- the link never goes stale, the signature only proves
    we minted it for this exact job+user, so it can't be hand-crafted or reattributed.
  - `public.rr_resolve_apply_click(p_job_id, p_user_id, p_sig)` -- SECURITY DEFINER, `to anon,
    authenticated`. Re-verifies the signature server-side (never trusts the Worker's own check
    alone), inserts the click log, returns the real `job_pool.apply_url`. Called with only the
    public anon key -- no service_role key was ever generated for or given to Cloudflare.
- Cloudflare: Worker `rr-apply-redirect` (account `bfdcaafba103f3f4f4fde01b9f5bf304`), deployed via
  the Workers API, bound to zone route `myrolerover.com/go*` (zone `fe02e3607c366ced865c5930a0aa102c`).
  Everything else on the zone still serves from GitHub Pages untouched -- this route only
  intercepts `/go`. The Worker calls `rr_resolve_apply_click` over PostgREST and 302s to the
  real URL, or shows a small branded error page ("Go back to RoleRover") if the signature is bad.
  Docs: https://developers.cloudflare.com/workers/configuration/routing/routes/
- jobs.html: "Apply Manually" is now a `<button>` (was an `<a href>`). `applyCurrentJob()` opens a
  blank tab synchronously (so the browser doesn't treat it as an unrequested popup), calls
  `rr_sign_apply_click` for the signed link, then points the tab at it; falls back to the raw
  `job.apply_url` if the sign call fails, so a hiccup never blocks a real apply.

**Verified, real end-to-end chain (mosco/New York, no mocks):**
1. `rr_sign_apply_click` called from the actual deck page (not SQL) for job "Northbeam" ->
   returned `https://myrolerover.com/go?job=b71dcacd-...&uid=cbc2ad35-...&t=263e27b6...`.
2. Followed that exact URL for real (curl) -> `302` to `https://job-boards.greenhouse.io/northbeam/jobs/4558061006`
   (Northbeam's real posting).
3. `job_apply_clicks` shows the real row (Northbeam, correct user, correct timestamp).
4. A tampered `t=` value on the same job/uid -> `400` with the branded "link no longer valid"
   page, no redirect, nothing logged.

**Not done (separate, larger piece, deliberately out of scope this round):** this only tracks the
*apply click*. The bulk job data (titles/companies/descriptions/salary) is still returned in full
on every deck load straight from Supabase, which never touches Cloudflare at all -- that's the
"close the bulk-data hole" idea from the same conversation, not built.

**Also not done:** turning on Cloudflare's Bot Fight Mode toggle for the zone -- the classic
`/zones/{id}/settings/bot_fight_mode` API returned "Undefined zone setting" for this zone (it now
lives under the newer unified Security Settings UI, not that legacy endpoint); flipping it is a
one-click action in the dashboard (Security > Settings > Bot traffic) rather than something I
scripted here.

Related: [[manual-mode-job-board-search-fix-2026-10-21]]

## 28. Location-parse caching fix shipped + re-tested at 50-concurrent (2026-10-28)

Founder confirmed: fix the live location-text-parsing gap found during the 50-concurrent load
test (§ previous), then re-run the same test before any social-launch decision.

**Fix (Supabase, `cache_job_location_parse` + `cache_job_location_parse_trigger_and_functions`
migrations):**
- Added `job_pool.location_parsed_countries/regions/anywhere` -- caches `location_places_v2()`'s
  output (country/region codes parsed from the raw location text) once per job instead of
  recomputing it live on every single deck call, for every remote candidate, every time.
- Backfilled all 261,309 existing rows in 5,000-10,000-row batches (the full-table UPDATE hit
  Supabase's 2-minute statement cap; batching is Supabase's own documented approach --
  https://supabase.com/docs/guides/database/postgres/data-deletion -- confirmed via docs before
  building). Hit 3 deadlocks against the live job-ingestion pipeline mid-backfill; retried through
  them (expected/normal per the same docs).
- Self-maintaining trigger (`job_pool_cache_location_parse_trg`, before insert/update of
  `location`) keeps it correct forever -- no ingestion code touched.
- `geo_gate_v2` extended with 3 new trailing params (default NULL = exact original live-parse
  behavior). Found mid-build that `CREATE OR REPLACE` with a changed signature does NOT replace a
  Postgres function -- it creates a second overload, which made the 2 other real callers
  (`search_board_jobs_v1`, `bot_search_jobs_v1` -- public search + Telegram bot, neither touched
  otherwise) ambiguous/broken. Fixed by explicitly dropping the old 12-arg overload; confirmed
  both callers still run correctly afterward.
- `job_gate_v3` now passes the cached columns through to `geo_gate_v2`.

**Correctness, proven not assumed:** compared the old live-parse path against the new cached path
for the SAME 2,000 real remote jobs (`geo_gate_v2` called both ways side by side) -- 0 mismatches.

**Re-ran the identical 50-concurrent test (new 50 random real profiles):** 49/50 succeeded,
**1 timeout (2%)**, vs 3/50 (6%) before the fix. The one failure this time happened inside
`job_level_rank_v2`, not the location-parsing code the fix targeted -- direct proof the fix closed
the specific hole it was built for, and equally direct proof it is not the only hole: average
latency and the count of slow (>10s) calls did not meaningfully change (~5.8s avg, 4 calls >10s,
one as high as 14.1s), because at least one more expensive per-candidate step (the job-level check,
possibly also the duplicate-fingerprint hashing in `job_group_key_v2`) still runs fresh on every
candidate, every call.

**Status: not yet cleared for the social-launch volume (~50/hour expected).** 2% is better than 6%
but is not zero; founder has not yet decided whether to accept that risk or pursue the next fix
(automation's own top-up/cached-assignment pattern, so the expensive matching call doesn't re-run
on every single page view) before publicly announcing.

Related: [[free-job-deck-timeout-findings-2026-10-28]], [[free-job-deck-apply-click-tracking-2026-10-28]]

## 29. Duplicate-fingerprint caching shipped + re-tested at 50-concurrent (2026-10-28)

Founder: "fix the next bottleneck first."

**Ruled out first (proof):** the timeout in §28 landed in `job_level_rank_v2`, whose expensive
fallback (`job_level_rank_full` -> `job_required_years`, a regex over the full description) only runs
when a job has no `job_level` cache row. 0 of 134,780 active jobs lack one -> that fallback never
actually runs. Not the bottleneck.

**Real cost, measured:** `job_group_key_v2()` (duplicate fingerprint: MD5 of the full description,
never stored) over 20,000 real active jobs = 10.3s.

**Fix:** `job_pool.group_key` column, backfilled all 269,564 rows in 5k-10k batches (several deadlocks
against the live Greenhouse refresher, retried through), trigger `job_pool_cache_group_key_trg`
(before insert/update of company_name/company/title/location/description_text), and migration
`cache_job_group_key_trigger_and_job_gate` makes `job_gate_v3` read `jp.group_key` in both places it
used to call the function. `job_group_key_v2` itself untouched (`bot_search_jobs_v1` still calls it).
Correctness: 5,383 sampled rows, cached vs live = 0 mismatches.

**Re-test (50 new random real profiles, 15s cap):** 49/50 ok, 1 timeout (2%, unchanged), average
~4.7s (was ~5.8s), slowest 13.4s, calls over 10s: 2 (was 4). The one failure landed in a third,
different function (`deck_level_cap_from_rank`) -> no single dominant cost left; the remaining load
is the sum of many small per-candidate steps, repeated on every page view.

**Conclusion:** further function-level caching = whack-a-mole. The structural fix is to stop running
the full match on every page view (precompute and store each user's deck; see next entry).

## 30. CRITICAL: "Apply Manually" clicks were turned into REAL automated applications (found 2026-10-28)

Found while answering the founder's "a link click is a false positive" point. Proof:
- Every Free Job Deck "Apply Manually" click upserts `user_job_swipes` with decision `'apply'`
  (`recordSwipe(job, 'apply')` in jobs.html).
- n8n workflow **"Swipe to Apply"** (`9qNxbuJqSlCU5biZ`, main n8n, last edited 2026-10-27) has a second
  trigger, **"Backstop - Hourly Swipe Check"**: every hour it reads `'apply'` swipes from the last 48 h
  that have no matching `job_applications` row (older than 10 min) and feeds them straight into the
  normal swipe path -> Resume Matching (tailored CV + cover letter) -> "Wake Up AutoApply Engine"
  (bot submits) -> `Record Swipe` (resets the swipe's `created_at`). The "Replay Swipe" node is disabled,
  but `Compute Stalled Swipes` is wired directly to `Normalize Webhook Input`, so the backstop is live.
  `Get Job` uses `.first()`, so it processes ONE stalled swipe per run -> one application per hour.
- Result for mosco (the only account with `feature_access.manual_mode`): 10 real applications in 24 h,
  all at :01 past the hour, status `applied`, `credit_charged = true` (credits now 30/70), including every
  job clicked "Apply Manually" today, in click order: 3M Consultancy 03:01, Axios 04:01, Hypori 05:01,
  Northbeam 06:01, Keeper Security 07:01, Reddit 08:01, Andesite 09:01, CoverGo 10:01 (Lagos). Fit
  scores null, `auto_apply_enabled = false` -> not the Auto-Apply toggle; it's the backstop.
- Pending right now: 0 (all processed). No real user affected: the deck is gated to mosco only.
- Second, related effect: `apply_slots_left()` counts `'apply'` swipes from the last 90 min with no
  application as "pending" automation applications, so manual clicks also shrink the automation
  credits a user is allowed to use, for 90 minutes.

**Fix (proposed, not applied):** the Free Job Deck must never write `'apply'`. Record the click as
"seen" (it leaves both decks; Back still undoes it) and log the click (already in `job_apply_clicks`);
an explicit "Yes, I applied" confirmation records a manual application separately. Not launch-safe
until this is changed.
