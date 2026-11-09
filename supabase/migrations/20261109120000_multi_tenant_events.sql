-- F-02 multi-tenant-events: many restaurants, each with many events; every link and every operation works only
-- inside its own event (PRD v2 NFR-012, NFR-015, US-10).
--
-- restaurant: a venue on the platform (name only for now; accounts, settings and flags come with F-03 / S-10).
-- event: no longer a singleton. id is an integer identity (the two-argument advisory locks take int4), restaurant_id
--   says whose event it is, and the organizer and TV keys get the same DB default as restaurant_key (18 random bytes
--   in base64url), so creating an event is one plain insert. The name has no default any more.
-- Existing data: every existing event (the dinner, id 1) moves to the restaurant „Restauracja domyślna” with all its
--   rows and keys unchanged; that restaurant is created only when there is an event to move. New events continue
--   after the highest existing id.
-- event_id: every child table keeps its event_id, now integer and WITHOUT a default: every insert names its event.
-- Cross-row references are event-scoped by composite foreign keys (event_id, x) → (event_id, id), so a row of one
--   event can never point at a row of another. They keep the names of the single-column keys they replace (the app
--   recognises "room not found" by venue_table_room_id_fkey). guess.guest_id stays single-column: the PostgREST
--   embed guest → guess (one-to-one) needs exactly that key; the guess writers check the guest's event instead.
-- Functions: every function that reads or writes event data takes p_event_id and touches only that event's rows (a
--   row of another event behaves exactly like an unknown one). The old signatures are dropped explicitly, otherwise
--   PostgREST would see two candidates. Advisory locks are per event: (3003, event) for seating and venue writes,
--   (3008, event) for AI topic reservations; reset_event takes 3003 → 3008 → the event row, as before.
-- Unchanged: guest_published_table_id and guest_order_lines (they derive everything from the guest), the row
--   triggers, snapshot children (written only by publish_seating, from one event).
--
-- Access model as in the earlier migrations: browser roles get nothing. RLS on, no policies, privileges revoked
-- (Supabase grants anon/authenticated everything on new tables and EXECUTE on new functions by default).

-- 1. Restaurants -----------------------------------------------------------------------------------------------------

create table public.restaurant (
  id integer generated always as identity primary key,
  name text not null,
  created_at timestamptz not null default now(),
  constraint restaurant_name_format check (char_length(name) between 1 and 80 and name = btrim(name))
);

comment on table public.restaurant is 'A restaurant on the platform; every event belongs to exactly one.';

alter table public.restaurant enable row level security;
revoke all on table public.restaurant from anon, authenticated;

insert into public.restaurant (name)
select 'Restauracja domyślna'
  where exists (select 1 from public.event);

-- 2. Old function signatures (each is recreated below with p_event_id or an integer event id) ----------------------

drop function public.create_guest_group (bigint[]);
drop function public.seat_guest (bigint, bigint, integer);
drop function public.publish_seating ();
drop function public.replace_seating (jsonb);
drop function public.apply_venue_layout (jsonb, integer);
drop function public.save_guest_guess (bigint, integer);
drop function public.save_guest_guess_with_place (bigint, integer, integer);
drop function public.reserve_ai_topic (smallint, bigint, text, integer, integer);
drop function public.reset_event (smallint, text[], jsonb);
drop function public.reset_counts (smallint);
drop function public.ai_topic_usage (smallint, bigint);
drop function public.ai_topic_tokens (smallint);
drop function public.set_order_pieces (bigint, integer[], boolean, bigint);

-- 3. Events ----------------------------------------------------------------------------------------------------------

alter table public.event drop constraint event_singleton;
alter table public.event alter column id drop default;
alter table public.event alter column id type integer;
alter table public.event alter column id add generated always as identity;
select setval(pg_get_serial_sequence('public.event', 'id'), (select coalesce(max(id), 0) + 1 from public.event), false);

alter table public.event add column restaurant_id integer references public.restaurant (id);
update public.event set restaurant_id = (select min(id) from public.restaurant) where restaurant_id is null;
alter table public.event alter column restaurant_id set not null;
create index event_restaurant_id_idx on public.event (restaurant_id);

alter table public.event
  alter column organizer_key set default translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_'),
  alter column tv_key set default translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_'),
  alter column name drop default,
  add constraint event_name_format check (char_length(name) between 1 and 120 and name = btrim(name));

comment on table public.event is
  'An event of a restaurant with its link keys (organizer, TV, restaurant); every child row belongs to one event.';
