-- client-restaurant-split (S-14; PRD v2 FR-026, FR-028, US-07): the per-event switch „Lokal prowadzi”.
-- false (default) = the client edits through the organizer link and the restaurant's staff only preview its work;
-- true = the staff edit through the panel and the organizer link is view-only (its writes get a 409). The app checks
-- the column on every write of either side, so the two never edit at the same time.
-- Additive: every existing event (event 1 included) stays led by its client; code from before ignores the column.

alter table public.event add column venue_leads boolean not null default false;

comment on column public.event.venue_leads is
  'S-14 „Lokal prowadzi”: true = the restaurant staff edit the client''s work in the panel and the organizer link is view-only.';
