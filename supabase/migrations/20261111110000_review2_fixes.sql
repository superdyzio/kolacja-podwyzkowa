-- review2-fixes (PR #4, the second review round): two database fixes.
--
-- 1. issue_owner_link refuses an owner account that is itself a platform administrator (OWNER_NOT_FOUND, the route's
--    identical 404). Without it one administrator could take over a peer administrator's account through „Nowy link”
--    (a reset link logs whoever opens it in AS that account, platform-admin flag included, and ends its sessions), so
--    every later support_log row would name the wrong administrator. The team path already refuses it
--    (team_account_exclusive); an administrator's own link comes only from the operator (npm run platform:admin).
--    The function is now also the writer of the invitation that „Nowa restauracja” and „Dodaj właściciela” hand out
--    (src/lib/platform/service.ts), so that invitation is logged as a 'link' row for the owner too.
-- 2. delete_guest: the single guest delete (the client's guest list and the staff dispatcher) takes the event's
--    seating lock (3003, event) BEFORE it locks the guest row. reset_event, purge_event_guest_data, publish_seating,
--    replace_seating and seat_guest all start with that lock and then delete or write snapshots, seats, groups and
--    guests; a plain DELETE locked the guest row first and then — in guest_erase_published — the snapshot seat and
--    snapshot rows, the reverse order, so a guest deleted during the venue's reset could deadlock (40P01).
--
-- Additive and data-preserving: one replaced function (same signature) and one new function. Old code on the migrated
-- database keeps working (its plain guest delete still runs, just without the lock; its owner invitations stay
-- unlogged; an administrator-owner's „Nowy link” is refused for it too). New code on an un-migrated database fails
-- every guest delete (no delete_guest), so the migration goes BEFORE the code.

-- 1. issue_owner_link: never for a platform administrator's account (latest body: 20261111070000_review_fixes.sql) --

create or replace function public.issue_owner_link(
  p_restaurant_id integer,
  p_admin_id bigint,
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
  v_admin_email text;
  v_admin_name text;
  v_target_email text;
  v_has_password boolean;
  v_kind text;
  v_expires_at timestamptz;
begin
  select a.email, a.display_name into v_admin_email, v_admin_name
  from public.staff_account a
  where a.id = p_admin_id and a.is_platform_admin;
  if v_admin_email is null then
    raise exception 'NOT_ADMIN' using errcode = 'P0001';
  end if;

  -- review2-fixes: a platform administrator's account is never a target (its link is the operator's).
  select a.email, a.password_hash is not null into v_target_email, v_has_password
  from public.restaurant_member m
  join public.staff_account a on a.id = m.account_id
  where m.restaurant_id = p_restaurant_id
    and m.account_id = p_account_id
    and m.role = 'owner'
    and not a.is_platform_admin;
  if v_target_email is null then
    raise exception 'OWNER_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_kind := case when v_has_password then 'reset' else 'invite' end;
  v_expires_at := case when v_has_password then p_reset_expires_at else p_invite_expires_at end;
  perform public.issue_staff_token(p_account_id, v_kind, p_token_hash, v_expires_at, p_admin_id);

  insert into public.support_log (
    restaurant_id, grant_id, account_id, admin_email, admin_name, kind, expires_at, link_kind, target_email
  )
  select m.restaurant_id, null, p_admin_id, v_admin_email, v_admin_name, 'link', v_expires_at, v_kind, v_target_email
  from public.restaurant_member m
  where m.account_id = p_account_id
  order by m.restaurant_id;

  return query select v_kind, v_expires_at;
end;
$$;

revoke execute on function public.issue_owner_link (integer, bigint, bigint, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.issue_owner_link (integer, bigint, bigint, text, timestamptz, timestamptz)
  to service_role;

comment on function public.issue_owner_link (integer, bigint, bigint, text, timestamptz, timestamptz) is
  'review-fixes: the platform administrator''s one-time link (invite or reset) for a restaurant''s owner — „Nowy link” '
  'and the invitation of „Nowa restauracja” / „Dodaj właściciela” — logged as ''link'' in the support log of every '
  'restaurant of the account; never for a platform administrator''s account (review2-fixes).';

-- 2. delete_guest: the seating lock first ---------------------------------------------------------------------------
--
-- Lock order (the same as every writer of the event's seating): (3003, event) → the guest row (the DELETE's row lock;
-- a BEFORE ROW trigger runs on the locked row) → guest_erase_published: the guest's seating_snapshot_seat rows, then
-- their seating_snapshot rows in id order (for update) → the cascades (seat_assignment, guess, guest_rsvp,
-- quiz_answer, quiz_score, tv_spotlight; set null on order_item, order_piece, ai_topic) and the group trigger (another
-- member's row when the group drops below two). reset_event and purge_event_guest_data take (3003, event) first too
-- and then delete snapshots, groups and guests, so the two now queue on the advisory lock instead of each holding what
-- the other waits for. Two guest deletes of one event queue on it as well. Another event's guest or an unknown id
-- deletes nothing (false).

create function public.delete_guest(p_event_id integer, p_guest_id bigint)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(3003, p_event_id);
  delete from public.guest where id = p_guest_id and event_id = p_event_id;
  return found;
end;
$$;

revoke execute on function public.delete_guest (integer, bigint) from public, anon, authenticated;
grant execute on function public.delete_guest (integer, bigint) to service_role;

comment on function public.delete_guest (integer, bigint) is
  'review2-fixes: deletes one guest of the event under the seating lock (3003, event) taken before the guest row, so '
  'it never deadlocks with reset_event / purge_event_guest_data (guest_erase_published locks snapshot rows); true when '
  'a row went.';
