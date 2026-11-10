# Restaurant and event branding (S-18, FR-032) Implementation Plan

## Overview

The owner sets the restaurant's name, logo and colour; the client (or the staff while „Lokal prowadzi” is on) sets the
name and logo of their company or event. Both show on the guests' phones, the TV, the restaurant tablet, the QR cards,
the client's shell and the panel. Guests never see the platform name, and „Kolacja podwyżkowa” leaves every
user-facing text and the AI prompt.

## Current State Analysis

- Restaurants have a `name` (1–80, set by the platform admin at creation, `parseRestaurantName` in
  `src/lib/platform/rules.ts`); events have a `name`. Nothing else brands a page.
- The venue plan image is the pattern for user images: `sniffImageType` by magic bytes (`src/lib/venue/image.ts`),
  base64 text column in a singleton table (`venue_plan`), `readBodyBytes` with a byte cap, image routes per key area
  with `nosniff` (`src/lib/venue/image-response.ts`), the version (epoch ms) in the URL, `no-store` from the middleware.
- „Kolacja podwyżkowa” / „Raise dinner” remain in `Layout.astro` (default title), `shell/messages.ts` (`appName`, home
  page), `ai-topics/prompt.ts` (system prompt), `scripts/package-lambda.mjs` (home check) and the v1 guessing copy
  („Ile kosztowała cała kolacja?” in `guest-links/messages.ts`, `guesses/messages.ts`, `modules/messages.ts`).
- Organizer routes must be listed in `CLIENT_ROUTE_PATTERNS` + `CLIENT_ROUTE_MODULES` (`match.test.ts`); mutations
  under `/api/o/<key>/` get the lead rule's 409 in the middleware for free; the dispatcher runs them for the staff.

## Desired End State

- `restaurant.brand_color` and `event.brand_name` columns; `restaurant_logo` / `event_logo` singleton tables (PNG,
  JPEG, WebP by magic bytes, ≤ 512 KiB).
- Owner edits the restaurant brand (name, colour, logo) on `/panel/restauracje/<id>` („Marka lokalu”); managers and
  support see it read-only; waiters, other restaurants and bad ids get the identical 404.
- The client edits the event brand (name, logo) on `/o/<key>` („Marka wydarzenia”); the staff edit it on the event card
  through the dispatcher while the venue leads.
- A brand header (restaurant logo + name on the brand colour with black/white text by contrast, client logo + name)
  on `/g/<key>`, `/tv/<key>` (corner badge), `/r/<key>`, `/o/<key>`, the QR cards and the panel restaurant page;
  unset branding keeps today's look.
- No „Kolacja podwyżkowa” / „Raise dinner” / „kolacji podwyżkowej” in `src/` or `public/` user-facing text or the AI
  prompt; the guessing game speaks of „the bill”.
- Verified by unit tests, an integration test, smoke section 34, the demo.

### Key Discoveries:

- `src/lib/venue/image.ts:31` `sniffImageType`, `bytesToBase64` / `base64ToBytes` — reuse for logos.
- `src/lib/venue/image-response.ts` — the image response shape (Content-Type sniffed at upload, `nosniff`).
- `src/pages/api/panel/events/[id]/klient/[...path].ts` — the dispatcher; patterns in `src/lib/client-routes/match.ts`.
- `src/lib/panel-api.ts` `panelRestaurantApi(locals, id, roles)` — support mode reads only, admin mutations → 404.
- `scripts/smoke.mjs` `requestBytes`, `TINY_PNG`, `sessionOwner` (A and B), `sessionB`, `sessionManager`,
  `sessionWaiter`, `sessionAdmin`, `enterSupport`; `scripts/demo.mjs` already builds PNGs (`planPng`).

## What We're NOT Doing

- No live update of the brand on phones / TV: the page load reads it, image URLs carry the version (no token change,
  no new poll).
- No editor for the event brand in the admin's support mode; the panel event-card editor reuses the client's island through the dispatcher.
- No branding for venue templates (no key opens a template; the template dispatcher has no branding route).
- No logo `<img>` in the admin's support mode on the panel restaurant page (one guard call per page; the section says
  whether a logo is set) and no event-brand section on the event card in support mode.
- No platform-admin rename route (the admin names the restaurant at creation; the owner renames).
- No SVG, no image resizing, no favicon or manifest per brand.
- Not renaming internal identifiers (package name, localStorage keys, SW cache name, Lambda name, DB content).

## Implementation Approach

One pure module `src/lib/branding/` (rules, messages, zod api) + DB service + image response; thin routes in every key
area and the panel; one shared Astro `BrandHeader` component; two small islands for editing. Copy cleanup in the same
slice.

## Critical Implementation Details

- **Contrast:** text colour on the brand colour = whichever of `#000000` / `#ffffff` has the higher WCAG contrast ratio
  against it (relative luminance), computed on the server and returned with the colour.
- **Deploy order:** `getEventBranding` reads the new columns/tables on every guest/TV/tablet/shell page, so the
  migration must reach the database BEFORE the code; it is additive (old code works on the migrated DB).
