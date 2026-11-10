# Staff offline readout (S-27) — Plan Brief

> Full plan: `context/changes/staff-offline-readout/plan.md`

## What & Why

When the venue's network fails, the kitchen tablet `/r/<key>`, the staff floor `/panel/obsluga/<id>` and the per-event waiter's floor `/kelner/sala/<id>` must still show the last state of orders (what is delivered) and the published seating of their event, also after a reload, read-only (PRD v2 NFR-017, FR-047, US-08). Diets matter most exactly then (allergies).

## Starting Point

v1 has this for the client link only (S-09: localStorage envelopes, a data-free `/o/<key>/odczyt` page, `public/organizer-sw.js`). The three staff views poll already, but keep nothing on the device, and the floors swallow every failure and denial.

## Desired End State

Each live staff page saves a price-free, id-free copy (the tablet's own view) owner-tagged to its scope and expiring at the end of the floor window; three readout pages behind the same guards show it with „Stan z …”; the one generalised worker serves them when a live page cannot load (https/localhost production only); a denial, a logout or the window end leaves nothing readable on the device.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Diets in the copy | Included, with a hard expiry | Allergy info matters most offline; the expiry (noon Warsaw the day after the event) keeps health data from outliving the event day and is stricter than S-26's term. |
| What the floors keep | The tablet's projection (no prices, drinks, ids, marks) | FR-047/NFR-017 ask for orders + delivered + seating; one validator and one renderer for all three areas. |
| Slots | One fixed localStorage key per area | Same as v1; a second event's floor replaces the first one's copy (documented). |
| Owner binding | Tablet = link key path; floor = event + account; waiter = event + waiter id | A copy never shows under another link, event, account or waiter session. |
| Expiry | Floor window end (waiter: earlier of it and the waiter's expiry); checked on save and every read; expired slots swept | Nothing outlives the event day; a tablet opened after the window saves nothing. |
| Saving | Piggyback the existing polls; the readout page probes `/orders` | No new API, no extra requests on the live pages. |
| Worker | Generalise `public/organizer-sw.js` (same file, four scope kinds) | Keeps existing organizer registrations; one tested implementation; segment-exact scopes; redirects/401 are denials. |
| Logout | `/logowanie` clears panel floors' slot + workers; `/kelner` without a session clears the waiter's | The account/waiter owner tag alone does not satisfy "clear on logout". |
| Readout UI | The tablet's board extracted as `RestaurantBoard` (plan with map search, diets, prep, serving) | Same view as online; S-22's search reused for free. |
| Offline drawing | Keep the measured plan aspect ratio in the copy | The plan photo is an API answer the worker never stores. |

## Scope

**In scope:** core module + tests, floor window end, worker generalisation + vm tests, hooks' sync/denial state, store + saver, `RestaurantBoard`, three readout pages, live-page links and notes, logout clears, smoke 42, demo links, CLAUDE.md.

**Out of scope:** offline writes, prices/drinks offline, caching API answers, several events per area, the client's panel preview, the TV, real-device tests.

## Architecture / Approach

`src/lib/offline/staff.ts` (pure: projection, validation, envelope, scopes, denial, one-shot read) → `staff-offline-store.ts` + `useStaffReadout` (save on `syncedAt`, clear + forget worker on `denied`) used by `RestaurantView` and `OrderManager` (only with a `readout` scope from the three live pages) → readout pages (same guards, data-free HTML) with `StaffReadoutPage` → `public/organizer-sw.js` serves `<scope>/odczyt` when a navigation fails.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Core + worker | Pure model, floor window end, generalised worker with vm tests | Worker regressions for the organizer scope |
| 2. UI wiring | Saving on three live pages, three readout pages, logout clears | Hook changes ripple into the client's order page |
| 3. Smoke, demo, docs | Section 42, demo links, CLAUDE.md | Smoke setup of two today events with waiters |

**Prerequisites:** S-21, S-21b, S-22, S-23, S-26 done (they are).
**Estimated effort:** one session, 3 phases.

## Open Risks & Assumptions

- Real offline behaviour (worker install timing, storage eviction) is only provable on devices — manual check for the user.
- Plain-http LAN addresses get no worker: a reload offline fails there; only the open page keeps its state.
- Devices that never open any staff page again keep the (unreadable after expiry) slot until one does.

## Success Criteria (Summary)

- A tablet or waiter phone that loses network still shows the last orders, delivered pieces, seating and diets after a reload.
- No copy shows under another link, event, account or waiter, after a logout, a denial or the window end.
- Smoke proves the readout pages' guards and data-free HTML; organizer offline behaviour unchanged.
