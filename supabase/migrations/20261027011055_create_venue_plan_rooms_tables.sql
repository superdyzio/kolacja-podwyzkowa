-- S-02 rooms-and-tables-on-plan: the venue floor plan image, named rooms and pinned tables (PRD FR-005, FR-006).
--
-- venue_plan: one screenshot of the whole venue per event (singleton row). The image lives in the database (no
--   Supabase Storage) as base64 text: PostgREST moves bytea as a "\x…" hex string (2x the size), base64 is 1.33x.
--   The app accepts PNG/JPEG/WebP recognized by their magic bytes, at most 5 MB (5 242 880 bytes); mime_type is the
--   sniffed type and is what the image routes serve. Metadata queries never select image_base64. Replacing the plan
--   = upserting this row; tables keep their pins.
-- venue_room: a named room (label only, no geometry on the plan). Names 1–40 characters, unique per event
--   regardless of letter case. Deleting a room deletes its tables.
-- venue_table: a table in a room with a name (1–24 characters, unique per event case-insensitively, because the
--   TV shows every table on one plan), 2–20 seats, a shape and a pin. The pin (pos_x, pos_y) is a fraction 0–1 of
--   the rendered plan image from its top-left corner, so it does not depend on the image resolution. Tables do not
--   reference venue_plan: the "upload the plan first" rule lives in the UI.
--
-- Seats (contract for S-03/S-04, executable form in src/lib/venue/seats.ts): a seat is (table id, 1..seat_count).
--   round: 1..n clockwise, neighbours i-1/i+1 with wrap-around. rectangular: side A = 1..ceil(n/2), side B = the
--   rest in the same direction; neighbours i-1/i+1 on the same side without wrap-around; opposite = the same
--   position on the other side.
-- Deletion semantics (contract for S-03): deleting a table (or its room) removes every seat assignment and pinned
--   seat at that table; lowering seat_count removes those above the new count; changing the shape keeps seat
--   numbers; renaming, moving to another room, moving the pin and replacing the plan do not touch seating.
--
-- Access model as in the event migration: browser roles get nothing. RLS on, no policies, privileges revoked
-- (Supabase grants anon/authenticated everything on new tables by default).

create table public.venue_plan (
  event_id smallint primary key default 1 references public.event (id) on delete cascade,
  mime_type text not null,
  byte_size integer not null,
  image_base64 text not null,
  updated_at timestamptz not null default now(),
  constraint venue_plan_mime_type check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  constraint venue_plan_byte_size check (byte_size between 1 and 5242880),
  -- Padded base64 of byte_size bytes is exactly 4 * ceil(byte_size / 3) characters.
  constraint venue_plan_base64_length check (char_length(image_base64) = ((byte_size + 2) / 3) * 4)
);

comment on table public.venue_plan is 'The venue floor plan screenshot (singleton per event), base64 PNG/JPEG/WebP up to 5 MB.';

create table public.venue_room (
  id bigint generated always as identity primary key,
  event_id smallint not null default 1 references public.event (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint venue_room_name_format check (
    char_length(name) between 1 and 40
    and name !~ '^[[:space:]]'
    and name !~ '[[:space:]]$'
    and name !~ '[[:space:]]{2}'
    and name !~ '[\t\n\r]'
  )
);

comment on table public.venue_room is 'Named room of the venue (unique per event, case-insensitive); its tables are deleted with it.';

create unique index venue_room_name_key on public.venue_room (event_id, lower(name));

create table public.venue_table (
  id bigint generated always as identity primary key,
  event_id smallint not null default 1 references public.event (id) on delete cascade,
  room_id bigint not null references public.venue_room (id) on delete cascade,
  name text not null,
  seat_count smallint not null,
  shape text not null,
  pos_x double precision not null,
  pos_y double precision not null,
  created_at timestamptz not null default now(),
  constraint venue_table_name_format check (
    char_length(name) between 1 and 24
    and name !~ '^[[:space:]]'
    and name !~ '[[:space:]]$'
    and name !~ '[[:space:]]{2}'
    and name !~ '[\t\n\r]'
  ),
  constraint venue_table_seat_count check (seat_count between 2 and 20),
  constraint venue_table_shape check (shape in ('round', 'rectangular')),
  constraint venue_table_pos_x check (pos_x between 0 and 1),
  constraint venue_table_pos_y check (pos_y between 0 and 1)
);

comment on table public.venue_table is
  'Table in a room: name (unique per event, case-insensitive), 2–20 seats, round/rectangular, pin as 0–1 fractions of the plan image.';

create unique index venue_table_name_key on public.venue_table (event_id, lower(name));

create index venue_table_room_id_idx on public.venue_table (room_id);

alter table public.venue_plan enable row level security;
alter table public.venue_room enable row level security;
alter table public.venue_table enable row level security;

revoke all on table public.venue_plan from anon, authenticated;
revoke all on table public.venue_room from anon, authenticated;
revoke all on table public.venue_table from anon, authenticated;
