-- menu-catalog-courses (S-16; FR-037, FR-027, US-07): the restaurant's menu catalog with courses, the menu of each
-- event (none / full / reduced) and the course of every order line. Additive: every existing event gets
-- menu_mode = 'off' (free-text orders exactly as before), new events default to 'full' (which behaves like 'off' while
-- the restaurant has no catalog). Order lines keep their own name, course and price (a snapshot): deleting or
-- changing a catalog item never touches them.

-- The catalog: one row per dish or drink of a restaurant, unique by name in any letter case.
create table public.menu_item (
  id integer generated always as identity primary key,
  restaurant_id integer not null references public.restaurant (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  course text not null check (course in ('starter', 'soup', 'main', 'dessert', 'drinks')),
  price_grosze integer not null check (price_grosze between 0 and 10000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_item_restaurant_id_id_key unique (restaurant_id, id)
);

create unique index menu_item_restaurant_name_key on public.menu_item (restaurant_id, lower(name));

alter table public.menu_item enable row level security;
revoke all on table public.menu_item from anon, authenticated;

-- The menu of an event: off = free text (v1), full = the whole catalog, reduced = the items in event_menu_item.
alter table public.event
  add column menu_mode text not null default 'off' check (menu_mode in ('off', 'full', 'reduced'));
alter table public.event alter column menu_mode set default 'full';

alter table public.event add constraint event_id_restaurant_id_key unique (id, restaurant_id);

-- The reduced menu's items. Both composite keys keep an item of another restaurant out of an event.
create table public.event_menu_item (
  event_id integer not null,
  restaurant_id integer not null,
  menu_item_id integer not null,
  primary key (event_id, menu_item_id),
  constraint event_menu_item_event_fkey foreign key (event_id, restaurant_id)
    references public.event (id, restaurant_id) on delete cascade,
  constraint event_menu_item_menu_item_fkey foreign key (restaurant_id, menu_item_id)
    references public.menu_item (restaurant_id, id) on delete cascade
);

create index event_menu_item_menu_item_idx on public.event_menu_item (restaurant_id, menu_item_id);

alter table public.event_menu_item enable row level security;
revoke all on table public.event_menu_item from anon, authenticated;

-- The course of an order line (null = free text) and the catalog item it came from (null when free text or deleted).
alter table public.order_item
  add column course text check (course is null or course in ('starter', 'soup', 'main', 'dessert', 'drinks')),
  add column menu_item_id integer references public.menu_item (id) on delete set null;

create index order_item_menu_item_idx on public.order_item (menu_item_id);

-- Sets the menu of a (non-template) event in one transaction: the mode and, for 'reduced', exactly the given items
-- (other modes clear the subset). Every item must belong to the event's restaurant. Raises EVENT_NOT_FOUND,
-- INVALID_MODE, ITEM_NOT_FOUND.
create function public.set_event_menu(p_event_id integer, p_mode text, p_item_ids integer[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_restaurant integer;
  v_ids integer[] := coalesce(p_item_ids, '{}');
begin
  if p_mode is null or p_mode not in ('off', 'full', 'reduced') then
    raise exception 'INVALID_MODE';
  end if;
  select e.restaurant_id into v_restaurant
  from public.event e
  where e.id = p_event_id and not e.is_template
  for update;
  if v_restaurant is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if p_mode = 'reduced' and exists (
    select 1
    from unnest(v_ids) as wanted(id)
    where not exists (
      select 1 from public.menu_item m where m.id = wanted.id and m.restaurant_id = v_restaurant
    )
  ) then
    raise exception 'ITEM_NOT_FOUND';
  end if;
  update public.event set menu_mode = p_mode where id = p_event_id;
  delete from public.event_menu_item where event_id = p_event_id;
  if p_mode = 'reduced' then
    insert into public.event_menu_item (event_id, restaurant_id, menu_item_id)
    select distinct p_event_id, v_restaurant, wanted.id from unnest(v_ids) as wanted(id);
  end if;
end;
$$;

revoke execute on function public.set_event_menu (integer, text, integer[]) from public, anon, authenticated;
