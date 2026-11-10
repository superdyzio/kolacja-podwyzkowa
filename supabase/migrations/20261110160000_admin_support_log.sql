-- S-13 admin-support-log: the platform administrator's support access to a restaurant's data, with an access log the
-- restaurant's owner sees (PRD v2 FR-021, US-05, US-10, NFR-012 — the only exception to data isolation).
--
-- support_grant: the operational state of support mode — which login session (staff_session) of a platform
--   administrator may READ which restaurant, why, and until when (a fixed time box set by the app, 60 minutes). It
--   dies with the login session (logout, password change, "log out everywhere", a used reset link) and with the
--   restaurant; entering again replaces it. Read-only is enforced by the app's central panel guard (it admits support
--   access only on reads), never here.
-- support_log: the permanent record for the owner — 'enter' (reason, until), one 'access' row for EVERY request the
--   guard admitted in support mode (method, path, the event when an event was opened) and 'exit'. Snapshots of the
--   administrator's e-mail and name and of the event's name, and NO foreign key to the grant, the session, the
--   account or the event: the record outlives each of them. Append-only: a trigger refuses every update and delete
--   (except the cascade when the restaurant itself is deleted) and every truncate.
--
-- begin_support_access: checks the login session is live and belongs to a platform administrator and the restaurant
--   exists (switched off or not), replaces the session's grant for that restaurant, writes 'enter'.
-- record_support_access: the guard's ONE call — finds the live grant of the session for the restaurant (or for the
--   event's restaurant), re-checks the session and the administrator flag, writes 'access' and only then returns the
--   restaurant (and the event). Nothing found → an empty result and nothing written; a failed write raises, so data
--   is never returned without its log row.
-- end_support_access: deletes the grant; a live one writes 'exit'.
--
-- Access model as in the earlier migrations: browser roles get nothing (RLS on, no policies, privileges revoked;
-- EXECUTE revoked from public, anon, authenticated). Additive: two tables, four functions, three triggers; no existing
-- row, table or function changes.

-- 1. Tables ----------------------------------------------------------------------------------------------------------

create table public.support_grant (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.staff_session (id) on delete cascade,
  account_id bigint not null references public.staff_account (id) on delete cascade,
  restaurant_id integer not null references public.restaurant (id) on delete cascade,
  reason text not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint support_grant_reason_format check (
    char_length(reason) between 3 and 300 and reason = btrim(reason)
  ),
  constraint support_grant_session_restaurant_key unique (session_id, restaurant_id)
);

create index support_grant_restaurant_id_idx on public.support_grant (restaurant_id);
create index support_grant_account_id_idx on public.support_grant (account_id);

comment on table public.support_grant is
  'Support mode of a platform administrator''s login session in one restaurant: read-only, with a reason, until expires_at.';

create table public.support_log (
  id bigint generated always as identity primary key,
  restaurant_id integer not null references public.restaurant (id) on delete cascade,
  grant_id bigint not null,
  account_id bigint not null,
  admin_email text not null,
  admin_name text,
  kind text not null,
  reason text,
  expires_at timestamptz,
  method text,
  path text,
  event_id integer,
  event_name text,
  created_at timestamptz not null default now(),
  constraint support_log_kind check (kind in ('enter', 'access', 'exit')),
  constraint support_log_enter_fields check (kind <> 'enter' or (reason is not null and expires_at is not null)),
  constraint support_log_access_fields check (kind <> 'access' or (method is not null and path is not null)),
  constraint support_log_path_format check (path is null or (path like '/%' and char_length(path) <= 300)),
  constraint support_log_method_format check (method is null or method ~ '^[A-Z]{1,10}$'),
  constraint support_log_event_fields check ((event_id is null) = (event_name is null))
);

create index support_log_restaurant_id_idx on public.support_log (restaurant_id, id desc);

comment on table public.support_log is
  'Append-only record of a platform administrator''s support access to a restaurant (enter, every access, exit), for its owner.';

alter table public.support_grant enable row level security;
alter table public.support_log enable row level security;
revoke all on table public.support_grant from anon, authenticated;
revoke all on table public.support_log from anon, authenticated;

-- 2. Append-only log ------------------------------------------------------------------------------------------------

-- Refuses every update and delete of a log row, except a delete whose restaurant row is already gone: the cascade of
-- a deleted restaurant (the record goes with the restaurant whose owner it was for).
create function public.support_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.restaurant where id = old.restaurant_id) then
    return old;
  end if;
  raise exception 'SUPPORT_LOG_APPEND_ONLY' using errcode = 'P0001';
