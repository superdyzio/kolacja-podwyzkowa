# Product page and draft legal documents (S-30) — Implementation Plan

## Overview

S-30 „Strona produktu i szkice dokumentów” (PRD v2 FR-041; Open Questions 1, 5, 6). A visitor of `/` sees a public
product page — what the platform does, for whom, how a venue gets access, the privacy facts — with a clear way to the
staff login, and two DRAFT documents, the terms of service (`/regulamin`) and the privacy policy
(`/polityka-prywatnosci`), each marked „Wersja robocza — do przeglądu prawnika” / „Draft — for legal review”, with
visible placeholders wherever the operator's identity, prices or legal choices are still open. Everything PL + EN,
Polish by default; the product name only through `PRODUCT_NAME`; guests, the TV, the tablet and prints never see any of
it (white-label).

## Current State Analysis

- `/` (`src/pages/index.astro`) shows `PRODUCT_NAME`, „Dostęp tylko przez link od organizatora.” (or `noDatabase`
  when `getDb()` is null) and a „Logowanie dla personelu” link; texts in `shellMessages` (`linkOnly`, `noDatabase`,
  `staffLogin` — used nowhere else; `500.astro` and `ClientWorkCards` use other keys of the same dictionary).
- `Layout.astro` emits `<meta name="robots" content="noindex, nofollow">` on EVERY page, the default `<title>` is
  `PRODUCT_NAME` (staff pages), and shows the `missingConfigs` banner when the DB is not configured — so `/` does not
  need `getDb()` to tell that.
- `/`, `/regulamin`, `/polityka-prywatnosci` are outside every middleware area (`parseAccessPath`,
  `classifyAuthPath`, `classifyWaiterPath`): they get no extra headers; the locale comes from `kp-lang` (default
  `pl`), `?lang=en` sets it and 303s back.
