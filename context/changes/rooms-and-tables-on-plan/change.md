---
change_id: rooms-and-tables-on-plan
title: Venue plan upload, named rooms and pinned tables with seats and type for the organizer
status: implemented
created: 2026-10-27
updated: 2026-10-27
archived_at: null
---

## Notes

Roadmap slice S-02 (rooms-and-tables-on-plan): organizer at /o/<key> uploads one screenshot of the venue floor plan (png/jpeg/webp, ≤ 5 MB, stored in the database — no Supabase Storage), names 2–3 rooms (create/rename/delete), and adds/edits/deletes tables in a room with a name, seat count (2–20), type (okrągły / prostokątny) and a pin position marked by clicking on the uploaded plan (stored resolution-independently as fractions of image width/height). The image is served through a key-guarded route usable by organizer and TV (S-03 TV view shows guest names next to tables on this plan). Seat numbering convention and deletion semantics are fixed here for S-03 (seat assignments) and S-04 (neighbours). Covers US-01, FR-005, FR-006. Sources: context/foundation/prd.md, context/foundation/roadmap.md, context/foundation/tech-stack.md, context/foundation/overnight-brief.md