end;
$$;

comment on function public.support_log_append_only () is
  'support_log is append-only: no update, no delete (except the cascade of a deleted restaurant), no truncate.';

create trigger support_log_append_only
before update or delete on public.support_log
for each row execute function public.support_log_append_only();

create trigger support_log_no_truncate
before truncate on public.support_log
for each statement execute function public.support_log_append_only();

-- 3. Entering support mode ------------------------------------------------------------------------------------------

create function public.begin_support_access(
  p_session_id bigint,
  p_restaurant_id integer,
  p_reason text,
  p_minutes integer
)
returns table (grant_id bigint, started_at timestamptz, expires_at timestamptz)
language plpgsql
set search_path = ''
as $$
declare
  v_account_id bigint;
  v_email text;
  v_name text;
  v_grant_id bigint;
  v_started_at timestamptz;
  v_expires_at timestamptz;
begin
  if p_minutes is null or p_minutes < 1 or p_minutes > 240 then
    raise exception 'INVALID_DURATION' using errcode = 'P0001';
  end if;
  -- The login session, locked so two entries of one login cannot collide on the unique pair below.
  select s.account_id, a.email, a.display_name
    into v_account_id, v_email, v_name
  from public.staff_session s
  join public.staff_account a on a.id = s.account_id
  where s.id = p_session_id and s.expires_at > now() and a.is_platform_admin
  for update of s;
  if v_account_id is null then
    raise exception 'NOT_ADMIN' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.restaurant where id = p_restaurant_id) then
    raise exception 'RESTAURANT_NOT_FOUND' using errcode = 'P0001';
  end if;

  delete from public.support_grant g
  where g.session_id = p_session_id and (g.restaurant_id = p_restaurant_id or g.expires_at <= now());

  v_started_at := now();
  v_expires_at := v_started_at + make_interval(mins => p_minutes);
  insert into public.support_grant (session_id, account_id, restaurant_id, reason, started_at, expires_at)
  values (p_session_id, v_account_id, p_restaurant_id, p_reason, v_started_at, v_expires_at)
  returning id into v_grant_id;

  insert into public.support_log (restaurant_id, grant_id, account_id, admin_email, admin_name, kind, reason, expires_at)
  values (p_restaurant_id, v_grant_id, v_account_id, v_email, v_name, 'enter', p_reason, v_expires_at);

  return query select v_grant_id, v_started_at, v_expires_at;
end;
$$;

comment on function public.begin_support_access (bigint, integer, text, integer) is
  'A platform administrator''s login session enters support mode in a restaurant (replaces its earlier grant there) and logs it.';

-- 4. Every access in support mode -----------------------------------------------------------------------------------

create function public.record_support_access(
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
    select e.restaurant_id, e.name into v_restaurant_id, v_event_name from public.event e where e.id = p_event_id;
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

comment on function public.record_support_access (bigint, integer, integer, text, text) is
  'The panel guard''s support check: a live grant of the session for the restaurant (or the event''s) → logs the access and returns it.';

-- 5. Leaving support mode -------------------------------------------------------------------------------------------

create function public.end_support_access(p_session_id bigint, p_restaurant_id integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_grant public.support_grant%rowtype;
  v_email text;
  v_name text;
begin
  delete from public.support_grant g
  where g.session_id = p_session_id and g.restaurant_id = p_restaurant_id
  returning g.* into v_grant;
  if v_grant.id is null or v_grant.expires_at <= now() then
    return false;
  end if;
  select a.email, a.display_name into v_email, v_name from public.staff_account a where a.id = v_grant.account_id;
  insert into public.support_log (restaurant_id, grant_id, account_id, admin_email, admin_name, kind)
  values (p_restaurant_id, v_grant.id, v_grant.account_id, v_email, v_name, 'exit');
  return true;
end;
$$;

comment on function public.end_support_access (bigint, integer) is
  'Ends a login session''s support mode in a restaurant; a live one is logged as exit.';

revoke execute on function public.support_log_append_only () from public, anon, authenticated;
revoke execute on function public.begin_support_access (bigint, integer, text, integer) from public, anon, authenticated;
revoke execute on function public.record_support_access (bigint, integer, integer, text, text)
  from public, anon, authenticated;
revoke execute on function public.end_support_access (bigint, integer) from public, anon, authenticated;