comment on column public.event.restaurant_id is 'The restaurant the event belongs to.';

-- 4. event_id columns: integer, no default -------------------------------------------------------------------------

alter table public.guest_group alter column event_id type integer, alter column event_id drop default;
alter table public.guest alter column event_id type integer, alter column event_id drop default;
alter table public.venue_plan alter column event_id type integer, alter column event_id drop default;
alter table public.venue_room alter column event_id type integer, alter column event_id drop default;
alter table public.venue_table alter column event_id type integer, alter column event_id drop default;
alter table public.seat_assignment alter column event_id type integer, alter column event_id drop default;
alter table public.seating_snapshot alter column event_id type integer, alter column event_id drop default;
alter table public.guess alter column event_id type integer, alter column event_id drop default;
alter table public.question alter column event_id type integer, alter column event_id drop default;
alter table public.ai_topic alter column event_id type integer, alter column event_id drop default;
alter table public.tv_spotlight alter column event_id type integer, alter column event_id drop default;
alter table public.order_item alter column event_id type integer, alter column event_id drop default;
alter table public.order_piece alter column event_id type integer, alter column event_id drop default;
alter table public.drink_item alter column event_id type integer, alter column event_id drop default;

-- 5. Event-scoped references ----------------------------------------------------------------------------------------

alter table public.guest add constraint guest_event_id_id_key unique (event_id, id);
alter table public.guest_group add constraint guest_group_event_id_id_key unique (event_id, id);
alter table public.venue_room add constraint venue_room_event_id_id_key unique (event_id, id);
alter table public.venue_table add constraint venue_table_event_id_id_key unique (event_id, id);
alter table public.order_item add constraint order_item_event_id_id_key unique (event_id, id);

alter table public.guest
  drop constraint guest_group_id_fkey,
  add constraint guest_group_id_fkey foreign key (event_id, group_id)
    references public.guest_group (event_id, id) on delete set null (group_id);

alter table public.venue_table
  drop constraint venue_table_room_id_fkey,
  add constraint venue_table_room_id_fkey foreign key (event_id, room_id)
    references public.venue_room (event_id, id) on delete cascade;

alter table public.seat_assignment
  drop constraint seat_assignment_guest_id_fkey,
  drop constraint seat_assignment_table_id_fkey,
  add constraint seat_assignment_guest_id_fkey foreign key (event_id, guest_id)
    references public.guest (event_id, id) on delete cascade,
  add constraint seat_assignment_table_id_fkey foreign key (event_id, table_id)
    references public.venue_table (event_id, id) on delete cascade;

alter table public.ai_topic
  drop constraint ai_topic_guest_id_fkey,
  add constraint ai_topic_guest_id_fkey foreign key (event_id, guest_id)
    references public.guest (event_id, id) on delete set null (guest_id);

alter table public.order_item
  drop constraint order_item_guest_id_fkey,
  drop constraint order_item_table_id_fkey,
  add constraint order_item_guest_id_fkey foreign key (event_id, guest_id)
    references public.guest (event_id, id) on delete set null (guest_id),
  add constraint order_item_table_id_fkey foreign key (event_id, table_id)
    references public.venue_table (event_id, id) on delete set null (table_id);

alter table public.order_piece
  drop constraint order_piece_order_item_id_fkey,
  drop constraint order_piece_guest_id_fkey,
  add constraint order_piece_order_item_id_fkey foreign key (event_id, order_item_id)
    references public.order_item (event_id, id) on delete cascade,
  add constraint order_piece_guest_id_fkey foreign key (event_id, guest_id)
    references public.guest (event_id, id) on delete set null (guest_id);

-- Per-event reads on every TV and guest poll ("latest snapshot of the event") and in the boards.
create index seating_snapshot_event_id_idx on public.seating_snapshot (event_id, id);
create index seat_assignment_event_id_idx on public.seat_assignment (event_id);
create index guess_event_id_idx on public.guess (event_id);
create index guest_group_event_id_idx on public.guest_group (event_id);

-- 6. Functions ------------------------------------------------------------------------------------------------------

-- Atomic group creation inside one event. Raises GROUP_SIZE (not 2–5 distinct ids), GUEST_NOT_FOUND (an id is unknown
-- or belongs to another event) or GUEST_ALREADY_GROUPED.
create function public.create_guest_group(p_event_id integer, p_guest_ids bigint[])
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_ids bigint[];
  v_count integer;
  v_group_id bigint;
