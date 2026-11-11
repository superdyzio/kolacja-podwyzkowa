-- venue-templates (S-15; PRD v2 FR-030, US-06, US-09): a restaurant's venue templates.
--
-- A template is an `event` row with is_template = true: the room layout (plan image, rooms, tables, outlines,
-- rotation, chair pitch) lives in the same venue tables as an event's, so the existing venue editor and its routes
-- edit it through the panel (a template dispatcher allowing only the venue routes). A template has no guests, no
-- questions and no seating; its link keys come from the column defaults like every event's but are NEVER shown and
-- NEVER open anything: every reader that resolves a key, lists, counts or opens an event by id filters
-- is_template = false (src/lib/access/resolve.ts, findEventMembership, the event list and card, the client
-- dispatcher, platform_restaurant_list, record_support_access, npm run links). Hook for S-26 (retention, export): a
-- template has an event_date (the NOT NULL default = the day it was made), so retention and export MUST filter
-- is_template = false too — a template is never deleted or anonymised as a past event.
--
-- Copies are database functions, ONE transaction each, so the plan blob never leaves Postgres and the template and the
-- event share no rows afterwards: create_venue_template (from scratch or from an event of the same restaurant),
-- create_event_from_template, apply_venue_template („Zaktualizuj z szablonu”: replaces an event's venue with the
-- template's, matching rooms and tables by lower(name), keeping a matched table's row — its seats, pins and order
-- lines — except seats above a lower seat count). Additive: a column with a default, a check, an index, two replaced
-- functions with unchanged signatures and new functions. The readers select the column, so this migration must reach
-- the database BEFORE the code.

-- 1. The marker --------------------------------------------------------------------------------------------------------

alter table public.event
  add column is_template boolean not null default false,
  add constraint event_template_no_guest_access check (not is_template or not guest_access_enabled);

comment on column public.event.is_template is
  'venue-templates: true = a restaurant''s venue template (only its venue rows are used; never opens through a key, never listed or counted as an event; retention/export must skip it).';

create index event_restaurant_template_idx on public.event (restaurant_id) where is_template;

-- 2. Counters and the admin's support path leave templates out ----------------------------------------------------------

create or replace function public.platform_restaurant_list()
returns table (
  id integer,
  name text,
  created_at timestamptz,
  disabled_at timestamptz,
  event_count integer,
  member_count integer,
  owners jsonb
)
language sql
stable
set search_path = ''
as $$
  select
    r.id,
    r.name,
    r.created_at,
    r.disabled_at,
    (select count(*)::integer from public.event e where e.restaurant_id = r.id and not e.is_template),
    (select count(*)::integer from public.restaurant_member m where m.restaurant_id = r.id),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'accountId', a.id,
            'email', a.email,
            'displayName', a.display_name,
            'hasPassword', a.password_hash is not null
          )
          order by a.email
        )
        from public.restaurant_member m
        join public.staff_account a on a.id = m.account_id
        where m.restaurant_id = r.id and m.role = 'owner'
      ),
      '[]'::jsonb
    )
  from public.restaurant r
  order by r.id;
$$;

create or replace function public.record_support_access(
  p_session_id bigint,
  p_restaurant_id integer,
  p_event_id integer,
  p_method text,
  p_path text
)
returns table (
  restaurant_id integer,
  restaurant_name text,
  restaurant_disabled boolean,
  event_id integer,
  event_name text,
  grant_id bigint,
  reason text,
  started_at timestamptz,
  expires_at timestamptz
)
language plpgsql
set search_path = ''
as $$
declare
  v_restaurant_id integer;
  v_event_name text;
  v_grant public.support_grant%rowtype;
  v_email text;
  v_name text;
  v_restaurant_name text;
  v_disabled boolean;
begin
  if (p_restaurant_id is null) = (p_event_id is null) then
    return;
  end if;
  if p_event_id is not null then
    -- venue-templates: a template is never an event (the template guard opens it through its restaurant).
    select e.restaurant_id, e.name into v_restaurant_id, v_event_name
    from public.event e where e.id = p_event_id and not e.is_template;
    if v_restaurant_id is null then
      return;
    end if;
  else
    v_restaurant_id := p_restaurant_id;
  end if;

  select g.* into v_grant
  from public.support_grant g
  join public.staff_session s on s.id = g.session_id
  join public.staff_account a on a.id = g.account_id
  where g.session_id = p_session_id
    and g.restaurant_id = v_restaurant_id
    and g.expires_at > now()
    and s.expires_at > now()
    and a.is_platform_admin;
  if v_grant.id is null then
    return;
  end if;

  select a.email, a.display_name into v_email, v_name from public.staff_account a where a.id = v_grant.account_id;
  select r.name, r.disabled_at is not null into v_restaurant_name, v_disabled
  from public.restaurant r where r.id = v_restaurant_id;

  insert into public.support_log (
    restaurant_id, grant_id, account_id, admin_email, admin_name, kind, method, path, event_id, event_name
  )
  values (
    v_restaurant_id, v_grant.id, v_grant.account_id, v_email, v_name, 'access', p_method, p_path,
    p_event_id, v_event_name
  );

  return query select
    v_restaurant_id, v_restaurant_name, v_disabled, p_event_id, v_event_name,
    v_grant.id, v_grant.reason, v_grant.started_at, v_grant.expires_at;
