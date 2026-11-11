-- S-11 restaurant-events: a restaurant's own events — a date, an expected number of guests and the archive (PRD v2
-- FR-024, FR-025, US-06, US-09).
--
-- event.event_date: the day of the event (a calendar date, no time of day). Every existing event gets the day it was
--   created on, in the platform's time zone (Europe/Warsaw — the server and the database run in UTC, so never
--   current_date); the column default is "today" in that zone, so every insert that names no date (tests, smoke,
--   npm run event:create) keeps working. The app computes "upcoming / today / past" from it (src/lib/events/dates.ts).
-- event.expected_guests: the number of guests the restaurant expects (informational, 1–1000; null = not given). The
--   guest list's own limit is separate.
-- event.archived_at: NULL = active; set = moved to the archive at that time. Archiving only moves the event between the
--   panel's lists: its links (client, TV, guests, tablet) keep working until the event is deleted.
-- Permanent deletion needs no function: every child row cascades with the event (multi-tenant-events).
-- Templates (S-15) will add their own marker; the panel's one list query must then leave them out.
--
-- Access model as in the earlier migrations: browser roles get nothing (the table's privileges are already revoked).
-- Additive: three columns (the date backfilled), two checks and one index; no row or function changes otherwise.

alter table public.event
  add column event_date date,
  add column expected_guests integer,
  add column archived_at timestamptz;

update public.event set event_date = (created_at at time zone 'Europe/Warsaw')::date where event_date is null;

alter table public.event
  alter column event_date set not null,
  alter column event_date set default ((now() at time zone 'Europe/Warsaw')::date),
  add constraint event_date_range check (event_date between date '2000-01-01' and date '2100-12-31'),
  add constraint event_expected_guests_range check (expected_guests is null or expected_guests between 1 and 1000);

-- The restaurant panel's lists: every event of one restaurant, by date.
create index event_restaurant_id_date_idx on public.event (restaurant_id, event_date);

comment on column public.event.event_date is
  'The day of the event (Europe/Warsaw calendar date); defaults to today there.';
comment on column public.event.expected_guests is 'How many guests the restaurant expects (1–1000), null = not given.';
comment on column public.event.archived_at is
  'NULL = active; set = archived at that time (only moves it between the panel''s lists; its links keep working).';
