-- review-fixes (PR #4 review, batch B): database fixes found by the review of the M-2 platform.
--
-- 1. The platform administrator's „Nowy link” for a restaurant's owner is logged for the owner (PRD v2 FR-021,
--    NFR-012: every way of the administrator into a restaurant's data is recorded and visible to its owner). A reset
--    link logs whoever opens it in AS the owner — until now with no support_log row. New support_log kind 'link' (no
--    support grant: grant_id may be null for it only) with the link's kind and the target account's e-mail
--    (snapshots, no foreign keys — the record outlives the account), written by the new function issue_owner_link in
--    the SAME transaction as the token, for every restaurant the account belongs to (the link opens all of them).
-- 2. purge_event_guest_data also takes the quiz lock (3013, event), in the order reset_event takes it (3003, 3008,
--    3013, then the event row): its guest delete cascades into quiz_answer / quiz_score, which quiz_run_action
--    ('results') writes under that lock.
-- 3. The TV's quiz token part (quiz_tv_version = <revision>-<answers>) changes when a question is added or deleted
--    while a quiz runs: a trigger takes a new revision from quiz_run_revision_seq (the TV shows the question count,
--    the closed count and the question's number). Edits need nothing: only a never-asked question can be edited, and
--    the TV shows no draft. The guest's token already covers it (quizKey has total and closed).
-- 4. delete_quiz_question: the delete of a question under the quiz lock (3013, event) with the run row locked first,
--    so it can never delete the question an `ask` puts on the TV at the same moment (the check and the delete were
--    two requests).
-- 5. Explicit EXECUTE grants to service_role on every function of the M-2 migrations (20261109140000 …
--    20261111060000) and USAGE on quiz_run_revision_seq: they worked through Supabase's default privileges only, unlike
--    every earlier migration.
--
-- Additive and data-preserving: a relaxed NOT NULL, new nullable columns, replaced checks that every existing row
-- passes, one replaced function (same signature), new functions and a trigger, grants. Code from before keeps working
-- on the migrated database (it reads support_log by kind and ignores 'link'; its plain quiz delete fires the trigger
-- too).

-- 1. „Nowy link” in the owner's support log --------------------------------------------------------------------------

alter table public.support_log alter column grant_id drop not null;
alter table public.support_log add column link_kind text;
alter table public.support_log add column target_email text;

alter table public.support_log drop constraint support_log_kind;
alter table public.support_log
  add constraint support_log_kind check (kind in ('enter', 'access', 'exit', 'unlock', 'lock', 'link')),
  add constraint support_log_grant check (kind = 'link' or grant_id is not null),
  add constraint support_log_link_kind check (link_kind is null or link_kind in ('invite', 'reset')),
  add constraint support_log_link_fields check (
    (kind = 'link') = (link_kind is not null) and (kind = 'link') = (target_email is not null)
  ),
  add constraint support_log_link_expiry check (kind <> 'link' or expires_at is not null);

comment on column public.support_log.link_kind is
  'review-fixes: the kind of a ''link'' entry (invite | reset), the platform administrator''s „Nowy link” for an owner.';
comment on column public.support_log.target_email is
  'review-fixes: the e-mail of the account a ''link'' entry''s one-time link was issued for (snapshot).';

-- The platform administrator's one-time link for an OWNER of the restaurant: an invitation while the account has no
-- password, else a password reset (issue_staff_token: the account's earlier unused link dies); one 'link' row in the
-- support log of every restaurant the account belongs to, in the same transaction. Raises NOT_ADMIN (the actor is not
-- a platform administrator) and OWNER_NOT_FOUND (unknown restaurant, account or not an owner there).

create function public.issue_owner_link(
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

  select a.email, a.password_hash is not null into v_target_email, v_has_password
  from public.restaurant_member m
  join public.staff_account a on a.id = m.account_id
  where m.restaurant_id = p_restaurant_id and m.account_id = p_account_id and m.role = 'owner';
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
  'review-fixes: the platform administrator''s one-time link (invite or reset) for a restaurant''s owner, logged as ''link'' in the support log of every restaurant of the account.';

-- 2. The purge takes the quiz lock too (latest body: 20261111050000_privacy_retention.sql) ---------------------------

create or replace function public.purge_event_guest_data(p_event_id integer, p_now timestamptz)
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

  -- The locks of reset_event, in its order: seating and venue, AI reservations, the quiz (its answers and standings
  -- go with the guests), then the event row.
  perform pg_advisory_xact_lock(3003, p_event_id);
  perform pg_advisory_xact_lock(3008, p_event_id);
  perform pg_advisory_xact_lock(3013, p_event_id);
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
  -- Cascades: guess, seat_assignment, guest_rsvp, quiz_answer, quiz_score; set null: ai_topic, order_item,
  -- order_piece guest ids.
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

-- 3. A question added or deleted during a run changes the TV's quiz token --------------------------------------------

create function public.quiz_question_bump_run()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.quiz_run
    set revision = nextval('public.quiz_run_revision_seq')
    where event_id = case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  return null;
end;
$$;

revoke execute on function public.quiz_question_bump_run () from public, anon, authenticated;
grant execute on function public.quiz_question_bump_run () to service_role;

comment on function public.quiz_question_bump_run () is
  'review-fixes: a question added or deleted while the event''s quiz runs gives the run a new revision (the TV token).';

create trigger quiz_question_bump_run
after insert or delete on public.quiz_question
for each row execute function public.quiz_question_bump_run();

-- 4. Deleting a question under the quiz lock --------------------------------------------------------------------------
-- Raises QUESTION_NOT_FOUND (unknown, another event's) and QUESTION_ON_TV (the question the run shows now, in any
-- phase). The run row is locked first, like quiz_run_action, so an `ask` of the same question waits or wins.

create function public.delete_quiz_question(p_event_id integer, p_question_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_on_tv bigint;
begin
  perform pg_advisory_xact_lock(3013, p_event_id);
  select r.question_id into v_on_tv
  from public.quiz_run r
  where r.event_id = p_event_id
  for update;

  perform 1 from public.quiz_question q where q.event_id = p_event_id and q.id = p_question_id for update;
  if not found then
    raise exception 'QUESTION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_on_tv = p_question_id then
    raise exception 'QUESTION_ON_TV' using errcode = 'P0001';
  end if;

  delete from public.quiz_question where event_id = p_event_id and id = p_question_id;
end;
$$;

revoke execute on function public.delete_quiz_question (integer, bigint) from public, anon, authenticated;
grant execute on function public.delete_quiz_question (integer, bigint) to service_role;

comment on function public.delete_quiz_question (integer, bigint) is
  'review-fixes: deletes a quiz question (with its answers) under the quiz lock; never the one on the TV.';

-- 5. Explicit grants for the M-2 functions and the quiz sequence ------------------------------------------------------

grant execute on function public.add_event_waiter (integer, integer, text, bigint, text, text, integer) to service_role;
grant execute on function public.add_restaurant_member (integer, bigint, text, text, text) to service_role;
grant execute on function public.add_restaurant_owner (integer, text, text) to service_role;
grant execute on function public.apply_venue_template (integer, integer) to service_role;
grant execute on function public.begin_login_attempt (text, integer, integer) to service_role;
grant execute on function public.begin_support_access (bigint, integer, text, integer) to service_role;
grant execute on function public.change_staff_password (bigint, bigint, text) to service_role;
grant execute on function public.claim_retention_sweep (timestamptz, integer) to service_role;
grant execute on function public.close_event_rsvp (integer, timestamptz) to service_role;
grant execute on function public.copy_event_venue (integer, integer) to service_role;
grant execute on function public.create_event_from_template (integer, integer, text, date, integer) to service_role;
grant execute on function public.create_restaurant_with_owner (text, text, text) to service_role;
grant execute on function public.create_venue_template (integer, text, integer) to service_role;
grant execute on function public.end_support_access (bigint, integer) to service_role;
grant execute on function public.event_has_guest_data (integer) to service_role;
grant execute on function public.expired_guest_data_events (timestamptz, integer, integer) to service_role;
grant execute on function public.guest_data_expired (date, integer, timestamptz) to service_role;
grant execute on function public.guest_rsvp_absence_by_organizer () to service_role;
grant execute on function public.guest_rsvp_state (integer, bigint) to service_role;
grant execute on function public.issue_member_link (integer, bigint, bigint, text, timestamptz, timestamptz)
  to service_role;
grant execute on function public.issue_staff_token (bigint, text, text, timestamptz, bigint) to service_role;
grant execute on function public.platform_restaurant_list () to service_role;
grant execute on function public.purge_event_guest_data (integer, timestamptz) to service_role;
grant execute on function public.quiz_board (integer) to service_role;
grant execute on function public.quiz_guest_state (integer, bigint) to service_role;
grant execute on function public.quiz_options_valid (text[]) to service_role;
grant execute on function public.quiz_run_action (integer, text, bigint) to service_role;
grant execute on function public.quiz_tv_state (integer) to service_role;
grant execute on function public.quiz_tv_version (integer) to service_role;
grant execute on function public.record_support_access (bigint, integer, integer, text, text) to service_role;
grant execute on function public.redeem_staff_token (text, text, text, timestamptz) to service_role;
grant execute on function public.remove_restaurant_member (integer, bigint, bigint) to service_role;
grant execute on function public.save_guest_rsvp (integer, bigint, boolean, text, text) to service_role;
grant execute on function public.save_quiz_answer (integer, bigint, bigint, integer) to service_role;
grant execute on function public.set_event_menu (integer, text, integer[]) to service_role;
grant execute on function public.set_event_module_unlock (bigint, integer, text, boolean) to service_role;
grant execute on function public.set_event_rsvp_options (integer, integer[]) to service_role;
grant execute on function public.set_restaurant_member_role (integer, bigint, bigint, text) to service_role;
grant execute on function public.support_log_append_only () to service_role;
grant execute on function public.team_account_exclusive (integer, bigint) to service_role;
grant execute on function public.team_drop_team_links () to service_role;
grant execute on function public.team_lock_actor (integer, bigint) to service_role;
grant execute on function public.team_role_invites (text, text) to service_role;
grant execute on function public.team_role_manages (text, text) to service_role;
grant execute on function public.team_target_role (integer, text, bigint) to service_role;

grant usage, select on sequence public.quiz_run_revision_seq to service_role;
