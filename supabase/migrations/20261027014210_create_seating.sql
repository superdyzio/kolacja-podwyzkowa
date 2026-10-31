-- S-03 manual-seating-on-tv: the working seating arrangement with pinned seats, and immutable published snapshots
-- that the TV (and, from S-05, guest phones) show (PRD FR-004, FR-007, FR-008).
--
-- Working arrangement (what the organizer edits; S-04's draw rewrites its non-pinned rows to make a draft):
--   seat_assignment: one row per seated guest — (table, seat number 1..seat_count). A guest has at most one seat
--   (guest_id is the primary key) and a seat at most one guest (unique table_id, seat). is_pinned = the guest is
--   pinned to that seat (FR-004): manual moves, swaps, displacing and unseating are refused until it is unpinned,
--   and draws keep the guest there. Absent guests may stay seated here (the organizer view marks them).
--   Writes that move people go through seat_guest() (atomic seat / move / swap / replace).
--   Deletion semantics (the S-02 contract): deleting a guest, a table or its room deletes the rows (FK cascade, pins
--   included); lowering a table's seat_count deletes the rows above the new count (trigger below); changing the
--   shape keeps seat numbers.
--
-- Published snapshots (what the TV and phones show; history for S-04):
--   seating_snapshot: one row per publish; its id is the published version (monotonic, never reused). The latest
--   (highest id) snapshot is the current published arrangement.
--   seating_snapshot_table: a copy of every venue table at publish time (name, room name, shape, seat count, pin),
--   so a snapshot renders on its own; table_id is set to null when the table is deleted later.
--   seating_snapshot_seat: who sat where (snapshot table, seat) with the display name at publish time; guest_id is
--   set to null when the guest is deleted later. Absent guests are left out.
--   Snapshots are created only by publish_seating() and never updated. "Publish without changes is a no-op" is
--   decided by the app (src/lib/seating/published.ts compares the would-be snapshot with the latest one).
--
-- Both functions take the same transaction-scoped advisory lock, so a publish never copies half of a swap.
--
-- Access model as in the earlier migrations: browser roles get nothing. RLS on, no policies, privileges revoked
-- (Supabase grants anon/authenticated everything on new tables and EXECUTE on new functions by default).

create table public.seat_assignment (
  guest_id bigint primary key references public.guest (id) on delete cascade,
  event_id smallint not null default 1 references public.event (id) on delete cascade,
  table_id bigint not null references public.venue_table (id) on delete cascade,
  seat smallint not null,
  is_pinned boolean not null default false,
  constraint seat_assignment_seat_positive check (seat >= 1),
  constraint seat_assignment_seat_key unique (table_id, seat)
);

comment on table public.seat_assignment is
  'Working seating arrangement: a guest on a seat (table, 1..seat_count); is_pinned locks the guest to that seat.';

-- Backstop for every writer (seat_guest, S-04 draws): the seat must exist at its table.
create function public.check_seat_in_range()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_seat_count smallint;
begin
  select seat_count into v_seat_count from public.venue_table where id = new.table_id;
  if found and new.seat > v_seat_count then
    raise exception 'SEAT_OUT_OF_RANGE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger seat_assignment_seat_in_range
  before insert or update of table_id, seat on public.seat_assignment
  for each row
  execute function public.check_seat_in_range();

-- Lowering a table's seat count unseats the guests above the new count (pinned ones too); raising adds empty seats.
create function public.unseat_beyond_seat_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.seat_count < old.seat_count then
    delete from public.seat_assignment where table_id = new.id and seat > new.seat_count;
  end if;
  return null;
end;
$$;

create trigger venue_table_unseat_beyond_seat_count
  after update of seat_count on public.venue_table
  for each row
  execute function public.unseat_beyond_seat_count();

create table public.seating_snapshot (
  id bigint generated always as identity primary key,
  event_id smallint not null default 1 references public.event (id) on delete cascade,
  published_at timestamptz not null default now()
);

comment on table public.seating_snapshot is
  'A published seating arrangement (immutable); id = published version, the highest id is what the TV shows.';

create table public.seating_snapshot_table (
  id bigint generated always as identity primary key,
  snapshot_id bigint not null references public.seating_snapshot (id) on delete cascade,
  table_id bigint references public.venue_table (id) on delete set null,
  room_name text not null,
  name text not null,
  seat_count smallint not null,
  shape text not null,
  pos_x double precision not null,
  pos_y double precision not null,
  constraint seating_snapshot_table_seat_count check (seat_count between 2 and 20),
  constraint seating_snapshot_table_shape check (shape in ('round', 'rectangular')),
  constraint seating_snapshot_table_pos_x check (pos_x between 0 and 1),
  constraint seating_snapshot_table_pos_y check (pos_y between 0 and 1)
);

comment on table public.seating_snapshot_table is
  'Copy of a venue table at publish time (renders without the live venue); table_id is null once the table is gone.';

create index seating_snapshot_table_snapshot_id_idx on public.seating_snapshot_table (snapshot_id);
create index seating_snapshot_table_table_id_idx on public.seating_snapshot_table (table_id);

create table public.seating_snapshot_seat (
  snapshot_id bigint not null references public.seating_snapshot (id) on delete cascade,
  snapshot_table_id bigint not null references public.seating_snapshot_table (id) on delete cascade,
  seat smallint not null,
  guest_id bigint references public.guest (id) on delete set null,
  guest_name text not null,
  constraint seating_snapshot_seat_positive check (seat >= 1),
  constraint seating_snapshot_seat_pkey primary key (snapshot_table_id, seat),
  constraint seating_snapshot_seat_guest_key unique (snapshot_id, guest_id)
);

comment on table public.seating_snapshot_seat is
  'Who sat where in a published snapshot, with the display name at publish time; guest_id is null once deleted.';

create index seating_snapshot_seat_guest_id_idx on public.seating_snapshot_seat (guest_id);

-- Seats p_guest_id at (p_table_id, p_seat) atomically:
--   empty seat → the guest moves there (their old seat, if any, becomes free);
--   seat taken and the guest had a seat → the two swap;
--   seat taken and the guest had no seat → the guest sits down and the occupant becomes unseated;
--   the guest's own seat → no change.
-- Raises GUEST_NOT_FOUND, TABLE_NOT_FOUND, SEAT_OUT_OF_RANGE, GUEST_PINNED (the guest is pinned elsewhere) or
-- SEAT_PINNED (the occupant is pinned); the app maps these messages to statuses.
create function public.seat_guest(p_guest_id bigint, p_table_id bigint, p_seat integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_seat_count smallint;
  v_mine public.seat_assignment%rowtype;
  v_other public.seat_assignment%rowtype;
  v_has_mine boolean;
  v_has_other boolean;
begin
  perform pg_advisory_xact_lock(3003);

  if not exists (select 1 from public.guest where id = p_guest_id) then
    raise exception 'GUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  select seat_count into v_seat_count from public.venue_table where id = p_table_id;
  if not found then
    raise exception 'TABLE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_seat is null or p_seat < 1 or p_seat > v_seat_count then
    raise exception 'SEAT_OUT_OF_RANGE' using errcode = 'P0001';
  end if;

  select * into v_mine from public.seat_assignment where guest_id = p_guest_id;
  v_has_mine := found;
  if v_has_mine and v_mine.table_id = p_table_id and v_mine.seat = p_seat then
    return;
  end if;
  if v_has_mine and v_mine.is_pinned then
    raise exception 'GUEST_PINNED' using errcode = 'P0001';
  end if;

  select * into v_other from public.seat_assignment where table_id = p_table_id and seat = p_seat;
  v_has_other := found;
  if v_has_other and v_other.is_pinned then
    raise exception 'SEAT_PINNED' using errcode = 'P0001';
  end if;

  -- Lock the tables involved (stable order) so a concurrent seat-count change waits instead of deadlocking.
  perform 1 from public.venue_table
    where id = p_table_id or (v_has_mine and id = v_mine.table_id)
    order by id
    for share;

  delete from public.seat_assignment where guest_id in (p_guest_id, v_other.guest_id);
  insert into public.seat_assignment (guest_id, table_id, seat) values (p_guest_id, p_table_id, p_seat);
  if v_has_other and v_has_mine then
    insert into public.seat_assignment (guest_id, table_id, seat) values (v_other.guest_id, v_mine.table_id, v_mine.seat);
  end if;
end;
$$;

comment on function public.seat_guest (bigint, bigint, integer) is
  'Seats a guest on (table, seat): move, swap or replace atomically; refuses to move or displace pinned guests.';

-- Publishes the working arrangement: a new snapshot with a copy of every venue table and every seated present
-- guest, in one statement (one consistent view of the data). Returns the snapshot id (the new published version).
create function public.publish_seating()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_snapshot_id bigint;
begin
  perform pg_advisory_xact_lock(3003);

  insert into public.seating_snapshot default values returning id into v_snapshot_id;

  with copied_tables as (
    insert into public.seating_snapshot_table (snapshot_id, table_id, room_name, name, seat_count, shape, pos_x, pos_y)
    select v_snapshot_id, t.id, r.name, t.name, t.seat_count, t.shape, t.pos_x, t.pos_y
      from public.venue_table as t
      join public.venue_room as r on r.id = t.room_id
    returning id, table_id
  )
  insert into public.seating_snapshot_seat (snapshot_id, snapshot_table_id, seat, guest_id, guest_name)
  select v_snapshot_id, c.id, a.seat, a.guest_id, g.display_name
    from public.seat_assignment as a
    join copied_tables as c on c.table_id = a.table_id
    join public.guest as g on g.id = a.guest_id
    where not g.is_absent;

  return v_snapshot_id;
end;
$$;

comment on function public.publish_seating () is
  'Freezes the working arrangement (present guests only) and every table into a new snapshot; returns its id.';

alter table public.seat_assignment enable row level security;
alter table public.seating_snapshot enable row level security;
alter table public.seating_snapshot_table enable row level security;
alter table public.seating_snapshot_seat enable row level security;

revoke all on table public.seat_assignment from anon, authenticated;
revoke all on table public.seating_snapshot from anon, authenticated;
revoke all on table public.seating_snapshot_table from anon, authenticated;
revoke all on table public.seating_snapshot_seat from anon, authenticated;

revoke execute on function public.check_seat_in_range () from public, anon, authenticated;
revoke execute on function public.unseat_beyond_seat_count () from public, anon, authenticated;
revoke execute on function public.seat_guest (bigint, bigint, integer) from public, anon, authenticated;
revoke execute on function public.publish_seating () from public, anon, authenticated;
grant execute on function public.seat_guest (bigint, bigint, integer) to service_role;
grant execute on function public.publish_seating () to service_role;
