---
change_id: link-access-foundation
title: Link-key access foundation, no-access page, Vitest and CI on main
status: planned
created: 2026-10-27
updated: 2026-10-27
archived_at: null
---

## Notes

Roadmap item F-01 (foundation) — covers NFR-009 and the PRD "Access Control" section: one singleton event exists with a secret organizer link (/o/<key>) and a separate read-only TV address (/tv/<key>); keys are unguessable (>=128 bits random) and not derivable from each other; any entry without a valid key shows a Polish no-access page (HTTP 404, no data); the starter's e-mail login example is removed; unit/integration tests run with one command (`npm test`, Vitest); CI runs on `main`. Sources: context/foundation/prd.md, context/foundation/roadmap.md (F-01), context/foundation/tech-stack.md, context/foundation/overnight-brief.md (binding rules + shared architecture decisions).
