-- F-03 staff-accounts: staff accounts with e-mail + password, 30-day sessions and one-time links, without e-mail
-- (PRD v2 FR-022, US-05, NFR-013, NFR-020, NFR-022).
--
-- staff_account: a person working on the platform (platform admin, restaurant owner, manager, waiter). The e-mail is
--   the login (stored trimmed and lowercase); password_hash is NULL until the person sets a password from their
--   invitation link (scrypt string `scrypt$N$r$p$salt$hash`, computed by the server). is_platform_admin marks the
--   platform's administrators (created from the CLI: npm run platform:admin).
-- restaurant_member: the person's role in a restaurant (owner, manager or waiter); one role per restaurant. Read by
--   the central membership guard; written by later slices (S-10, S-12), tests and the scripts.
-- staff_session: a login on one device. Only the SHA-256 of the random session token is stored; a session ends at
--   expires_at (30 days after the login, no sliding), on logout, or when the person's password changes.
-- staff_token: a one-time link (invitation or password reset), handed over by a human (the app never sends e-mail).
--   Only the SHA-256 of the token is stored; it is valid once, until expires_at, and a newer link of the same person
--   supersedes the older ones.
-- login_attempt: throttling of password guessing, per typed e-mail (the key is a hash, so nothing reveals whether an
--   account exists). Lambda instances share no memory, so the count lives here.
--
-- Access model as in the earlier migrations: browser roles get nothing. RLS on, no policies, privileges revoked
-- (Supabase grants anon/authenticated everything on new tables and EXECUTE on new functions by default). Additive:
-- five new tables and four functions, no existing row or function changes.

-- 1. Tables ----------------------------------------------------------------------------------------------------------

create table public.staff_account (
  id bigint generated always as identity primary key,
  email text not null,
  display_name text,
  password_hash text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  password_changed_at timestamptz,
  constraint staff_account_email_format check (
    email = lower(btrim(email)) and char_length(email) between 3 and 254 and position('@' in email) > 1
  ),
  constraint staff_account_display_name_format check (
    display_name is null or (char_length(display_name) between 1 and 80 and display_name = btrim(display_name))
  ),
  constraint staff_account_password_hash_format check (password_hash is null or password_hash like 'scrypt$%')
);

create unique index staff_account_email_key on public.staff_account (email);

comment on table public.staff_account is
  'Staff accounts (platform admin, owners, managers, waiters): e-mail login, scrypt password hash (NULL until set).';

