# Restaurant team — invitations, roles, removal and password-reset links (S-12 restaurant-team) Implementation Plan

## Overview

The restaurant manages its own team in the restaurant panel. The owner invites managers and waiters, a manager invites waiters, each with a one-time, expiring link the inviter hands over (the app sends no e-mail, NFR-020). In their own scope they change roles, remove people and generate a one-time link to set a new password (US-05 AC: a lost password never locks the restaurant out). A manager never manages managers or owners. A removed person loses access to that restaurant on their next request while their other restaurants stay. The restaurant never ends up without an owner. PRD v2 FR-023 (without the per-event waiter, S-21), US-05, the Access Control table (owner / manager / waiter rows).

## Current State Analysis

- Accounts and memberships exist since F-03 (`supabase/migrations/20261109140000_staff_accounts.sql`): `staff_account` (password null until set from a link, `is_platform_admin`), `restaurant_member` (PK `(restaurant_id, account_id)`, role `owner | manager | waiter`), `staff_session` (per ACCOUNT, not per restaurant), `staff_token` (`invite | reset`, hashed, single use; `issue_staff_token` deletes the account's other unused links). Service: `createStaffAccount`, `addRestaurantMember`, `issueStaffToken(db, accountId, kind, createdBy)` (`src/lib/auth/service.ts`).
- Every panel guard re-reads the membership per request (`findRestaurantMembership`, `src/lib/auth/service.ts:350`; `panelRestaurantApi` / `findPanelRestaurant` / `findPanelEvent` in `src/lib/panel-api.ts`), so deleting a `restaurant_member` row closes that restaurant to the person on their next request, with no session change.
- S-10 (`supabase/migrations/20261109160000_platform_restaurants.sql`, `src/lib/platform/service.ts`): `add_restaurant_owner` (account created without a password when new, membership upserted), `ownerResult` (invitation only while the account has no password), `issueOwnerLink` (invite while no password, else reset; owners only; platform admin route). `StaffLinkCard` (`src/components/platform/StaffLinkCard.tsx`) shows a one-time link once with copy and expiry; `parseOwnerInput` / `ownerInputProblem` (`src/lib/platform/rules.ts`, `messages.ts`) validate an e-mail + optional name.
- S-11: `EVENT_STAFF_ROLES = owner, manager` and `EVENT_DELETE_ROLES = owner` (`src/lib/events/rules.ts`) already give a manager every event right of the PRD table except the permanent delete. No restaurant settings exist yet (branding S-18, retention S-26); nothing deletes a restaurant.
- `/panel/restauracje/<id>` (`src/pages/panel/restauracje/[id].astro`) shows owners and managers a static team list from `getRestaurantOverview` (`src/lib/restaurants/service.ts`, no ids) with `teamComingSoon`; waiters see the restaurant name, their role and the note „Dzisiejsze wydarzenia dla kelnerów…” (`te.waiterNote`).
- Smoke (`scripts/smoke.mjs`): section 25 creates owner A, waiter A, owner B, a platform admin; section 26 pins A's `memberCount === 2` and makes owner A also an owner of B; section 27 adds manager A (DB insert) and ends with `finish()`. Sessions available after 27: `sessionOwner` (owner A + owner B), `sessionManager` (manager A), `sessionWaiter` (waiter A), `sessionB` (owner B only), `sessionAdmin` (no restaurant); helpers `staffCall`, `noAccessJson`, `isNoAccessPage`, `redeem`, `logIn`, `me`, `meNoCookie`, `authHeaders`, `staffEmail`.
- Demo (`scripts/demo.mjs`): the demo restaurant's owner redeems an invitation over HTTP (`ownerCookie`) and creates events through the panel API; the summary prints the owner's and the admin's logins.

## Desired End State

- Migration `supabase/migrations/20261110140000_restaurant_team.sql` (additive: four functions, no table or column change) puts the role matrix, the last-owner rule and the "link only for an account of this restaurant alone" rule in the database, each under a lock on the restaurant row.
- `/panel/restauracje/<id>` for owners and managers: section „Zespół” (island `TeamManager`): the members (name, e-mail, role, „czeka na ustawienie hasła”, „Ty”), „Zaproś do zespołu” (e-mail, optional name, role limited to what the person may give), and per member the actions the person may take: role select (owners only), „Usuń z zespołu”, „Nowy link”; every link is shown once in `StaffLinkCard`. Waiters keep today's page (name, role, the note): that is their panel until S-21.
- API (owners and managers through `panelRestaurantApi(…, TEAM_ROLES)`; every answer `TeamAnswerDto { team }` with the whole team, `team: null` when the person no longer manages it):
  - `GET /api/panel/restaurants/<id>/team` → `{ team }`
  - `POST /api/panel/restaurants/<id>/team { email, name?, role }` (strict) → 201 `{ team, invited }` (`invited.link` = a 7-day invitation, or null with a note when the e-mail already has an account)
  - `PATCH /api/panel/restaurants/<id>/team/<accountId> { role }` (strict) → `{ team }`
  - `DELETE /api/panel/restaurants/<id>/team/<accountId>` → `{ team }`
  - `POST /api/panel/restaurants/<id>/team/<accountId>/link` → `{ team, link }` (invitation while the account has no password, else a 24-hour reset link; the account's earlier unused link dies)
  - A waiter, another restaurant's staff, the platform admin without membership, an unknown / malformed / foreign account id, a member outside the person's scope and a role the person may not give → the identical 404 of an unknown id; removing or demoting the last owner → 409 with a message; inviting a member → 409; a link for an account that also belongs to another restaurant or is a platform admin → 409 with a message; no session → the panel's 401; a mutation without the page's Origin → 403.
- Smoke section 28 proves the role matrix, cross-restaurant denials, Origin, the last-owner rule, the reset link and that a removed member's session is refused for that restaurant only. `npm run demo` gives the demo restaurant a manager and a waiter with printed local logins. CLAUDE.md and README describe the team.

### Key Discoveries:

- `src/lib/auth/service.ts:350` `findRestaurantMembership` is the one place every guard asks; removal needs no session handling for access to end at once (sessions are per account, `staff_session` has no restaurant column) — deleting sessions would log the person out of their OTHER restaurants.
- `supabase/migrations/20261109140000_staff_accounts.sql` `issue_staff_token` deletes ALL the account's unused links and is callable from another plpgsql function (S-10's `create_restaurant_with_owner` calls `add_restaurant_owner` the same way).
- `src/lib/platform/service.ts:62` `ownerResult` — the "link only while there is no password" pattern to repeat for invitations.
- `scripts/smoke.mjs:4615` section 26 pins A's member count; every account of this slice is created in a new section 28 after section 27 (no rewiring of earlier sections).

## What We're NOT Doing

- The per-event waiter („kelner na imprezę”: name + one-time link or code, no password) and the waiter's day view — S-21. The model stays open: S-21 adds its own table (F-03 decision) and lists those people separately; `restaurant_member` and the team routes stay for accounts.
- Restaurant settings and deleting a restaurant (no such feature exists; S-18/S-26 must gate their settings with the owner role only).
- Editing a member's display name or e-mail, transferring ownership as one action (promote + demote covers it), a team audit log, pagination (team ≤ PostgREST `max_rows` 1000).
- Links for staff who also belong to another restaurant or are platform admins (refused with a message; their way back is S-13's support access or the admin's owner link) — see the security decision below.
- Changing the platform admin's owner routes (S-10) or section 27's DB-inserted manager.

## Implementation Approach

The rules live in two mirrored places: a pure TS table (`src/lib/team/rules.ts`) drives the UI and the route pre-checks, and four DB functions re-check the same matrix under `select … from restaurant where id = … for update` together with the last-owner count, so two owners demoting each other at once cannot leave the restaurant without one (the roadmap Risk: every action checked server-side). Integration tests compare the DB's answers with the TS table for every actor × target combination. Thin routes behind `panelRestaurantApi` map the functions' errors onto the identical 404 / 409. The UI is one island on the restaurant page reusing `StaffLinkCard`; the static team list and `getRestaurantOverview` are replaced by `getTeam`.

Role matrix (decided; logged):

| Actor | Sees the team | Invites as | Acts on (role change / remove / link) | Gives the role |
| --- | --- | --- | --- | --- |
| owner | yes | manager, waiter | every member, also other owners and themself | owner, manager, waiter |
| manager | yes | waiter | waiters only | waiter (no role control in the UI) |
| waiter | no (identical 404) | — | — | — |

Owners invite only managers and waiters (PRD table: the owner manages „menedżerowie i kelnerzy”; owners are added by the platform admin, S-10); an owner promotes a member to co-owner with the role change. Self-actions follow the same matrix: an owner may demote or remove themself while another owner exists (the confirm says so); a manager cannot touch themself.

## Critical Implementation Details

- **Cross-restaurant takeover**: a link sets the ACCOUNT's password, and the account may belong to other restaurants. Whoever generates a link can open it, so a manager of A could take over a waiter of A who is an owner of B. Rule: a link (invitation or reset) is issued only when the account has no membership in any other restaurant and is not a platform admin (`ELSEWHERE` → 409 „…zgłosi się do administratora platformy”); an invitation to an e-mail that already has an account never issues a link (the person logs in, or sets the password from the link they already have). The same rule keeps `issue_staff_token` from killing another restaurant's pending invitation.
- **Removal**: delete only the `restaurant_member` row; never sessions. When the account is left with no membership and is not a platform admin, its unused links are deleted in the same transaction (a removed invitee's invitation or a just-issued reset link dies with the removal).
- **Locks**: every team function first locks the restaurant row `for update` and reads the actor's role under it (an actor removed a moment ago gets `NOT_ALLOWED` → 404). The last-owner count happens under the same lock.

## Phase 1: Schema, rules and services

### Overview

The DB functions with the role matrix and the last-owner rule, the pure team module (rules, texts, zod bodies) and the service, with unit and integration tests.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261110140000_restaurant_team.sql`

**Intent**: Four service-role-only functions (header comment in the style of S-10's: what, why, the matrix, access model unchanged, additive). Every one: `set search_path = ''`, `revoke execute … from public, anon, authenticated`, comment.

**Contract** (errors as `raise exception '<CODE>' using errcode = 'P0001'`):
- `add_restaurant_member(p_restaurant_id integer, p_actor_id bigint, p_email text, p_display_name text, p_role text)` → `table (member_account_id bigint, member_created boolean, member_has_password boolean, member_exclusive boolean)`. Lock the restaurant (`RESTAURANT_NOT_FOUND`); the actor's role under the lock; `p_role` must be an invite role of the actor (owner → manager, waiter; manager → waiter; else `NOT_ALLOWED`); find or create the account (no password; the name only for a new account); an existing membership → `ALREADY_MEMBER`; insert the membership; `member_exclusive` = not a platform admin and no membership in another restaurant.
- `set_restaurant_member_role(p_restaurant_id integer, p_actor_id bigint, p_account_id bigint, p_role text)` → `void`. Lock; actor role; target role (`MEMBER_NOT_FOUND`); the actor must manage the target's current role AND the new role (owner → any; manager → waiter; else `NOT_ALLOWED`); same role → no-op; an owner losing the role while they are the only owner → `LAST_OWNER`.
- `remove_restaurant_member(p_restaurant_id integer, p_actor_id bigint, p_account_id bigint)` → `void`. Lock; scope as above (`NOT_ALLOWED`, `MEMBER_NOT_FOUND`); the only owner → `LAST_OWNER`; delete the membership; when the account has no membership left and is not a platform admin, delete its unused `staff_token` rows.
- `issue_member_link(p_restaurant_id integer, p_actor_id bigint, p_account_id bigint, p_token_hash text, p_invite_expires_at timestamptz, p_reset_expires_at timestamptz)` → `table (link_kind text, link_expires_at timestamptz)`. Lock; scope (`NOT_ALLOWED`, `MEMBER_NOT_FOUND`); not exclusive → `ELSEWHERE`; kind `invite` while the account has no password, else `reset`; `perform public.issue_staff_token(p_account_id, kind, p_token_hash, <matching expiry>, p_actor_id)`.

#### 2. DB types

**File**: `src/db/database.types.ts`

**Intent**: The four functions under `Functions` (Args / Returns as above; bigint → number).

#### 3. Pure team module

**Files**: `src/lib/team/rules.ts`, `src/lib/team/messages.ts`, `src/lib/team/api.ts`, `src/lib/team/index.ts`

**Intent**: Everything routes and islands share, no DB / node:crypto / `astro:*`.

**Contract**:
- `rules.ts`: `TEAM_ROLES: readonly StaffRole[] = ["owner", "manager"]`; `MANAGED_ROLES: Record<StaffRole, readonly StaffRole[]>` (owner → owner, manager, waiter; manager → waiter; waiter → none); `INVITE_ROLES` (owner → manager, waiter; manager → waiter; waiter → none); `canManageTeam(role)`, `canManageMember(actor, target)`, `assignableRoles(actor)`, `inviteRoles(actor)`, `ownerCount(members)`, `isLastOwner(members, accountId)`, `sortTeam(members)` (owner, manager, waiter, then e-mail in Polish order). Invite input reuses `parseOwnerInput` (e-mail + optional name ≤ 80) from `@/lib/platform/rules`.
- `messages.ts`: `teamMessages` (`defineMessages`, PL + EN): section heading and intro (who may do what, the app sends no e-mail), manager scope note, invite form (heading, e-mail / name / role labels, hint, button), role option labels reuse `authMessages().roleLabels`, list heading with count, „Ty”, account active / pending, per-row aria labels (role select, remove, new link for <e-mail>), confirms (remove; remove yourself — you lose access to this restaurant; promote to owner — full control incl. deleting events and the team; demote yourself; new link — earlier unused link dies, a reset link ends their sessions once used), notices (invited, role changed, removed, already has an account → sees the restaurant after logging in), API messages `lastOwner`, `alreadyMember`, `elsewhere`, the "you no longer manage this team" text with the way back to `/panel`, the last-owner hint shown on the row.
- `api.ts`: `InviteMemberBody = { email: TEXT, name?: TEXT | null, role: "owner" | "manager" | "waiter" }` strict; `UpdateMemberBody = { role }` strict (an unknown role or field → 400; a known role outside the person's scope is decided by the DB → 404).
- `index.ts` re-exports server-side (with the service); islands import the pure modules directly.

#### 4. Service and DTOs

**Files**: `src/lib/team/service.ts`, `src/types.ts`

**Intent**: The DB side of the team, every call scoped by the restaurant id the guard opened and the actor's account id; it will replace `getRestaurantOverview` (the page reads the team with ids from Phase 2 on).

**Contract**:
- `src/types.ts`: `TeamMemberDto { accountId, email, displayName, role, hasPassword }`, `TeamDto { restaurantId, you: { accountId, role }, members }`, `TeamInviteResultDto { accountId, email, role, created, hasPassword, link: StaffLinkDto | null }`, `TeamAnswerDto { team: TeamDto | null; invited?: TeamInviteResultDto; link?: StaffLinkDto }`.
- `service.ts`: `getTeam(db, restaurantId, you)` → `TeamDto` (one query, `sortTeam`, no hashes); `teamFor(db, restaurantId, accountId)` → `TeamDto | null` (re-reads the person's own membership after a change: null when they are gone or no longer an owner/manager); `inviteMember(db, restaurantId, actorId, { email, displayName, role })` → `{ status: "invited", member } | { status: "not-found" } | { status: "already-member" }` (invitation via `issueStaffToken` only when `!member_has_password && member_exclusive`); `setMemberRole(…)` → `"updated" | "not-found" | "last-owner"`; `removeMember(…)` → `"removed" | "not-found" | "last-owner"`; `issueMemberLink(…)` → `{ status: "issued", link } | { status: "not-found" } | { status: "elsewhere" }` (token from `generateSecretToken`, expiries from `tokenTtlMs`). `RESTAURANT_NOT_FOUND`, `NOT_ALLOWED`, `MEMBER_NOT_FOUND` → `not-found`; other errors throw.
- `getRestaurantOverview` stays until Phase 2 rewrites the page (plan review F1: deleting it here would break `astro check`).

#### 5. Tests

**Files**: `src/lib/team/team.test.ts`, `tests/integration/restaurant-team.test.ts`, `tests/integration/platform-restaurants.test.ts`

**Intent**: Unit: the matrix tables and helpers (every actor × target), `isLastOwner`, `sortTeam`. Integration (own restaurants via `createRestaurantWithOwner`, own accounts, all deleted after): `getTeam` order and ids; invite new → invitation link that redeems; invite an existing account with a password → no link; an account with a pending invitation from another restaurant → no link and its other invitation still valid; a member → `already-member`; manager inviting a manager / owner, waiter inviting, a non-member actor → `not-found`; role changes per the matrix (manager on waiter → waiter only); last owner demote/remove → `last-owner`, allowed with two owners incl. self; removal keeps the account's other membership and its sessions (`getSession` still valid) while `findRestaurantMembership` is null; removing the last membership deletes unused links (invitation page info gone); links: invite vs reset kind, `elsewhere` for a member of two restaurants and for a platform admin, a used reset link ends the target's sessions; a parity loop over actor role × target role × {role change, remove, link} comparing the DB with `canManageMember`; two owners removing each other in parallel (`Promise.all`) → exactly one `removed`, one owner left. `platform-restaurants.test.ts` reads the team through `getTeam` instead of `getRestaurantOverview`.

### Success Criteria:

#### Automated Verification:

- Migration applies from scratch: `npx supabase db reset`
- Migration applies on the populated local DB, every existing row unchanged: `npx supabase migration up` (counts before/after)
- Unit and integration tests pass: `AI_PROVIDER=mock npm test`
- Lint and type check pass: `npm run lint`, `npx astro check`

#### Manual Verification:

- The four functions refuse `anon`/`authenticated` (checked over SQL: `has_function_privilege`)

**Implementation Note**: unattended run — manual rows are verified by the agent where possible (HTTP / SQL) and otherwise left for the user in the closing checklist.

---

## Phase 2: Routes, page and island

### Overview

The team API behind the central guard and the „Zespół” section on the restaurant page.

### Changes Required:

#### 1. API routes

**Files**: `src/pages/api/panel/restaurants/[id]/team/index.ts` (GET, POST), `src/pages/api/panel/restaurants/[id]/team/[accountId].ts` (PATCH, DELETE), `src/pages/api/panel/restaurants/[id]/team/[accountId]/link.ts` (POST)

**Intent**: Thin routes: `panelRestaurantApi(locals, params.id, TEAM_ROLES)` → `parseId(params.accountId)` (null → `denied`) → `readJsonBody` → rules (400 with the PL/EN message) → service → `teamFor` → `TeamAnswerDto`. `not-found` → `denied(locals)`; `last-owner`, `already-member`, `elsewhere` → 409 with the message. `export const prerender = false`; header comments name the matrix.

**Contract**: as in Desired End State. POST invite → 201.

#### 2. Hook and island

**Files**: `src/components/hooks/useTeam.ts`, `src/components/team/TeamManager.tsx`, `src/components/team/TeamInviteForm.tsx`, `src/components/team/TeamMemberRow.tsx`

**Intent**: Hook (like `usePlatformRestaurants`): one action at a time, every answer replaces the team; a 404 re-reads `GET …/team` (still 404 → `lost` state with the way back to `/panel`); `team: null` in an answer → `window.location.assign("/panel")`; failures via `api-failure.ts`. Island: intro (+ manager scope note), invite form (role select from `inviteRoles(you.role)`, client-side `parseOwnerInput`), the result (`StaffLinkCard`, or the "already has an account" note), the list; each row shows its controls only when `canManageMember(you.role, member.role)`: role select (owners; options `assignableRoles`; the last owner's row disables the non-owner options with the hint), „Usuń z zespołu” (disabled for the last owner), „Nowy link” (not on your own row) → `StaffLinkCard` under the row. Every action with `window.confirm` (texts above).

#### 3. Restaurant page

**Files**: `src/pages/panel/restauracje/[id].astro`, `src/lib/restaurants/messages.ts`, `src/lib/restaurants/service.ts` (deleted), `src/lib/restaurants/index.ts`, `src/types.ts`

**Intent**: For owners and managers render `<TeamManager client:load restaurantId initial={getTeam(…)} origin={Astro.url.origin} locale />` in place of the static list (`data-team-section`); waiters unchanged. Drop `teamHeading`, `teamComingSoon`, `accountPending` from the restaurant texts and the `getRestaurantOverview` call; delete `src/lib/restaurants/service.ts` (no caller left: the page and the platform test read `getTeam`), its export and `RestaurantTeamMemberDto`.

### Success Criteria:

#### Automated Verification:

- Tests, lint, type check and build pass: `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check`, `npm run build`
- The existing smoke passes on `AI_PROVIDER=mock npm run preview`: `npm run smoke`

#### Manual Verification:

- Browser: owner invites a manager → link card → the link in a private window sets the password → the manager sees the restaurant; the manager invites a waiter; role change, remove and „Nowy link” with their confirms; PL/EN

---

## Phase 3: Smoke and demo

### Overview

HTTP proof of the team's access matrix and a demo restaurant with a manager and a waiter.

### Changes Required:

#### 1. Smoke section 28

**File**: `scripts/smoke.mjs`

**Intent**: New section 28 „Restaurant team (restaurant-team, S-12)” after 27 (move `finish()` to its end), with accounts of this run created ONLY through the team API (never the earlier sections' accounts changed, except reading them):
- owner A: `GET …/team` (no-store, members owner A, manager A, waiter A with ids, `you.role` owner, no hashes / tokens); manager A reads it with `you.role` manager; the restaurant page shows the team section with the e-mails to owner and manager, the waiter's page has neither
- invitations: owner A invites a manager and a waiter (201, 7-day `/haslo/<token>` invitations that open and redeem → sessions; `/api/panel/restaurants/A` gives them their roles); manager A invites a waiter (201); manager A inviting a manager or an owner → the identical 404, team unchanged; validation (bad e-mail, 81-character name, unknown role, extra field) → 400; an existing member → 409 with the message
- role changes by owner A: waiter → manager → waiter; manager → owner (two owners) → back to manager; the promoted owner demotes themself while owner A is an owner → 200 with their team as manager
- last owner: owner A demoting or removing themself while the only owner → 409 with the message, still owner
- manager scope: manager A on the new manager, on owner A, on themself (role, remove, link) → the identical 404; manager A on a waiter: reset link (kind `reset`, 24 h) and remove → 200
- removed member: a waiter of this section, also invited into B by owner B (existing account → no link, `hasPassword`), is removed from A by owner A → their session: A's API → the identical 404, A's page → the no-access page, B's API 200, `/panel` lists B not A, `/api/panel/me` 200; links: owner A's link for them while they are in B too → 409 `elsewhere`; owner A's link for owner A (also in B) → 409
- a removed pending invitee: invited, removed before redeeming → their invitation page is the invalid-link page
- reset link: owner A's link for the section's manager → `reset`; redeeming it sets the new password and their old session gets 401
- outsiders: waiter A, owner B, the admin → every team route of A (GET, invite, role, remove, link) the identical 404 body of an unknown restaurant id; owner B on `/restaurants/B/team/<A's member id>` → the identical 404; unknown / malformed / huge account ids → 404; nothing changed (team re-read equal)
- no session → the identical 401 of `/api/panel/me`; mutations without the page's Origin or with a foreign one → 403, nothing changed

#### 2. Demo

**File**: `scripts/demo.mjs`

**Intent**: After the events step, the owner (`ownerCookie`) invites `menedzer-<restaurant id>@demo.stolik` (manager, „Menedżer demo”) and `kelner-<restaurant id>@demo.stolik` (waiter, „Kelner demo”) through `POST …/team`, both redeem their invitations over HTTP with fixed local passwords (`demo-menedzer-1`, `demo-kelner-1`); the script checks the team has three members and prints both logins with their roles in the summary.

### Success Criteria:

#### Automated Verification:

- `npm run build`, then on `AI_PROVIDER=mock npm run preview`: `npm run smoke` passes twice in a row on the same DB
- `npm run demo` passes and prints the manager's and the waiter's logins
- `AI_PROVIDER=mock npm test`, `npm run lint`, `npx astro check` pass

#### Manual Verification:

- Log in as the demo manager: events and team visible, only waiters actionable; as the demo waiter: the restaurant page with the note only

---

## Phase 4: Documentation

### Overview

CLAUDE.md and README describe the team; the overnight log has the decisions.

### Changes Required:

#### 1. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: A „Restaurant team (restaurant-team, S-12)” block (the matrix, the four DB functions, the link rule, removal semantics, routes, UI, S-21's per-event waiter goes into its own table, restaurant settings must be owner-only); the panel guard paragraph lists the team routes; S-10 texts „team management comes with S-12” and `getRestaurantOverview` replaced; smoke and demo command lines; deploy note (the code calls the new functions: migration before the code).

#### 2. README

**File**: `README.md`

**Intent**: The restaurant panel section: inviting the team, roles, removing, „Nowy link” for a forgotten password.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check` pass; only docs touched in this phase

#### Manual Verification:

- CLAUDE.md read-through: the matrix, routes and the link rule are findable

---

## Testing Strategy

### Unit Tests:

- The role matrix (`MANAGED_ROLES`, `INVITE_ROLES`, `canManageMember`, `assignableRoles`, `inviteRoles`), `isLastOwner`, `sortTeam`.

### Integration Tests:

- `tests/integration/restaurant-team.test.ts`: invite / role / remove / link per the matrix with DB ↔ TS parity, last owner incl. the parallel race, removal semantics (other memberships and sessions kept, links of a membership-less account deleted), the cross-restaurant link refusal.

### Manual Testing Steps:

1. Demo owner invites a manager; open the link in a private window, set the password, see the restaurant.
2. The manager invites a waiter; tries to act on the owner (no controls); removes the waiter; the waiter's open page shows no access on reload.
3. The owner tries to demote themself as the only owner (message), promotes the manager to owner, then demotes themself.

## Performance Considerations

Team reads are one query per page or answer; each mutation is one DB function call plus one team re-read. The row lock on `restaurant` serializes team changes of one restaurant only.

## Migration Notes

Additive (functions only); the new code calls them, so the migration goes to the platform DB before the code (`db push` before `deploy:aws`, the user's step), never to the old dinner project. Code from before keeps working on the migrated DB.

## References

- Roadmap: `context/foundation/roadmap.md` (### S-12)
- PRD: `context/foundation/prd-v2.md` (FR-023, US-05, Access Control Changes)
- Similar implementation: `src/lib/platform/service.ts` (`ownerResult`, `issueOwnerLink`), `supabase/migrations/20261109160000_platform_restaurants.sql`, `context/archive/2026-11-10-restaurant-events/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, rules and services

#### Automated

- [x] 1.1 Migration applies from scratch: `npx supabase db reset` — 3ee7e0d
- [x] 1.2 Migration applies on the populated local DB, every existing row unchanged — 3ee7e0d
- [x] 1.3 Unit and integration tests pass: `AI_PROVIDER=mock npm test` — 3ee7e0d
- [x] 1.4 Lint and type check pass: `npm run lint`, `npx astro check` — 3ee7e0d

#### Manual

- [x] 1.5 The four functions refuse `anon`/`authenticated` — 3ee7e0d

### Phase 2: Routes, page and island

#### Automated

- [x] 2.1 Tests, lint, type check and build pass — eb2cffd
- [x] 2.2 The existing smoke passes on the preview — eb2cffd

#### Manual

- [ ] 2.3 Browser: invite → link → password → restaurant; manager invites a waiter; role change, remove, „Nowy link”; PL/EN

### Phase 3: Smoke and demo

#### Automated

- [ ] 3.1 `npm run smoke` passes twice in a row on the preview
- [ ] 3.2 `npm run demo` passes and prints the manager's and the waiter's logins
- [ ] 3.3 Tests, lint and type check pass

#### Manual

- [ ] 3.4 Demo manager and demo waiter logins show their scopes

### Phase 4: Documentation

#### Automated

- [ ] 4.1 Lint and type check pass; only docs touched

#### Manual

- [ ] 4.2 CLAUDE.md read-through: matrix, routes and the link rule are findable
