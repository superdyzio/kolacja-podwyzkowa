# Guest list, groups and absences Implementation Plan

## Overview

Roadmap S-01 (`guest-list-and-groups`, PRD US-01, FR-001, FR-002, FR-003). The organizer (at `/o/<key>`) gets a "Goście i grupy" page where they paste a guest list (one person per line), add, rename and delete single guests by display name, create and dissolve inseparable groups of 2–5 guests (pair by default; a guest belongs to at most one group), and mark guests absent/present. Guests, groups and absence are stored durably in Postgres and are the input for seating (S-03/S-04) and guest links (S-05).

## Current State Analysis

- F-01 is done: singleton `public.event` (id = 1) with `organizer_key`/`tv_key` (`supabase/migrations/20261026232057_create_event.sql`); `src/middleware.ts` guards `/o|tv|g/` and `/api/o|tv|g/` and puts the access in `locals.access`; pages/APIs re-check with `accessFor(locals, role)` (`src/lib/access/resolve.ts:89-99`).
- The organizer shell `src/pages/o/[key].astro` shows the links and placeholder cards ("Goście i grupy" marked "Wkrótce", lines 20-27).
- DB access: `getDb()` (`src/lib/db.ts`, the only `astro:env` reader) and `createServiceClient` / `DbClient` (`src/lib/supabase-client.ts`). Services take a `DbClient` and never import `astro:*` (pattern: `src/lib/event.ts`, status-union results, Supabase errors throw).
- `src/db/database.types.ts` is hand-written; `Functions` is empty.
- Tests: Vitest, unit next to code, DB integration in `tests/integration/*.test.ts` gated by `hasLocalDb` (`tests/integration/helpers.ts`); the event-acquire/release pattern lives inline in `tests/integration/access.test.ts:15-31`.
- HTTP behaviour is checked by `scripts/smoke.mjs` (dependency-free) against the production preview on a DB without an event.
- No zod in `package.json`, but Astro ships zod 4 as `astro/zod` (verified: `import("astro/zod")` resolves).
- No input/textarea UI components yet (`src/components/ui/button.tsx` only).
- Local DB: ICU collation (`datlocprovider = i`, `en_US.UTF-8`); `lower('ŁUKASZ Żaneta')` → `łukasz żaneta`, so a `lower()` unique index folds Polish letters correctly. Supabase default privileges grant `EXECUTE` on new functions (and all on tables) to `anon`/`authenticated` — every new table and function needs an explicit revoke.

## Desired End State

- `/o/<organizerKey>/goscie`: Polish, phone-friendly page. Single-guest input and a paste box ("jedna osoba na linię"); alphabetical guest list with rename, delete (confirm), absent/present toggle and a group badge; selecting 2–5 ungrouped guests enables "Utwórz parę" / "Utwórz grupę (N)"; a groups list with "Rozwiąż". Summary line: guests, present, groups.
- The organizer shell card "Goście i grupy" links to that page and shows counts.
- JSON API under `/api/o/<organizerKey>/`: `GET/POST guests`, `PATCH/DELETE guests/<id>`, `POST groups`, `DELETE groups/<id>`; every mutation returns the full refreshed list. TV key, unknown keys → the existing 404 `{"error":"Brak dostępu"}`.
- DB guarantees: display names unique per event (case-insensitive), 1–40 characters, normalized; a guest is in at most one group; a group is created only with 2–5 existing ungrouped guests, atomically; a group that drops below 2 members is dissolved automatically; anon/authenticated cannot read the tables or call the function.

Verify: `npm test` (unit + integration on the local DB), `npm run lint`, `npx astro check`, `npm run build` green; `npm run smoke` passes against `npm run preview` on a DB without an event.

### Key Discoveries:

- `src/lib/access/paths.ts:20` — `^/(api/)?(o|tv|g)/([^/]+)(?:/.*)?$` already covers `/o/<key>/goscie` and `/api/o/<key>/guests/<id>`; no middleware change needed.
- `src/pages/o/[key].astro` + a new `src/pages/o/[key]/goscie.astro` coexist in Astro routing (file `[key].astro` serves `/o/<key>`, folder `[key]/` serves sub-paths).
- `tests/integration/access.test.ts:15-31` + `helpers.ts:releaseEvent` — event reuse/cleanup pattern to extract into a shared helper.
- Astro pages must not `return` from frontmatter (F-01 decision) — set `Astro.response.status = 404` and render `<NoAccess />`.
- Postgres `char_length` counts code points; JS `.length` counts UTF-16 units — count with `[...name].length` so the 40-character limit agrees on both sides.

