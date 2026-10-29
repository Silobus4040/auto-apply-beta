# Social Hiring — Comprehensive Technical Handoff

---

## 1. Workflows Inventory & Status

| Workflow Name | n8n ID | Status | Trigger | Role & Architecture |
| :--- | :--- | :--- | :--- | :--- |
| **Social Outreach Draft Generator** | `47iMywpBbvAVbyB9` | **ACTIVE** (Live) | Webhook `POST /webhook/generate-social-draft` | **The active live drafting engine.** Triggered directly from `swipe.html` when a user swipes Apply. Fetches candidate profile, master resume, confirmed skills, and lead details; generates a plain-text email pitch via Cloudflare Workers AI (`Llama 3.3 70B`); inserts draft into `public.emails` (`category: 'draft'`); updates `social_hiring_lead_matches.decision = 'draft'`. |
| **Social Lead Auto-Apply** | `IzjZd6SYIXn59foH` | **INACTIVE** | `scheduleTrigger` (`Poll For Swiped Sends`) + Manual | **Older batch-polling prototype (Oct 23, 2026).** Polled `social_hiring_lead_matches` where `decision = 'send'`. Contains the original `Create Cover Letter` node with the `< 300` char thin-post prompt and GPT-4o-mini, followed by Gotenberg PDF rendering and direct email dispatch. Disconnected from frontend swipe events. |
| **Social Hiring Signal Scraper** | `AEzEs5bufc7EgSZW` | **INACTIVE** (Scheduled) | Schedule + Manual | **Ingestion pipeline.** Searches LinkedIn, Facebook groups, and X via Apify. Extracts contact email or Google Doc links. Extracts company name via OpenAI, classifies job level (0–3), assesses scam/fraud signals, and writes qualifying rows into `social_hiring_leads` or `social_hiring_doc_leads`. |
| **Matching v2: Jev location check** | `93vUULA5aodg7dDm` | **ACTIVE** | Queue-driven | Evaluates candidate target countries (ISO code to country name translation), workplace preference (`remote`, `hybrid`, `onsite`), and level cap (candidate rank ± 1). Inserts matches into `social_hiring_lead_matches`. |
| **Resend Inbound Bridge.** | `8slgeCUYgO4EoC6r` | **ACTIVE** | Webhook | Captures inbound recruiter replies sent to candidates' dedicated `@myrolerover.com` mailboxes and synchronizes them into `public.emails`. |
| **RoleRover Redraft API** | `1vR9LaTegnKQQaE6` | **ACTIVE** | Webhook | On-demand redrafting service called when a candidate types revision instructions in the draft review modal. |

---

## 2. Answers to Specific Technical Inquiries

### Question A: Are `recruiter@facebook-post.com` and `mosco@careermailing.com` reachable in `Format Final Email`?

In `47iMywpBbvAVbyB9` (`Format Final Email` node):
```javascript
sender: match.application_email || match.user_auth_email || 'mosco@careermailing.com',
recipient: match.contact_email || 'recruiter@facebook-post.com',
```

#### 1. `recruiter@facebook-post.com`: **GUARANTEED UNREACHABLE in production.**
* **Database Constraint Guarantee:** In `public.social_hiring_leads`, `contact_email` is defined as `text NOT NULL`. Postgres physically rejects any row without an email:
  ```sql
  table_name: social_hiring_leads | column_name: contact_email | is_nullable: NO
  ```
* **Upstream Ingestion Guarantee:** In `AEzEs5bufc7EgSZW` (`Extract Contact Info & Filter` node):
  ```javascript
  const emailMatch = text.match(EMAIL_RE);
  const contactEmail = emailMatch ? emailMatch[0] : null;
  if (contactEmail && !hasLinkOrForm) leadKind = 'email';
  else if (docUrls.length) leadKind = 'doc';
  if (!leadKind) continue; // Discarded before saving
  ```
* **Live DB Audit:** Current count in `social_hiring_leads`: `total_leads: 31`, `leads_with_email: 31`, `leads_without_email: 0`. `match.contact_email` is never null.

