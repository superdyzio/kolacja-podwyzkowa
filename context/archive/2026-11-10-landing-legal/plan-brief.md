# Product page and draft legal documents (S-30) — Plan Brief

> Full plan: `context/changes/landing-legal/plan.md`

## What & Why

PRD v2 FR-041: a visitor sees a public product page with the way to log in, plus drafts of the terms of service and the
privacy policy, marked „do przeglądu prawnika”. It closes M-2's last slice after the demo; the name (Open Question 1),
prices (OQ 5) and legal content (OQ 6) stay open, so the drafts state what the app really does and leave visible
placeholders for everything only the operator and a lawyer can decide.

## Starting Point

`/` only says access is by link and links the staff login. `/logowanie`, `/haslo/<token>`, `/panel` and `/kelner`
link no legal text. The guest privacy notice `/g/<key>/prywatnosc` (S-26) is already a draft (restaurant = controller,
the system provider = processor, white-label). Every page carries a global `noindex` meta.

## Desired End State

`/` is a product page (for whom, what it does, how it works in seven steps, privacy facts, how a venue gets access,
„Zaloguj się”). `/regulamin` and `/polityka-prywatnosci` render the drafts with an amber „Wersja robocza — do
przeglądu prawnika” banner, a table of contents and marked `[…]` placeholders. The staff doors link both drafts; guest,
TV, tablet and print pages never do.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Login on `/` | links to `/logowanie` (header + hero), no form | the login page is frame-denied, throttled and session-aware; no duplicate password form on a public page |
| Indexing | every page keeps the Layout's `noindex`; the drafts also send `X-Robots-Tag: noindex, nofollow` | working name and no domain yet; drafts must not be indexed before review |
| Slugs | `/regulamin`, `/polityka-prywatnosci` (EN via `?lang=en`) | URL slugs are Polish and untranslated, like `/logowanie` |
| Link placement | footers of `/`, `/logowanie`, `/haslo/<token>`, `/panel`, `/kelner` | staff and public doors only; white-label for guests, TV, tablet, prints and the guest notice |
| Facts | numbers and cookie names interpolated from the code's constants | the drafts cannot drift from the code |
| Unknowns | `[…]` placeholders rendered as `<mark data-legal-placeholder>` | no invented identity, address, NIP, e-mail, prices, jurisdiction or liability |
| Providers | named as today's (AWS Lambda, Supabase, Anthropic when AI is on) under „[do potwierdzenia]” with `[region]` | CLAUDE.md states them; the platform environment (OQ 4) is still open |
| DPA | not drafted; terms reference it, the policy lists its facts | a contract only a lawyer can write (OQ 6) |
| DB on `/` | none (`getDb()` removed) | the Layout's config banner already reports a missing DB |
| Consent records | none (no migration) | accepting the terms is a contractual decision after review |

## Scope

**In scope:** pure `src/lib/legal/` (texts PL/EN, paths, placeholder splitter), `LegalLinks` / `LegalText` /
`LegalDocumentPage` components, `/`, `/regulamin`, `/polityka-prywatnosci`, links on the staff doors, unit tests,
smoke section 45 (+ section 1), demo links, CLAUDE.md.

**Out of scope:** login form on `/`, contact form, analytics, cookie banner, prices, DPA document, consent tracking,
indexing, changes to the guest notice.

## Architecture / Approach

Content as data: three `defineMessages` dictionaries whose documents are `sections: { id, heading, paragraphs,
items? }[]`, rendered by one Astro component; placeholders are plain `[…]` text split at render time. Static Astro
pages, no islands, no DB.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Legal content module and pages | texts, components, three pages, unit tests | inaccurate statements about what the app does |
| 2. Links, smoke, demo | staff-door links, smoke 45, demo links | a link leaking onto a white-label page |
| 3. Documentation | CLAUDE.md (+ README) | — |

**Prerequisites:** S-29 done (it is).
**Estimated effort:** one session, 3 phases.

## Open Risks & Assumptions

- The drafts are not legal advice: operator identity, legal bases, retention of staff accounts and technical logs,
  backups vs. the guest-data purge, sub-processors and regions, liability, complaints, governing law and the DPA all
  need the lawyer.
- Who is the controller of guest data entered by the client (organizer) — the venue alone or jointly — is a lawyer
  point; the drafts follow S-26 (venue = controller).

## Success Criteria (Summary)

- A visitor understands the product and reaches the login from `/`, in PL and EN.
- Both drafts are clearly marked drafts, truthful about cookies, storage, retention, support access and AI, with every
  unknown visibly marked.
- Guests, the TV, the tablet and prints show no product name and no legal links.