## What We're NOT Doing

- Seats, tables, pinning, seating, publishing, TV rendering of guests (S-02..S-04). Deleting a seated guest is S-03's concern.
- Guest personal links/keys, QR cards, guest-access toggle (S-05). No `/g/` changes.
- An "organizer is this guest" flag — the organizer adds themselves as an ordinary guest; S-03 may add a marker if the organizer view needs it.
- Adding/removing members of an existing group (dissolve and recreate instead; FR-002 asks only for create and dissolve).
- Changing group membership because a member is absent (absent members stay in their group; S-04 decides how present members are seated).
- Live refresh/polling of the guest list (single organizer device), offline cache (S-09), undo.
- Browser/E2E tests (no Playwright overnight); generated Supabase types.
- More than 100 guests; full names/surnames handling beyond the display name.

## Implementation Approach

Schema first: two tables (`guest_group`, `guest`), a unique expression index on display names, one plpgsql function for atomic group creation (supabase-js has no transactions) and a trigger that dissolves groups left with fewer than 2 members. A pure module (`src/lib/guests/names.ts`) owns normalization, the paste parser, limits and Polish problem messages (unit-tested); a DB service (`src/lib/guests/service.ts`) takes a `DbClient` and returns status unions (integration-tested on the local DB). Thin Astro API routes validate with `astro/zod`, map statuses to HTTP + Polish messages and return the full list after every mutation. The page is SSR (initial list) plus one React island that replaces its state with each API response.

## Critical Implementation Details

- **Group integrity lives in the DB.** Group creation must be one `create_guest_group(p_guest_ids bigint[])` call that de-duplicates ids, checks 2–5, locks the rows (`for update`), checks all exist and are ungrouped, inserts the group and assigns members — raising distinct messages (`GROUP_SIZE`, `GUEST_NOT_FOUND`, `GUEST_ALREADY_GROUPED`) that the service maps to statuses. The auto-dissolve trigger (`after delete or update of group_id on guest`) must tolerate re-entry: dissolving a group sets members' `group_id` to null, which fires the trigger again for an already-deleted group (a no-op delete).
- **Privileges.** `revoke all on table … from anon, authenticated` for both tables and `revoke execute on function … from public, anon, authenticated` (+ `grant execute … to service_role`) for both functions; `set search_path = ''` and schema-qualified names in function bodies.
- **Name normalization must match the DB check.** Normalize before validation and before the duplicate check: NFC, drop zero-width/BOM/control characters, collapse every whitespace run (incl. tabs from a spreadsheet) to one space, trim. Duplicate keys use `toLocaleLowerCase("pl")`; the DB index (`lower(display_name)`) is the backstop — a `23505` on insert/rename maps to the duplicate status, never a 500.
- **Paste is all-or-nothing.** Any problem (line too long, duplicate inside the paste, name already on the list, list would exceed 100) saves nothing; the response lists the offending lines/names so the organizer can fix the text (the textarea keeps it).

## Phase 1: Schema, types and name parsing

### Overview

