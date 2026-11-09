# Platform panel: restaurants and owner invitations — Plan Brief

> Full plan: `context/changes/platform-restaurants/plan.md`

## What & Why

Step 1 of the PRD v2 flow: the platform administrator creates a restaurant and hands its owner a one-time invitation link; sees all restaurants with counters; switches a restaurant off and on; gives an owner a fresh link when they lost access (guardrail „Utrata hasła nie blokuje lokalu”). The owner, after accepting, sees an (empty) restaurant panel. FR-021 (without the support access, which is S-13), US-05.

## Starting Point

F-02 gave restaurants and many events; F-03 gave staff accounts, one-time links, sessions and the central membership guard (`src/lib/panel-api.ts`). Nothing in the app creates restaurants yet (scripts insert them), `/panel` only lists the person's restaurants, and the platform admin flag opens nothing.

## Desired End State

`/panel/platforma` (admin only) creates a restaurant with its owner in one step and shows the owner's one-time link with a copy button; lists every restaurant (the default one too) with „Wydarzenia: N · Zespół: N”, status and owners; „Nowy link”, „Dodaj właściciela”, „Wyłącz/Włącz”. `/panel/restauracje/<id>` is the owner's empty restaurant panel. A disabled restaurant opens nothing to its staff (identical 404, `/panel` explains why); its event links keep working.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Create = restaurant + owner | one DB function `create_restaurant_with_owner` (atomic), link issued afterwards in TS | No restaurant without an owner; hashing stays in one TS place, a failed link is recovered by „Nowy link”. |
| Owner e-mail already has a password | no link; the restaurant appears after their login | Never reset a working password just to add a restaurant. |
| Owner's lost access | „Nowy link”: invite when no password yet, else a 24 h reset link; owners of that restaurant only | Covers both expired invitations and lost passwords without manual DB edits. |
| Disabled restaurant | `restaurant.disabled_at`; `findRestaurantMembership` returns null → every guard denies with the identical 404; `/panel` lists it with „Wyłączona” + PL/EN note | One choke point; members learn why, nobody else learns anything. |
| Disabled restaurant's event links | keep working | An evening in progress is never cut by a click; v1 key paths untouched (logged; cutting links later = one embed). |
| Admin-only routes | `panelPlatformApi`: other staff get the identical 404 of an unknown id; anonymous the panel's identical 401 | Same denial model as F-03 (NFR-012); no session = login, as the PRD says. |
| Admin data access | counters and owners only | Support access comes with its access log (S-13). |
| UI | React island with JSON API (whole list in every answer), `StaffLinkCard` reusable by S-12 | One-time secrets must be shown once after the action; matches existing island patterns. |
| Demo | fixed local admin `admin@demo.stolik` / `demo-admin-1` next to the demo owner | Morning walk admin → restaurant → owner invitation. |

## Scope

**In scope:** migration (flag + 3 functions), platform/restaurant services, `panelPlatformApi`, 4 admin API routes, `/panel/platforma` island, `/panel/restauracje/<id>`, `/panel` hub links, smoke section 26, demo admin, CLAUDE.md/README.

**Out of scope:** admin data access + log (S-13), events in the restaurant panel (S-11), team invitations/roles (S-12), rename/delete restaurant, remove owner, cutting event links on disable.

## Architecture / Approach

Admin page → island → `/api/panel/platform/restaurants…` (middleware: session + Origin) → `panelPlatformApi` → `src/lib/platform/service.ts` → DB functions / `issueStaffToken`. Staff guards unchanged; the disabled check sits in `findRestaurantMembership`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema, services and rules | column, functions, types, services, disabled check, tests | plpgsql OUT-column name clashes |
| 2. Guard, routes and pages | admin API, platform island, restaurant panel, hub | identical denial bodies |
| 3. Smoke and demo | section 26 (access, Origin, flow, disable), demo admin | smoke ordering after section 25's sessions |
| 4. Docs | CLAUDE.md, README | — |

**Prerequisites:** F-03 done; local Supabase running.
**Estimated effort:** one overnight slice, 4 phases.

## Open Risks & Assumptions

- „Identical denial” for admin routes is read as: every non-admin staff member gets the 404 of an unknown id; anonymous callers get the panel-wide 401/redirect (never data).
- Several owners per restaurant are allowed (needed to give the default restaurant an owner; removing owners is later).

## Success Criteria (Summary)

- Admin creates a restaurant, the owner accepts the link and sees the restaurant panel — no CLI, no DB edits.
- A lost password or expired invitation is fixed with „Nowy link”.
- Disabled restaurant: staff locked out with an explanation; other restaurants' staff and owners never see anything of another restaurant.