create table public.restaurant_member (
  restaurant_id integer not null references public.restaurant (id) on delete cascade,
  account_id bigint not null references public.staff_account (id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  primary key (restaurant_id, account_id),
  constraint restaurant_member_role check (role in ('owner', 'manager', 'waiter'))
);

create index restaurant_member_account_id_idx on public.restaurant_member (account_id);

comment on table public.restaurant_member is 'A staff account''s role in a restaurant: owner, manager or waiter.';

create table public.staff_session (
  id bigint generated always as identity primary key,
  account_id bigint not null references public.staff_account (id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint staff_session_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$')
);

create unique index staff_session_token_hash_key on public.staff_session (token_hash);
create index staff_session_account_id_idx on public.staff_session (account_id);

comment on table public.staff_session is
  'A login on one device: SHA-256 of the random session token, fixed 30-day expiry.';

create table public.staff_token (
  id bigint generated always as identity primary key,
  account_id bigint not null references public.staff_account (id) on delete cascade,
  kind text not null,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by bigint references public.staff_account (id) on delete set null,
  constraint staff_token_kind check (kind in ('invite', 'reset')),
  constraint staff_token_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$')
);

create unique index staff_token_token_hash_key on public.staff_token (token_hash);
create index staff_token_account_id_idx on public.staff_token (account_id);
create index staff_token_created_by_idx on public.staff_token (created_by);

comment on table public.staff_token is
  'One-time links (invitation or password reset): SHA-256 of the token, valid once until expires_at.';

create table public.login_attempt (
  id bigint generated always as identity primary key,
  key_hash text not null,
  created_at timestamptz not null default now(),
  constraint login_attempt_key_hash_format check (key_hash ~ '^[0-9a-f]{64}$')
);

create index login_attempt_key_created_idx on public.login_attempt (key_hash, created_at);
create index login_attempt_created_at_idx on public.login_attempt (created_at);

comment on table public.login_attempt is
  'Password attempts per typed e-mail (hashed key), counted as failures until a successful login clears them.';

alter table public.staff_account enable row level security;
alter table public.restaurant_member enable row level security;
alter table public.staff_session enable row level security;
alter table public.staff_token enable row level security;
alter table public.login_attempt enable row level security;
revoke all on table public.staff_account from anon, authenticated;
revoke all on table public.restaurant_member from anon, authenticated;
revoke all on table public.staff_session from anon, authenticated;
revoke all on table public.staff_token from anon, authenticated;
revoke all on table public.login_attempt from anon, authenticated;

-- 2. Functions -------------------------------------------------------------------------------------------------------

-- A new one-time link for the account: the account's unused links are deleted (the newest link wins), then the new one
-- is stored. Raises ACCOUNT_NOT_FOUND.
create function public.issue_staff_token(
  p_account_id bigint,
  p_kind text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_created_by bigint default null
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform 1 from public.staff_account where id = p_account_id for update;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;

  delete from public.staff_token where account_id = p_account_id and used_at is null;
  insert into public.staff_token (account_id, kind, token_hash, expires_at, created_by)
  values (p_account_id, p_kind, p_token_hash, p_expires_at, p_created_by)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.issue_staff_token (bigint, text, text, timestamptz, bigint) is
  'Stores a new one-time link (invite or reset) for an account, replacing its unused links; returns the link id.';

-- Uses a one-time link: sets the password, ends every earlier session of the account and opens a new one, all at once.
-- Unknown, used and expired links all raise TOKEN_INVALID. Returns the account id.
create function public.redeem_staff_token(
  p_token_hash text,
  p_password_hash text,
  p_session_hash text,
  p_session_expires_at timestamptz
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_token public.staff_token%rowtype;
begin
  select * into v_token
  from public.staff_token
  where token_hash = p_token_hash and used_at is null and expires_at > now()
  for update;
  if not found then
    raise exception 'TOKEN_INVALID' using errcode = 'P0001';
  end if;

  update public.staff_token set used_at = now() where id = v_token.id;
  delete from public.staff_token where account_id = v_token.account_id and used_at is null;
  update public.staff_account
  set password_hash = p_password_hash, password_changed_at = now()
  where id = v_token.account_id;
  delete from public.staff_session where account_id = v_token.account_id;
  insert into public.staff_session (account_id, token_hash, expires_at)
  values (v_token.account_id, p_session_hash, p_session_expires_at);
  return v_token.account_id;
end;
$$;

comment on function public.redeem_staff_token (text, text, text, timestamptz) is
  'Uses a one-time link: sets the password, ends earlier sessions, opens a new session; TOKEN_INVALID otherwise.';

-- A password change from a logged-in session: the new hash is stored and every OTHER session of the account ends.
-- Raises ACCOUNT_NOT_FOUND.
create function public.change_staff_password(p_account_id bigint, p_keep_session_id bigint, p_password_hash text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.staff_account
  set password_hash = p_password_hash, password_changed_at = now()
  where id = p_account_id;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;
  delete from public.staff_session where account_id = p_account_id and id <> p_keep_session_id;
end;
$$;

comment on function public.change_staff_password (bigint, bigint, text) is
  'Sets a new password hash and ends every session of the account except the one that changed it.';

-- Admits one password attempt for a key (the hash of a typed e-mail): below p_limit attempts within the window the
-- attempt is recorded (it counts as a failure until a successful login deletes the key's rows) and allowed; otherwise
-- it is refused with the seconds until the oldest attempt leaves the window. Counting and recording happen under one
-- advisory lock per key, so parallel requests cannot pass the limit. Rows older than a day are deleted on the way.
create function public.begin_login_attempt(p_key_hash text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
set search_path = ''
as $$
declare
  v_window interval := make_interval(secs => p_window_seconds);
  v_count integer;
  v_oldest timestamptz;
begin
  perform pg_advisory_xact_lock(3010, hashtext(p_key_hash));

  delete from public.login_attempt where created_at < now() - interval '1 day';

  select count(*), min(created_at) into v_count, v_oldest
  from public.login_attempt
  where key_hash = p_key_hash and created_at > now() - v_window;

  if v_count >= p_limit then
    return query select false, greatest(1, ceil(extract(epoch from (v_oldest + v_window - now())))::integer);
    return;
  end if;

  insert into public.login_attempt (key_hash) values (p_key_hash);
  return query select true, 0;
end;
$$;

comment on function public.begin_login_attempt (text, integer, integer) is
  'Throttles password attempts per key: records and allows below the limit, else refuses with retry-after seconds.';

revoke execute on function public.issue_staff_token (bigint, text, text, timestamptz, bigint)
  from public, anon, authenticated;
revoke execute on function public.redeem_staff_token (text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.change_staff_password (bigint, bigint, text) from public, anon, authenticated;
revoke execute on function public.begin_login_attempt (text, integer, integer) from public, anon, authenticated;
