# Guest list, groups and absences — Plan Brief

> Full plan: `context/changes/guest-list-and-groups/plan.md`

## What & Why

Roadmap S-01 (US-01, FR-001..FR-003): the organizer pastes the guest list, edits single guests by display name, ties 2–5 guests into inseparable groups (pair by default) and marks absences. It is the first real data of the evening and the input for seating (S-03/S-04), which treats groups and absences as hard rules — so group validation must be enforced, not just shown.

## Starting Point

F-01 gave a singleton event with an organizer link (`/o/<key>`) and a TV link, a middleware guard for `/o|tv|g/` and `/api/o|tv|g/`, a service-role DB client used only on the server, hand-written DB types, Vitest (unit + local-DB integration) and an HTTP smoke script. The organizer shell has a "Goście i grupy" placeholder card.

## Desired End State

`/o/<key>/goscie` lets the organizer, on a phone, paste a list, add/rename/delete guests, mark absent/present, select 2–5 ungrouped guests and create a pair/group, and dissolve groups. The data survives refreshes in Postgres; the DB itself guarantees unique names, at most one group per guest, group size 2–5 at creation and automatic dissolution of a group that falls below 2.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Duplicate names | Unique per event, case-insensitive after whitespace normalization | Two identical "Kasia" are indistinguishable on the TV plan and on QR cards. |
| Paste behaviour | All-or-nothing; problems listed by line, text kept | No guest silently disappears from a 40-line paste. |
| Limits | ≤ 100 guests, names 1–40 characters | PRD scale is ≤ 60; short names keep the TV readable. |
| Group editing | Create (2–5 ungrouped) and dissolve only | Exactly FR-002; change = dissolve + recreate. |
| Deleting a group member | Group auto-dissolves when < 2 remain (DB trigger); a triple becomes a pair | Keeps the 2–5 invariant whatever the write path. |
| Absent group member | Stays in the group; S-04 seats present members together | Absence is temporary; membership is a relationship. |
| Atomic group creation | One plpgsql function `create_guest_group` with row locks | supabase-js has no transactions. |
| Organizer as guest | No flag now; organizer is an ordinary guest | Smallest scope; S-03 can add a marker if needed. |
| UI | Separate page `/o/<key>/goscie`, one React island, alphabetical (pl) list, checkbox selection | Phone-friendly and keeps the shell light for later slices. |
| Validation library | `astro/zod` (bundled with Astro) | No new dependency. |

## Scope

**In scope:** `guest` / `guest_group` tables + function + trigger + revokes; pure name/paste parsing; DB service; organizer JSON API; guest page and shell link; unit, integration and smoke tests; CLAUDE.md data notes.

**Out of scope:** seats/tables/seating/TV rendering (S-02..S-04), guest links and QR (S-05), organizer flag, editing group membership, live refresh, offline, browser E2E.

## Architecture / Approach

Postgres (constraints, unique index, `create_guest_group`, auto-dissolve trigger) ← `src/lib/guests/service.ts` (DbClient, status unions) ← thin Astro API routes under `/api/o/[key]/` (zod, Polish errors, return the full list) ← React island `GuestManager` on the SSR page `/o/[key]/goscie`. Pure rules (`src/lib/guests/names.ts`) are shared by service, API and UI.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema, types, parsing | Migration, DB types, `parseGuestList` + unit tests, anon denial tests | Privileges: Supabase default grants on new tables/functions |
| 2. Services | `getGuestList`, `addGuests`, `updateGuest`, `deleteGuest`, `createGroup`, `dissolveGroup` + integration tests | Trigger re-entry, tests touching real data |
| 3. API + smoke | Organizer-only JSON routes, smoke on the production preview | Status/HTTP mapping drift |
| 4. Page + shell link | Phone UI island, card with counts, docs | Usability on a small screen (manual check) |

**Prerequisites:** F-01 done; local Supabase running (db/rest/kong); empty event table for smoke.
**Estimated effort:** ~1 overnight session, 4 phases.

## Open Risks & Assumptions

- Absent members of a group: S-04 must handle a group with 0–1 present members (documented, not solved here).
- Organizer identity among guests is deferred to S-03.

## Success Criteria (Summary)

- Pasting 40 lines creates 40 guests; each can be renamed or deleted; absences toggle.
- No path (UI, API, DB) can produce a group outside 2–5 members or a guest in two groups.
- Without the organizer key nothing about guests is visible (TV key and anonymous REST included).
