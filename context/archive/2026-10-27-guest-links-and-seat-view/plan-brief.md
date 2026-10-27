# Personal guest links, QR cards and the live seat view — Plan Brief

> Full plan: `context/changes/guest-links-and-seat-view/plan.md`

## What & Why

Roadmap S-05 (US-03, FR-011..FR-013, NFR-003, NFR-008, NFR-009). Guests need their own way into the app: a personal, unguessable link (printed as a QR card) that shows them their table and seat on the phone, live after every publish. The organizer controls it: copies links, prints cards, switches guest access on/off and revokes a link by issuing a new one. This is the first guest view; S-06/S-07/S-08 add sections to the same page.

## Starting Point

F-01 already parses `/g/<key>` and `/api/g/<key>/…` but denies every guest key. S-03 publishes immutable seating snapshots with a cheap polling version token, and the TV polls `?since=` (204/200). Guests have no keys; the event has no guest-access switch; the organizer shell shows "Linki gości i karteczki" as "Wkrótce".

## Desired End State

Each guest has a 144-bit personal key. `/o/<key>/linki` lists every guest's link with copy and revoke, plus the access switch; `/o/<key>/karteczki` prints A4 cards (name + QR + instruction). A guest opening `/g/<key>` sees "Twój stolik / Sala / Miejsce" from the latest published arrangement, refreshed within ≤ 5 s; with access off or a revoked link they get the same no-access page as everyone else, with no data.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Default guest access | OFF until the organizer turns it on | Cards can be printed early without exposing anything; the switch state is shown on the shell and links page. |
| Key storage | `guest.access_key` with a pgcrypto DB default; revoke uses `generateAccessKey()` | Backfills existing guests and covers every insert path; same 18-byte base64url format as F-01. |
| Denials | One identical 404 for off / revoked / unknown / cross-role; a guest hint in the shared NoAccess text | Denial reasons stay indistinguishable (NFR-009), yet a guest knows to ask the organizer. |
| Guest view | Live name + table, room, seat from the latest snapshot; 3 states; plan highlight on demand | Same truth as the TV; plan image (up to 5 MB) only loads when asked. |
| Live refresh | `/api/g/<key>/state?since=` 204/200, 2.5 s, paused in background, immediate on return; 404 clears data | Reuses the S-03 contract; cheap for 60 phones; phones unlocked after a publish catch up at once. |
| QR codes | Generated only in the organizer's browser (`qrcode` → own SVG path, EC level M) | Cloudflare's ~10 ms CPU cannot afford 40 codes server-side; keeps the lib out of the Worker bundle. |
| Cards | Separate print page, A4, 2 × 4 cards with cut lines, `?guest=<id>` for one card, localhost warning | Preview before printing; reprint after a revoke; cards printed from localhost would not open on phones. |
| Guest API convention | `guestApi(locals)` → `access.guest.id`; never a guest id from the request | Personal links are the identity (PRD), so S-06..S-08 cannot be spoofed. |
| Tests | Unit (state, token, links, summary, QR decode via `jsqr`), integration (keys, access matrix, services), HTTP smoke matrix | Covers "działający kod QR" and the Access Control matrix automatically. |

## Scope

**In scope:** key column + switch; guest resolver, `guestApi`; services (links, switch, revoke, guest state); organizer API + guest state/plan API; `/o/<key>/linki`, `/o/<key>/karteczki`, shell card; `/g/<key>` with live seat island; smoke matrix; CLAUDE.md contract.

**Out of scope:** seatmates on the guest page, "absent" vs "unseated" distinction, sending links, copy-all, bulk revoke, server-side QR, guesses/questions/AI (S-06..S-08), offline (S-09), browser E2E.

## Architecture / Approach

Middleware → `resolveAccess("guest")` (one query: guest by key with the event flag embedded) → `GuestAccess` in `locals`. Guest routes use `guestApi`; the state endpoint compares `since` with `guestStateVersion(getSeatingVersion, name)` (204) or reads the guest's single snapshot seat row (200). Organizer routes use `organizerApi` over `src/lib/guest-links/service.ts`. Card sheet = Astro HTML + client script that fills `data-qr` placeholders with SVGs.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema and guest access | Keys, switch, guest resolver, `guestApi`, access-matrix integration tests | Typed embed of `event(...)` in supabase-js with hand-written types |
| 2. Services | Links list, switch, revoke, guest state + token; pure helpers; QR decode test | New dependencies (`qrcode`, `@types/qrcode`, `jsqr`) |
| 3. API + smoke | Organizer and guest routes; full guest access matrix over HTTP | Smoke state assumptions after §16 |
| 4. Organizer pages | Links page, A4 card sheet with client-side QR, shell card | `qrcode` leaking into the server bundle; print layout untested in a real printer |
| 5. Guest page + docs | `/g/<key>` with polling seat card and plan highlight; CLAUDE.md contract | Mobile behaviour only verifiable manually (no browser tests overnight) |

**Prerequisites:** S-03 (snapshots, polling contract) done; local Supabase running; DB without an event for the smoke.
**Estimated effort:** ~5 phases in one overnight session.

## Open Risks & Assumptions

- QR scanning, print layout and phone behaviour (background timers, small screens) can only be confirmed manually (rows 4.4, 5.4).
- Cards printed from a local laptop encode a localhost URL; the pages warn, but the real public address (PRD Open Question 6) is needed before final printing.

## Success Criteria (Summary)

- Printed cards scan into the right guest's page; copy/revoke/switch work from the organizer's links page.
- A guest's phone shows their table, room and seat and follows each publish within 5 s with no action.
- Access off or a revoked link shows only the no-access page; a guest key opens nothing else.
