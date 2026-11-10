-- S-12 restaurant-team: the restaurant's own team — invitations, role changes, removal and one-time links to set a
-- password (PRD v2 FR-023 without the per-event waiter, US-05, the Access Control table).
--
-- The role matrix, checked here under a lock on the restaurant row (the app mirrors it in src/lib/team/rules.ts for
-- the UI; the database decides):
--   owner   acts on every member (also other owners and themself) and gives any role; invites managers and waiters
--           (owners come from the platform administrator, or a member is promoted with a role change);
--   manager acts on waiters only and invites waiters only;
--   waiter  nothing.
-- A restaurant never loses its last owner (LAST_OWNER). Errors: RESTAURANT_NOT_FOUND, NOT_ALLOWED (the actor is not a
-- member or the action is outside their scope), MEMBER_NOT_FOUND, ALREADY_MEMBER, PENDING_ELSEWHERE, LAST_OWNER,
-- ELSEWHERE, INVALID_ROLE.
--
-- add_restaurant_member: invites an e-mail into the restaurant — finds the account or creates it WITHOUT a password
--   (the person sets one from the one-time link the server issues next, staff-accounts) and adds the membership.
--   member_exclusive tells the server whether it may issue a link: only for an account that belongs to no other
--   restaurant and is not a platform administrator (a link sets the ACCOUNT's password, and whoever issues it can open
--   it — it must never reach rights in another restaurant). An existing account WITHOUT a password that is not
--   exclusive is refused (PENDING_ELSEWHERE): it would join with no way to set a password (no team may give it a link,
--   and the trigger below ends the link it already had) — it joins once it has set its password.
-- set_restaurant_member_role: changes a member's role within the actor's scope.
-- remove_restaurant_member: deletes the membership only. Sessions are per account and every panel guard re-reads the
--   membership on each request, so the restaurant closes to the person at once while their other restaurants stay.
--   An account left with no membership (and not a platform administrator) loses its unused one-time links.
-- issue_member_link: a fresh one-time link for a member within the actor's scope — an invitation while the account has
--   no password, else a password reset (issue_staff_token: the account's earlier unused link dies); ELSEWHERE for an
--   account that belongs to another restaurant too or is a platform administrator.
-- Trigger restaurant_member_team_links: the link rule is checked when a link is issued, so a link issued while the
--   account belonged to one restaurant alone must not outlive that: when the account gains a membership in a second
--   restaurant (any path: this team API, the platform panel, the CLI), its unused links issued by a restaurant's team
--   (created_by = a staff account that is not a platform administrator) are deleted. Links of the operator's CLI
--   (created_by null) and of a platform administrator stay: they are trusted across restaurants.
--
-- Access model as in the earlier migrations: service role only (EXECUTE revoked from public, anon, authenticated).
-- Additive: four functions, five internal helpers (team_*) and one trigger on restaurant_member, no table, column or
-- existing function changes.

-- The roles an actor may act on (and give, for role changes).
create function public.team_role_manages(p_actor_role text, p_target_role text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_actor_role
    when 'owner' then p_target_role in ('owner', 'manager', 'waiter')
    when 'manager' then p_target_role = 'waiter'
    else false
  end;
$$;

comment on function public.team_role_manages (text, text) is
  'The team matrix: an owner manages every role, a manager only waiters, a waiter nobody.';

-- The roles an actor may invite as.
create function public.team_role_invites(p_actor_role text, p_role text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_actor_role
    when 'owner' then p_role in ('manager', 'waiter')
    when 'manager' then p_role = 'waiter'
    else false
  end;
$$;

comment on function public.team_role_invites (text, text) is
  'Who may invite as what: an owner invites managers and waiters, a manager waiters.';

-- Whether a link may be issued for the account: no membership outside the restaurant and no platform-admin flag.
create function public.team_account_exclusive(p_restaurant_id integer, p_account_id bigint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (
    select 1 from public.staff_account a where a.id = p_account_id and a.is_platform_admin
  ) and not exists (
    select 1 from public.restaurant_member m where m.account_id = p_account_id and m.restaurant_id <> p_restaurant_id
  );
$$;

comment on function public.team_account_exclusive (integer, bigint) is
  'True when the account belongs to this restaurant alone and is not a platform administrator.';

-- Locks the restaurant row (team changes of one restaurant run one at a time) and returns the actor's role there.
create function public.team_lock_actor(p_restaurant_id integer, p_actor_id bigint)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_role text;
begin
  perform 1 from public.restaurant where id = p_restaurant_id for update;
  if not found then
    raise exception 'RESTAURANT_NOT_FOUND' using errcode = 'P0001';
  end if;
  select role into v_role from public.restaurant_member
  where restaurant_id = p_restaurant_id and account_id = p_actor_id;
  if v_role is null then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return v_role;
end;
$$;

comment on function public.team_lock_actor (integer, bigint) is
  'Locks the restaurant row for a team change and returns the actor''s role (NOT_ALLOWED when not a member).';

-- The target's role within the actor's scope (MEMBER_NOT_FOUND, NOT_ALLOWED).
create function public.team_target_role(p_restaurant_id integer, p_actor_role text, p_account_id bigint)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_role text;
begin
  select role into v_role from public.restaurant_member
  where restaurant_id = p_restaurant_id and account_id = p_account_id;
  if v_role is null then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not public.team_role_manages(p_actor_role, v_role) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return v_role;
end;
$$;

comment on function public.team_target_role (integer, text, bigint) is
  'The role of a member the actor may act on; MEMBER_NOT_FOUND or NOT_ALLOWED otherwise.';

-- 1. Invite ------------------------------------------------------------------------------------------------------------

-- The e-mail (already normalized: trimmed, lowercase) joins the restaurant with p_role. The name is stored only for a
-- new account (an existing person keeps their own).
create function public.add_restaurant_member(
  p_restaurant_id integer,
  p_actor_id bigint,
  p_email text,
  p_display_name text,
  p_role text
)
returns table (
  member_account_id bigint,
  member_created boolean,
  member_has_password boolean,
  member_exclusive boolean
)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor_role text;
  v_account_id bigint;
  v_password_hash text;
  v_created boolean := false;
begin
  if p_role not in ('owner', 'manager', 'waiter') then
    raise exception 'INVALID_ROLE' using errcode = 'P0001';
  end if;
  v_actor_role := public.team_lock_actor(p_restaurant_id, p_actor_id);
  if not public.team_role_invites(v_actor_role, p_role) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;

  insert into public.staff_account (email, display_name)
  values (p_email, p_display_name)
  on conflict (email) do nothing
  returning id, password_hash into v_account_id, v_password_hash;
  if found then
    v_created := true;
  else
    select id, password_hash into v_account_id, v_password_hash from public.staff_account where email = p_email;
  end if;

  if exists (
    select 1 from public.restaurant_member where restaurant_id = p_restaurant_id and account_id = v_account_id
  ) then
    raise exception 'ALREADY_MEMBER' using errcode = 'P0001';
  end if;
  if v_password_hash is null and not public.team_account_exclusive(p_restaurant_id, v_account_id) then
    raise exception 'PENDING_ELSEWHERE' using errcode = 'P0001';
  end if;
  insert into public.restaurant_member (restaurant_id, account_id, role)
  values (p_restaurant_id, v_account_id, p_role);

  return query select
    v_account_id,
    v_created,
    v_password_hash is not null,
    public.team_account_exclusive(p_restaurant_id, v_account_id);
end;
$$;

comment on function public.add_restaurant_member (integer, bigint, text, text, text) is
  'Invites an e-mail into a restaurant within the actor''s scope (account created without a password when missing).';

-- 2. Role change -------------------------------------------------------------------------------------------------------

create function public.set_restaurant_member_role(
  p_restaurant_id integer,
  p_actor_id bigint,
  p_account_id bigint,
  p_role text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_actor_role text;
  v_target_role text;
begin
  if p_role not in ('owner', 'manager', 'waiter') then
    raise exception 'INVALID_ROLE' using errcode = 'P0001';
  end if;
  v_actor_role := public.team_lock_actor(p_restaurant_id, p_actor_id);
  v_target_role := public.team_target_role(p_restaurant_id, v_actor_role, p_account_id);
  if not public.team_role_manages(v_actor_role, p_role) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if v_target_role = p_role then
    return;
  end if;
  if v_target_role = 'owner' and (
    select count(*) from public.restaurant_member where restaurant_id = p_restaurant_id and role = 'owner'
  ) <= 1 then
    raise exception 'LAST_OWNER' using errcode = 'P0001';
  end if;
  update public.restaurant_member set role = p_role
  where restaurant_id = p_restaurant_id and account_id = p_account_id;
end;
$$;

comment on function public.set_restaurant_member_role (integer, bigint, bigint, text) is
  'Changes a member''s role within the actor''s scope; never demotes the last owner.';

-- 3. Removal -----------------------------------------------------------------------------------------------------------

create function public.remove_restaurant_member(p_restaurant_id integer, p_actor_id bigint, p_account_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_actor_role text;
  v_target_role text;
begin
  v_actor_role := public.team_lock_actor(p_restaurant_id, p_actor_id);
  v_target_role := public.team_target_role(p_restaurant_id, v_actor_role, p_account_id);
  if v_target_role = 'owner' and (
    select count(*) from public.restaurant_member where restaurant_id = p_restaurant_id and role = 'owner'
  ) <= 1 then
    raise exception 'LAST_OWNER' using errcode = 'P0001';
  end if;
  delete from public.restaurant_member where restaurant_id = p_restaurant_id and account_id = p_account_id;
  -- Nothing left to open: a pending invitation or a just-issued reset link of the person stops working too.
  if not exists (select 1 from public.restaurant_member where account_id = p_account_id)
    and not exists (select 1 from public.staff_account where id = p_account_id and is_platform_admin) then
    delete from public.staff_token where account_id = p_account_id and used_at is null;
  end if;
end;
$$;

comment on function public.remove_restaurant_member (integer, bigint, bigint) is
  'Removes a member within the actor''s scope (never the last owner); sessions stay, the membership goes.';

-- 4. One-time link -----------------------------------------------------------------------------------------------------

create function public.issue_member_link(
  p_restaurant_id integer,
  p_actor_id bigint,
  p_account_id bigint,
  p_token_hash text,
  p_invite_expires_at timestamptz,
  p_reset_expires_at timestamptz
)
returns table (link_kind text, link_expires_at timestamptz)
language plpgsql
set search_path = ''
as $$
declare
  v_actor_role text;
  v_has_password boolean;
  v_kind text;
  v_expires_at timestamptz;
begin
  v_actor_role := public.team_lock_actor(p_restaurant_id, p_actor_id);
  perform public.team_target_role(p_restaurant_id, v_actor_role, p_account_id);
  if not public.team_account_exclusive(p_restaurant_id, p_account_id) then
    raise exception 'ELSEWHERE' using errcode = 'P0001';
  end if;
  select password_hash is not null into v_has_password from public.staff_account where id = p_account_id;
  v_kind := case when v_has_password then 'reset' else 'invite' end;
  v_expires_at := case when v_has_password then p_reset_expires_at else p_invite_expires_at end;
  perform public.issue_staff_token(p_account_id, v_kind, p_token_hash, v_expires_at, p_actor_id);
  return query select v_kind, v_expires_at;
end;
$$;

comment on function public.issue_member_link (integer, bigint, bigint, text, timestamptz, timestamptz) is
  'A fresh one-time link (invite without a password, else reset) for a member within the actor''s scope.';

-- 5. Links do not outlive the one-restaurant rule ----------------------------------------------------------------------

create function public.team_drop_team_links()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.restaurant_member m
    where m.account_id = new.account_id and m.restaurant_id <> new.restaurant_id
  ) then
    delete from public.staff_token t
    where t.account_id = new.account_id
      and t.used_at is null
      and t.created_by is not null
      and not exists (select 1 from public.staff_account a where a.id = t.created_by and a.is_platform_admin);
  end if;
  return null;
end;
$$;

comment on function public.team_drop_team_links () is
  'An account joining a second restaurant loses its unused links issued by a restaurant''s team.';

create trigger restaurant_member_team_links
after insert on public.restaurant_member
for each row execute function public.team_drop_team_links();

revoke execute on function public.team_drop_team_links () from public, anon, authenticated;
revoke execute on function public.team_role_manages (text, text) from public, anon, authenticated;
revoke execute on function public.team_role_invites (text, text) from public, anon, authenticated;
revoke execute on function public.team_account_exclusive (integer, bigint) from public, anon, authenticated;
revoke execute on function public.team_lock_actor (integer, bigint) from public, anon, authenticated;
revoke execute on function public.team_target_role (integer, text, bigint) from public, anon, authenticated;
revoke execute on function public.add_restaurant_member (integer, bigint, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.set_restaurant_member_role (integer, bigint, bigint, text)
  from public, anon, authenticated;
revoke execute on function public.remove_restaurant_member (integer, bigint, bigint) from public, anon, authenticated;
revoke execute on function public.issue_member_link (integer, bigint, bigint, text, timestamptz, timestamptz)
  from public, anon, authenticated;
