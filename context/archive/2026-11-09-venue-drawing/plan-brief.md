# Drawn venue plan with names at the chairs — Plan Brief

> Full plan: `context/changes/venue-drawing/plan.md`

## What & Why

The TV should show at a glance where each guest sits. Instead of the venue photo with name cards next to table pins, it draws the venue in one consistent style: rooms, tables, chairs, and each name centred over its chair. The organizer redraws the venue over the photo, and Claude (Sonnet 5.5, vision) proposes the layout as a draft to correct.

## Starting Point

- **Tables** have a centre pin on the photo, a shape and a seat count; rooms are names only.
- **The TV** shows the photo and lays name cards near the pins.
- **Seat numbering** (round: clockwise; rectangular: two facing sides) is a contract shared by phones, the draw and neighbour history.
- **Real data has been in the hosted DB since 2026-10-31**, and the dinner is 2026-11-08.

## Desired End State

- **TV and guest phones** draw the venue in SVG: room outlines with names, tables sized from seat count × one venue-wide chair pitch, chairs numbered as today, and names horizontal over their chairs. The phone enlarges the guest's table and highlights their chair.
- **`/sale`** becomes a drawing editor over a semi-transparent photo: drag, rotate, room outlines and a scale slider.
- **„Zaproponuj układ ze zdjęcia (AI)”** fills a draft you accept line by line. Existing tables only move or rotate; nothing is deleted and no seat count changes.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Who redraws | AI proposal + manual correction | Fast start from the photo, with the organizer having the last word |
| TV background | Drawing only, no photo | Most legible from across the room |
| Name placement | Horizontal, centred over the chair, outward | Readable without tilting your head; per-table font shrinks to avoid overlaps |
| Table size | Seat count × one venue-wide chair pitch | Consistent look, fewer controls |
| Rooms | Rectangle outline + name | Guests see which room their table is in |
| Guest phone | Same drawing, own chair highlighted | One look everywhere; names only from the guest's own table |
| Vision model | Sonnet 5.5, effort low, Lambda timeout 15 → 30 s | Better layout reading for a few cents per call |
| AI vs existing data | Draft; match by name, then nearest pin; position and rotation only | Seat assignments and pins on live data stay safe |
| Editor device | Laptop first, phone via number fields | The real use case, less risk before 8.11 |

## Scope

**In scope:**
- An additive migration (rotation, room outlines, chair pitch, their snapshot copies, `apply_venue_layout`).
- Pure geometry.
- An SVG renderer on the TV and phone.
- The editor.
- The AI proposal with a mock.
- The Lambda timeout.
- Docs.

**Out of scope:**
- Per-table size, chairs at table ends, or a change in numbering.
- AI changes to seat counts or deletions.
- Changes to the offline readout.
- Multi-touch gestures.
- New npm dependencies.

## Architecture / Approach

- **One pure module** (`src/lib/venue/drawing.ts`) turns a table and the pitch into a body, chair positions in the seat-contract order, and label anchors.
- **One React SVG component** renders it for the TV, phone and editor.
- **Publishing** copies the new geometry into the snapshot; the TV and phones read only snapshots.
- **Null in old snapshots** means the default, so nothing turns "unpublished" after the deploy.
- **The AI path:**
  1. The browser downscales the photo.
  2. The server calls Sonnet 5.5 with structured JSON output.
  3. Proposals are matched to existing tables.
  4. The organizer ticks lines.
  5. One DB function applies them in a transaction.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data & geometry | Columns, snapshot copies, DTOs/APIs, tested chair math | Fingerprint drift turning every board "unpublished" |
| 2. TV & phone drawing | Names at chairs on TV; phone with own chair | Legibility with 40 names on a 16:9 TV |
| 3. Editor on /sale | Drag, rotate, room outlines, scale, TV preview | Editor UX polish within the time left |
| 4. AI proposal | Photo → draft → apply | Vision accuracy and latency under the 30 s Lambda limit |

**Prerequisites:** a DB dump before `db push` on prod; the order is `db push` → `deploy:aws`; a republish after redrawing.
**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- The plan photo's aspect ratio is the stage, and every drawing coordinate is a fraction of it, like today's pins.
- Very long names at dense rectangular tables shrink to a minimum font, so they may need a shorter display name.
- Vision output quality is unknown until tried on the real photo. The editor is the fallback either way.

## Success Criteria (Summary)

- On the TV, every seated guest finds their name at a chair of the right table, readable from a distance.
- The organizer redraws the real venue in minutes (AI draft + corrections) without disturbing anyone's seat.
- Deploying it changes nothing for live data until the organizer publishes a redrawn plan.
