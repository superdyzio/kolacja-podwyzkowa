---
change_id: ai-topics-with-limits
title: AI conversation topics per category with per-guest and per-evening limits
status: implementing
created: 2026-10-27
updated: 2026-10-27
archived_at: null
---

## Notes

Roadmap S-08 (ai-topics-with-limits): the organizer and guests generate an AI conversation topic in a chosen category (kontrowersyjne / generyczne / refleksyjne), visible only to whoever generated it; a guest may generate at most 5 topics per evening, at most 300 per evening in total, the organizer has no per-person limit; topic in ≤ 10 s, on failure a Polish message suggesting the question draw, and a failed attempt does not consume the limit; Polish output only. AI provider behind an interface: a mock (default, the only one used overnight — zero paid calls) and Claude (Haiku family) via the Anthropic Messages API, selected by server-only env vars. PRD refs: US-03, FR-016, NFR-005, NFR-010. Sources: context/foundation/prd.md, context/foundation/roadmap.md, context/foundation/tech-stack.md, context/foundation/overnight-brief.md.