begin
  select coalesce(array_agg(distinct guest_id), '{}')
    into v_ids
    from unnest(p_guest_ids) as guest_id
    where guest_id is not null;

  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count < 2 or v_count > 5 then
    raise exception 'GROUP_SIZE' using errcode = 'P0001';
  end if;

  -- Lock the members so two concurrent creations cannot both take the same guest.
  perform 1 from public.guest where id = any (v_ids) and event_id = p_event_id order by id for update;

  if (select count(*) from public.guest where id = any (v_ids) and event_id = p_event_id) <> v_count then
    raise exception 'GUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.guest where id = any (v_ids) and event_id = p_event_id and group_id is not null) then
    raise exception 'GUEST_ALREADY_GROUPED' using errcode = 'P0001';
  end if;

  insert into public.guest_group (event_id) values (p_event_id) returning id into v_group_id;
  update public.guest set group_id = v_group_id where id = any (v_ids) and event_id = p_event_id;
  return v_group_id;
end;
$$;

comment on function public.create_guest_group (integer, bigint[]) is
  'Creates an inseparable group of 2–5 existing, ungrouped guests of one event atomically; returns the new group id.';

-- Seats p_guest_id at (p_table_id, p_seat) inside one event: move, swap or replace atomically (as before). Raises
-- GUEST_NOT_FOUND, TABLE_NOT_FOUND (also for another event's guest or table), SEAT_OUT_OF_RANGE, GUEST_PINNED or
-- SEAT_PINNED.
create function public.seat_guest(p_event_id integer, p_guest_id bigint, p_table_id bigint, p_seat integer)
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
  perform pg_advisory_xact_lock(3003, p_event_id);

  if not exists (select 1 from public.guest where id = p_guest_id and event_id = p_event_id) then
    raise exception 'GUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  select seat_count into v_seat_count from public.venue_table where id = p_table_id and event_id = p_event_id;
  if not found then
    raise exception 'TABLE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_seat is null or p_seat < 1 or p_seat > v_seat_count then
    raise exception 'SEAT_OUT_OF_RANGE' using errcode = 'P0001';
  end if;

  select * into v_mine from public.seat_assignment where guest_id = p_guest_id and event_id = p_event_id;
  v_has_mine := found;
  if v_has_mine and v_mine.table_id = p_table_id and v_mine.seat = p_seat then
    return;
  end if;
  if v_has_mine and v_mine.is_pinned then
    raise exception 'GUEST_PINNED' using errcode = 'P0001';
  end if;

  select * into v_other
    from public.seat_assignment
    where table_id = p_table_id and seat = p_seat and event_id = p_event_id;
  v_has_other := found;
  if v_has_other and v_other.is_pinned then
    raise exception 'SEAT_PINNED' using errcode = 'P0001';
  end if;

  -- Lock the tables involved (stable order) so a concurrent seat-count change waits instead of deadlocking.
  perform 1 from public.venue_table
    where event_id = p_event_id and (id = p_table_id or (v_has_mine and id = v_mine.table_id))
    order by id
    for share;

  delete from public.seat_assignment where event_id = p_event_id and guest_id in (p_guest_id, v_other.guest_id);
  insert into public.seat_assignment (event_id, guest_id, table_id, seat)
    values (p_event_id, p_guest_id, p_table_id, p_seat);
  if v_has_other and v_has_mine then
    insert into public.seat_assignment (event_id, guest_id, table_id, seat)
      values (p_event_id, v_other.guest_id, v_mine.table_id, v_mine.seat);
  end if;
end;
$$;

comment on function public.seat_guest (integer, bigint, bigint, integer) is
  'Seats a guest on (table, seat) inside one event: move, swap or replace atomically; refuses to move pinned guests.';

-- Publishes one event's working arrangement: a new snapshot with a copy of the event's tables, outlined rooms, chair
-- pitch and every seated present guest. Returns the snapshot id (the new published version).
create function public.publish_seating(p_event_id integer)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_snapshot_id bigint;
  v_pitch double precision;
begin
  perform pg_advisory_xact_lock(3003, p_event_id);

  select chair_pitch into v_pitch from public.venue_plan where event_id = p_event_id;

  insert into public.seating_snapshot (event_id, chair_pitch)
    values (p_event_id, coalesce(v_pitch, 0.035))
    returning id into v_snapshot_id;

  insert into public.seating_snapshot_room (snapshot_id, room_name, outline_x, outline_y, outline_w, outline_h)
  select v_snapshot_id, r.name, r.outline_x, r.outline_y, r.outline_w, r.outline_h
    from public.venue_room as r
    where r.event_id = p_event_id and r.outline_x is not null;

  with copied_tables as (
    insert into public.seating_snapshot_table
      (snapshot_id, table_id, room_name, name, seat_count, shape, pos_x, pos_y, rotation)
    select v_snapshot_id, t.id, r.name, t.name, t.seat_count, t.shape, t.pos_x, t.pos_y, t.rotation
      from public.venue_table as t
      join public.venue_room as r on r.id = t.room_id
      where t.event_id = p_event_id
    returning id, table_id
  )
  insert into public.seating_snapshot_seat (snapshot_id, snapshot_table_id, seat, guest_id, guest_name)
  select v_snapshot_id, c.id, a.seat, a.guest_id, g.display_name
    from public.seat_assignment as a
    join copied_tables as c on c.table_id = a.table_id
    join public.guest as g on g.id = a.guest_id
    where a.event_id = p_event_id and not g.is_absent;

  return v_snapshot_id;
end;
$$;

comment on function public.publish_seating (integer) is
  'Freezes one event''s working arrangement (present guests only), tables and outlines into a new snapshot; returns its id.';

-- Replaces every non-pinned working seat of one event with the given rows [{guest_id, table_id, seat}] atomically
-- (draft / restore). A guest or table of another event violates the composite foreign keys and aborts the call.
create function public.replace_seating(p_event_id integer, p_seats jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(3003, p_event_id);

  -- Lock the tables involved (stable order) so a concurrent seat-count change waits instead of racing the range
  -- check.
  perform 1 from public.venue_table
    where event_id = p_event_id
      and id in (
        select x.table_id from jsonb_to_recordset(p_seats) as x (guest_id bigint, table_id bigint, seat integer)
      )
    order by id
    for share;

  delete from public.seat_assignment where event_id = p_event_id and not is_pinned;

  insert into public.seat_assignment (event_id, guest_id, table_id, seat)
  select p_event_id, x.guest_id, x.table_id, x.seat
    from jsonb_to_recordset(p_seats) as x (guest_id bigint, table_id bigint, seat integer);
end;
$$;

comment on function public.replace_seating (integer, jsonb) is
  'Replaces every non-pinned working seat of one event with the given rows [{guest_id, table_id, seat}] atomically.';

-- Applies an accepted drawing proposal to one event (as before): moves/rotates its tables, sets its room outlines and
-- pitch, adds tables; never deletes. Raises TABLE_NOT_FOUND, ROOM_NOT_FOUND (also for another event's rows),
-- DUPLICATE_NAME, TOO_MANY_TABLES or NO_PLAN.
create function public.apply_venue_layout(p_event_id integer, p_layout jsonb, p_max_tables integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_outline jsonb;
  v_pitch double precision;
begin
  perform pg_advisory_xact_lock(3003, p_event_id);

  for v_item in select * from jsonb_array_elements(coalesce(p_layout -> 'tables', '[]'::jsonb)) loop
    update public.venue_table
      set pos_x = (v_item ->> 'x')::double precision,
          pos_y = (v_item ->> 'y')::double precision,
          rotation = (v_item ->> 'rotation')::smallint
      where id = (v_item ->> 'id')::bigint and event_id = p_event_id;
    if not found then
      raise exception 'TABLE_NOT_FOUND' using errcode = 'P0001';
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_layout -> 'rooms', '[]'::jsonb)) loop
    v_outline := v_item -> 'outline';
    if v_outline is null or jsonb_typeof(v_outline) = 'null' then
      update public.venue_room
        set outline_x = null, outline_y = null, outline_w = null, outline_h = null
        where id = (v_item ->> 'id')::bigint and event_id = p_event_id;
    else
      update public.venue_room
        set outline_x = (v_outline ->> 'x')::double precision,
            outline_y = (v_outline ->> 'y')::double precision,
            outline_w = (v_outline ->> 'width')::double precision,
            outline_h = (v_outline ->> 'height')::double precision
        where id = (v_item ->> 'id')::bigint and event_id = p_event_id;
    end if;
    if not found then
      raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001';
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_layout -> 'newTables', '[]'::jsonb)) loop
    if not exists (
      select 1 from public.venue_room where id = (v_item ->> 'roomId')::bigint and event_id = p_event_id
    ) then
      raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001';
    end if;
    begin
      insert into public.venue_table (event_id, room_id, name, seat_count, shape, pos_x, pos_y, rotation)
      values (
        p_event_id,
        (v_item ->> 'roomId')::bigint,
        v_item ->> 'name',
        (v_item ->> 'seatCount')::smallint,
        v_item ->> 'shape',
        (v_item ->> 'x')::double precision,
        (v_item ->> 'y')::double precision,
        (v_item ->> 'rotation')::smallint
      );
    exception when unique_violation then
      raise exception 'DUPLICATE_NAME' using errcode = 'P0001';
    end;
  end loop;

  if (select count(*) from public.venue_table where event_id = p_event_id) > p_max_tables then
    raise exception 'TOO_MANY_TABLES' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_layout -> 'chairPitch') = 'number' then
    v_pitch := (p_layout ->> 'chairPitch')::double precision;
    update public.venue_plan set chair_pitch = v_pitch where event_id = p_event_id;
    if not found then
      raise exception 'NO_PLAN' using errcode = 'P0001';
    end if;
  end if;