Create the guest/group schema with its integrity rules and privileges, extend the hand-written DB types, and add the pure, unit-tested name and paste parsing.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261026234000_create_guests_and_groups.sql`

**Intent**: Durable guests and inseparable groups for the singleton event, with DB-enforced invariants, invisible to browser roles.

**Contract**:
- `public.guest_group(id bigint generated always as identity primary key, event_id smallint not null default 1 references public.event(id) on delete cascade, created_at timestamptz not null default now())`.
- `public.guest(id bigint generated always as identity primary key, event_id smallint not null default 1 references public.event(id) on delete cascade, display_name text not null, is_absent boolean not null default false, group_id bigint null references public.guest_group(id) on delete set null, created_at timestamptz not null default now())` with a check: `display_name` has no leading/trailing whitespace, no whitespace runs and `char_length` 1–40.
- `create unique index guest_display_name_key on public.guest (event_id, lower(display_name))`; index on `guest(group_id)`.
- `public.create_guest_group(p_guest_ids bigint[]) returns bigint` (plpgsql, `set search_path = ''`) as described in Critical Implementation Details.
- Trigger function `public.dissolve_undersized_guest_groups()` + trigger `after delete or update of group_id on public.guest for each row`: when `old.group_id` is set (and changed/deleted), delete that group if it now has fewer than 2 members.
- RLS enabled on both tables, no policies; revokes as in Critical Implementation Details; comments on tables/function.

#### 2. DB and shared types

**Files**: `src/db/database.types.ts`, `src/types.ts`

**Intent**: Typed queries and RPC calls; DTOs shared by service, API and island.

**Contract**: `Database.public.Tables.guest` and `guest_group` (`Row`/`Insert`/`Update`, `Relationships` with the FKs or `[]` — no embedded selects are used); `Functions.create_guest_group: { Args: { p_guest_ids: number[] }; Returns: number }`. In `src/types.ts`: `GuestRow`, `GuestGroupRow`, `GuestDto { id: number; displayName: string; isAbsent: boolean; groupId: number | null }`, `GuestGroupDto { id: number; memberIds: number[] }`, `GuestListDto { guests: GuestDto[]; groups: GuestGroupDto[] }`.

#### 3. Name and paste parsing (pure)

**File**: `src/lib/guests/names.ts` (+ `names.test.ts`)

**Intent**: One place for the guest-name rules, used by service, API and UI.

**Contract**:
- Constants `MAX_GUESTS = 100`, `MAX_DISPLAY_NAME_LENGTH = 40`, `MIN_GROUP_SIZE = 2`, `MAX_GROUP_SIZE = 5`.
- `normalizeDisplayName(raw: string): string`; `displayNameKey(name: string): string` (`toLocaleLowerCase("pl")`); `displayNameLength(name): number` (code points); `validateDisplayName(name): "empty" | "too-long" | null`.
- `parseGuestList(text: string): { names: string[]; problems: GuestListProblem[] }` — split on `\r\n|\n|\r`, strip a BOM, strip a leading list marker (`-`, `*`, `•`, `–`, `1.`, `1)` followed by whitespace), normalize, skip empty lines, flag `too-long` lines and later occurrences of a duplicate (`duplicate`, by key); `GuestListProblem { line: number (1-based); text: string; reason: "too-long" | "duplicate" }`.
- `describeGuestListProblem(problem): string` — Polish, e.g. `Linia 3: „…” — za długa (najwyżej 40 znaków)`, `Linia 7: „Kasia” — powtórzona na liście`.
- `isValidGroupSize(count: number): boolean`.

#### 4. Anonymous access to the new schema

**File**: `tests/integration/guest-schema.test.ts`

**Intent**: Prove the browser roles see nothing.

**Contract**: `describe.skipIf(!hasLocalDb)`; anonymous `GET /rest/v1/guest?select=*` and `/rest/v1/guest_group?select=*` (no apikey and a garbage apikey) are denied or return `[]`; anonymous `POST /rest/v1/rpc/create_guest_group` is not 2xx.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase migration up`
- Unit + integration tests pass (integration not skipped): `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 2: Guest and group services

### Overview

The DB-backed operations for the guest list, groups and absence, integration-tested on the local DB.

### Changes Required:

#### 1. Service

**Files**: `src/lib/guests/service.ts`, `src/lib/guests/index.ts`

**Intent**: All guest/group reads and writes, taking a `DbClient`, no `astro:*`; Supabase errors throw (pattern `src/lib/event.ts`).

**Contract**:
- `getGuestList(db): Promise<GuestListDto>` — two plain queries (guests, groups); guests sorted with `Intl.Collator("pl")`; each group's `memberIds` in the same order; groups ordered by their first member.
- `addGuests(db, names: string[]): Promise<{ status: "added"; added: GuestDto[] } | { status: "duplicates"; names: string[] } | { status: "too-many"; limit: number; existing: number }>` — names already parsed; pre-checks against existing names by key and the 100 cap; inserts all in one statement; `23505` → `duplicates`.
- `updateGuest(db, id, patch: { displayName?: string; isAbsent?: boolean }): Promise<{ status: "updated"; guest: GuestDto } | { status: "not-found" } | { status: "duplicate" } | { status: "invalid"; reason: "empty" | "too-long" }>` — normalizes and validates the name; never touches `group_id`.
- `deleteGuest(db, id): Promise<{ status: "deleted" } | { status: "not-found" }>` (the trigger dissolves an undersized group).
- `createGroup(db, guestIds: number[]): Promise<{ status: "created"; groupId: number } | { status: "invalid-size" } | { status: "not-found" } | { status: "already-grouped" }>` — calls `create_guest_group`; maps its messages; other errors throw.
- `dissolveGroup(db, groupId): Promise<{ status: "dissolved" } | { status: "not-found" }>`.
- `index.ts` re-exports names + service.

#### 2. Shared test event helper

**File**: `tests/integration/helpers.ts` (and `access.test.ts` to use it)

**Intent**: One way for integration tests to reuse an existing event or create (and later release) one.

**Contract**: `acquireTestEvent(db): Promise<TestEvent>` (existing → `createdByTest: false`; none → `createEvent` → `true`); `releaseEvent` unchanged (cascade removes guests/groups of a test-created event). `access.test.ts` keeps its concurrent-creation race check.

#### 3. Integration tests

**File**: `tests/integration/guests.test.ts`

**Intent**: Prove FR-001..FR-003 and the group invariants on the real schema without touching pre-existing data.

**Contract**: names carry a random per-run suffix (≤ 40 chars); each test deletes only the guest/group ids it created (`afterEach`). Cases: 40 parsed lines → 40 guests, each renameable and deletable (US-01 AC); adding a name that exists (different case/whitespace) → `duplicates`, nothing inserted; exceeding the cap (100 − existing + 1 names) → `too-many`, nothing inserted; rename to an existing name → `duplicate`; rename to empty/too long → `invalid`; mark absent and back; unknown id → `not-found` for update/delete/dissolve; group of 2 and of 5 created; 1 and 6 → `invalid-size`; duplicated ids in the request count once; unknown guest → `not-found`; guest already grouped → `already-grouped` and no partial group left; two concurrent `createGroup` calls sharing a guest → exactly one `created`; dissolving clears all members; deleting a member of a pair dissolves the pair; deleting a member of a triple leaves a pair; `getGuestList` returns Polish alphabetical order (e.g. `Łucja` after `Lena`, before `Marek`) and `memberIds` per group.

### Success Criteria:

#### Automated Verification:

- Unit + integration tests pass (integration not skipped): `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 3: Organizer API routes and HTTP smoke

