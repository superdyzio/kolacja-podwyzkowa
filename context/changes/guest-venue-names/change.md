---
change_id: guest-venue-names
title: The guest's phone shows the whole venue with every guest at their chair
status: implemented
created: 2026-11-07
updated: 2026-11-07
archived_at: null
---

## Notes

User request (2026-11-07): „na widoku gościa, na planie sali chcemy wyświetlać wszystkich gości z ich miejscami,
podświetlić stolik oraz miejsce na którym siedzi dany gość”.

- Data: `GuestDrawingDto.tables[]` is now `TvTableDto` (geometry + `seats: [{ seat, name }]` of the latest published
  snapshot), exactly what the TV shows; one more `seating_snapshot_seat` query by `snapshot_id` on the 200 path only.
  No token part: snapshots are immutable and the snapshot id is already in the token. Still no ids, keys or absences.
- Access rule changed on purpose (user decision): a guest now sees every published name and seat, like the TV;
  CLAUDE.md's guardrail says so.
- UI: the own table stays first (zoomed). „Pokaż plan sali ze wszystkimi” opens the whole venue: every name, own table
  red with a steady ring, own chair red; wider than the screen in a scroll box, the first zoom picked from the measured
  name height (`venue-zoom.ts`), scrolled to the own table; „−”/„+” keep the middle, „Mój stolik” scrolls back; a
  new seat (redraw) scrolls to the new table.
- Checked: unit (`venue-zoom.test.ts`), integration (`venue-drawing.test.ts`: the guest's seats equal the TV's),
  smoke (guest drawing seats equal the TV's, no other names outside the published seating), headless phone
  screenshots on demo data.