end;
$$;

-- 3. Copying a venue ---------------------------------------------------------------------------------------------------

-- Copies the plan (with the chair pitch), the rooms (with outlines) and the tables (with rotation) of p_from into
-- p_to, whose venue is empty. Internal: called by the functions below inside their transaction.
create function public.copy_event_venue(p_from integer, p_to integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room record;
  v_new_room bigint;
begin
  insert into public.venue_plan (event_id, mime_type, byte_size, image_base64, chair_pitch)
  select p_to, p.mime_type, p.byte_size, p.image_base64, p.chair_pitch
  from public.venue_plan p where p.event_id = p_from;

  for v_room in select r.* from public.venue_room r where r.event_id = p_from order by r.id loop
    insert into public.venue_room (event_id, name, outline_x, outline_y, outline_w, outline_h)
    values (p_to, v_room.name, v_room.outline_x, v_room.outline_y, v_room.outline_w, v_room.outline_h)
    returning id into v_new_room;
    insert into public.venue_table (event_id, room_id, name, seat_count, shape, pos_x, pos_y, rotation)
    select p_to, v_new_room, t.name, t.seat_count, t.shape, t.pos_x, t.pos_y, t.rotation
    from public.venue_table t where t.event_id = p_from and t.room_id = v_room.id order by t.id;
  end loop;
end;
$$;

comment on function public.copy_event_venue (integer, integer) is
  'venue-templates (internal): copies one event row''s venue (plan, rooms, tables, drawing) into another''s empty venue.';

-- A new template of the restaurant: empty, or a copy of the venue of p_source_event_id (an event or a template of the
-- SAME restaurant). → the template's id. RESTAURANT_NOT_FOUND, SOURCE_NOT_FOUND.
create function public.create_venue_template(p_restaurant_id integer, p_name text, p_source_event_id integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_id integer;
begin
  perform 1 from public.restaurant where id = p_restaurant_id;
  if not found then
    raise exception 'RESTAURANT_NOT_FOUND';
  end if;
  if p_source_event_id is not null then
    perform 1 from public.event where id = p_source_event_id and restaurant_id = p_restaurant_id;
    if not found then
      raise exception 'SOURCE_NOT_FOUND';
    end if;
    -- Venue writers of the source take the same lock: the copy sees one consistent venue.
    perform pg_advisory_xact_lock(3003, p_source_event_id);
  end if;
  insert into public.event (restaurant_id, name, is_template)
  values (p_restaurant_id, p_name, true)
  returning id into v_id;
  if p_source_event_id is not null then
    perform public.copy_event_venue(p_source_event_id, v_id);
  end if;
  return v_id;
end;
$$;

comment on function public.create_venue_template (integer, text, integer) is
  'venue-templates: a new venue template of the restaurant, empty or copied from an event of the same restaurant.';

-- A new event of the restaurant with the template's venue. → the event's id. TEMPLATE_NOT_FOUND.
create function public.create_event_from_template(
  p_restaurant_id integer,
  p_template_id integer,
  p_name text,
  p_date date,
  p_expected_guests integer
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_id integer;
begin
  perform 1 from public.event where id = p_template_id and restaurant_id = p_restaurant_id and is_template;
  if not found then
    raise exception 'TEMPLATE_NOT_FOUND';
  end if;
  perform pg_advisory_xact_lock(3003, p_template_id);
  insert into public.event (restaurant_id, name, event_date, expected_guests)
  values (p_restaurant_id, p_name, p_date, p_expected_guests)
  returning id into v_id;
  perform public.copy_event_venue(p_template_id, v_id);
  return v_id;
end;
$$;

comment on function public.create_event_from_template (integer, integer, text, date, integer) is
  'venue-templates: a new event of the restaurant with a copy of the template''s venue.';

-- „Zaktualizuj z szablonu”: the event's venue becomes the template's (same restaurant). Rooms and tables are matched
-- by lower(name) (their unique key): a matched room or table is updated in place (a table keeps its row, so its seats,
-- pins and order lines stay; seats above a lower seat count go through unseat_beyond_seat_count), an event table or
-- room missing from the template is deleted (its seats with it), a new one is added; the plan and the chair pitch are
-- replaced 1:1 (a template without a plan removes the event's). Published snapshots are untouched: the TV and phones
-- change after the next publish. → jsonb counts. EVENT_NOT_FOUND, TEMPLATE_NOT_FOUND.
create function public.apply_venue_template(p_event_id integer, p_template_id integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_restaurant integer;
  v_before integer;
  v_after integer;
  v_rooms_added integer := 0;
  v_rooms_removed integer := 0;
  v_tables_added integer := 0;
  v_tables_removed integer := 0;
  v_tables_kept integer := 0;
  v_room record;
  v_table record;
  v_room_id bigint;
begin
  select e.restaurant_id into v_restaurant from public.event e where e.id = p_event_id and not e.is_template;
  if v_restaurant is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  perform 1 from public.event e where e.id = p_template_id and e.restaurant_id = v_restaurant and e.is_template;
  if not found then
    raise exception 'TEMPLATE_NOT_FOUND';
  end if;
  -- The event first, then the template (nothing takes them the other way round).
  perform pg_advisory_xact_lock(3003, p_event_id);
  perform pg_advisory_xact_lock(3003, p_template_id);

  select count(*) into v_before from public.seat_assignment where event_id = p_event_id;

  for v_room in select r.* from public.venue_room r where r.event_id = p_template_id order by r.id loop
    update public.venue_room
    set name = v_room.name,
        outline_x = v_room.outline_x,
        outline_y = v_room.outline_y,
        outline_w = v_room.outline_w,
        outline_h = v_room.outline_h
    where event_id = p_event_id and lower(name) = lower(v_room.name);
    if not found then
      insert into public.venue_room (event_id, name, outline_x, outline_y, outline_w, outline_h)
      values (p_event_id, v_room.name, v_room.outline_x, v_room.outline_y, v_room.outline_w, v_room.outline_h);
      v_rooms_added := v_rooms_added + 1;
    end if;
  end loop;

  delete from public.venue_table t
  where t.event_id = p_event_id
    and not exists (
      select 1 from public.venue_table s where s.event_id = p_template_id and lower(s.name) = lower(t.name)
    );
  get diagnostics v_tables_removed = row_count;

  for v_table in
    select t.*, r.name as room_name
    from public.venue_table t join public.venue_room r on r.id = t.room_id
    where t.event_id = p_template_id
    order by t.id
  loop
    select r.id into v_room_id from public.venue_room r
    where r.event_id = p_event_id and lower(r.name) = lower(v_table.room_name);
    update public.venue_table
    set room_id = v_room_id,
        name = v_table.name,
        seat_count = v_table.seat_count,
        shape = v_table.shape,
        pos_x = v_table.pos_x,
        pos_y = v_table.pos_y,
        rotation = v_table.rotation
    where event_id = p_event_id and lower(name) = lower(v_table.name);
    if found then
      v_tables_kept := v_tables_kept + 1;
    else
      insert into public.venue_table (event_id, room_id, name, seat_count, shape, pos_x, pos_y, rotation)
      values (
        p_event_id, v_room_id, v_table.name, v_table.seat_count, v_table.shape, v_table.pos_x, v_table.pos_y,
        v_table.rotation
      );
      v_tables_added := v_tables_added + 1;
    end if;
  end loop;

  delete from public.venue_room r
  where r.event_id = p_event_id
    and not exists (
      select 1 from public.venue_room s where s.event_id = p_template_id and lower(s.name) = lower(r.name)
    );
  get diagnostics v_rooms_removed = row_count;

  delete from public.venue_plan where event_id = p_event_id;
  insert into public.venue_plan (event_id, mime_type, byte_size, image_base64, chair_pitch)
  select p_event_id, p.mime_type, p.byte_size, p.image_base64, p.chair_pitch
  from public.venue_plan p where p.event_id = p_template_id;

  select count(*) into v_after from public.seat_assignment where event_id = p_event_id;

  return jsonb_build_object(
    'seatsBefore', v_before,
    'seatsAfter', v_after,
    'roomsAdded', v_rooms_added,
    'roomsRemoved', v_rooms_removed,
    'tablesAdded', v_tables_added,
    'tablesRemoved', v_tables_removed,
    'tablesKept', v_tables_kept
  );
end;
$$;

comment on function public.apply_venue_template (integer, integer) is
  'venue-templates: „Zaktualizuj z szablonu” — replaces an event''s venue with its restaurant''s template (match by name).';

revoke execute on function public.copy_event_venue (integer, integer) from public, anon, authenticated;
revoke execute on function public.create_venue_template (integer, text, integer) from public, anon, authenticated;
revoke execute on function public.create_event_from_template (integer, integer, text, date, integer)
  from public, anon, authenticated;
revoke execute on function public.apply_venue_template (integer, integer) from public, anon, authenticated;
