-- S-10 platform-restaurants: the platform administrator's panel — restaurants with their owners, the on/off switch of a
-- restaurant and the counters of the restaurant list (PRD v2 FR-021, US-05).
--
-- restaurant.disabled_at: NULL = active; set = switched off by the platform administrator at that time. A disabled
--   restaurant opens nothing to its staff (the membership lookups of the panel guards treat it like an unknown
--   restaurant); its events' link keys (client, TV, guests, tablet) keep working.
-- add_restaurant_owner: makes an e-mail an owner of a restaurant — finds the account or creates it WITHOUT a password
--   (the person sets one from the one-time link the server issues next, staff-accounts), then upserts the membership
--   with the role owner (an existing member becomes owner).
-- create_restaurant_with_owner: a new restaurant and its owner in one transaction (never a restaurant without one).
-- platform_restaurant_list: every restaurant with its counters (events, team) and its owners (e-mail, name, whether a
--   password is set) — never password hashes, events' names, keys or guests (the administrator's data access comes
--   with its access log, S-13).
--
-- Access model as in the earlier migrations: service role only (EXECUTE revoked from public, anon, authenticated).
-- Additive: one nullable column (every existing restaurant stays active) and three functions.

-- 1. The switch ------------------------------------------------------------------------------------------------------

alter table public.restaurant add column disabled_at timestamptz;

comment on column public.restaurant.disabled_at is
  'NULL = active; set = switched off by the platform administrator (its staff get no access; event links keep working).';

-- 2. Owners ----------------------------------------------------------------------------------------------------------

-- The e-mail (already normalized: trimmed, lowercase) becomes an owner of the restaurant. Raises RESTAURANT_NOT_FOUND.
-- Returns the account, whether it was created now and whether it already has a password.
create function public.add_restaurant_owner(p_restaurant_id integer, p_email text, p_display_name text default null)
returns table (owner_account_id bigint, owner_created boolean, owner_has_password boolean)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_account_id bigint;
  v_password_hash text;
  v_created boolean := false;
begin
  perform 1 from public.restaurant where id = p_restaurant_id for share;
  if not found then
    raise exception 'RESTAURANT_NOT_FOUND' using errcode = 'P0001';
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

  insert into public.restaurant_member (restaurant_id, account_id, role)
  values (p_restaurant_id, v_account_id, 'owner')
  on conflict (restaurant_id, account_id) do update set role = 'owner';

  return query select v_account_id, v_created, v_password_hash is not null;
end;
$$;

comment on function public.add_restaurant_owner (integer, text, text) is
  'Makes an e-mail an owner of a restaurant (the account is created without a password when missing).';

-- A new restaurant with its owner, atomically. Returns the restaurant id and the owner as add_restaurant_owner does.
create function public.create_restaurant_with_owner(p_name text, p_email text, p_display_name text default null)
returns table (
  new_restaurant_id integer,
  owner_account_id bigint,
  owner_created boolean,
  owner_has_password boolean
)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_restaurant_id integer;
begin
  insert into public.restaurant (name) values (p_name) returning id into v_restaurant_id;
  return query
  select v_restaurant_id, o.owner_account_id, o.owner_created, o.owner_has_password
  from public.add_restaurant_owner(v_restaurant_id, p_email, p_display_name) as o;
end;
$$;

comment on function public.create_restaurant_with_owner (text, text, text) is
  'Creates a restaurant and makes the e-mail its owner in one transaction.';

-- 3. The list --------------------------------------------------------------------------------------------------------

create function public.platform_restaurant_list()
returns table (
  id integer,
  name text,
  created_at timestamptz,
  disabled_at timestamptz,
  event_count integer,
  member_count integer,
  owners jsonb
)
language sql
stable
set search_path = ''
as $$
  select
    r.id,
    r.name,
    r.created_at,
    r.disabled_at,
    (select count(*)::integer from public.event e where e.restaurant_id = r.id),
    (select count(*)::integer from public.restaurant_member m where m.restaurant_id = r.id),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'accountId', a.id,
            'email', a.email,
            'displayName', a.display_name,
            'hasPassword', a.password_hash is not null
          )
          order by a.email
        )
        from public.restaurant_member m
        join public.staff_account a on a.id = m.account_id
        where m.restaurant_id = r.id and m.role = 'owner'
      ),
      '[]'::jsonb
    )
  from public.restaurant r
  order by r.id;
$$;

comment on function public.platform_restaurant_list () is
  'Every restaurant with its event and team counts and its owners (no hashes, no event data).';

revoke execute on function public.add_restaurant_owner (integer, text, text) from public, anon, authenticated;
revoke execute on function public.create_restaurant_with_owner (text, text, text) from public, anon, authenticated;
revoke execute on function public.platform_restaurant_list () from public, anon, authenticated;
