# Restaurant and event branding (S-18) — Plan Brief

> Full plan: `context/changes/event-branding/plan.md`

## What & Why

FR-032: the restaurant shows its own name, logo and colour, and the client its company or event name and logo, on
guests' phones, the TV, the QR cards and in the panel — white-label: guests never see the platform name, and
„Kolacja podwyżkowa” leaves the product and the AI prompt.

## Starting Point

Restaurants and events have only names. The venue plan upload is the proven pattern for user images (magic-byte sniff,
base64 text, byte cap, guarded `nosniff` routes with a version in the URL).

## Desired End State

The owner edits „Marka lokalu” in the panel, the client „Marka wydarzenia” on its link (staff through the dispatcher
while the venue leads); one brand header renders on phone, tablet, client shell, TV badge, cards and panel.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Storage | `restaurant.brand_color`, `event.brand_name`, singleton tables `restaurant_logo` / `event_logo` | Blobs never ride along with `event`/`restaurant` reads |
| Logo limits | PNG/JPEG/WebP by magic bytes, ≤ 512 KiB | No SVG; far inside the 6 MB Lambda payload |
| Rename | The owner may rename the restaurant (FR-032); admin names at creation | PRD gives the name to the owner |
| Live update | Page load only, logo URL carries the version | No token change, no new poll |
| Text colour | Black/white by the higher WCAG contrast | Readable on any brand colour |
| Roles | Owner edits, owner + manager see, waiter / outsiders 404, support reads (no image) | PRD: restaurant settings are owner-only; one guard call per page |
| Copy | Guessing game asks for „the whole bill”; AI host is a neutral party host | Event-neutral wording |

## Scope

**In scope:** migration, service, 11 routes, brand header on 6 pages, two editors, copy cleanup, tests, smoke 34, demo.

**Out of scope:** live update, template branding, admin rename route, SVG/resizing, renaming internal identifiers.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data + routes + copy | Migration, service, guarded routes, cleanup, tests | Cross-tenant leak via a logo route |
| 2. UI | Brand header everywhere, two editors | Breaking today's look when unset |
| 3. Smoke + demo + docs | Section 34, demo brand, CLAUDE.md | Time box |

**Prerequisites:** S-11 (done). **Estimated effort:** one overnight session.

## Open Risks & Assumptions

- The TV badge may overlap the drawing's corner on very crowded plans (kept small).
- Deploy order: migration before code.

## Success Criteria (Summary)

- A guest's phone, the TV and the cards show the restaurant's and the client's brand and never „Stolik” or
  „Kolacja podwyżkowa”.
- Only the owner changes the restaurant brand; only the client (or staff while leading) the event's; no route ever
  serves another event's or restaurant's logo.
