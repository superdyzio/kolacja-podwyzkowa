-- event-modules (S-17; PRD v2 FR-031, US-07, NFR-023): games and extras are optional modules per event.
--
-- Three sets on the event, each a text[] of module keys (checked against the known keys):
--   modules_available — the venue's offer for this event (owner, manager; e.g. no projector → no „Pokaż na TV”);
--   modules_enabled   — what the client switched on among the available ones;
--   modules_unlocked  — the paid modules the platform administrator unlocked for this event by hand.
-- A module works when it is available AND enabled AND (free OR unlocked); which modules are paid is decided in the
-- code (src/lib/modules/rules.ts, PAID_MODULES) until there is a price list (Open Question 5).
--
-- New events: everything available, questions / seating draw / TV screen on, AI topics and the guessing game off
-- (NFR-023), nothing unlocked. Every event that exists now (event 1, the dinner of 2026-11-08, included) keeps every v1
-- module on and AI topics unlocked, so nothing that worked yesterday changes; pub quiz (S-28) did not exist, it stays off.
-- Templates (is_template) keep the defaults and never use them.
--
-- The administrator's unlock is a write on one event of a restaurant: set_event_module_unlock() accepts it only inside
-- a live support visit of THIS login session to the event's restaurant (admin-support-log, S-13) and appends an
-- 'unlock' / 'lock' row to the owner's support log (new column support_log.module).

-- 1. Module sets on the event -----------------------------------------------------------------------------------------

alter table public.event
  add column modules_available text[] not null
    default '{questions,aiTopics,guessing,seatingDraw,tvSpotlight,pubQuiz}'::text[],
  add column modules_enabled text[] not null default '{questions,seatingDraw,tvSpotlight}'::text[],
  add column modules_unlocked text[] not null default '{}'::text[];

alter table public.event
  add constraint event_modules_available_known check (
    modules_available <@ array['questions', 'aiTopics', 'guessing', 'seatingDraw', 'tvSpotlight', 'pubQuiz']
  ),
  add constraint event_modules_enabled_known check (
    modules_enabled <@ array['questions', 'aiTopics', 'guessing', 'seatingDraw', 'tvSpotlight', 'pubQuiz']
  ),
  add constraint event_modules_unlocked_known check (
    modules_unlocked <@ array['questions', 'aiTopics', 'guessing', 'seatingDraw', 'tvSpotlight', 'pubQuiz']
  );

-- Every event of before this migration keeps what it had: the five v1 modules on, AI topics unlocked.
update public.event
set
  modules_enabled = '{questions,aiTopics,guessing,seatingDraw,tvSpotlight}'::text[],
  modules_unlocked = '{aiTopics}'::text[];

comment on column public.event.modules_available is
  'event-modules: the modules the venue offers for this event (owner, manager).';
comment on column public.event.modules_enabled is
  'event-modules: the modules the client switched on among the available ones.';
comment on column public.event.modules_unlocked is
  'event-modules: the paid modules the platform administrator unlocked for this event.';

-- 2. The owner's support log names the module of an unlock --------------------------------------------------------------

alter table public.support_log add column module text;

alter table public.support_log drop constraint support_log_kind;
alter table public.support_log
  add constraint support_log_kind check (kind in ('enter', 'access', 'exit', 'unlock', 'lock')),
  add constraint support_log_module_fields check ((kind in ('unlock', 'lock')) = (module is not null)),
  add constraint support_log_module_event check (module is null or event_id is not null);

-- 3. The administrator's unlock --------------------------------------------------------------------------------------

create function public.set_event_module_unlock(
  p_session_id bigint,
  p_event_id integer,
  p_module text,
  p_unlocked boolean
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_restaurant_id integer;
  v_event_name text;
  v_unlocked text[];
  v_grant public.support_grant%rowtype;
  v_email text;
  v_name text;
begin
  if p_module is null or p_unlocked is null
    or not (p_module = any (array['questions', 'aiTopics', 'guessing', 'seatingDraw', 'tvSpotlight', 'pubQuiz'])) then
    return 'not-found';
  end if;

  select e.restaurant_id, e.name, e.modules_unlocked into v_restaurant_id, v_event_name, v_unlocked
  from public.event e
  where e.id = p_event_id and not e.is_template
  for update;
  if v_restaurant_id is null then
    return 'not-found';
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
    return 'not-found';
  end if;

  if (p_module = any (v_unlocked)) = p_unlocked then
    return 'unchanged';
  end if;

  update public.event
  set modules_unlocked = case
    when p_unlocked then array_append(v_unlocked, p_module)
    else array_remove(v_unlocked, p_module)
  end
  where id = p_event_id;

  select a.email, a.display_name into v_email, v_name from public.staff_account a where a.id = v_grant.account_id;
  insert into public.support_log (
    restaurant_id, grant_id, account_id, admin_email, admin_name, kind, event_id, event_name, module
  )
  values (
    v_restaurant_id, v_grant.id, v_grant.account_id, v_email, v_name,
    case when p_unlocked then 'unlock' else 'lock' end,
    p_event_id, v_event_name, p_module
  );
  return 'changed';
end;
$$;

revoke execute on function public.set_event_module_unlock (bigint, integer, text, boolean)
  from public, anon, authenticated;

comment on function public.set_event_module_unlock (bigint, integer, text, boolean) is
  'event-modules: the platform administrator unlocks (or locks again) a paid module of one event, only inside a live support visit of the session to its restaurant; logs unlock/lock for the owner.';