end;
$$;

comment on function public.apply_venue_layout (integer, jsonb, integer) is
  'Applies an accepted drawing proposal to one event atomically: moves/rotates tables, sets outlines and pitch, adds tables.';

-- The guest's own save (FR-017) inside their event: refused once intake is closed. Raises GUEST_NOT_FOUND (also for
-- another event's guest) or INTAKE_CLOSED.
create function public.save_guest_guess(p_event_id integer, p_guest_id bigint, p_amount_grosze integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.guest where id = p_guest_id and event_id = p_event_id) then
    raise exception 'GUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Holds the event row against a concurrent close until this transaction ends.
  perform 1 from public.event where id = p_event_id and guess_intake_open for share;
  if not found then
    raise exception 'INTAKE_CLOSED' using errcode = 'P0001';
  end if;

  insert into public.guess (guest_id, event_id, amount_grosze, entered_by, updated_at)
  values (p_guest_id, p_event_id, p_amount_grosze, 'guest', now())
  on conflict (guest_id) do update
    set amount_grosze = excluded.amount_grosze,
        entered_by = 'guest',
        updated_at = now();
end;
$$;

comment on function public.save_guest_guess (integer, bigint, integer) is
  'Saves or replaces a guest''s own guess while their event''s intake is open (atomic against a concurrent close).';

