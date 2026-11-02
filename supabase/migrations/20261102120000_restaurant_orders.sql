-- restaurant-orders: the evening's food order kept by the organizer and a read-only link for the restaurant.
--
-- event.restaurant_key: the restaurant's link key (/r/<key>), same format as the other keys (18 random bytes in
--   base64url = 24 characters). The column default gives the existing event row a key when the column is added and
--   gives one to the row createEvent inserts. „Wymień link” = the app writes a fresh generateAccessKey(); the old link
--   is dead at once. No reset part ever touches it (like the organizer and TV keys).
-- order_item: one line of the order — a dish with its unit price (integer grosze), quantity, optional note and who it
--   is for: a guest (served at the guest's seat in the latest published snapshot), a table (a loose line placed on
--   the table) or nobody yet. Deleting the guest or the table keeps the line, unassigned (on delete set null), so
--   nothing ordered silently disappears. delivered = the organizer ticked it as served.
-- reset_counts / reset_event: replaced with the new part „orders” (every order line deleted; no implications).
--
-- Access model as in the earlier migrations: browser roles get nothing; only the server (service role) reads and
-- writes, with plain inserts, updates and deletes.

alter table public.event
  add column restaurant_key text not null
    default translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_'),
  add constraint event_restaurant_key_format check (restaurant_key ~ '^[A-Za-z0-9_-]{24}$'),
  add constraint event_restaurant_key_distinct check (restaurant_key <> organizer_key and restaurant_key <> tv_key);

create unique index event_restaurant_key_key on public.event (restaurant_key);

comment on column public.event.restaurant_key is
  'Restaurant link key (/r/<key>): 18 random bytes in base64url (24 chars); replaced by „Wymień link”.';

create table public.order_item (
  id bigint generated always as identity primary key,
  event_id smallint not null default 1 references public.event (id) on delete cascade,
  name text not null,
  note text,
  quantity integer not null,
  unit_price_grosze integer not null,
  guest_id bigint references public.guest (id) on delete set null,
  table_id bigint references public.venue_table (id) on delete set null,
  delivered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_item_name_length check (char_length(name) between 1 and 80),
  constraint order_item_note_length check (note is null or char_length(note) between 1 and 120),
  constraint order_item_quantity_range check (quantity between 1 and 99),
  constraint order_item_price_range check (unit_price_grosze between 0 and 10000000),
  constraint order_item_one_place check (num_nonnulls(guest_id, table_id) <= 1)
);

comment on table public.order_item is
  'The evening''s food order: dish, unit price (grosze), quantity, note, for a guest or a table (or nobody), delivered.';

create index order_item_event_id_idx on public.order_item (event_id, id);
create index order_item_guest_id_idx on public.order_item (guest_id);
create index order_item_table_id_idx on public.order_item (table_id);

alter table public.order_item enable row level security;
revoke all on table public.order_item from anon, authenticated;

-- What the reset would remove, per kind (read-only). Raises EVENT_NOT_FOUND. Same as 20261030120000 plus "orders".
create or replace function public.reset_counts(p_event_id smallint)
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
    'orders', (select count(*) from public.order_item where event_id = p_event_id),
    'questions', (select count(*) from public.question where event_id = p_event_id),
    'guestAccessEnabled', v_event.guest_access_enabled
  );
end;
$$;

-- The organizer reset, as in 20261030120000 plus the part "orders" (canonical order: after "venue").
create or replace function public.reset_event(p_event_id smallint, p_parts text[], p_starter_questions jsonb)
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

  perform pg_advisory_xact_lock(3003);
  perform pg_advisory_xact_lock(3008);
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

-- create or replace keeps the earlier grants; repeated so the migration states the access model on its own.
revoke execute on function public.reset_counts (smallint) from public, anon, authenticated;
grant execute on function public.reset_counts (smallint) to service_role;

revoke execute on function public.reset_event (smallint, text[], jsonb) from public, anon, authenticated;
grant execute on function public.reset_event (smallint, text[], jsonb) to service_role;