#### 2. `mosco@careermailing.com`: **REACHABLE ONLY ON ORPHAN PROFILE EDGE CASES.**
* The query resolves `p."Application_email" as application_email` and `p.email as user_auth_email`.
* In `public.profiles`, both columns are nullable (`is_nullable: YES`).
* For any candidate who has signed up and completed onboarding, `p.Application_email` (e.g. `first.last.49@myrolerover.com`) or `p.email` is populated.
* **Vulnerability:** If an orphaned or corrupt candidate profile exists where both `Application_email` and `email` are `NULL`, the sender will fall back to `mosco@careermailing.com`.
* **Fix for you to deploy:** Replace the fallback in `Format Final Email` with an explicit throw error or default to `notifications@myrolerover.com` instead of founder personal email.

---

### Question B: Why is thin-post / short-post handling missing in `Build Draft Prompt`?

* **Status:** **NOT BUILT YET in `47iMywpBbvAVbyB9` (Intentional separation during webhook rebuild).**
* **Context:** The `< 300 char` logic originally lived in the prototype workflow `IzjZd6SYIXn59foH` (`Create Cover Letter` node):
  ```javascript
  if (core.length < 300) {
    // 2 paragraphs, max 120 words, tight focus on role title + single strongest proof
  }
  ```
* When `47iMywpBbvAVbyB9` was stood up as a real-time webhook responding to user swipes, the prompt engineer focused on the grounded 4-paragraph prompt (fused opening, honest gaps, confirmed skills handling). The branching `if (core.length < 300)` check was never ported over. Every lead currently receives the 4-paragraph prompt regardless of post brevity.
* **Code to port:** You can drop the `core.length < 300` branch from `IzjZd6SYIXn59foH` directly into `47iMywpBbvAVbyB9`'s `Build Draft Prompt` node.

---

## 3. Database Schemas (Verified from `information_schema`)

### A. `public.social_hiring_leads`
| Column Name | Data Type | Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary Key |
| `platform` | `text` | NO | — | `facebook`, `linkedin`, `x` |
| `search_keyword` | `text` | NO | — | Target matched role title |
| `post_url` | `text` | YES | — | Source URL |
| `post_text` | `text` | NO | — | Full raw recruiter post text |
| `posted_at` | `timestamptz` | YES | — | Post timestamp |
| `author_name` | `text` | YES | — | Recruiter / Poster name |
| `author_profile_url` | `text` | YES | — | Social profile URL |
| `company_name` | `text` | YES | — | Extracted company name |
| `contact_email` | `text` | **NO** | — | Recruiter destination email |
| `has_link_or_form` | `boolean` | NO | `false` | True if post had external link/form |
| `fraud_check_status` | `text` | NO | `'pending'` | `'passed'`, `'flagged'`, `'pending'` |
| `fraud_check_notes` | `text` | YES | — | Scrutiny evaluation notes |
| `status` | `text` | NO | `'new'` | `'new'`, `'active'`, `'rejected'` |
| `detected_countries` | `text[]` | YES | — | Array of ISO country codes |
| `detected_workplace_type`| `text` | YES | — | `remote`, `hybrid`, `onsite` |
| `detected_job_level` | `integer` | YES | — | `0` (entry), `1` (mid), `2` (senior), `3` (exec) |
| `says_anywhere` | `boolean` | YES | — | True if worldwide remote allowed |
| `google_doc_urls` | `text[]` | NO | `'{}'::text[]` | Extracted doc/form URLs |

### B. `public.social_hiring_lead_matches`
| Column Name | Data Type | Nullable | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary Key |
| `lead_id` | `uuid` | NO | — | FK -> `social_hiring_leads.id` |
| `profile_id` | `uuid` | NO | — | FK -> `profiles.id` |
| `matched_at` | `timestamptz` | NO | `now()` | Match timestamp |
| `decision` | `text` | NO | `'pending'` | `'pending'`, `'draft'`, `'send'`, `'skip'`, `'declined'` |
| `decided_at` | `timestamptz` | YES | — | Timestamp of swipe |
| `sent_at` | `timestamptz` | YES | — | Timestamp email dispatched |
| `send_error` | `text` | YES | — | Dispatch error if failed |
| `fit_reason` | `text` | YES | — | Explanation of candidate fit |
| `fit_strengths` | `jsonb` | NO | `'[]'::jsonb` | Matched capability highlights |
| `fit_missing_skills` | `jsonb` | NO | `'[]'::jsonb` | Identified gaps |
| `fit_scored_at` | `timestamptz` | YES | — | Scoring timestamp |

