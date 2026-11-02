-- venue-drawing: the venue drawn in one style on the TV and guest phones (rooms, tables, chairs, names at the chairs)
-- instead of the plan photo with name cards. Additive only (production data is live): new columns are defaulted or
-- nullable, publish_seating() keeps its signature, so the previous app build keeps working against this schema.
--
-- Live venue:
--   venue_table.rotation: degrees clockwise 0..359 about the table centre (the pin).
--   venue_room.outline_*: one axis-aligned rectangle per room as fractions of the plan image (all four null = no
--     outline). x, y in [0, 1], width, height in (0, 1].
--   venue_plan.chair_pitch: the distance between two chairs as a fraction of the plan width, for the whole venue; a
--     table's size follows from its seat count and this pitch (src/lib/venue/drawing.ts). Deleted with the plan.
-- Snapshots (what the TV and phones draw):
--   seating_snapshot.chair_pitch, seating_snapshot_table.rotation: copies; null in snapshots published before this
--     migration and read as the defaults (0.035, 0°), so such a snapshot still counts as up to date
--     (src/lib/seating/published.ts treats null exactly like the live default).
--   seating_snapshot_room: the outlined rooms at publish time (rooms without an outline are not copied).
-- apply_venue_layout(): writes an accepted drawing proposal (AI draft, venue-drawing phase 4) in one transaction. It
--   only moves and rotates existing tables, sets room outlines and the pitch, and inserts new tables: it never deletes
--   anything and never changes an existing table's name, shape or seat count (seat assignments and pins survive).
--
-- Access model as in the earlier migrations: browser roles get nothing.

alter table public.venue_table
  add column rotation smallint not null default 0,
  add constraint venue_table_rotation check (rotation between 0 and 359);

alter table public.venue_room
  add column outline_x double precision,
  add column outline_y double precision,
  add column outline_w double precision,
  add column outline_h double precision,
  add constraint venue_room_outline check (
    (outline_x is null and outline_y is null and outline_w is null and outline_h is null)
    or (
      outline_x between 0 and 1
      and outline_y between 0 and 1
      and outline_w > 0 and outline_w <= 1
      and outline_h > 0 and outline_h <= 1
    )
  );

alter table public.venue_plan
  add column chair_pitch double precision not null default 0.035,
  add constraint venue_plan_chair_pitch check (chair_pitch between 0.005 and 0.2);

alter table public.seating_snapshot
  add column chair_pitch double precision,
  add constraint seating_snapshot_chair_pitch check (chair_pitch is null or chair_pitch between 0.005 and 0.2);

alter table public.seating_snapshot_table
  add column rotation smallint,
  add constraint seating_snapshot_table_rotation check (rotation is null or rotation between 0 and 359);

create table public.seating_snapshot_room (
  id bigint generated always as identity primary key,
  snapshot_id bigint not null references public.seating_snapshot (id) on delete cascade,
  room_name text not null,
  outline_x double precision not null,
  outline_y double precision not null,
  outline_w double precision not null,
  outline_h double precision not null
);

comment on table public.seating_snapshot_room is
  'Outline of a room at publish time (only rooms that had one), so a snapshot draws without the live venue.';

create index seating_snapshot_room_snapshot_id_idx on public.seating_snapshot_room (snapshot_id);

alter table public.seating_snapshot_room enable row level security;
revoke all on table public.seating_snapshot_room from anon, authenticated;

-- Same signature, lock and return value as before; also copies the rotation, the venue's chair pitch (the default
-- when there is no plan) and the outlined rooms.
create or replace function public.publish_seating()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_snapshot_id bigint;
  v_pitch double precision;