### Overview

Expose the services as organizer-only JSON routes with zod validation and Polish errors, and extend the HTTP smoke test.

### Changes Required:

#### 1. HTTP helpers (pure)

**File**: `src/lib/http.ts` (+ `http.test.ts`)

**Intent**: Uniform JSON responses and body/param parsing for API routes.

**Contract**: `jsonError(status, message, extra?)` → `Response.json({ error: message, ...extra }, { status })`; `readJsonBody(request, schema)` → `{ ok: true; data } | { ok: false; response }` (invalid JSON or schema failure → 400 `"Nieprawidłowe dane"`); `parseId(param: string | undefined): number | null` (positive safe integer).

#### 2. Routes

**Files**: `src/pages/api/o/[key]/guests.ts`, `src/pages/api/o/[key]/guests/[id].ts`, `src/pages/api/o/[key]/groups.ts`, `src/pages/api/o/[key]/groups/[id].ts`

**Intent**: Thin organizer-only adapters: `export const prerender = false`; `accessFor(context.locals, "organizer")` else 404 `Brak dostępu`; `getDb()` null → 503; validate with `import { z } from "astro/zod"`; call the service; respond with the full `GuestListDto` after every mutation.

**Contract**:
- `GET guests` → 200 `GuestListDto`.
- `POST guests` body `{ text: string }` (≤ 20 000 chars) → `parseGuestList`; no names → 400 `"Wpisz co najmniej jedno imię."`; problems → 400 `{ error, problems: string[] }` (Polish lines); `duplicates` → 409 `{ error: "Ci goście już są na liście: …", names }`; `too-many` → 400 `"Lista może mieć najwyżej 100 gości."`; added → 201 `{ added: number, ...GuestListDto }`.
- `PATCH guests/<id>` body `{ displayName?: string; isAbsent?: boolean }` (at least one; unknown keys rejected, so `groupId` cannot be set) → 200 list; `not-found` → 404 `"Nie znaleziono gościa."`; `duplicate` → 409; `invalid` → 400.
- `DELETE guests/<id>` → 200 list | 404.
- `POST groups` body `{ guestIds: number[] }` → 201 list; `invalid-size` → 400 `"Grupa musi mieć od 2 do 5 osób."`; `not-found` → 404; `already-grouped` → 409 `"Ktoś z zaznaczonych jest już w grupie."`.
- `DELETE groups/<id>` → 200 list | 404 `"Nie znaleziono grupy."`.
- Malformed `<id>` → 404 like an unknown id.

