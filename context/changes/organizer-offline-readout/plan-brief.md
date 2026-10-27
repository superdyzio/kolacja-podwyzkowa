# Organizer offline readout — Plan Brief

> Full plan: `context/changes/organizer-offline-readout/plan.md`

## What & Why

S-09, the last slice of M-1 (US-04, FR-020, NFR-004). If the venue network fails during the dinner, the organizer must still see the last published seating ("where do I sit?") and the guesses with the ranking (to read the results from the last place) on their own device — also after refreshing the page. The user's recovery path is „Ostatni stan + hotspot”: show the last state, reconnect through a phone hotspot.

## Starting Point

Organizer pages are SSR with `no-store`; offline, a refresh shows the browser's error page. `/strzaly` keeps the guess board in memory and polls every 5 s; `/rozsadzenie` holds only the working arrangement — the published seats (snapshots) have no organizer route. Pure ranking (`rankGuesses`, `placesFromLast`) and the readout UI (`RankingReadout`, `RankingTable`) already exist.

## Desired End State

Organizer pages keep two localStorage entries (published seating, whole guess board) fresh with „Stan z HH:MM”. When the server is unreachable they show a hotspot hint and „Pokaż ostatni zapisany stan” → a full-screen readout (seating search + tables by room, ranking with „Czytaj od końca”, who is missing, a local correct amount when none was saved). On https/localhost a small service worker serves a cached copy of the data-free `/o/<key>/odczyt` page when an organizer navigation fails, so refresh and the bookmark work offline too.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Offline surface | In-page notice + overlay AND a minimal service worker for refresh | NFR-004 says „także po odświeżeniu strony”; only a worker can serve a page with no network. |
| What seating | Latest PUBLISHED snapshot, text list by room/table with name search | That is what guests and the TV show; the plan image (≤ 5 MB) does not fit localStorage. |
| Ranking without a saved correct amount | Cache all guesses; offline the organizer can type the amount locally (memory only, never sent) | The outage may hit before the reveal; `rankGuesses` is pure. |
| Storage | Two fixed keys `kolacja-podwyzkowa:odczyt:*`, versioned envelope, owner = FNV hash of the API base, deep validation | No secrets in key names; data of another event never shows; corrupted storage is ignored. |
| „Stan z” | Time of the last successful server read, with the date when not today | Rehearsal data cannot pass as current. |
| Freshness | Sync on load, every 30 s, on visible/online, after publish; `/strzaly` on every poll | One organizer device; tiny cost. |
| Offline detection | Network error, 8 s timeout, 5xx or the browser `offline` event; retry every 5 s | "Wi-Fi up, no internet" hangs instead of failing. |
| Worker scope & safety | Scope `/o/<key>`, caches only `/odczyt` + its `/_astro/` closure, never API; fallback only on error/timeout/5xx; 404 → forget + unregister; atomic precache; prod + secure context only | Smallest worker that meets NFR-004 without risking online behaviour or leaking across keys. |
| Testing | Unit tests for pure modules, the sync step and the store; the shipped worker file run in `node:vm` with fake caches/fetch; smoke for route/page/worker file | No browser tests overnight. |

## Scope

**In scope:** published-seating route; cache store and sync hook; readout components (overlay + `/o/<key>/odczyt`); integration in `/strzaly`, `/rozsadzenie`, shell and other organizer pages; service worker; shell card; docs.

**Out of scope:** any offline write or sync queue; working arrangement, history, pins; plan image; guest/TV offline; questions/AI offline; caching other pages or API answers; PWA manifest; worker on plain-http LAN or in dev.

## Architecture / Approach

Server: `getPublishedSeating` → `GET /api/o/<key>/seating/published`. Browser: `useOfflineSync(apiBase)` reads that route and `/guesses` → `offline-cache-store` (localStorage) and reports `offline`; `OfflineReadout` renders from the store; host islands show `OfflineNotice` + `OfflineReadoutDialog`. `/o/<key>/odczyt` hosts the same readout; `public/organizer-sw.js` (scope `/o/<key>`) precaches it and answers failed navigations with it.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Pure offline domain and types | DTOs, projection, envelope + validation, readout helpers | Validators too loose/strict |
| 2. Published seating API | Service, route, integration test, smoke | None notable |
| 3. Cache sync and in-page readout | Store, sync hook, components, host-page integration | Nested overlays, hydration |
| 4. Readout page, worker, shell card, docs | `/odczyt`, `organizer-sw.js` + vm tests, smoke, CLAUDE.md | Worker behaviour unverified in a real browser overnight |

**Prerequisites:** S-03/S-04 snapshots, S-06 guess board (done).
**Estimated effort:** ~1 session, 4 phases.

## Open Risks & Assumptions

- The worker is verified only in Node (`node:vm`) overnight; a real-browser check is a manual row.
- Service workers need https or localhost; on `http://<LAN-IP>` only the in-page fallback works.
- iOS may evict worker caches after long inactivity; the evening's normal use refreshes them.

## Success Criteria (Summary)

- With the network off, the organizer reads the published seating and the ranking (from the last place) on their device, also after a refresh.
- The notice tells them to switch to a hotspot and disappears by itself when the server is back.
- Nothing about the cache or the worker changes online behaviour; guests and the TV are unaffected.