- **Origin:** panel logo uploads are raw-body PUTs under `/api/panel/` → the middleware's Origin check applies (the
  island sends same-origin fetches, fine).

## Phase 1: Data, service, routes, copy cleanup

### Overview

Migration, types, pure rules, service, every route, the copy cleanup and tests.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261111000000_event_branding.sql`

**Intent**: Store the brands without touching existing rows.

**Contract**: `restaurant.brand_color text null check (~ '^#[0-9a-f]{6}$')`; `event.brand_name text null check
(char_length between 1 and 80)`; tables `restaurant_logo (restaurant_id pk → restaurant on delete cascade, mime_type
in png/jpeg/webp, byte_size 1..524288, image_base64 ≤ 699052 chars, updated_at)` and `event_logo (event_id pk → event on
delete cascade, same columns)`; RLS on, `revoke all … from anon, authenticated`. No functions.

#### 2. Types and pure rules

**Files**: `src/db/database.types.ts`, `src/types.ts`, `src/lib/branding/{rules,messages,api,index}.ts`

**Intent**: DTOs and validation shared by server and islands.

**Contract**: `MAX_LOGO_BYTES = 524288`; `parseBrandColor(text)` (`#rgb` / `#rrggbb`, case-insensitive → lowercase
`#rrggbb`, empty → null), `brandTextColor(hex)`, `parseBrandName(text)` (normalized like names, empty → null, ≤ 80),
`logoUrl(base, kind, version)`; `LogoDto { mimeType, byteSize, version }`, `BrandingDto { restaurant: { name, color,
textColor, logo }, client: { name, logo } }`, `RestaurantBrandingDto { restaurantId, name, color, textColor, logo }`;
zod `RestaurantBrandingPatch { name?, color?: string | null }` (strict, ≥ 1 field), `EventBrandingPatch { name: string
| null }` (strict); roles `BRAND_EDIT_ROLES = [owner]`, `BRAND_VIEW_ROLES = [owner, manager]`; `brandingMessages`.

#### 3. Service and image response

**Files**: `src/lib/branding/service.ts`, `src/lib/branding/image-response.ts`

**Intent**: Every read and write scoped by the event or restaurant the guard opened.

