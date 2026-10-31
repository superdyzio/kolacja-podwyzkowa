# Rooms and tables on the venue plan — Plan Brief

> Full plan: `context/changes/rooms-and-tables-on-plan/plan.md`

## What & Why

Roadmap S-02 (US-01, FR-005, FR-006): the organizer uploads one screenshot of the venue floor plan, names the rooms and pins tables on the plan with a name, seat count and type (okrągły / prostokątny). This is the seating structure that S-03 (manual seating + TV plan with guest names) and S-04 (reshuffle without repeated neighbours) build on, so the seat-numbering convention and deletion semantics are fixed here.

## Starting Point

F-01 (link keys, middleware, organizer shell, TV placeholder) and S-01 (guests and groups: pure rules module, DB service with status unions, thin API routes returning the whole list, SSR page + React island, HTTP smoke) are done. The organizer shell still shows "Sale i stoliki — Wkrótce". Supabase Storage is disabled; the brief requires the image in the database.

## Desired End State

`/o/<key>/sale`: upload/replace the plan, add/rename/delete rooms, click on the plan to add a table, click a pin to edit it (name, room, seats 2–20, type), move its pin, delete it. The shell card links there with a summary ("Plan wgrany · 3 sale · 7 stolików · 52 miejsca"). The image is served to the organizer and the TV by key-guarded routes; pins are stored as fractions of the image so S-03 can draw them at any resolution.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Image storage | base64 `text` in a singleton `venue_plan` row; metadata columns separate | PostgREST sends `bytea` as hex (2×); base64 is 1.33× and needs no RPC; metadata queries never touch the blob |
| Accepted files | PNG/JPEG/WebP by magic bytes, ≤ 5 MB (5 242 880 B), checked while reading the body and in the DB | Client headers can lie; the served type is the sniffed one (`nosniff`) |
| Image dimensions | not stored; views use the `<img>`'s natural size | Fraction pins don't need them; avoids JPEG/WebP header parsing |
| Pin model | `x`, `y` ∈ [0, 1] of the rendered `<img>` box (top-left origin), 4 decimals; required for every table | US-01 AC "każdy stolik ma pozycję na planie"; resolution-independent for the TV |
| Rooms | name only (1–40 chars, unique case-insensitively, ≤ 10); a table belongs to exactly one room | Rooms are labels; the plan is one screenshot of the whole venue |
| Tables | name 1–24 chars unique per event (case-insensitive), seats 2–20, `round`/`rectangular`, ≤ 40 | All tables appear on one TV plan, so names must be distinguishable |
| Pin UX | click on the plan → "Nowy stolik" form at that point; "Przestaw pinezkę" → next click moves it; no drag | Simplest reliable interaction on a laptop |
| Plan replacement | upload again; no delete; pins keep their fractions; confirm asks to check them | Never loses tables because of a new screenshot |
| Seat convention | round: 1..n clockwise, neighbours i±1 with wrap; rectangular: side A 1..ceil(n/2), side B the rest in the same direction, neighbours i±1 on one side without wrap, opposite = same position on the other side | Recommended by the user; encoded and tested in `src/lib/venue/seats.ts` |
| Deletion semantics | structure edits always succeed: deleting a table/room or lowering seats removes seat assignments there (guests unseated, UI warns); type change keeps seats; rename/move/re-pin/replace plan don't touch seating | Predictable rule for S-03; history for S-04 stored as publish-time pairs |
| Tests | unit for rules/image/seats/pin/body reader/summary; integration for services and anon denial (plan cases skipped if a real plan exists); smoke for API + image routes | Mirrors S-01; never overwrites real data |

## Scope

**In scope:** migration (3 tables), DB types and DTOs, pure rules/image/seats/pin/summary modules, venue service, organizer API + organizer/TV image routes, smoke, `/o/<key>/sale` page with a React island, shell link, CLAUDE.md docs.

**Out of scope:** seat assignments, publishing, TV rendering of the plan (S-03); shuffle and neighbour scoring (S-04); guest access to the plan (S-05); drawing rooms; resizing images; drag-and-drop pins; E2E browser tests.

## Architecture / Approach

Migration → `src/lib/venue/` (pure `rules.ts`, `image.ts`, `seats.ts`, `pin.ts`, `summary.ts`; DB `service.ts`; `image-response.ts`) → thin Astro routes under `/api/o/<key>/` (`venue`, `plan`, `plan/image`, `rooms`, `tables`) and `/api/tv/<key>/plan/image` → SSR page `/o/<key>/sale` with island `VenueEditor` + hook `useVenue` that replaces its state with each `VenueDto` answer.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema, types and venue rules | Tables with checks + RLS/revokes, DTOs, pure rules/image/seats/pin modules, anon-denial test | Check constraints disagreeing with JS validation |
| 2. Venue services | Plan save/read, room/table CRUD, integration tests incl. exactly-5 MB round trip | Body size through the gateway; test hygiene on the singleton plan |
| 3. Organizer API, image routes, smoke | JSON routes, capped upload reader, organizer/TV image routes, smoke | Binary bodies through middleware; 413/415 paths |
| 4. Page and shell link | `/o/<key>/sale` island (upload, rooms, pins, forms), shell card, docs | Click-to-fraction accuracy; phone layout |

**Prerequisites:** local Supabase running (db/rest/kong), `.env` from `npm run env:local`, DB without an event for smoke.
**Estimated effort:** ~1 session, 4 phases.

## Open Risks & Assumptions

- Hosted Supabase gateway limits for a ~7 MB insert are unverified (local accepts it).
- Cloudflare Workers free plan (10 ms CPU) may not fit base64 decoding of a 5 MB image; deploy target still open (PRD OQ 6).

## Success Criteria (Summary)

- The organizer sets up the real venue (plan, 2–3 rooms, 5–8 tables with pins, seats and types) from a laptop.
- The TV route serves the same plan image; pins are stored resolution-independently for S-03.
- S-03/S-04 have a written, tested seat convention and explicit deletion semantics.