-- The guest's own save of the amount AND the place prediction together (null clears it), as save_guest_guess.
create function public.save_guest_guess_with_place(
  p_event_id integer,
  p_guest_id bigint,
  p_amount_grosze integer,
  p_predicted_place integer
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.guest where id = p_guest_id and event_id = p_event_id) then
    raise exception 'GUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform 1 from public.event where id = p_event_id and guess_intake_open for share;
  if not found then
    raise exception 'INTAKE_CLOSED' using errcode = 'P0001';
  end if;

  insert into public.guess (guest_id, event_id, amount_grosze, predicted_place, entered_by, updated_at)
  values (p_guest_id, p_event_id, p_amount_grosze, p_predicted_place, 'guest', now())
  on conflict (guest_id) do update
    set amount_grosze = excluded.amount_grosze,
        predicted_place = excluded.predicted_place,
        entered_by = 'guest',
        updated_at = now();
end;
$$;

comment on function public.save_guest_guess_with_place (integer, bigint, integer, integer) is
  'Saves or replaces a guest''s own guess and place prediction while intake is open (atomic against a close).';

-- Admits one AI topic attempt of one event (as before; the lock is per event). Raises EVENT_NOT_FOUND,
-- GUEST_NOT_FOUND, GUEST_BUSY, GUEST_LIMIT or EVENT_LIMIT.
create function public.reserve_ai_topic(
  p_event_id integer,
  p_guest_id bigint,
  p_category text,
  p_guest_limit integer,
  p_event_limit integer
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_used integer;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(3008, p_event_id);

  perform 1 from public.event where id = p_event_id;
  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_guest_id is not null then
    perform 1 from public.guest where id = p_guest_id and event_id = p_event_id;
    if not found then
      raise exception 'GUEST_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  -- Dead attempts never count.
  update public.ai_topic
    set status = 'failed', finished_at = now()
    where event_id = p_event_id
      and status = 'pending'
      and created_at < now() - interval '60 seconds';

  if p_guest_id is not null then
    perform 1 from public.ai_topic where event_id = p_event_id and guest_id = p_guest_id and status = 'pending';
    if found then
      raise exception 'GUEST_BUSY' using errcode = 'P0001';
    end if;

    select count(*) into v_used
      from public.ai_topic
      where event_id = p_event_id and guest_id = p_guest_id and status in ('pending', 'succeeded');
    if v_used >= p_guest_limit then
      raise exception 'GUEST_LIMIT' using errcode = 'P0001';
    end if;
  end if;

  select count(*) into v_used
    from public.ai_topic
    where event_id = p_event_id and status in ('pending', 'succeeded');
  if v_used >= p_event_limit then
    raise exception 'EVENT_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.ai_topic (event_id, requester, guest_id, category)
  values (
    p_event_id,
    case when p_guest_id is null then 'organizer' else 'guest' end,
    p_guest_id,
    p_category
  )
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.reserve_ai_topic (integer, bigint, text, integer, integer) is
  'Admits one AI topic attempt against the per-guest and per-event limits (atomic); returns the pending row id.';

-- One event's usage (and one guest's, when given), read-only: used = succeeded + pending younger than 60 s;
-- failed = failed + older pending; guest_busy = the guest has a live pending attempt.
create function public.ai_topic_usage(p_event_id integer, p_guest_id bigint default null)
returns table (event_used integer, event_failed integer, guest_used integer, guest_busy boolean)
language sql
stable
set search_path = ''
as $$
  with attempts as (
    select
      guest_id,
      status = 'succeeded' or (status = 'pending' and created_at >= now() - interval '60 seconds') as live,
      status = 'pending' and created_at >= now() - interval '60 seconds' as busy
    from public.ai_topic
    where event_id = p_event_id
  )
  select
    count(*) filter (where live)::integer,
    count(*) filter (where not live)::integer,
    count(*) filter (where live and p_guest_id is not null and guest_id = p_guest_id)::integer,
    coalesce(bool_or(busy) filter (where p_guest_id is not null and guest_id = p_guest_id), false)
  from attempts;
