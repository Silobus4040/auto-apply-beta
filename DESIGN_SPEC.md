# RoleRover design spec (v1 draft)

Goal: stop looking template-made. One accent color, one font, a few repeated components, and the real product on screen.
Status: draft for the founder to approve. Nothing here is implemented yet.

How to read the numbers: values marked **(measured)** were read from the live reference sites or computed from our own code. Everything else is **our choice** and can be changed.

---

## 1. Principles

1. **Show the product, not decoration.** Every hero and feature block uses a crisp screenshot of the real app (swipe card, matched jobs, tailored resume, tracker).
2. **One accent.** Teal is the only brand color on screen at once. Neutrals do the rest. Lime now lives in the logo only.
3. **One font, sentence case.** All caps only for tiny labels.
4. **Few shapes.** Three corner radii, two shadows, one spacing scale. No colored glows.
5. **Quiet motion.** Native scrolling, short fades, nothing that blocks reading.
6. **Only claims we can prove.** No number goes on the page unless it comes from our data.

## 2. What we take from each reference

| Source | Take | Leave |
|---|---|---|
| Jobmate | Large crisp product screenshot right under the headline. Floating nav with one clear primary button. Sentence-case headline. Mono font for salary. Each feature shown as a real workflow. | Pill label above every heading. Unproven "10x" claim. Pre-launch tweets as testimonials. |
| Sprout | Calm single-color page. Headline with a grey first half and black second half. Three product cards under the hero. One trust line under the button. Swipe card layout. | Their numbers, testimonials and copy. Leftover template text. |
| n8n | Off-white page with a faint dot grid. Tight, large headline. Floating pill nav. Mono uppercase for buttons and chips. One inverted dark section for contrast. Large rounded containers. Native scrolling. | Their pink, their custom fonts, the cookie wall in the way of content. |

n8n measured values: body `#161616` on `#FAFAFA`; h1 64px, weight 500, letter-spacing -0.01em, line-height about 0.85; buttons are pills (radius 9999px), 14px mono, uppercase, 12px 16px padding; spacing tokens 2, 4, 8, 12, 14, 16, 24, 32, 48, 64, 96, 120, 160, 240.

## 3. Color

### Neutrals (our choice)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#FAFAFA` | page background |
| `--surface` | `#FFFFFF` | cards, inputs, nav |
| `--ink` | `#0A0A0A` | headings, primary text, dark sections |
| `--text` | `#27272A` | body text (14.89:1 on white, measured) |
| `--text-muted` | `#52525B` | secondary text (7.73:1) |
| `--text-subtle` | `#71717A` | captions only (4.83:1, the lightest allowed) |
| `--border` | `#E4E4E7` | all dividers and card borders |

### Brand
| Token | Value | Rule |
|---|---|---|
| `--teal` (`--accent`) | `#00FFCC` | the one accent: main button, highlights, small marks. **Always black text on it** (16.2:1). Never as text or icon color on white (1.30:1, unreadable); use `--success-text` for teal-looking text on white. |
| `--accent-hover` | `#00E6B8` | button hover |
| Lime `#D4FF33` | n/a | logo gradient only. Not used in the UI. |
| `--success-text` | `#0F766E` | success text/icons on white (5.47:1) |
| `--success-tint` | `#E6FBF6` | success background, with `#115E59` text (7.04:1) |

Status colors (our choice): amber for waiting, red for rejected/error, grey for neutral. Use a tinted background with a dark text color, never bright fills.

### Retire
- The lime-to-teal gradient on buttons, glows and highlighted text. The gradient stays in the logo only; lime is no longer a UI color.
- The lime highlighter box behind the hero headline.
- `--secondary` coral `#FF6B4A` in `index.html`: audit where it is used before removing.

## 4. Typography

- **Family:** Inter for everything (already loaded on every page). Drop Outfit from pages; the logo is an image.
- **Mono (optional):** one mono font (Geist Mono or JetBrains Mono) for salary, dates, fit %, tags and status chips. This is the Jobmate and n8n detail that makes data look precise.
- **Scale (desktop / mobile):**
  - Display: 56/60 px, 36/40 px. Weight 600, letter-spacing -0.02em, line-height 1.1
  - H2: 40 px / 30 px, weight 600, line-height 1.15
  - H3: 24 px / 20 px, weight 600
  - Body: 16 px, line-height 1.6
  - Small: 14 px
  - Label: 12 px, uppercase, letter-spacing 0.06em, weight 600. **Labels only.**
- **Case:** headlines, buttons and nav in sentence case. No all-caps headlines, no all-caps buttons.
- **Headline trick:** first half in `--text-subtle`, second half in `--ink` (Sprout does this). Example draft: "Stop searching. **Start interviewing.**" Copy is a draft; the founder owns the final words.

## 5. Shape, spacing, elevation

- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48, 64, 96, 120. Nothing else.
- **Radius (3 values + pill):**
  - `--r-sm: 8px` inputs, small chips
  - `--r-md: 12px` cards
  - `--r-lg: 20px` large containers, hero media, dark sections
  - `--r-pill: 9999px` buttons, nav, badges
  - Circle (`50%`) only for avatars.
  - Today's code uses 6, 8, 10, 14 and 20px. Mapping: 6/8/10 becomes 8, 14 becomes 12, 20 stays 20.
- **Shadow (2 values):** `--shadow-sm: 0 1px 2px rgba(0,0,0,.06)`, `--shadow-md: 0 8px 24px rgba(0,0,0,.08)`. No colored glows.
- **Borders do most of the separating:** 1px `--border`. Cards have no shadow at rest.
- **Background:** `--bg` with an optional faint dot grid on the hero only (n8n).

