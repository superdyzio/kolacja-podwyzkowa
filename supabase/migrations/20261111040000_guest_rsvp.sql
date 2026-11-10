-- guest-rsvp-menu (S-25; PRD v2 FR-039, US-07): before the event a guest confirms attendance and picks one dish from
-- the options the client set for the event, until a deadline; the client answers for any guest at any time; client and
-- venue see the counts. „Lokal udostępnia, klient wybiera”: the options are menu items AVAILABLE in the event (S-16).
--
-- Additive: every existing event starts with RSVP off (rsvp_deadline null); nothing else changes.
--
-- Attendance has ONE source of truth: guest.is_absent (v1; the draw and the publish already honour it). A „no” marks
-- the guest absent, a „yes” present; guest_rsvp only records THAT the guest answered, the dish, by whom and when.
-- Counts derive from both: absent → not coming; present and answered → coming; present, no answer → no answer.

-- 1. The deadline: null = RSVP off; set = on, open while now() < rsvp_deadline (afterwards read-only for guests). ----

alter table public.event add column rsvp_deadline timestamptz;

comment on column public.event.rsvp_deadline is
  'guest-rsvp-menu: null = RSVP off; set = guests answer until this instant (later read-only; the client edits always).';

-- 2. The client's options: menu items of the event's restaurant (shown to guests while the event's menu offers them).

create table public.event_rsvp_option (
  event_id integer not null,
  restaurant_id integer not null,
  menu_item_id integer not null,
  primary key (event_id, menu_item_id),
  constraint event_rsvp_option_event_fkey foreign key (event_id, restaurant_id)
    references public.event (id, restaurant_id) on delete cascade,
  constraint event_rsvp_option_menu_item_fkey foreign key (restaurant_id, menu_item_id)
    references public.menu_item (restaurant_id, id) on delete cascade
);

create index event_rsvp_option_menu_item_idx on public.event_rsvp_option (restaurant_id, menu_item_id);

alter table public.event_rsvp_option enable row level security;
revoke all on table public.event_rsvp_option from anon, authenticated;

comment on table public.event_rsvp_option is
  'guest-rsvp-menu: the dishes guests pick from (the client''s choice among the items the event''s menu offers).';

-- 3. The answers: one row per guest who answered (or whose answer the client entered). ----------------------------

create table public.guest_rsvp (
  guest_id bigint primary key,
  event_id integer not null,
  restaurant_id integer not null,
  menu_item_id integer,
  answered_by text not null check (answered_by in ('guest', 'organizer')),
  answered_at timestamptz not null default now(),
  constraint guest_rsvp_guest_fkey foreign key (event_id, guest_id)
    references public.guest (event_id, id) on delete cascade,
  constraint guest_rsvp_event_fkey foreign key (event_id, restaurant_id)
    references public.event (id, restaurant_id) on delete cascade,
  constraint guest_rsvp_menu_item_fkey foreign key (restaurant_id, menu_item_id)
    references public.menu_item (restaurant_id, id) on delete set null (menu_item_id)
);

create index guest_rsvp_event_idx on public.guest_rsvp (event_id);
create index guest_rsvp_menu_item_idx on public.guest_rsvp (restaurant_id, menu_item_id);

alter table public.guest_rsvp enable row level security;
revoke all on table public.guest_rsvp from anon, authenticated;

comment on table public.guest_rsvp is
  'guest-rsvp-menu: that a guest answered, the chosen dish (null = none or deleted), who answered and when. '
  'Attendance itself is guest.is_absent.';

-- 4. Absence changed elsewhere (the client's guest list): the existing answer is now the organizer's decision. -----
-- save_guest_rsvp updates is_absent BEFORE it writes the answer row, so its own answers keep their author.

create function public.guest_rsvp_absence_by_organizer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.guest_rsvp
  set answered_by = 'organizer', answered_at = now()
  where guest_id = new.id;
  return null;
end;
$$;

revoke execute on function public.guest_rsvp_absence_by_organizer () from public, anon, authenticated;

create trigger guest_rsvp_absence_by_organizer
after update of is_absent on public.guest
for each row
when (old.is_absent is distinct from new.is_absent)
execute function public.guest_rsvp_absence_by_organizer();

-- 5. The guest's own RSVP for the phone's poll (one round trip; both the 204 and the 200 path call it). -----------
-- Null when RSVP is off or the guest is not of that (non-template) event. `open` is decided here with the database's
-- clock. Options: the client's options the event's menu offers NOW (full → every option, reduced → also chosen in
-- event_menu_item, off → none), names and courses only — never prices or ids. Unordered (the app sorts).

create function public.guest_rsvp_state(p_event_id integer, p_guest_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'deadline', e.rsvp_deadline,
    'open', now() < e.rsvp_deadline,
    'absent', g.is_absent,
    'answered', r.guest_id is not null,
    'answeredBy', r.answered_by,
    'dish', m.name,
    'options', coalesce((
      select jsonb_agg(jsonb_build_object('name', item.name, 'course', item.course))
      from public.event_rsvp_option o
      join public.menu_item item on item.id = o.menu_item_id and item.restaurant_id = o.restaurant_id
      where o.event_id = e.id
        and (
          e.menu_mode = 'full'
          or (
            e.menu_mode = 'reduced'
            and exists (
              select 1 from public.event_menu_item emi
              where emi.event_id = e.id and emi.menu_item_id = o.menu_item_id
            )
          )
        )
    ), '[]'::jsonb)
  )
  from public.event e
  join public.guest g on g.id = p_guest_id and g.event_id = e.id
  left join public.guest_rsvp r on r.guest_id = g.id
  left join public.menu_item m on m.id = r.menu_item_id
  where e.id = p_event_id and not e.is_template and e.rsvp_deadline is not null;
$$;

revoke execute on function public.guest_rsvp_state (integer, bigint) from public, anon, authenticated;

comment on function public.guest_rsvp_state (integer, bigint) is
  'guest-rsvp-menu: the guest''s own RSVP (deadline, open, absent, answered, author, dish, offered options) or null.';

-- 6. The one writer of answers. p_by 'guest' (the guest's link: only while open, an answer required) or 'organizer'
-- (the client or the staff: always; null = „no answer”). A dish (with „yes” only) must be one of the options the
-- event's menu offers now, matched by name in any letter case. Order: is_absent first, then the answer row (the
-- trigger of step 4 must not overwrite the author). The event row is locked FOR SHARE, so a guest's save never lands
-- after a committed close. Raises INVALID_ANSWER, EVENT_NOT_FOUND, GUEST_NOT_FOUND, RSVP_CLOSED, DISH_NOT_OFFERED.

create function public.save_guest_rsvp(
  p_event_id integer,
  p_guest_id bigint,
  p_attending boolean,
  p_dish text,
  p_by text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_restaurant integer;
  v_deadline timestamptz;
  v_mode text;
  v_item integer;
begin
  if p_by is null or p_by not in ('guest', 'organizer') or (p_by = 'guest' and p_attending is null)
    or (p_dish is not null and p_attending is distinct from true) then
    raise exception 'INVALID_ANSWER' using errcode = 'P0001';
  end if;

  select e.restaurant_id, e.rsvp_deadline, e.menu_mode into v_restaurant, v_deadline, v_mode
  from public.event e
  where e.id = p_event_id and not e.is_template
  for share;
  if v_restaurant is null then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.guest where id = p_guest_id and event_id = p_event_id) then
    raise exception 'GUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_by = 'guest' and (v_deadline is null or now() >= v_deadline) then
    raise exception 'RSVP_CLOSED' using errcode = 'P0001';
  end if;

  if p_dish is not null then
    select item.id into v_item
    from public.event_rsvp_option o
    join public.menu_item item on item.id = o.menu_item_id and item.restaurant_id = o.restaurant_id
    where o.event_id = p_event_id
      and lower(item.name) = lower(btrim(p_dish))
      and (
        v_mode = 'full'
        or (
          v_mode = 'reduced'
          and exists (
            select 1 from public.event_menu_item emi
            where emi.event_id = p_event_id and emi.menu_item_id = o.menu_item_id
          )
        )
      );
    if v_item is null then
      raise exception 'DISH_NOT_OFFERED' using errcode = 'P0001';
    end if;
  end if;

  update public.guest
  set is_absent = coalesce(not p_attending, false)
  where id = p_guest_id and event_id = p_event_id;

  if p_attending is null then
    delete from public.guest_rsvp where guest_id = p_guest_id;
  else
    insert into public.guest_rsvp (guest_id, event_id, restaurant_id, menu_item_id, answered_by, answered_at)
    values (p_guest_id, p_event_id, v_restaurant, v_item, p_by, now())
    on conflict (guest_id) do update
      set menu_item_id = excluded.menu_item_id,
          answered_by = excluded.answered_by,
          answered_at = excluded.answered_at;
  end if;
end;
$$;

revoke execute on function public.save_guest_rsvp (integer, bigint, boolean, text, text)
  from public, anon, authenticated;

comment on function public.save_guest_rsvp (integer, bigint, boolean, text, text) is
  'guest-rsvp-menu: saves a guest''s answer (attendance = guest.is_absent, the dish among the offered options).';

-- 7. Replaces the client's options in one transaction. Every item must belong to the event's restaurant (whether the
-- event's menu offers it is the app's check, against the same read the client saw). Raises EVENT_NOT_FOUND,
-- ITEM_NOT_FOUND.

create function public.set_event_rsvp_options(p_event_id integer, p_item_ids integer[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_restaurant integer;
  v_ids integer[] := coalesce(p_item_ids, '{}');
begin
  select e.restaurant_id into v_restaurant
  from public.event e
  where e.id = p_event_id and not e.is_template
  for update;
  if v_restaurant is null then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from unnest(v_ids) as wanted(id)
    where not exists (
      select 1 from public.menu_item m where m.id = wanted.id and m.restaurant_id = v_restaurant
    )
  ) then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;
  delete from public.event_rsvp_option where event_id = p_event_id;
  insert into public.event_rsvp_option (event_id, restaurant_id, menu_item_id)
  select distinct p_event_id, v_restaurant, wanted.id from unnest(v_ids) as wanted(id);
end;
$$;

revoke execute on function public.set_event_rsvp_options (integer, integer[]) from public, anon, authenticated;

comment on function public.set_event_rsvp_options (integer, integer[]) is
  'guest-rsvp-menu: replaces the dishes guests pick from (items of the event''s restaurant).';

-- 8. „Zamknij teraz”: the deadline becomes the EARLIER of the app's and the database's clocks, so the app (the board's
-- `open`) and the database (guest_rsvp_state, save_guest_rsvp) both see the answers closed at once whatever their
-- skew. False for an unknown event or a template.

create function public.close_event_rsvp(p_event_id integer, p_now timestamptz)
returns boolean
language sql
set search_path = ''
as $$
  with closed as (
    update public.event
    set rsvp_deadline = least(p_now, now())
    where id = p_event_id and not is_template
    returning id
  )
  select exists (select 1 from closed);
$$;

revoke execute on function public.close_event_rsvp (integer, timestamptz) from public, anon, authenticated;

comment on function public.close_event_rsvp (integer, timestamptz) is
  'guest-rsvp-menu: closes the answers now (the earlier of the app''s and the database''s clocks).';
