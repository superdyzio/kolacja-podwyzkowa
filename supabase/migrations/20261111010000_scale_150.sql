-- scale-150 (S-19, FR-033): an event holds up to 150 guests, tables of 2–30 seats and up to 60 tables (v1: 100 guests,
-- 2–20 seats, 40 tables). The guest and table counts are app rules (MAX_GUESTS, MAX_TABLES; apply_venue_layout takes
-- p_max_tables), so only the three range CHECKs below change. Every existing row (2..20 seats, places 1..100) fits the
-- wider ranges: data-preserving, and the code before this migration keeps its own stricter limits on the migrated DB.

alter table public.venue_table drop constraint venue_table_seat_count;
alter table public.venue_table add constraint venue_table_seat_count check (seat_count between 2 and 30);

alter table public.seating_snapshot_table drop constraint seating_snapshot_table_seat_count;
alter table public.seating_snapshot_table
  add constraint seating_snapshot_table_seat_count check (seat_count between 2 and 30);

-- guess.predicted_place: 1 … MAX_GUESTS (150); the app also refuses anything above the event's guest count.
alter table public.guess drop constraint guess_predicted_place_range;
alter table public.guess
  add constraint guess_predicted_place_range check (predicted_place is null or predicted_place between 1 and 150);