$$;

comment on function public.ai_topic_usage (integer, bigint) is
  'Counts of AI topic attempts for one event (and one guest): live (succeeded + fresh pending), failed, busy.';

-- Billed tokens of one event per model (rows without token counts left out), read-only.
create function public.ai_topic_tokens(p_event_id integer)
returns table (model text, input_tokens bigint, output_tokens bigint)
language sql
stable
set search_path = ''
as $$
  select
    attempt.model,
    coalesce(sum(attempt.input_tokens), 0)::bigint,
    coalesce(sum(attempt.output_tokens), 0)::bigint
  from public.ai_topic as attempt
  where attempt.event_id = p_event_id
    and (attempt.input_tokens is not null or attempt.output_tokens is not null)
  group by attempt.model
  order by attempt.model nulls first;
$$;

comment on function public.ai_topic_tokens (integer) is
  'Billed AI topic tokens of one event per model, for the cost estimate.';

-- What the reset would remove, per kind (read-only). Raises EVENT_NOT_FOUND. Body as in 20261108120000.
create function public.reset_counts(p_event_id integer)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_event public.event%rowtype;
  v_ai_used integer;
begin
  select * into v_event from public.event where id = p_event_id;
  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select event_used into v_ai_used from public.ai_topic_usage(p_event_id);

  return jsonb_build_object(
    'guesses', (select count(*) from public.guess where event_id = p_event_id),
    'correctAmountSet', v_event.correct_amount_grosze is not null,
    'intakeOpen', v_event.guess_intake_open,
    'aiAttempts', (select count(*) from public.ai_topic where event_id = p_event_id),
    'aiUsed', coalesce(v_ai_used, 0),
    'seats', (select count(*) from public.seat_assignment where event_id = p_event_id),
    'pinned', (select count(*) from public.seat_assignment where event_id = p_event_id and is_pinned),
    'snapshots', (select count(*) from public.seating_snapshot where event_id = p_event_id),
    'guests', (select count(*) from public.guest where event_id = p_event_id),
    'groups', (select count(*) from public.guest_group where event_id = p_event_id),
    'plan', exists (select 1 from public.venue_plan where event_id = p_event_id),
    'rooms', (select count(*) from public.venue_room where event_id = p_event_id),
    'tables', (select count(*) from public.venue_table where event_id = p_event_id),
    'orders', (select count(*) from public.order_item where event_id = p_event_id)
      + (select count(*) from public.drink_item where event_id = p_event_id),
    'questions', (select count(*) from public.question where event_id = p_event_id),
    'guestAccessEnabled', v_event.guest_access_enabled
  );