- Staff doors: `/logowanie` (auth area, frame-denied, a session → 303 `/panel`), `/haslo/<token>` (one page for valid
  and invalid links), `/panel` hub, `/kelner` (per-event waiter's door). None links any legal text today.
- The guest privacy notice `/g/<key>/prywatnosc` (S-26) is a draft with the amber banner `data-privacy-draft`: the
  restaurant is the controller of guest data, „the system provider” the processor, never the product's name.
- Facts the drafts must state exist as constants: `SESSION_COOKIE` „kp-session”, `SESSION_DAYS` 30,
  `INVITE_TTL_DAYS` 7, `RESET_TTL_HOURS` 24, `LOGIN_FAILURE_LIMIT` 10 / `LOGIN_WINDOW_SECONDS` 900,
  `PASSWORD_MIN_LENGTH` 10 / `PASSWORD_MAX_LENGTH` 200 (`src/lib/auth/limits.ts`, `cookie.ts` — pure),
  `WAITER_COOKIE` „kp-waiter” (`src/lib/event-waiters/cookie.ts`), `localeCookieName()` „kp-lang” / „kp-lang-r”
  (`src/lib/i18n/locale.ts`; the one-year max-age is a private constant in `src/middleware.ts`),
  `DEFAULT_GUEST_RETENTION_DAYS` 30 / `MIN_` 1 / `MAX_` 365 (`src/lib/privacy/rules.ts`), `SUPPORT_MINUTES` 60
  (`src/lib/support/rules.ts`), `PAID_MODULES` (`src/lib/modules/rules.ts`, names in `modulesMessages().names`).
  Login attempts keep only a SHA-256 of the typed e-mail and are deleted after 1 day (`begin_login_attempt`).
- Browser storage today: cookies `kp-session`, `kp-waiter`, `kp-lang`, `kp-lang-r` (all HttpOnly, SameSite=Lax);
  localStorage — the question draw memory and the last AI topic (guest and organizer), the organizer's offline copy
  (published seating with names + the guess board; replaced or cleared on the next successful read or denial of that
  link), the staff offline copy (tablet / floor / per-event waiter: published seating with names, diets, orders
  without prices; hard expiry at noon after the event, cleared on denial and at the login / waiter doors); the service
  worker caches only the readout page and its scripts.
- AI: topic prompts carry no guest data (NFR-021); BUT „Zaproponuj układ ze zdjęcia (AI)” sends the plan image and the
  venue's room and table names, shapes, seat counts and positions to the AI provider (`src/lib/venue-ai/`).
- Hosting today (CLAUDE.md): AWS Lambda behind a Function URL, Supabase Postgres, Anthropic API when
  `AI_PROVIDER=anthropic`; the platform's own environment and region are still open (Open Question 4).

## Desired End State

- `/` is the product page (`data-landing`): product name, a one-line pitch, „Zaloguj się” → `/logowanie` in the
  header and the hero (`data-landing-login`), sections for whom (`data-landing-section="audience"`), what it does
  (`features`), how it works (`steps`, the PRD's flow 1–7 in public words), privacy and safety (`privacy`) and access
  (`access`: venue accounts are created by the platform administrator, no self-registration; holders of an event link
  open it directly — this page shows no event), and the footer `LegalLinks` (`data-legal-links`). No DB, no images,
  fonts, scripts or forms; `Cache-Control: no-store` (content varies by the language cookie).
- `/regulamin` (`data-legal-document="terms"`) and `/polityka-prywatnosci` (`data-legal-document="privacy"`): title,
  the amber draft banner (`data-legal-draft`, same look as `data-privacy-draft`), „Stan na 2026-11-10”, a table of
  contents (`data-legal-toc`), numbered sections (`data-legal-section="<id>"`), every `[…]` placeholder rendered as
  `<mark data-legal-placeholder>`, the cross-link to the other document and back to `/`; headers `Cache-Control:
  no-store` and `X-Robots-Tag: noindex, nofollow`.
- `LegalLinks` in the footer of `/`, `/logowanie`, `/haslo/<token>` (valid and invalid), `/panel` and `/kelner`;
  never on `/g/`, `/tv/`, `/r/`, `/o/`, prints, the guest notice or the per-event waiter's floor.
- Every number and cookie name in the drafts comes from the code's constants; a unit test proves PL/EN parity (section
  ids, placeholders), the draft markers, no e-mail address and no external URL, and that `src/lib/legal/` and the three
  pages never spell the product name.
- Smoke section 45 + section 1 rewritten; the demo prints (and checks) the three links; CLAUDE.md describes the pages.

### Key Discoveries:

- `src/layouts/Layout.astro:24` — the global `noindex, nofollow` meta: the landing is not indexable whatever this
  slice does; flipping it is a launch decision (name + domain).
- `src/pages/g/[key]/prywatnosc.astro:63-69` — the draft banner's classes to mirror (`border-amber-400 bg-amber-50
  text-amber-950`).
- `src/middleware.ts:65` — `LOCALE_COOKIE_MAX_AGE` (one year) is private; move it to `src/lib/i18n/locale.ts` so the
  policy states the real value.
- `scripts/smoke.mjs:118-126` (section 1) asserts „Dostęp tylko przez link od organizatora” on `/`; section 34
  (`scripts/smoke.mjs:8167`) asserts the home page carries „Stolik” — keep that true.
- `defineMessages` type-checks the shape only (arrays of different lengths or other section ids pass), so parity is a
  unit test.

## What We're NOT Doing

- No login form on `/` (the login stays on `/logowanie`: frame-denied, throttled, session-aware redirect); no
  contact form, newsletter, analytics, cookie banner (no non-essential cookies exist), external fonts/scripts/images,
  pricing, testimonials or screenshots.
- No consent / „I accept the terms” record (no migration): whether and how venues accept the terms is a contractual
  decision for after the legal review.
- No data-processing agreement (umowa powierzenia) as a separate document: the terms name it as a placeholder and the
  policy lists the facts it will need (Open Question 6).
- No change to the guest notice `/g/<key>/prywatnosc` and no link from it to the platform policy (that page carries the
  product name — white-label).
- No indexing change: every page keeps the Layout's `noindex`; no `robots.txt`, sitemap or canonical URLs.
- No operator identity, address, tax numbers, contact e-mail, jurisdiction, liability, complaint procedure or prices
  invented — placeholders only.
- No legal-document links on the restaurant / event / platform panel pages beyond the `/panel` hub.

## Implementation Approach

Content is data: three dictionaries in a new pure module `src/lib/legal/` (`landingMessages`, `termsMessages`,
`privacyPolicyMessages`), the documents as `{ title, …, sections: [{ id, heading, paragraphs, items? }] }` so one
Astro component renders both drafts. Facts come from imported constants (the dictionaries interpolate them), so a
changed session length or retention default changes the drafts. Placeholders are plain `[…]` text in the dictionaries;
a pure `splitPlaceholders` turns them into marked segments at render time. Pages are static Astro (no islands).

## Critical Implementation Details

- **White-label:** the new `LegalLinks` component must only be rendered by staff/public pages; do not put it in
  `Layout.astro` (the layout serves guest, TV, tablet and print pages too).
- **No e-mail-looking strings:** the drafts must not contain anything matching an e-mail address — not even an example
  (`[e-mail kontaktowy]` only); the unit test and the smoke enforce it.

## Phase 1: Legal content module and pages

### Overview

The pure module with all texts and helpers, the shared components, the three pages and the unit tests.

### Changes Required:

#### 1. Pure legal module

**File**: `src/lib/legal/paths.ts`, `src/lib/legal/placeholders.ts`, `src/lib/legal/landing.ts`,
`src/lib/legal/terms.ts`, `src/lib/legal/privacy-policy.ts`, `src/lib/legal/types.ts`, `src/lib/legal/index.ts`

**Intent**: Hold every text of the product page and both drafts in PL and EN, built from the code's constants, plus the
paths and the placeholder splitter.

**Contract**:
- `paths.ts`: `HOME_PATH = "/"`, `TERMS_PATH = "/regulamin"`, `PRIVACY_POLICY_PATH = "/polityka-prywatnosci"`,
  `LEGAL_DRAFT_DATE = "2026-11-10"`.
- `types.ts`: `LegalSection { id: string; heading: string; paragraphs: readonly string[]; items?: readonly string[] }`,
  `LegalDocument { pageTitle, heading, draft, draftText, asOf(date), tocLabel, otherDocument, backHome, sections }`.
  The document dictionaries are typed explicitly (`defineMessages<LegalDocument>(pl, en)`): inferred from the PL literal,
  sections with and without `items` would become a union the EN object may not match.
- `placeholders.ts`: `splitPlaceholders(text) → { text: string; placeholder: boolean }[]` (`[` … `]` without nested
  brackets; no empty segments), `placeholdersOf(text) → string[]`.
- `landing.ts`: `landingMessages` — header/hero texts, login label, the five sections (audience cards, feature list,
  seven steps, privacy points with `DEFAULT_GUEST_RETENTION_DAYS`, access text incl. the link-holder hint), the
  footer label, `legalLinksLabel`, `termsLink`, `privacyLink`, `draftSuffix` („wersja robocza” / „draft”).
- `terms.ts`: `termsMessages` — sections (ids fixed, same order in both languages): `general` (operator placeholders,
  product working name), `definitions`, `service`, `accounts` (no self-registration, invitations / resets as one-time
  links of `INVITE_TTL_DAYS` / `RESET_TTL_HOURS`, password `PASSWORD_MIN_LENGTH`–`PASSWORD_MAX_LENGTH`, sessions
  `SESSION_DAYS`, throttle `LOGIN_FAILURE_LIMIT` per 15 min, roles), `links` (links without login, keep them secret,
  replace / revoke), `venue-duties`, `guest-data` (venue = controller, operator = processor, `[umowa powierzenia]`,
  retention `MIN_`–`MAX_GUEST_RETENTION_DAYS`, default `DEFAULT_GUEST_RETENTION_DAYS`, export, health data),
  `support` (read-only, reason, `SUPPORT_MINUTES`, logged for the owner, module unlocks logged), `modules` (paid
  modules by name from `PAID_MODULES`, manual unlock, no online payments, `[cennik]`), `ai`, `availability` (no
  formal SLA), `liability`, `termination` (a switched-off restaurant: panel closed, event links keep working;
  `[procedura usunięcia konta i danych]`), `complaints`, `final` (`[prawo właściwe]`, `[sąd]`, changes, entry into
  force).
- `privacy-policy.ts`: `privacyPolicyMessages` — sections: `controller` (placeholders incl. `[e-mail kontaktowy]`,
  `[inspektor ochrony danych]`), `scope` (product page, staff accounts, per-event waiters, support log; guest data =
  the venue's, notice on the guest's link), `visitors` (the page reads nothing, no analytics, only the language cookie,
  `[logi techniczne hostingu]`), `accounts` (e-mail, name, scrypt hash, session and link hashes, login-attempt hash
  kept up to 1 day, memberships and roles; no IP stored by the app; `[podstawa prawna]`, `[okres przechowywania]`),
  `event-waiters` (name, hashes, expiry at noon after the event, deleted with the event or the guest data),
  `support-log` (admin e-mail and name, reason, times, each read's method and path and the event name, unlocks; owners
  see it; kept while the restaurant exists), `guest-data` (categories incl. diets as health data — GDPR art. 9 —,
  who sees what, deletion after the venue's term, what remains, export; processed on the venue's instructions), `ai`
  (topics without guest data; the plan photo + venue structure for the layout proposal; topic texts not stored except
  the organizer's „Pokaż na TV”), `recipients` (`[lista podmiotów przetwarzających — do potwierdzenia]` with today's
  categories and providers: app hosting AWS Lambda, Postgres database Supabase, AI API Anthropic — each with
  `[region]`), `cookies` (the four cookie names with purpose and lifetime from the constants; no analytics, ads or
  third-party cookies), `storage` (localStorage copies and their lifetimes, the worker cache), `security`, `rights`
  (`[prawa i sposób ich realizacji]`, `[organ nadzorczy]`), `changes`.
- `index.ts` re-exports; `src/lib/i18n/locale.ts` exports `LOCALE_COOKIE_MAX_AGE_SECONDS` (one year) and
  `src/middleware.ts` imports it instead of its private constant.

#### 2. Shared components

**File**: `src/components/legal/LegalLinks.astro`, `src/components/legal/LegalText.astro`,
`src/components/legal/LegalDocumentPage.astro`

**Intent**: One footer nav with both drafts, one renderer of a text with marked placeholders, one page body for a draft.

**Contract**: `LegalLinks` (`<nav data-legal-links aria-label=…>` with `href={TERMS_PATH}` and
`href={PRIVACY_POLICY_PATH}`, each followed by the draft suffix; optional `class`); `LegalText` (`text: string` →
spans and `<mark data-legal-placeholder>`); `LegalDocumentPage` (`kind: "terms" | "privacy"`, `doc: LegalDocument`):
`<main data-legal-document={kind}>`, back link to `/`, `h1`, draft banner `data-legal-draft` (amber, like the guest
notice), the as-of line, `<nav data-legal-toc>` with `#legal-<id>` anchors, sections `data-legal-section={id}`
numbered in order, the other document's link and `LegalLinks` at the bottom.

#### 3. Pages

**File**: `src/pages/index.astro`, `src/pages/regulamin.astro`, `src/pages/polityka-prywatnosci.astro`

**Intent**: Replace the link-only home with the product page; add the two drafts.

**Contract**: `index.astro` imports nothing DB-related (no `getDb`), keeps `Cache-Control: no-store`, renders the
landing from `landingMessages(locale)` with `PRODUCT_NAME`, `LOGIN_PATH` links (`data-landing-login="header"`,
`"hero"`) and `LegalLinks`. Each draft page sets `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow` and
renders `LegalDocumentPage` inside `Layout` with the document's own title (`… — PRODUCT_NAME`). `shellMessages` loses
`linkOnly`, `noDatabase`, `staffLogin`.

#### 4. Unit tests

**File**: `src/lib/legal/legal.test.ts`

**Intent**: Guard the content's honesty and parity.

**Contract**: `splitPlaceholders` cases (none, one, several, adjacent, unclosed bracket stays text); for both
documents: PL and EN have the same section ids in the same order, each with a heading and content, the same NUMBER of
placeholders per section, the draft texts „Wersja robocza — do przeglądu prawnika” / „Draft — for legal review”, the
operator and contact placeholders; no e-mail address (`/[\w.+-]+@[\w-]+\.[\w.-]+/`) and no `http` URL in any landing
or legal text; the policy contains `SESSION_COOKIE`, `WAITER_COOKIE`, `localeCookieName("/")`,
`localeCookieName("/r/x")`, `String(SESSION_DAYS)`, `String(DEFAULT_GUEST_RETENTION_DAYS)`; the terms contain
`String(SUPPORT_MINUTES)`, `String(INVITE_TTL_DAYS)`, every paid module's name; the landing and both documents contain
`PRODUCT_NAME`; a source scan of `src/lib/legal/*.ts` (not tests), `src/components/legal/*.astro` and the three pages
finds no literal `"Stolik"` and no „Kolacja podwyżkowa”.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `AI_PROVIDER=mock npx vitest run src/lib/legal`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`

#### Manual Verification:

- The landing reads as a product page in PL and EN on a phone and a laptop (no overlap with the language switch)
- Both drafts are readable, the banner and the placeholders stand out, the table of contents jumps to sections

**Implementation Note**: unattended run — manual rows stay open for the user.

---

## Phase 2: Links on the staff doors, smoke and demo

### Overview

The legal links on every staff door, the smoke's new section 45 (and section 1), the demo's links.

### Changes Required:

#### 1. Staff doors

**File**: `src/pages/logowanie.astro`, `src/pages/haslo/[token].astro`, `src/pages/panel/index.astro`,
`src/pages/kelner/index.astro`

**Intent**: Every staff entrance links the terms and the privacy policy (and the login page the home page).

**Contract**: `LegalLinks` at the bottom of each `<main>` (the password page for valid AND invalid links); on
`/logowanie` the `PRODUCT_NAME` kicker becomes a link to `/`.

#### 2. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Pin the product page and the drafts over HTTP, prove the links and the white-label boundary.

**Contract**: section 1 → `/` 200 with `data-landing`, the login link `href="/logowanie"`, the link-holder hint
(„Masz link”), no event creation (`Utwórz wydarzenie`, `/api/event` absent). New section 45 before `finish()`:
`/` PL (`lang="pl"`, `data-landing-login`, `data-legal-links`, both draft hrefs, every `data-landing-section`,
„Stolik”, no-store) and EN (`kp-lang=en` → `lang="en"`, „Log in”); each draft PL/EN: 200, `data-legal-document`,
`data-legal-draft` with „Wersja robocza — do przeglądu prawnika” / „Draft — for legal review”,
`data-legal-placeholder`, „[nazwa operatora]” / „[operator name]”, `X-Robots-Tag` noindex and no-store; the policy
names `kp-session`, `kp-waiter`, `kp-lang`, `kp-lang-r`; `?lang=en` on `/regulamin` → 303 back to `/regulamin` with a
`kp-lang=en` cookie; no e-mail address in the three pages; `/logowanie`, an invalid `/haslo/<token>`, `/kelner` and
the owner's `/panel` carry `data-legal-links`; the bodies of section 34's guest page, TV, tablet and QR cards, the
client shell and section 41's guest notice contain neither `data-legal-links` nor `/regulamin` nor
`/polityka-prywatnosci`.

#### 3. Demo

**File**: `scripts/demo.mjs`, `docs/scenariusz-pokazu.md`

**Intent**: The demo shows where the product page and the drafts are.

**Contract**: before the summary, `/`, `/regulamin` and `/polityka-prywatnosci` must answer 200 with `data-landing` /
`data-legal-draft` (else `fail`); the summary prints „Strona produktu: …” with both drafts („szkice do przeglądu
prawnika”). The scenario mentions that the laptop can start on `/` (product page → „Zaloguj się”).

### Success Criteria:

#### Automated Verification:

- Full test suite passes: `AI_PROVIDER=mock npm test`
- Lint and type check pass: `npm run lint`, `npx astro check`
- Build passes: `npm run build`
- Smoke passes against the production preview: `AI_PROVIDER=mock npm run preview` + `npm run smoke`
- Demo passes: `npm run demo`

#### Manual Verification:

- The login, password, panel and waiter doors show the two links unobtrusively at the bottom
- The demo printout's three links open the product page and the drafts

---

## Phase 3: Documentation

### Overview

CLAUDE.md, README if it describes `/`, the overnight log.

### Changes Required:

#### 1. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Describe the product page and drafts (paths, markers, headers, the constants rule, white-label boundary,
link placement), update the „home page `/` only says access is by link” sentence, the smoke description (section 45)
and the demo description.

**Contract**: a new bullet „Product page and legal drafts (landing-legal, S-30; FR-041)” under Architecture.

#### 2. README

**File**: `README.md`

**Intent**: README's „Pierwsze uruchomienie” says „strona `/` tylko mówi, że dostęp jest przez link” — now it is the
product page with the drafts.

**Contract**: that sentence rewritten (`/` = product page with „Zaloguj się”, `/regulamin`, `/polityka-prywatnosci`).

### Success Criteria:

#### Automated Verification:

- Prettier check of the docs passes: `npx prettier --check CLAUDE.md README.md docs/scenariusz-pokazu.md`

#### Manual Verification:

- CLAUDE.md's description matches the pages

---

## Testing Strategy

### Unit Tests:

- `splitPlaceholders` / `placeholdersOf` edge cases.
- PL/EN parity of the documents, draft markers, placeholders, facts from constants, no e-mail or URL, no hard-coded
  product name.

### Integration Tests:

- None (no DB change); HTTP behaviour is the smoke's.

### Manual Testing Steps:

1. Open `/` on a phone width and a laptop, switch PL/EN, follow „Zaloguj się”.
2. Open both drafts, check the banner, placeholders and table of contents.
3. Open `/logowanie`, `/kelner`, `/panel` and a password link; the legal links are at the bottom.
4. Open a guest link, the TV and the tablet: no product name, no legal links.

## Performance Considerations

None: static pages without DB access.

## Migration Notes

None (no migration, no new API route).

## References

- PRD v2 FR-041, Open Questions 1, 5, 6; roadmap § S-30.
- Guest notice: `src/pages/g/[key]/prywatnosc.astro`, `src/lib/privacy/messages.ts` (`privacyNoticeMessages`).
- Archived S-26 plan: `context/archive/2026-11-10-privacy-retention/plan.md`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Legal content module and pages

#### Automated

- [x] 1.1 Unit tests pass: `AI_PROVIDER=mock npx vitest run src/lib/legal`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Type check passes: `npx astro check`
- [x] 1.4 Build passes: `npm run build`

#### Manual

- [ ] 1.5 The landing reads as a product page in PL and EN on a phone and a laptop (no overlap with the language switch)
- [ ] 1.6 Both drafts are readable, the banner and the placeholders stand out, the table of contents jumps to sections

### Phase 2: Links on the staff doors, smoke and demo

#### Automated

- [ ] 2.1 Full test suite passes: `AI_PROVIDER=mock npm test`
- [ ] 2.2 Lint and type check pass: `npm run lint`, `npx astro check`
- [ ] 2.3 Build passes: `npm run build`
- [ ] 2.4 Smoke passes against the production preview: `AI_PROVIDER=mock npm run preview` + `npm run smoke`
- [ ] 2.5 Demo passes: `npm run demo`

#### Manual

- [ ] 2.6 The login, password, panel and waiter doors show the two links unobtrusively at the bottom
- [ ] 2.7 The demo printout's three links open the product page and the drafts

### Phase 3: Documentation

#### Automated

- [ ] 3.1 Prettier check of the docs passes: `npx prettier --check CLAUDE.md README.md docs/scenariusz-pokazu.md`

#### Manual

- [ ] 3.2 CLAUDE.md's description matches the pages