begin
  perform pg_advisory_xact_lock(3003);

  select chair_pitch into v_pitch from public.venue_plan limit 1;

  insert into public.seating_snapshot (chair_pitch) values (coalesce(v_pitch, 0.035)) returning id into v_snapshot_id;

  insert into public.seating_snapshot_room (snapshot_id, room_name, outline_x, outline_y, outline_w, outline_h)
  select v_snapshot_id, r.name, r.outline_x, r.outline_y, r.outline_w, r.outline_h
    from public.venue_room as r
    where r.outline_x is not null;

  with copied_tables as (
    insert into public.seating_snapshot_table
      (snapshot_id, table_id, room_name, name, seat_count, shape, pos_x, pos_y, rotation)
    select v_snapshot_id, t.id, r.name, t.name, t.seat_count, t.shape, t.pos_x, t.pos_y, t.rotation
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

-- p_layout = {
--   "tables":    [{ "id", "x", "y", "rotation" }],                                  existing tables: move + rotate
--   "newTables": [{ "roomId", "name", "seatCount", "shape", "x", "y", "rotation" }], inserted
--   "rooms":     [{ "id", "outline": { "x", "y", "width", "height" } | null }],     outline set or cleared
--   "chairPitch": number | null                                                     null = unchanged
-- }
-- Raises TABLE_NOT_FOUND, ROOM_NOT_FOUND, DUPLICATE_NAME, TOO_MANY_TABLES (more than p_max_tables afterwards) or
-- NO_PLAN (a pitch without a plan); check violations (values out of range) abort with their own error. Any error
-- leaves everything as it was.
create function public.apply_venue_layout(p_layout jsonb, p_max_tables integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_outline jsonb;
  v_pitch double precision;
begin
  perform pg_advisory_xact_lock(3003);

  for v_item in select * from jsonb_array_elements(coalesce(p_layout -> 'tables', '[]'::jsonb)) loop
    update public.venue_table
      set pos_x = (v_item ->> 'x')::double precision,
          pos_y = (v_item ->> 'y')::double precision,
          rotation = (v_item ->> 'rotation')::smallint
      where id = (v_item ->> 'id')::bigint;
    if not found then
      raise exception 'TABLE_NOT_FOUND' using errcode = 'P0001';
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_layout -> 'rooms', '[]'::jsonb)) loop
    v_outline := v_item -> 'outline';
    if v_outline is null or jsonb_typeof(v_outline) = 'null' then
      update public.venue_room
        set outline_x = null, outline_y = null, outline_w = null, outline_h = null
        where id = (v_item ->> 'id')::bigint;
    else
      update public.venue_room
        set outline_x = (v_outline ->> 'x')::double precision,
            outline_y = (v_outline ->> 'y')::double precision,
            outline_w = (v_outline ->> 'width')::double precision,
            outline_h = (v_outline ->> 'height')::double precision
        where id = (v_item ->> 'id')::bigint;
    end if;
    if not found then
      raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001';
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_layout -> 'newTables', '[]'::jsonb)) loop
    if not exists (select 1 from public.venue_room where id = (v_item ->> 'roomId')::bigint) then
      raise exception 'ROOM_NOT_FOUND' using errcode = 'P0001';
    end if;
    begin
      insert into public.venue_table (room_id, name, seat_count, shape, pos_x, pos_y, rotation)
      values (
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

  if (select count(*) from public.venue_table) > p_max_tables then
    raise exception 'TOO_MANY_TABLES' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_layout -> 'chairPitch') = 'number' then
    v_pitch := (p_layout ->> 'chairPitch')::double precision;
    -- venue_plan is a singleton; the always-true WHERE satisfies pg-safeupdate.
    update public.venue_plan set chair_pitch = v_pitch where true;
    if not found then
      raise exception 'NO_PLAN' using errcode = 'P0001';
    end if;
  end if;
end;
$$;

comment on function public.apply_venue_layout (jsonb, integer) is
  'Applies an accepted drawing proposal atomically: moves/rotates tables, sets outlines and pitch, adds tables; never deletes.';

revoke execute on function public.apply_venue_layout (jsonb, integer) from public, anon, authenticated;
grant execute on function public.apply_venue_layout (jsonb, integer) to service_role;