end;
$$;

comment on function public.reset_counts (integer) is
  'What a reset of one event would remove, per kind (read-only).';

-- The organizer reset of one event (body as in 20261108120000; the locks are per event, same order).
create function public.reset_event(p_event_id integer, p_parts text[], p_starter_questions jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  c_order constant text[] :=
    array['guesses', 'aiUsage', 'seating', 'guests', 'venue', 'orders', 'questions', 'guestLinks'];
  v_parts text[];
  v_before jsonb;
  v_questions_added integer := 0;
  v_keys_replaced integer := 0;
begin
  if p_parts is null or coalesce(cardinality(p_parts), 0) = 0 then
    raise exception 'NO_PARTS' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_parts) as part where part is null or part <> all (c_order)) then
    raise exception 'UNKNOWN_PART' using errcode = 'P0001';
  end if;

  -- Implications: no guests means no guesses, AI attempts or seats; no tables means no seats. Orders stand alone:
  -- without their guest or table they stay, unassigned.
  v_parts := p_parts;
  if 'guests' = any (v_parts) then
    v_parts := v_parts || array['guesses', 'aiUsage', 'seating'];
  end if;
  if 'venue' = any (v_parts) then
    v_parts := v_parts || array['seating'];
  end if;
  select array_agg(part order by ord) into v_parts
    from unnest(c_order) with ordinality as o (part, ord)
    where part = any (v_parts);

  if 'questions' = any (v_parts) and (
    p_starter_questions is null
    or jsonb_typeof(p_starter_questions) <> 'array'
    or jsonb_array_length(p_starter_questions) = 0
  ) then
    raise exception 'NO_STARTER_QUESTIONS' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(3003, p_event_id);
  perform pg_advisory_xact_lock(3008, p_event_id);
  perform 1 from public.event where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_before := public.reset_counts(p_event_id);

  -- Dependents first: guesses, AI attempts, seats and order lines before the guests and tables they point at.
  if 'guesses' = any (v_parts) then
    update public.event
      set correct_amount_grosze = null, guess_intake_open = true
      where id = p_event_id;
    delete from public.guess where event_id = p_event_id;
  end if;

  if 'aiUsage' = any (v_parts) then
    delete from public.ai_topic where event_id = p_event_id;
  end if;

  if 'seating' = any (v_parts) then
    delete from public.seat_assignment where event_id = p_event_id;
    -- Snapshot tables and seats go with their snapshot (on delete cascade).
    delete from public.seating_snapshot where event_id = p_event_id;
  end if;

  if 'orders' = any (v_parts) then
    delete from public.order_item where event_id = p_event_id;
    delete from public.drink_item where event_id = p_event_id;
  end if;

  if 'guests' = any (v_parts) then
    delete from public.guest_group where event_id = p_event_id;
    delete from public.guest where event_id = p_event_id;
  end if;

  if 'venue' = any (v_parts) then
    delete from public.venue_plan where event_id = p_event_id;
    delete from public.venue_table where event_id = p_event_id;
    delete from public.venue_room where event_id = p_event_id;
  end if;

  if 'questions' = any (v_parts) then
    delete from public.question where event_id = p_event_id;
    insert into public.question (event_id, category, text)
    select p_event_id, x.category, x.text
      from rows from (jsonb_to_recordset(p_starter_questions) as (category text, text text))
        with ordinality as x (category, text, ord)
      order by x.ord
    on conflict (event_id, text_key) do nothing;
    get diagnostics v_questions_added = row_count;
  end if;

  if 'guestLinks' = any (v_parts) then
    -- The same expression as the column default (S-05): 18 random bytes in base64url.
    update public.guest
      set access_key = translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_')
      where event_id = p_event_id;
    get diagnostics v_keys_replaced = row_count;
    update public.event set guest_access_enabled = false where id = p_event_id;
  end if;

  return jsonb_build_object(
    'parts', to_jsonb(v_parts),
    'before', v_before,
    'questionsAdded', v_questions_added,
    'guestKeysReplaced', v_keys_replaced
  );
end;
$$;

comment on function public.reset_event (integer, text[], jsonb) is
  'Resets the chosen parts of one event in one transaction (implied parts added); returns parts, before counts, added.';