### C. `public.emails` (Social Drafts Integration)
Social hiring drafts **do not** write to a separate custom table; they are inserted directly into the shared `public.emails` table:
* `category`: `'draft'`
* `type`: `'outbound'`
* `matched_job_id`: Holds the `social_hiring_leads.id`
* `sender`: Candidate's `Application_email` (dedicated Rover mailbox)
* `recipient`: Recruiter's `contact_email`
* `subject` & `full_html`: Generated draft body

### D. `public.profiles` (Social Hiring Columns)
* `social_free_sends_used`: `integer NOT NULL DEFAULT 0` (tracks free quota usage; capped at 5).
* `subscription_tier`: `'Free Trial'`, `'premium'`.
* `Application_email`: Candidate's assigned `@myrolerover.com` mailbox.

---

## 4. Implicit Decisions & Assumptions to Review

The following behaviors and fallbacks were implemented and should be consciously evaluated:

1. **The Founder Webhook Gate (`swipe.html` lines 3119–3188):**
   ```javascript
   const isFounderAccount = (user.id === 'cbc2ad35-f715-466d-a9e3-e8ee4d60058e' || ...);
   if (decision === 'apply') {
       if (isFounderAccount) {
           // Calls live n8n webhook: /webhook/generate-social-draft
       } else {
           // Writes decision: 'send' directly to DB!
       }
   }
   ```
   * *Impact:* Currently, **only the founder test account triggers real-time draft generation**. Regular users write `decision = 'send'` into Supabase. Because the batch polling workflow (`IzjZd6SYIXn59foH`) is inactive, non-founder sends sit in the database without drafts being generated.
   * *Decision needed:* Remove `if (isFounderAccount)` in `swipe.html` so all users trigger `/webhook/generate-social-draft`.

2. **Free-Tier 5-Post Hard Cap:**
   * In `swipe.html:2965`, non-premium candidates are sliced to `socialLeadJobs.slice(0, 5)`.
   * Card #6 renders a dynamic paywall card (`🔥 40 New Social Posts Found Waiting For You!`).

3. **ATS Resume Naming Convention:**
   * Dynamic resume filename format: `${firstName}_${lastName}_${safeTitle}.pdf`.

4. **Fail-Safe Resume Click Handler:**
   * `handleDraftResumeClick()` in `swipe.html`: If a tailored resume in Supabase storage returns HTTP 404, the client silently falls back to opening the candidate's base master resume (`userProfile.master_resume`), preventing a raw JSON 404 error page.

5. **Unnamed Employer Presentation:**
   * Posts lacking an extracted `company_name` show an `NC` badge and the label `NO COMPANY NAME ON POST`. The safety badge renders `Employer not named · verify before applying` rather than falsely claiming clean fraud checks.

6. **Subject Line Fallback Regex:**
   * `Format Final Email` scans the post text with `/(?:email\s+)?subject(?:\s+line)?\s*:\s*([^\n\r]{3,100})/i`. If no explicit subject line is found, it falls back to: `Application for [Role] at [Company]`.

---

## 5. Anything In-Progress or Half-Built

1. **The Non-Founder "Send" Automation:**
   * As detailed above, non-founders writing `decision = 'send'` have no active listener since `IzjZd6SYIXn59foH` was turned off. The unified path is to route all users through the draft generator (`47iMywpBbvAVbyB9`).
2. **`social_hiring_doc_leads` Table:**
   * The scraper `AEzEs5bufc7EgSZW` collects recruiter posts where the call to action is a Google Form / Google Doc link into `social_hiring_doc_leads`. There is currently **no UI or automation attached to this table** — it is purely accumulating data.
3. **Outbound Dispatch from Rover Mailbox:**
   * Drafts appear in the Rover Dedicated Mailbox under the "Drafts" tab. When a candidate clicks "Send Application", it calls `https://n8n.leadscompass.ai/webhook/dashboard-send-social-draft`. Ensure this webhook is active and connected to your Resend domain credentials before candidates start hitting "Send".
