---
change_id: privacy-retention
title: Guest data retention, event export and the guest privacy notice (S-26)
status: archived
created: 2026-11-10
updated: 2026-11-10
archived_at: 2026-11-10T11:15:04Z
---

## Notes

— S-26 „Prywatność i retencja danych gości” (PRD v2 FR-040, US-09, NFR-019, NFR-021; Access Control table). Sources: context/foundation/prd-v2.md, context/foundation/roadmap.md (### S-26), context/foundation/shape-notes.md (Forward blocks), context/foundation/m2-product-notes.md (stale on numbering/roles), context/foundation/overnight-brief.md. Outcome: owner sets per-restaurant retention days (default 30); guest data actually disappears after the term without any scheduler (lazy purge from traffic + before any read of an expired event + CLI `npm run retention`); manager/owner export event data from the panel event card; guest privacy notice draft (PL/EN, „do przeglądu prawnika”) linked from /g/<key>.
