-- S-21b event-waiter-access: the per-event waiter („kelner na imprezę”; PRD v2 FR-023 per-event part, FR-029, US-08).
--
-- An owner or a manager adds a waiter for ONE event on the panel's event card: a display name, and the server hands out
-- once a one-time link and a short code. Neither is an account: this table is its own (never restaurant_member, never
-- staff_account). The link token, the code's secret and the session token redeemed from them are stored ONLY as
-- SHA-256 hex; a leaked row opens nothing by itself.
--
--   expires_at   noon Europe/Warsaw of the day after event_date (the end of the floor window, FR-029), fixed at
--                creation; the app also requires the live window on every request, so moving the event's date never
--                extends access.
--   link_hash / code_hash   set at creation; BOTH cleared by the one redemption (link and code are consumed together,
--                the app's conditional UPDATE makes exactly one tap win).
--   session_hash the redeemed session (one per waiter: one-time); logout clears it, so the waiter is out until a new
--                waiter row is added.
--   redeemed_at  when the link or the code was used.
-- Revoke = delete the row: its session dies with it. The rows cascade with the event (composite FK through
-- event(id, restaurant_id), so a waiter can never point at another restaurant's event).
--
-- add_event_waiter: under a lock on the event row (same restaurant, never a template) refuses an archived event or one
--   whose window is already over (EVENT_CLOSED), an event that is not this restaurant's (EVENT_NOT_FOUND) and the
--   per-event limit (TOO_MANY); computes expires_at in SQL (DST-correct) and inserts the row.
--
-- Access model as in the earlier migrations: RLS on, nothing granted to anon / authenticated, service role only.
-- Additive: one table, one function.

create table public.event_waiter (
  id bigint generated always as identity primary key,
  event_id integer not null,
  restaurant_id integer not null,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_by bigint references public.staff_account (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  link_hash text check (link_hash ~ '^[0-9a-f]{64}$'),
  code_hash text check (code_hash ~ '^[0-9a-f]{64}$'),
  session_hash text check (session_hash ~ '^[0-9a-f]{64}$'),
  redeemed_at timestamptz,
  constraint event_waiter_event_fkey foreign key (event_id, restaurant_id)
    references public.event (id, restaurant_id) on delete cascade,
  -- Unused: both secrets present, no redemption; redeemed: both gone. A session exists only after a redemption.
  constraint event_waiter_one_time check (
    (redeemed_at is null) = (link_hash is not null and code_hash is not null)
    and (session_hash is null or redeemed_at is not null)
  )
);

create unique index event_waiter_link_hash_key on public.event_waiter (link_hash);
create unique index event_waiter_session_hash_key on public.event_waiter (session_hash);
create index event_waiter_event_idx on public.event_waiter (event_id);

comment on table public.event_waiter is
  'Per-event waiters (S-21b): a one-time link and code (SHA-256 only) for one event''s floor until noon after it.';

alter table public.event_waiter enable row level security;
revoke all on table public.event_waiter from anon, authenticated;

create function public.add_event_waiter(
  p_event_id integer,
  p_restaurant_id integer,
  p_display_name text,
  p_created_by bigint,
  p_link_hash text,
  p_code_hash text,
  p_max integer
)
returns table (waiter_id bigint, expires_at timestamptz)
language plpgsql
set search_path = ''
as $$
declare
  v_date date;
  v_archived timestamptz;
  v_expires timestamptz;
  v_count integer;
  v_id bigint;
begin
  select e.event_date, e.archived_at into v_date, v_archived
  from public.event e
  where e.id = p_event_id and e.restaurant_id = p_restaurant_id and not e.is_template
  for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  -- Noon of the next day in the platform's time zone (the floor window's end).
  v_expires := ((v_date + 1) + time '12:00') at time zone 'Europe/Warsaw';
  if v_archived is not null or v_expires <= now() then
    raise exception 'EVENT_CLOSED';
  end if;

  select count(*) into v_count from public.event_waiter w where w.event_id = p_event_id;
  if v_count >= p_max then
    raise exception 'TOO_MANY';
  end if;

  insert into public.event_waiter (event_id, restaurant_id, display_name, created_by, expires_at, link_hash, code_hash)
  values (p_event_id, p_restaurant_id, p_display_name, p_created_by, v_expires, p_link_hash, p_code_hash)
  returning id into v_id;

  return query select v_id, v_expires;
end;
$$;

comment on function public.add_event_waiter (integer, integer, text, bigint, text, text, integer) is
  'Adds a per-event waiter (S-21b) under the event row lock: EVENT_NOT_FOUND, EVENT_CLOSED (archived or window over), TOO_MANY.';

revoke execute on function public.add_event_waiter (integer, integer, text, bigint, text, text, integer)
  from public, anon, authenticated;
