-- privacy-retention (S-26; PRD v2 FR-040, US-09, NFR-019): the guests' data of an event disappears N days after the
-- event (the restaurant's setting, default 30, owner only), without any scheduler: the hosting has no background jobs
-- and adding one (cron, EventBridge, pg_cron) is the user's decision. One function does the deletion and decides
-- itself whether an event may lose its guests' data (never a venue template, never before its term); the app calls it
-- (1) before serving anything of an expired event (link keys, panel guards, support mode), (2) from a throttled sweep
-- on panel page views (claim_retention_sweep: one winner per interval across all instances) and (3) from the CLI
-- `npm run retention`.
--
-- Additive and data-preserving: existing restaurants get 30 days, no event is marked purged and nothing is deleted by
-- this migration itself.
--
-- What goes (guest data): every guest of the event (names, diets and notes, absence, RSVP answers, guesses, seats and
-- pins, link keys — through the existing cascades; AI attempts, order lines and pieces keep their rows with the guest
-- set null), the groups, ALL published snapshots (the only copy of names that survives a guest delete:
-- seating_snapshot_seat.guest_name; DELETE, never TRUNCATE — snapshot ids feed the polling tokens), every TV spotlight
-- row (a drawn person's name), the per-event waiters (names) and the free-text notes of order lines; the guests'
-- switch goes off. What stays: the event row (name, date, its client / TV / tablet keys), the venue, the questions, the
-- order lines with dish, course, quantity, price and delivered pieces (the venue's bill, without a person or a note),
-- the drinks, the AI usage counts, the menu and RSVP options and the brand. support_log is never touched (no FK to
-- events; no event or restaurant row is deleted here).
--
-- The rule (Europe/Warsaw days, like event_date): the data is kept through the Nth day after the event and goes once
-- the platform's day is later: event_date + N < today. With N ≥ 1 the earliest purge is at 00:00 two days after the
-- event, always after the floor window (the event's day until noon of the next one).

-- 1. The restaurant's term. -----------------------------------------------------------------------------------------

alter table public.restaurant
  add column guest_retention_days integer not null default 30
    constraint restaurant_guest_retention_days check (guest_retention_days between 1 and 365);

comment on column public.restaurant.guest_retention_days is
  'privacy-retention: the guests'' data of an event is deleted once the Warsaw day is later than event_date + this.';

-- 2. When an event's guest data was deleted (the first time). ------------------------------------------------------

alter table public.event add column guest_data_purged_at timestamptz;

comment on column public.event.guest_data_purged_at is
  'privacy-retention: when the guests'' data of this event was deleted after its term (null = never).';

-- 3. The sweep's state: one row, the last time a sweep was claimed. ---------------------------------------------------

create table public.retention_sweep (
  id smallint primary key default 1 constraint retention_sweep_singleton check (id = 1),
  last_run_at timestamptz
);

insert into public.retention_sweep (id, last_run_at) values (1, null);

alter table public.retention_sweep enable row level security;
revoke all on table public.retention_sweep from anon, authenticated;

comment on table public.retention_sweep is
  'privacy-retention: the lazy sweep''s single row; claim_retention_sweep lets one caller per interval run it.';

-- 4. The rule. --------------------------------------------------------------------------------------------------------

create function public.guest_data_expired(p_event_date date, p_retention_days integer, p_now timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_event_date + p_retention_days < (p_now at time zone 'Europe/Warsaw')::date;
$$;

revoke execute on function public.guest_data_expired (date, integer, timestamptz) from public, anon, authenticated;

comment on function public.guest_data_expired (date, integer, timestamptz) is
  'privacy-retention: true once the Warsaw day of p_now is later than event_date + the retention days.';

-- 5. Is anything of the guests left in the event? (After a purge: only what someone added since.) -----------------

create function public.event_has_guest_data(p_event_id integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.guest where event_id = p_event_id)
    or exists (select 1 from public.guest_group where event_id = p_event_id)
    or exists (select 1 from public.seating_snapshot where event_id = p_event_id)
    or exists (select 1 from public.tv_spotlight where event_id = p_event_id)
    or exists (select 1 from public.event_waiter where event_id = p_event_id)
    or exists (select 1 from public.order_item where event_id = p_event_id and note is not null);
$$;

revoke execute on function public.event_has_guest_data (integer) from public, anon, authenticated;

comment on function public.event_has_guest_data (integer) is
  'privacy-retention: true while the event holds any guest data the purge deletes.';

-- 6. The purge of ONE event (one transaction). ------------------------------------------------------------------------
-- → { status: "not-found" | "kept" | "clean" | "purged", purgedAt, guests, groups, snapshots, spotlight, waiters,
--     notes }. not-found: unknown id or a venue template (never purged); kept: inside its term; clean: purged before
-- and nothing new since (no lock taken); purged: deleted now. Locks like reset_event: (3003, event), (3008, event),
-- then the event row — so a concurrent seating write, AI reservation, guest guess save or reset finishes first.

create function public.purge_event_guest_data(p_event_id integer, p_now timestamptz)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_event record;
  v_guests integer := 0;
  v_groups integer := 0;
  v_snapshots integer := 0;
  v_spotlight integer := 0;
  v_waiters integer := 0;
  v_notes integer := 0;
  v_purged_at timestamptz;
begin
  select e.id, e.event_date, e.guest_data_purged_at, r.guest_retention_days
    into v_event
    from public.event e
    join public.restaurant r on r.id = e.restaurant_id
    where e.id = p_event_id and not e.is_template;
  if not found then
    return jsonb_build_object('status', 'not-found', 'purgedAt', null);
  end if;
  if not public.guest_data_expired(v_event.event_date, v_event.guest_retention_days, p_now) then
    return jsonb_build_object('status', 'kept', 'purgedAt', v_event.guest_data_purged_at);
  end if;
  if v_event.guest_data_purged_at is not null and not public.event_has_guest_data(p_event_id) then
    return jsonb_build_object('status', 'clean', 'purgedAt', v_event.guest_data_purged_at);
  end if;

  perform pg_advisory_xact_lock(3003, p_event_id);
  perform pg_advisory_xact_lock(3008, p_event_id);
  -- Re-read under the row lock: a date or term changed meanwhile decides again.
  select e.id, e.event_date, e.guest_data_purged_at, r.guest_retention_days
    into v_event
    from public.event e
    join public.restaurant r on r.id = e.restaurant_id
    where e.id = p_event_id and not e.is_template
    for update of e;
  if not found then
    return jsonb_build_object('status', 'not-found', 'purgedAt', null);
  end if;
  if not public.guest_data_expired(v_event.event_date, v_event.guest_retention_days, p_now) then
    return jsonb_build_object('status', 'kept', 'purgedAt', v_event.guest_data_purged_at);
  end if;

  delete from public.tv_spotlight where event_id = p_event_id;
  get diagnostics v_spotlight = row_count;
  delete from public.seat_assignment where event_id = p_event_id;
  -- Snapshot tables, rooms and seats (with the published names) go with their snapshot (on delete cascade).
  delete from public.seating_snapshot where event_id = p_event_id;
  get diagnostics v_snapshots = row_count;
  update public.order_item set note = null where event_id = p_event_id and note is not null;
  get diagnostics v_notes = row_count;
  delete from public.event_waiter where event_id = p_event_id;
  get diagnostics v_waiters = row_count;
  delete from public.guest_group where event_id = p_event_id;
  get diagnostics v_groups = row_count;
  -- Cascades: guess, seat_assignment, guest_rsvp; set null: ai_topic, order_item, order_piece guest ids.
  delete from public.guest where event_id = p_event_id;
  get diagnostics v_guests = row_count;

  update public.event
    set guest_data_purged_at = coalesce(guest_data_purged_at, p_now),
        guest_access_enabled = false
    where id = p_event_id
    returning guest_data_purged_at into v_purged_at;

  return jsonb_build_object(
    'status', 'purged',
    'purgedAt', v_purged_at,
    'guests', v_guests,
    'groups', v_groups,
    'snapshots', v_snapshots,
    'spotlight', v_spotlight,
    'waiters', v_waiters,
    'notes', v_notes
  );
end;
$$;

revoke execute on function public.purge_event_guest_data (integer, timestamptz) from public, anon, authenticated;

comment on function public.purge_event_guest_data (integer, timestamptz) is
  'privacy-retention: deletes the guests'' data of one event past its term (never a template); idempotent.';

-- 7. Which events need a purge: past their term, not templates, never purged or with guest data added since. --------
-- p_restaurant_id null = every restaurant (switched-off ones too: retention does not pause); oldest first.

create function public.expired_guest_data_events(p_now timestamptz, p_restaurant_id integer, p_limit integer)
returns table (event_id integer)
language sql
stable
set search_path = ''
as $$
  select e.id
    from public.event e
    join public.restaurant r on r.id = e.restaurant_id
    where not e.is_template
      and (p_restaurant_id is null or e.restaurant_id = p_restaurant_id)
      and public.guest_data_expired(e.event_date, r.guest_retention_days, p_now)
      and (e.guest_data_purged_at is null or public.event_has_guest_data(e.id))
    order by e.event_date, e.id
    limit greatest(coalesce(p_limit, 0), 0);
$$;

revoke execute on function public.expired_guest_data_events (timestamptz, integer, integer)
  from public, anon, authenticated;

comment on function public.expired_guest_data_events (timestamptz, integer, integer) is
  'privacy-retention: ids of events whose guests'' data is past its term and still (or again) there, oldest first.';

-- 8. The sweep's claim: true for exactly one caller per interval. ----------------------------------------------------

create function public.claim_retention_sweep(p_now timestamptz, p_interval_seconds integer)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.retention_sweep
    set last_run_at = p_now
    where id = 1
      and (last_run_at is null or last_run_at <= p_now - make_interval(secs => p_interval_seconds));
  return found;
end;
$$;

revoke execute on function public.claim_retention_sweep (timestamptz, integer) from public, anon, authenticated;

comment on function public.claim_retention_sweep (timestamptz, integer) is
  'privacy-retention: claims the lazy sweep (true) unless another caller did within the interval (false).';
