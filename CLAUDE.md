# Rules for AI

This file provides guidance to AI Agent when working with code in this repository.

## Project rules

- Commit subject format: `[<model>] <message>` (e.g. `[Opus 5.5] feat(<change-id>): <phase title> (p<N>)`). Never add a `Co-Authored-By` trailer.
- Source of truth: `context/foundation/` (`prd.md`, `roadmap.md`, `tech-stack.md`, `shape-notes.md`). Changes live in `context/changes/<change-id>/`.
- Unattended (overnight) runs follow `context/foundation/overnight-brief.md` and log decisions, added dependencies and blockers in `context/foundation/overnight-log.md`.
- UI language: Polish. Every user-facing text (pages, errors, API messages) is in Polish.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`); copies `.dev.vars` into `dist/server/`, so rebuild after changing it
- `npm run preview` — preview production build
- `npm test` — Vitest unit + integration tests (`vitest run`); `npm run test:watch` for watch mode
- `npm run lint` — ESLint with type-checked rules; `npm run lint:fix` to auto-fix
- `npx astro check` — type check (run `npx astro sync` first after changing the env schema)
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)
- `npm run env:local` — write `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` for the local Supabase into `.env` and `.dev.vars`
- `npm run links` — print the organizer and TV links of the event (recovery for a lost organizer link)
- `npm run smoke` — dependency-free HTTP smoke test of the access matrix (`scripts/smoke.mjs`) against a running server, `BASE_URL` env (default `http://localhost:4321`); needs a DB without an event (it creates one)

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

**Astro 7 SSR app** with React 19 islands, Tailwind 4, Supabase (Postgres only) and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default. API routes must export `const prerender = false`.

### Access model (no accounts)

Identity is an unguessable key in the URL path (PRD Access Control, NFR-009): organizer `/o/<key>`, TV `/tv/<key>` (read-only), guest `/g/<key>` (S-05). Keys: 18 random bytes, base64url, 24 chars.

- `src/lib/access/` — `keys.ts` (`generateAccessKey`, `isWellFormedAccessKey`), `paths.ts` (`parseAccessPath`, `organizerPath`, `tvPath`, `guestPath`), `resolve.ts` (`resolveAccess`, `decideAccess`, `accessFor`, types `Access`, `OrganizerAccess`, `TvAccess`). Import from `@/lib/access`.
- `src/middleware.ts` guards every path under `/o/`, `/tv/`, `/g/` and `/api/{o,tv,g}/`. A valid key of the matching role sets `Astro.locals.access` and adds `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag`. Anything else gets the same 404: the `NoAccess` page (`src/components/NoAccess.astro`, also `src/pages/404.astro`) or `{"error":"Brak dostępu"}` for API routes. DB errors throw → `src/pages/500.astro`, never a 404.
- New guarded routes go under those prefixes, e.g. `src/pages/o/[key]/goscie.astro` or `src/pages/api/o/[key]/guests.ts`. Inside, re-check with `accessFor(Astro.locals, "organizer")` (or `context.locals`) and answer 404 when it is null.
- Astro pages: do not `return` from the frontmatter (ESLint `no-misused-promises` crashes on it). Set `Astro.response.status = 404` and render `<NoAccess />` instead.
- `TvAccess` carries no keys; never add organizer-only data (keys, guesses, ranking, drafts) to TV or guest responses.
- Guest access: `resolveAccess` returns `null` for `"guest"` until S-05 adds a resolver for guest keys.

### Data access

- The browser never talks to Supabase. All DB access is server-side with the service-role key.
- `src/lib/db.ts` — `getDb()`: the only reader of `astro:env/server` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`); returns `null` when not configured.
- `src/lib/supabase-client.ts` — `createServiceClient(url, key)` and the `DbClient` type. Business logic takes a `DbClient` parameter and must not import `astro:*`, so Vitest can test it against the local DB.
- `src/lib/event.ts` — the singleton event (`EVENT_ID = 1`, `hasEvent`, `createEvent`). Created once from `/` (POST `/api/event`).
- Supabase errors always throw; `null`/empty results mean "not found".
- `src/db/database.types.ts` — hand-written `Database` type (generated-types shape); extend it with every migration.

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths; mirrored in `vitest.config.ts`).
- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: use uppercase `GET`, `POST` exports; validate input with zod.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Every new table: `enable row level security`, no policies for `anon`/`authenticated`, and `revoke all on table ... from anon, authenticated` (Supabase grants them by default).
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts`.

### Tests

- Unit tests next to the code: `src/**/*.test.ts`.
- DB integration tests: `tests/integration/*.test.ts`, wrapped in `describe.skipIf(!hasLocalDb)` from `tests/integration/helpers.ts`. They run only when `SUPABASE_URL` points at `127.0.0.1`/`localhost`. Files run sequentially (`fileParallelism: false`).
- Integration tests reuse the existing event and may delete only rows they created themselves.
- HTTP-level behaviour (status codes, headers, page bodies) is checked by `npm run smoke` against the production preview.

### Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-only secrets in the `astro.config.mjs` env schema). Locally: `npm run env:local` writes both `.env` and `.dev.vars` (gitignored).
- Local Supabase (Docker), database + REST + gateway only: `npx supabase start -x gotrue,realtime,storage-api,imgproxy,studio,postgres-meta,mailpit,edge-runtime,logflare,vector,supavisor`, then `npx supabase migration up`. `supabase status` prints no API keys in this mode, which is why `env:local` exists.
- Deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth); secrets via `npx wrangler secret put`.

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`) on every push and PR to `main`:

- `ci` — lint, `astro check`, `npm test` (DB integration tests skip) and build. Optional repository secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- `smoke` — local Supabase (CLI from devDependencies), `npm run env:local`, `npm test` with DB tests, build, production preview and `npm run smoke`.