**Contract**: `getEventBranding(db, eventId)` (non-template event only), `getRestaurantBranding(db, restaurantId)`,
`updateRestaurantBranding(db, restaurantId, { name?, color? })`, `setEventBrandName(db, eventId, name)`,
`saveEventLogo` / `saveRestaurantLogo` (→ `saved | too-large | unsupported-type`), `deleteEventLogo` /
`deleteRestaurantLogo`, `getEventLogo(db, eventId)`, `getRestaurantLogoOfEvent(db, eventId)`,
`getRestaurantLogo(db, restaurantId)`; `logoImageResponse(db, eventId, kind, locale)` and `imageResponse(logo, locale)` (404 `logoMissing` when null). The restaurant page reads `getRestaurantBranding` from its ONE `findPanelRestaurant` result (never a second guard; the guard's own query stays untouched).

#### 4. Routes

**Files**: organizer `src/pages/api/o/[key]/branding.ts` (GET, PATCH) and `branding/logo.ts` (GET `?kind=event|restaurant`,
PUT and DELETE = the event's logo); tv / g / r `src/pages/api/{tv,g,r}/[key]/branding/logo.ts` (GET `?kind=`); panel
`src/pages/api/panel/restaurants/[id]/branding.ts` (GET `BRAND_VIEW_ROLES`, PATCH `BRAND_EDIT_ROLES`) and
`branding/logo.ts` (GET view roles, PUT/DELETE owner); `CLIENT_ROUTE_PATTERNS` + `CLIENT_ROUTE_MODULES` gain
`branding`, `branding/logo`. An unknown `kind` → the `logoMissing` 404. Each image route is the `plan/image.ts` shape
around `logoImageResponse(db, eventId, kind, locale)`.

**Intent**: Guarded routes in each area; answers `BrandingDto` (organizer) / `RestaurantBrandingDto` (panel).

#### 5. Copy cleanup

**Files**: `src/layouts/Layout.astro`, `src/pages/index.astro`, `src/lib/shell/messages.ts`,
`src/lib/ai-topics/prompt.ts`, `src/lib/guest-links/messages.ts`, `src/lib/guesses/messages.ts`,
`src/lib/modules/messages.ts`, `src/lib/questions/seed.ts` (comment only), `scripts/package-lambda.mjs`, code comments
mentioning the raise dinner.

**Intent**: Default title and home page use `PRODUCT_NAME` (staff-facing only; every guest/TV/tablet page passes its
own title); the AI host is a neutral „gospodarz przyjęcia w restauracji”; the game asks for the whole bill.

#### 6. Tests

**Files**: `src/lib/branding/branding.test.ts`, `tests/integration/event-branding.test.ts`, prompt test update.

### Success Criteria:

#### Automated Verification:

- Migration applies on the populated local DB (`npx supabase migration up`), counts unchanged
- `AI_PROVIDER=mock npm test` passes (unit + integration incl. the new files)
- `npm run lint` and `npx astro check` pass
- `grep -rn "Kolacja podwyżkowa\|Raise dinner\|kolacji podwyżkowej" src public` finds nothing user-facing

---

## Phase 2: UI (brand header, editors, cards, TV, panel)

### Overview

Show the brand everywhere and let the owner / client edit it.

### Changes Required:

#### 1. Brand header

**File**: `src/components/branding/BrandHeader.astro`

**Intent**: One server-rendered header (`data-brand-header`), variants `page` | `tv`; brand colour background with the
contrast text colour; logos by `logoUrl(base, kind, version)`; renders nothing extra when unset.

#### 2. Pages

**Files**: `src/pages/g/[key].astro`, `src/pages/tv/[key].astro`, `src/pages/r/[key].astro`, `src/pages/o/[key].astro`,
`src/pages/o/[key]/karteczki.astro`, `src/pages/panel/restauracje/[id].astro`, `src/pages/panel/wydarzenia/[id].astro`

**Intent**: Header on guest / tablet / shell; corner badge on TV; logos, client name and a brand-colour stripe on each
card; „Marka lokalu” section (owner: island; manager / support: read-only, support without the image) and the brand in
the restaurant page header; „Marka wydarzenia” on the event card (members only; editable while the venue leads).

#### 3. Islands

**Files**: `src/components/branding/RestaurantBrandingManager.tsx`, `src/components/branding/EventBrandingManager.tsx`,
hook(s) in `src/components/hooks/`

**Intent**: Name / colour (`<input type="color">` + text) / logo upload (raw PUT) / remove; every answer replaces the
state; errors shown inline; PL/EN via `locale` prop.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check`, `npm run build` pass

#### Manual Verification:

- The brand looks right on a phone, the TV, the cards (print preview) and the panel, PL and EN

---

## Phase 3: Smoke, demo, docs

### Changes Required:

- `scripts/smoke.mjs` section 34: client brand (name, logo, 413, 415, nosniff, same bytes on o/g/tv/r; a logo of event B never shows through A's key: A's routes → 404 `logoMissing`; the guest route read with guest access on, so `logoMissing` is never confused with the no-access body), restaurant
  brand by the owner (colour normalised + text colour, logo, rename), manager reads / cannot write, waiter / owner B /
  unknown / malformed → identical 404, no session 401, foreign Origin 403, lead rule (409 venue-leads, staff through the
  dispatcher), event B's logo routes never serve A's logo, pages carry the header and never „Stolik” / „Kolacja
  podwyżkowa”, support mode reads only.
- `scripts/demo.mjs`: restaurant logo + colour (owner session), client name + logo for the main event.
- `CLAUDE.md` section „Branding (event-branding, S-18)”, guessing copy line updated; README if commands change.

### Success Criteria:

#### Automated Verification:

- `npm run build` + `AI_PROVIDER=mock npm run preview` + `npm run smoke` all PASS
- `AI_PROVIDER=mock npm run demo` succeeds

## Testing Strategy

### Unit Tests:

- `parseBrandColor` (`#ABC` → `#aabbcc`, `#1e3a8a`, refusals `red`, `#12345`, `url(…)`), `brandTextColor` (white on
  dark, black on yellow/white), `parseBrandName` (trim, empty → null, 81 chars refused), `logoUrl`.
- AI prompt no longer names the raise dinner.

### Integration Tests:

- Two restaurants with one event each: logos and names land only on their own rows; `getEventBranding(B)` sees none of
  A's; SVG / HTML bytes → `unsupported-type`; > 512 KiB → `too-large`; deleting the logo; rename + colour; templates →
  null.

## Migration Notes

Additive: two nullable columns, two new tables. Deploy the migration before the code.

## References

- `src/lib/venue/image.ts`, `src/lib/venue/image-response.ts`, `src/pages/api/o/[key]/plan.ts`
- `context/archive/2026-11-10-client-restaurant-split/`, `context/archive/2026-11-10-event-modules/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data, service, routes, copy cleanup

#### Automated

- [x] 1.1 Migration applies on the populated local DB (`npx supabase migration up`), counts unchanged — 591c849
- [x] 1.2 `AI_PROVIDER=mock npm test` passes (unit + integration incl. the new files) — 591c849
- [x] 1.3 `npm run lint` and `npx astro check` pass — 591c849
- [x] 1.4 `grep -rn "Kolacja podwyżkowa\|Raise dinner\|kolacji podwyżkowej" src public` finds nothing user-facing — 591c849

### Phase 2: UI (brand header, editors, cards, TV, panel)

#### Automated

- [x] 2.1 `npm run lint`, `npx astro check`, `npm run build` pass

#### Manual

- [ ] 2.2 The brand looks right on a phone, the TV, the cards (print preview) and the panel, PL and EN

### Phase 3: Smoke, demo, docs

#### Automated

- [ ] 3.1 `npm run build` + `AI_PROVIDER=mock npm run preview` + `npm run smoke` all PASS
- [ ] 3.2 `AI_PROVIDER=mock npm run demo` succeeds