## 6. Components

- **Primary button:** `--accent` (teal) fill, black text, weight 600, pill, 44px tall, hover `--accent-hover`, pressed `translateY(1px)`. Maximum one primary button per screen section.
- **Secondary button:** white, 1px border, `--ink` text. **Ghost:** text only.
- **Focus ring:** 2px solid `--ink` with 2px offset on every interactive element. (Teal would be invisible on white.)
- **Nav:** fixed floating pill, white, 1px border, teal primary button on the right. Collapses to a menu on mobile.
- **Card:** white, 1px border, `--r-md`, 24px padding. Hover raises to `--shadow-sm`.
- **Chip / tag:** neutral grey pill, 12px, mono for data (salary, location type).
- **Status badge:** tinted background + dark text (see section 3).
- **Inputs:** 44px tall, `--r-sm`, 1px border, label above, error text in red below.
- **Empty state:** one line of text, one button. No illustrations needed.
- **Loading:** grey skeleton blocks (the dashboard already has a shimmer; reuse it).

## 7. Landing page structure

1. **Nav** (floating pill).
2. **Hero:** sentence-case headline, one-sentence subtext, **one** teal button plus a text link ("See how it works"), one trust line under the button.
   - The trust line may only use numbers from our own data (for example jobs available now, which `count-available-jobs` can supply). No invented user counts or ratings.
   - Under it: a crisp static screenshot of the swipe card and matched jobs in a phone/browser frame. **No autoplay video in the hero.** A short muted loop (under 1 MB) can come later.
3. **Three product cards** (Sprout pattern): swipe deck, tailored resume, application tracker. Each is a real screenshot with a two-line caption.
4. **How it works:** three steps, each with a screenshot (not four, not generic icons).
5. **One dark section** (`--ink` background, white text, teal accent) for the single strongest claim or the comparison table. Large radius, like n8n.
6. **Proof:** real testimonials with real name, role and outcome. If we don't have them yet, leave this section out; do not use placeholders.
7. **Pricing, FAQ, final call to action.**

Remove: stat tiles with unverified numbers, the pill label above every section, and the eight-row comparison table (cut to the 4 rows that matter).

## 8. Motion and scroll feel

What n8n actually does **(measured)**: no scroll library detected (no Lenis, GSAP, ScrollTrigger or Locomotive on the page), so the scrolling is the browser's own. CSS has `scroll-behavior: smooth`. Transitions are 150 to 500 ms, mostly plain `ease` or `ease-out`, with one slight-overshoot curve. The nav is `position: fixed`. The "smooth" feel comes from restraint, not from a scroll engine. (Limit of this check: I read page globals and CSS, not the private bundle, and I cannot feel the scroll through screenshots, so test it by hand.)

Our rules:
- **Native scrolling only.** No scroll-jacking library. `html { scroll-behavior: smooth }` only inside `@media (prefers-reduced-motion: no-preference)`, for anchor links.
- **Durations:** 150 ms hover, 200 to 300 ms state changes, 400 ms maximum for reveals.
- **Default easing (our choice):** `cubic-bezier(0.22, 1, 0.36, 1)` for entrances, `ease` for hovers.
- **Reveal on scroll:** fade in plus `translateY(12px)` to 0, once per element, via `IntersectionObserver`.
  - **Content must be visible without JavaScript and on first paint for anything above the fold.** On our current landing page, whole screens were blank until scroll animations fired; that must not happen.
  - Disable all of it under `prefers-reduced-motion: reduce`.
- Animate only `transform` and `opacity`.

## 9. App screens (dashboard, swipe, onboarding)

Use the same tokens; do not invent per-page styles.
- **Swipe card:** company logo, role, company, salary in mono, 2 to 3 neutral chips, fit % as a small chip. Apply is the one teal button; Skip is secondary.
- **Dashboard:** one page header pattern (title left, one primary action right), stage badges, consistent row height, empty and loading states from section 6.
- **Onboarding:** one question group per screen, progress at the top, one primary button, errors shown inline in red, never silently.

## 10. Cleanup before the visual work

- Rename "AutoApply AI" to "RoleRover" in the page titles of `dashboard`, `login`, `onboarding`, `optimize`, `signup`, `swipe`, `verify`. Give `swipe.html` its own title (it is currently also "Dashboard").
- Standardize "RoleRover" (one word) everywhere; the pages mix "Role Rover" and "RoleRover".
- Test and scratch pages are tracked in git, so they are served publicly with the site: `Secret_testing-vault.html`, `linkedin_test.html`, `compass-options.html`, `compass-options-2.html`. Decide whether to move them out of the deployed repo. (Not checked: whether any contains something sensitive.)

## 11. Implementation order

1. Create one shared tokens file with the variables above. It works on the current HTML pages and maps directly into a Tailwind/shadcn theme later.
2. Landing hero and nav.
3. Login, signup, verify.
4. Onboarding.
5. Dashboard.
6. Swipe.

Each step is shippable on its own. The React migration (after Nov 17) reuses the same tokens.

## 12. Decisions needed from the founder

1. ~~Lime or another primary?~~ Decided 2026-11-04: teal is the single accent; lime stays in the logo only.
2. Add a mono font for data, yes or no?
3. ~~Keep teal?~~ Decided: teal is the accent (see 1).
4. Which real screenshots will we use in the hero (we need clean, populated demo data)?
