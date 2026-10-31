-- S-08 ai-topics-with-limits: AI conversation topics with per-guest and per-evening limits
-- (PRD US-03, FR-016, NFR-005).
--
-- ai_topic: one row per generation ATTEMPT — who asked (a guest or the organizer), the category and the state:
--   'pending' while the AI is being asked, then 'succeeded' or 'failed'. The topic text itself is never stored: it
--   exists only in the answer and in the browser of whoever generated it ("visible only to whoever generated it").
--   A deleted guest's attempts stay counted in the evening total (guest_id set null).
--
-- Limits (the numbers come from the app, src/lib/ai-topics/limits.ts: 5 per guest, 300 per evening including the
-- organizer, who has no personal limit): reserve_ai_topic() admits an attempt only while
--   succeeded + live pending < limit, for the guest and for the event, under one advisory lock (3008), so concurrent
--   taps can never exceed a limit. A failed attempt simply stops counting.
-- Stale attempts: a pending row older than 60 seconds is dead (the app aborts the AI call after 9 s; the Worker may
--   have been cut off mid-call). reserve_ai_topic() turns such rows into 'failed', and ai_topic_usage() counts them
--   as failed, so they never eat a slot.
-- One live attempt per guest: a second tap while the first is still pending is refused (GUEST_BUSY) instead of
--   looking like a used-up limit.
--
-- Access model as in the earlier migrations: browser roles get nothing; only the server (service role) reads and
-- writes, through the two functions and plain updates of the attempt state.

create table public.ai_topic (
  id bigint generated always as identity primary key,
  event_id smallint not null default 1 references public.event (id) on delete cascade,
  requester text not null,
  guest_id bigint references public.guest (id) on delete set null,
  category text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint ai_topic_requester_known check (requester in ('guest', 'organizer')),
  constraint ai_topic_organizer_has_no_guest check (requester = 'guest' or guest_id is null),
  constraint ai_topic_category_known check (category in ('kontrowersyjne', 'generyczne', 'refleksyjne')),
  constraint ai_topic_status_known check (status in ('pending', 'succeeded', 'failed'))
);

comment on table public.ai_topic is
  'AI topic generation attempts (pending → succeeded | failed); counts drive the per-guest and per-evening limits. No topic text.';

create index ai_topic_event_status_idx on public.ai_topic (event_id, status);
create index ai_topic_guest_status_idx on public.ai_topic (guest_id, status);

-- Admits one attempt and returns its id (the pending row). p_guest_id null = the organizer (no personal limit, no
-- busy check). Raises EVENT_NOT_FOUND, GUEST_NOT_FOUND, GUEST_BUSY, GUEST_LIMIT or EVENT_LIMIT; the app maps these
-- messages to statuses.
create function public.reserve_ai_topic(
  p_event_id smallint,
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
  -- Serializes every reservation (only reservations: seating uses 3003).
  perform pg_advisory_xact_lock(3008);

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
    perform 1 from public.ai_topic where guest_id = p_guest_id and status = 'pending';
    if found then
      raise exception 'GUEST_BUSY' using errcode = 'P0001';
    end if;

    select count(*) into v_used
      from public.ai_topic
      where guest_id = p_guest_id and status in ('pending', 'succeeded');
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

comment on function public.reserve_ai_topic (smallint, bigint, text, integer, integer) is
  'Admits one AI topic attempt against the per-guest and per-evening limits (atomic); returns the pending row id.';

-- The evening's usage (and one guest's, when given), read-only: used = succeeded + pending younger than 60 s;
-- failed = failed + older pending; guest_busy = the guest has a live pending attempt.
create function public.ai_topic_usage(p_event_id smallint, p_guest_id bigint default null)
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

comment on function public.ai_topic_usage (smallint, bigint) is
  'Counts of AI topic attempts for the evening (and one guest): live (succeeded + fresh pending), failed, busy.';

alter table public.ai_topic enable row level security;

revoke all on table public.ai_topic from anon, authenticated;

revoke execute on function public.reserve_ai_topic (smallint, bigint, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_topic (smallint, bigint, text, integer, integer) to service_role;

revoke execute on function public.ai_topic_usage (smallint, bigint) from public, anon, authenticated;
grant execute on function public.ai_topic_usage (smallint, bigint) to service_role;
