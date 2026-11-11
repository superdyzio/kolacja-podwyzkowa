# Room prints (S-24) — Plan Brief

> Full plan: `context/changes/room-prints/plan.md`

## What & Why

FR-038: the client and the venue print what a room needs on the day — a „Znajdź swój stolik” board, table cards, place cards („winietki”) in a choice of formats and the staff list per table with diets — with the restaurant's and the event's brand. Today the only print is the v1 QR guest cards.

## Starting Point

`/o/<key>/karteczki` is the print pattern (A4 sheets in mm, `@page { margin: 0 }`, screen-only toolbar). The latest published snapshot (`toPublishedSeating`) and the diets per seat (`dietBoard` + `dietSeatLookup`) already exist; the panel, floor and per-event waiter guards exist.

## Desired End State

A „Wydruki dla sali” hub for the client (shell card) and a section on the panel's event card link four print pages per area. Each prints fixed A4 (or A3 board) sheets from the published seating with the brand; a screen-only toolbar picks the format and warns about unpublished changes. Waiters print the staff list from their floor. Diets only on the staff list; no keys, ids or prices on any print.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Data source | latest published snapshot | what the TV and phones show; absent guests already left out |
| Formats | query parameters, unknown → default | no stored settings, no migration |
| Board | A4 3 columns, A3 poster = the same layout ×√2, letter headings | predictable pagination, one layout |
| Table cards | `tent` (A4 folded, both halves) / `flat` (two A5 per A4), `names=1` | covers both table-card uses |
| Place cards | `tent-90x45` (6/A4), `tent-95x70` (4/A4), `flat-90x50` (10/A4) | two folded + one flat common sizes |
| Pagination | server-side fixed sheets (rows/units) | `@page margin 0` (no URL header) breaks normal flow across pages |
| Key-free client prints | relative links + page-area logo route `/o/<key>/wydruki/logo` | a saved/printed page never carries the client link |
| Support mode | prints readable (logged), staff list with diets, no logo images | S-23 lets support see diets; S-18 avoids logo reads in support |
| Waiters | staff list on both floors | cheap: same component, existing guards |
| Panel hub | a section on the event card, no `CLIENT_SECTIONS` entry | the sections drive the dispatcher and „Praca klienta” |

## Scope

**In scope:** four prints × client and panel, staff list on both floors, shell card + client hub, panel event-card section, PL/EN, unit + integration tests, smoke 44, demo, CLAUDE.md.

**Out of scope:** migration, JSON API, stored settings, QR codes on new prints, RSVP dishes on the staff list, prices/orders, landscape and custom paper sizes.

## Architecture / Approach

`src/lib/prints/` (pure options, builders, sheet math, pagination, brand, texts) + one loader `getRoomPrintSource(db, eventId, { diets })` → `src/components/prints/RoomPrint.astro` (toolbar + sheets) rendered by four thin page families that differ only in guard, paths and logo base.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Models, loader, tests | pure builders + loader + unit/integration tests | pagination estimates vs. real text widths |
| 2. Pages | components, client/panel/floor pages, links | print CSS across browsers |
| 3. Smoke, demo, docs | section 44, demo checks and links, CLAUDE.md | smoke run time |

**Prerequisites:** S-18 (branding), S-23 (diets) — done.
**Estimated effort:** ~1 session, 3 phases.

## Open Risks & Assumptions

- Row-unit estimates may let a very long name overflow its row (clipped, never spilling into another sheet).
- Browser print differences (roadmap risk): the sheets keep the karteczki rules that already print well.

## Success Criteria (Summary)

- The client and the venue print the four prints with the brand from the published seating; waiters print the staff list.
- Diets only on the staff list, no keys in client print HTML; smoke 44 and the demo pass.