-- Marks (or unmarks) pieces of one event's order line (as before). A line of another event is ITEM_NOT_FOUND, like an
-- unknown one.
create function public.set_order_pieces(
  p_event_id integer,
  p_item_id bigint,
  p_pieces integer[],
  p_delivered boolean,
  p_guest_id bigint
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_item record;
  v_pieces integer[];
begin
  select id, event_id, quantity, guest_id, table_id into v_item
    from public.order_item
    where id = p_item_id and event_id = p_event_id
    for update;
  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_guest_id is not null and not (
    v_item.guest_id is not distinct from p_guest_id
    or (v_item.table_id is not null and v_item.table_id is not distinct from public.guest_published_table_id(p_guest_id))
  ) then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- null = every piece of the line („Wydane” for the whole line).
  v_pieces := coalesce(p_pieces, array(select generate_series(1, v_item.quantity)));
  if cardinality(v_pieces) = 0
    or exists (select 1 from unnest(v_pieces) as wanted (n) where n is null or n < 1 or n > v_item.quantity) then
    raise exception 'PIECE_OUT_OF_RANGE' using errcode = 'P0001';
  end if;

  if p_delivered then
    insert into public.order_piece (order_item_id, piece, event_id, marked_by, guest_id)
    select distinct v_item.id, wanted.n, v_item.event_id,
        case when p_guest_id is null then 'organizer' else 'guest' end, p_guest_id
      from unnest(v_pieces) as wanted (n)
    on conflict (order_item_id, piece) do nothing;
  else
    if p_guest_id is not null and exists (
      select 1 from public.order_piece
        where order_item_id = v_item.id and piece = any (v_pieces) and marked_by = 'organizer'
    ) then
      raise exception 'MARKED_BY_ORGANIZER' using errcode = 'P0001';
    end if;
    delete from public.order_piece where order_item_id = v_item.id and piece = any (v_pieces);
  end if;

  update public.order_item
    set delivered = (select count(*) from public.order_piece where order_item_id = v_item.id) >= v_item.quantity,
        updated_at = now()
    where id = v_item.id;
end;
$$;

comment on function public.set_order_pieces (integer, bigint, integer[], boolean, bigint) is
  'Marks (or unmarks) pieces of one event''s order line as delivered by the organizer (p_guest_id null) or a guest.';

-- 7. Function access ------------------------------------------------------------------------------------------------

revoke execute on function public.create_guest_group (integer, bigint[]) from public, anon, authenticated;
revoke execute on function public.seat_guest (integer, bigint, bigint, integer) from public, anon, authenticated;
revoke execute on function public.publish_seating (integer) from public, anon, authenticated;
revoke execute on function public.replace_seating (integer, jsonb) from public, anon, authenticated;
revoke execute on function public.apply_venue_layout (integer, jsonb, integer) from public, anon, authenticated;
revoke execute on function public.save_guest_guess (integer, bigint, integer) from public, anon, authenticated;
revoke execute on function public.save_guest_guess_with_place (integer, bigint, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.reserve_ai_topic (integer, bigint, text, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.ai_topic_usage (integer, bigint) from public, anon, authenticated;
revoke execute on function public.ai_topic_tokens (integer) from public, anon, authenticated;
revoke execute on function public.reset_counts (integer) from public, anon, authenticated;
revoke execute on function public.reset_event (integer, text[], jsonb) from public, anon, authenticated;
revoke execute on function public.set_order_pieces (integer, bigint, integer[], boolean, bigint)
  from public, anon, authenticated;

grant execute on function public.create_guest_group (integer, bigint[]) to service_role;
grant execute on function public.seat_guest (integer, bigint, bigint, integer) to service_role;
grant execute on function public.publish_seating (integer) to service_role;
grant execute on function public.replace_seating (integer, jsonb) to service_role;
grant execute on function public.apply_venue_layout (integer, jsonb, integer) to service_role;
grant execute on function public.save_guest_guess (integer, bigint, integer) to service_role;
grant execute on function public.save_guest_guess_with_place (integer, bigint, integer, integer) to service_role;
grant execute on function public.reserve_ai_topic (integer, bigint, text, integer, integer) to service_role;
grant execute on function public.ai_topic_usage (integer, bigint) to service_role;
grant execute on function public.ai_topic_tokens (integer) to service_role;
grant execute on function public.reset_counts (integer) to service_role;
grant execute on function public.reset_event (integer, text[], jsonb) to service_role;
grant execute on function public.set_order_pieces (integer, bigint, integer[], boolean, bigint) to service_role;