#### 3. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: HTTP-level proof of the organizer-only API on the production preview.

**Contract**: the request helper accepts a method, JSON body and `Content-Type`; new checks after the TV checks: `GET /api/o/<org>/guests` 200 empty list with `no-store`; `POST` 3 names → 201 with 3 guests; same paste again → 409; blank text → 400; invalid JSON → 400; group of 2 → 201; `PATCH` absent → 200 with `isAbsent: true`; `PATCH` unknown id → 404 `Nie znaleziono gościa.`; `DELETE` a pair member → 200 and no groups; TV key on `GET`/`POST /api/o/<tv>/guests` → 404 `Brak dostępu`; the TV page body contains none of the guest names.

### Success Criteria:

#### Automated Verification:

- Unit tests pass (incl. `http.test.ts`): `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- HTTP smoke passes against the production preview on a DB without an event: `npm run preview` + `npm run smoke` (server stopped afterwards; smoke data removed with `delete from public.event`)

---

## Phase 4: Guest management page and organizer shell link

### Overview

The phone-friendly organizer page with a React island, the link from the organizer shell and the docs for later slices.

### Changes Required:

#### 1. UI primitives

**Files**: `src/components/ui/input.tsx`, `src/components/ui/textarea.tsx`

**Intent**: shadcn new-york `input` and `textarea` (`npx shadcn@latest add input textarea`, or the same source by hand if the CLI is unavailable); no new npm dependencies.

#### 2. Island and hook

**Files**: `src/components/guests/GuestManager.tsx` (+ small sibling components as needed), `src/components/hooks/useGuestList.ts`

**Intent**: Manage the list from a phone; every action calls the API and replaces the state with the returned list; one pending flag disables actions; errors (incl. paste problem lines) shown in a Polish alert region (`role="alert"`).

**Contract**: props `{ apiBase: string; initialList: GuestListDto }`. Sections: summary (`N gości · M obecnych · K grup`); add one guest (input + "Dodaj", Enter submits); paste ("Wklej listę", textarea, "Dodaj gości", text cleared only on success); guest list (alphabetical; checkbox to select ungrouped guests; group badge with partner names; "Nieobecny" styling + toggle "Oznacz jako nieobecnego/obecnego"; "Zmień nazwę" inline edit with save/cancel; "Usuń" with `window.confirm`); selection bar ("Utwórz parę" for 2, "Utwórz grupę (N)" for 3–5, hint "Grupa ma od 2 do 5 osób" otherwise; "Wyczyść zaznaczenie"); groups list with members and "Rozwiąż". Touch targets ≥ 40 px; works at 360 px width; `cn()` for conditional classes.

#### 3. Page and shell link

**Files**: `src/pages/o/[key]/goscie.astro`, `src/pages/o/[key].astro`

**Intent**: SSR page with the initial list; the shell's "Goście i grupy" card becomes a link with counts.

**Contract**: `goscie.astro`: `accessFor(Astro.locals, "organizer")` else `Astro.response.status = 404` + `<NoAccess />` (no frontmatter `return`); title "Goście i grupy"; back link "← Panel organizatora"; `<GuestManager client:load apiBase={`/api/o/${key}`} initialList={…} />`. Shell: card links to `/o/<key>/goscie`, shows `N gości · K grup · A nieobecnych` (from `getGuestList`) instead of "Wkrótce".

#### 4. Smoke and docs

**Files**: `scripts/smoke.mjs`, `CLAUDE.md`

**Intent**: Smoke checks the page; CLAUDE.md documents the guest data model and service for later slices.

**Contract**: smoke: `/o/<org>/goscie` 200 contains `Goście i grupy` and a pasted guest name; `/o/<tv>/goscie` 404 with the no-access text and no guest names; the organizer shell links to `/o/<org>/goscie`. CLAUDE.md "Data access": tables `guest` / `guest_group`, invariants, `create_guest_group`, `src/lib/guests` functions, `astro/zod` for validation.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Tests pass: `npm test`
- Build passes: `npm run build`
- HTTP smoke passes against the production preview on a DB without an event (server stopped afterwards; smoke data removed)

#### Manual Verification:

- On a phone (≈ 360 px) open `/o/<key>/goscie`: paste 40 names, rename one, delete one, create a pair and a group of 3, dissolve one, mark someone absent and present again; layout and Polish texts look right, nothing scrolls horizontally

---

## Testing Strategy

### Unit Tests:

- `parseGuestList`: 40 lines → 40 names; CRLF/CR, BOM, zero-width characters, tabs, blank/whitespace-only lines, list markers (`- `, `• `, `1. `, `2) `) but not `2Pac`, Polish letters, too-long (41 code points; emoji counted once), duplicates by case/whitespace (later line flagged, first kept), line numbers 1-based including blank lines.
- `normalizeDisplayName`, `validateDisplayName`, `displayNameKey` (`ŁUCJA` ≡ `łucja`), `isValidGroupSize` (1, 2, 5, 6), `describeGuestListProblem` texts.
- `http.ts`: invalid JSON, schema failure, `parseId` edge cases (`"0"`, `"-1"`, `"1.5"`, `"abc"`, huge numbers).

### Integration Tests:

- Anonymous REST/RPC denial for both tables and the function.
- Service behaviour and group invariants (Phase 2 list), including concurrent group creation and auto-dissolve on delete.

### Manual Testing Steps:

1. On a phone, open the organizer link → "Goście i grupy" card → page opens with counts.
2. Paste 40 names (some with list markers) → 40 guests; paste again → message lists the duplicates, nothing added.
3. Create a pair, a group of 3; try 6 → button disabled with the hint; delete a pair member → pair gone.
4. Mark a guest absent and back; the summary updates.

## Performance Considerations

≤ 100 guests: every mutation returns the full list (two small queries) — negligible. Paste inserts in one statement.

## Migration Notes

Second migration. Locally `npx supabase migration up`; CI's `supabase start` applies it. Deleting the event cascades to guests and groups (used by test/smoke cleanup).

## References

- PRD US-01, FR-001..FR-003: `context/foundation/prd.md`
- Roadmap S-01: `context/foundation/roadmap.md`
- Run rules: `context/foundation/overnight-brief.md`; decisions: `context/foundation/overnight-log.md` (S-01 lines)
- F-01 plan (architecture): `context/archive/2026-10-27-link-access-foundation/plan.md`
- Service pattern: `src/lib/event.ts`; access re-check: `src/lib/access/resolve.ts:89-99`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, types and name parsing

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase migration up` — b49f9b3
- [x] 1.2 Unit + integration tests pass (integration not skipped): `npm test` — b49f9b3
- [x] 1.3 Lint passes: `npm run lint` — b49f9b3
- [x] 1.4 Type check passes: `npx astro check` — b49f9b3

### Phase 2: Guest and group services

#### Automated

- [x] 2.1 Unit + integration tests pass (integration not skipped): `npm test` — 4e795e8
- [x] 2.2 Lint passes: `npm run lint` — 4e795e8
- [x] 2.3 Type check passes: `npx astro check` — 4e795e8

### Phase 3: Organizer API routes and HTTP smoke

#### Automated

- [x] 3.1 Unit tests pass (incl. `http.test.ts`): `npm test`
- [x] 3.2 Lint passes: `npm run lint`
- [x] 3.3 Type check passes: `npx astro check`
- [x] 3.4 Build passes: `npm run build`
- [x] 3.5 HTTP smoke passes against the production preview on a DB without an event

### Phase 4: Guest management page and organizer shell link

#### Automated

- [ ] 4.1 Lint passes: `npm run lint`
- [ ] 4.2 Type check passes: `npx astro check`
- [ ] 4.3 Tests pass: `npm test`
- [ ] 4.4 Build passes: `npm run build`
- [ ] 4.5 HTTP smoke passes against the production preview on a DB without an event

#### Manual

- [ ] 4.6 Phone check of `/o/<key>/goscie` (paste 40, rename, delete, pair, group of 3, dissolve, absent/present; no horizontal scroll)
