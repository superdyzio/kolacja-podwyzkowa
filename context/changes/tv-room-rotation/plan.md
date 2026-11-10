# TV room rotation and pinning (S-20) Implementation Plan

## Overview

The TV at the entrance (`/tv/<key>`) keeps showing the whole venue while every seated name is readable (NFR-006/NFR-018: name font ≥ 2.5% of the screen height). When it is not, the TV rotates room by room by itself (each room zoomed, a caption with the room's name and „2 / 4” plus dots), and a TV can be pinned to one room with `?sala=<room name>` (FR-034, US-08). Rotation is client-side only: the poll, its token and the 204 path are unchanged.

## Current State Analysis

- `src/components/tv/TvSeatingView.tsx` draws the whole published snapshot with `VenueDrawing` (variant `tv`), polls through `useTvSeating` (2.5 s, opaque token), renders `TvSpotlight` at `z-20` and the offline badge at `z-30`; `BrandHeader` (TV variant) sits top-left at `z-10`.
- `TvSeatingDto.rooms` carries the OUTLINED rooms only; `TvTableDto` has no room — the snapshot table has `room_name` (`toTvSeating` in `src/lib/seating/published.ts`; the guest drawing builds the same DTO in `src/lib/guest-links/service.ts`).
- `VenueDrawing` lays out every table with `layoutDrawing` (names fitted per table, font in stage units) and fits the viewBox to `padRect(unionRect(tables' bounds + room rects), pitch·0.6)`; passing it a subset of tables and rooms crops the view to them.
- The TV link is shown on the organizer shell `/o/<key>` („Twoje linki”, read-only field) and on the panel event card (`EventLinkRow` kind `tv`, copy/open/rotate).

## Desired End State

- Pure module `src/lib/tv-rooms/` decides the TV mode from fixed inputs: `venue` (whole venue), `room` (pinned) or `rotate` (rooms in natural name order, dwell `TV_ROOM_DWELL_MS` = 12 s).
- The TV page reads `?sala=`, cleans it (`parseRoomPin`: normalized, 1–40 code points, else null) and the island resolves it case-insensitively against the rooms of the published tables; unknown → venue/rotation as without a pin. The caption always shows the room name from the data, never the raw parameter.
- Room view = that room's tables plus its outline (when it has one) given to `VenueDrawing`, so the view is the outline ∪ its tables' bounds (just the tables' bounding box without an outline).
- `prefers-reduced-motion`: no fade (`motion-safe:` only), the rotation still runs. The spotlight and the offline badge are unchanged.
- Organizer shell and the panel event card list „TV dla jednej sali” links (`/tv/<key>?sala=<encoded name>`) per room of the live venue with „Kopiuj”, PL/EN.
- Smoke: pinned room page renders the room caption; malformed parameter → 200, no raw echo of markup, no leaks; A's TV with B's room name shows nothing of B. Demo prints one pinned-room TV link.

### Key Discoveries:

- `src/components/venue-drawing/VenueDrawing.tsx` view computation (no-focus branch) — extracted into `contentView` in `src/lib/venue/drawing.ts` so the readability decision and the drawing use the same view.
- `layoutDrawing` (`src/lib/venue/drawing.ts`) gives `LaidOutTable.font` (stage units) per table — the readability input.
- `tw-animate-css` is already imported (`src/styles/global.css`): `motion-safe:animate-in motion-safe:fade-in` needs nothing new.

## What We're NOT Doing

- No server-side filtering by room, no new API route, no DB migration, no new secret (the pin is a public view filter on the same TV key).
- No per-room readability fallback (a room that is still too dense is shown as well as it fits).
- No organizer UI to configure dwell time or rotation order.
- No browser tests.

## Implementation Approach

Readability rule (measurable): lay out the whole venue with the estimated text widths (`estimateTextWidth`, deterministic, same on server and client), compute the whole-venue view (`contentView`), fit it into the screen minus the TV padding (1.5% of the height on each side, `p-[1.5vh]`), and take the smallest name font among tables with names, in screen pixels. Readable ⇔ that ≥ `TV_READABLE_FRACTION` (0.025) × screen height. Screen = `window.innerWidth × innerHeight` (server and hydration: 1920 × 1080). Rotation only when not readable AND at least two rooms have tables; otherwise the whole venue.

Rotation order: rooms that have at least one published table, natural order (`compareTableNames`), each shown for 12 s; when the room list changes (a new publish) the TV stays on the same room name if it still exists, else starts again at the first.

## Phase 1: TV modes, rotation and pin

### Changes Required:

#### 1. TV DTO carries the table's room
**File**: `src/types.ts`, `src/lib/seating/published.ts`, `src/lib/guest-links/service.ts`, test fixtures
**Intent**: Add `room: string` (the snapshot's room name) to `TvTableDto` so the TV can group tables by room; nothing private (room names are on the guest's seat and the restaurant page already).
**Contract**: `TvTableDto.room`; `toTvSeating` and `guestDrawing` fill it (`room_name` added to the select).

#### 2. Pure TV-room rules
**File**: `src/lib/tv-rooms/{rotation.ts,pin.ts,messages.ts,index.ts}` + `rotation.test.ts`, `pin.test.ts`
**Intent**: Readability decision, rotation order, room scene, pin parsing/resolution, PL/EN caption texts.
**Contract**: `TV_READABLE_FRACTION = 0.025`, `TV_ROOM_DWELL_MS = 12000`, `TV_PADDING_FRACTION = 0.015`, `DEFAULT_TV_SCREEN = { width: 1920, height: 1080 }`; `tvRoomNames(tables)`, `roomScene(tv, room)` → `{ rooms, tables }`, `smallestNameFontPx(tables, chairPitch, aspect, rooms, screen, measure?)`, `planTvView({ tables, rooms, chairPitch, aspect, screen, pin })` → `{ mode: "venue" } | { mode: "room"; room } | { mode: "rotate"; rooms }`, `nextRoomIndex`, `keepRoomIndex(previous, rooms)`; `parseRoomPin(raw)`, `resolveRoomPin(pin, names)`, `tvRoomPath(tvPath, room)`; `tvRoomMessages(locale)`.

#### 3. Shared view rect
**File**: `src/lib/venue/drawing.ts`, `VenueDrawing.tsx`
**Intent**: `contentView(bounds, pitch, stage)` used by `VenueDrawing` and by the readability rule.

#### 4. TV island and page
**File**: `src/components/tv/TvSeatingView.tsx`, `src/components/hooks/useTvScreenSize.ts`, `src/components/hooks/useTvRotation.ts`, `src/pages/tv/[key].astro`
**Intent**: Page passes `pin = parseRoomPin(Astro.url.searchParams.get("sala"))`; island plans the mode, rotates with a `setTimeout` chain, draws the room scene keyed by room (fade under `motion-safe`), caption top-right (`data-tv-room`, `z-10`) with „2 / 4” and dots in rotation.

### Success Criteria:

#### Automated Verification:
- Unit tests for the pure rules pass: `npm test`
- Lint and type check pass: `npm run lint`, `npx astro check`

#### Manual Verification:
- On a real TV a dense venue rotates room by room and a sparse one shows the whole venue

---

## Phase 2: Per-room links, smoke, demo, docs

### Changes Required:

#### 1. Per-room TV links
**File**: `src/components/tv/TvRoomLinks.tsx`, `src/pages/o/[key].astro`, `src/lib/events/service.ts` (`EventCardDto.rooms`), `src/components/events/EventCard.tsx`, `src/types.ts`
**Intent**: A `<details>` „Link TV dla jednej sali” with one read-only field + „Kopiuj” per room (live venue rooms, natural order) under the TV link; hidden when the venue has no rooms; the event card's list follows the card's current TV path (after „Wymień link”). Support mode shows no links (unchanged).

#### 2. Smoke, demo, CLAUDE.md
**File**: `scripts/smoke.mjs`, `scripts/demo.mjs`, `CLAUDE.md`
**Intent**: Smoke checks pinned, malformed and cross-event pins; demo prints one pinned-room TV link; CLAUDE.md „TV rooms (tv-room-rotation)” section.

### Success Criteria:

#### Automated Verification:
- `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check`, `npm run build` pass
- `npm run smoke` passes against `AI_PROVIDER=mock npm run preview`
- `npm run demo` passes and prints the pinned-room TV link

#### Manual Verification:
- The per-room links copy and open the pinned TV

## Testing Strategy

Unit: readability with fixed inputs (two sparse tables → venue; many dense tables in three rooms → rotate; dense but one room → venue), rotation order (natural, rooms without tables skipped), room scene (outline vs. tables only, case-insensitive), pin parsing (blank, too long, markup kept as text but capped), resolution (case-insensitive, unknown → null), `keepRoomIndex`. Smoke: HTTP behaviour. No browser tests.

## References

- Roadmap S-20, PRD FR-034, US-08, NFR-018 (NFR-006 target)
- `src/lib/venue/drawing.ts`, `src/components/venue-drawing/VenueDrawing.tsx`, `src/components/tv/TvSeatingView.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: TV modes, rotation and pin

#### Automated

- [x] 1.1 Unit tests for the pure rules pass — be12b65
- [x] 1.2 Lint and type check pass — be12b65

#### Manual

- [ ] 1.3 On a real TV a dense venue rotates room by room and a sparse one shows the whole venue

### Phase 2: Per-room links, smoke, demo, docs

#### Automated

- [x] 2.1 Tests, lint, check and build pass — e8691ce
- [x] 2.2 Smoke passes against the mock preview — e8691ce
- [x] 2.3 Demo passes and prints the pinned-room TV link — e8691ce

#### Manual

- [ ] 2.4 The per-room links copy and open the pinned TV
