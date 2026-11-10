-- rsvp-reset (PR #4 review, the user's decision on the RSVP extras): the reset part `rsvp` — the guests' RSVP answers,
-- the client's dish options and the deadline (RSVP off) — in „Reset danych” on the panel's event card. `guests`
-- implies it (the answers cascade with the guests anyway; the options and the deadline go with them now). Attendance
-- (guest.is_absent) is the guest list's own state and stays. Not a trial part („Reset prób” is unchanged).
--
-- reset_counts / reset_event are replaced with the SAME signatures, copied from their latest version
-- (20261111060000_pub_quiz.sql): reset_counts gains `rsvpAnswers`, `rsvpOptions`, `rsvpDeadlineSet`; reset_event the
-- part `rsvp` (last in the canonical order). Nothing else changes.
--
-- Deploy: the migration BEFORE the code (the new code sends the part `rsvp`, which the old functions refuse with
-- UNKNOWN_PART). The OLD code's strict schema of the counts refuses the three new keys, so its „Reset danych” preview
-- and reset fail until the new code is deployed: deploy the code right after the migration.

create or replace function public.reset_counts(p_event_id integer)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_event public.event%rowtype;
  v_ai_used integer;
begin
  select * into v_event from public.event where id = p_event_id;
  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select event_used into v_ai_used from public.ai_topic_usage(p_event_id);

  return jsonb_build_object(
    'guesses', (select count(*) from public.guess where event_id = p_event_id),
    'correctAmountSet', v_event.correct_amount_grosze is not null,
    'intakeOpen', v_event.guess_intake_open,
    'aiAttempts', (select count(*) from public.ai_topic where event_id = p_event_id),
    'aiUsed', coalesce(v_ai_used, 0),
    'seats', (select count(*) from public.seat_assignment where event_id = p_event_id),
    'pinned', (select count(*) from public.seat_assignment where event_id = p_event_id and is_pinned),
    'snapshots', (select count(*) from public.seating_snapshot where event_id = p_event_id),
    'guests', (select count(*) from public.guest where event_id = p_event_id),
    'groups', (select count(*) from public.guest_group where event_id = p_event_id),
    'plan', exists (select 1 from public.venue_plan where event_id = p_event_id),
    'rooms', (select count(*) from public.venue_room where event_id = p_event_id),
    'tables', (select count(*) from public.venue_table where event_id = p_event_id),
    'orders', (select count(*) from public.order_item where event_id = p_event_id)
      + (select count(*) from public.drink_item where event_id = p_event_id),
    'questions', (select count(*) from public.question where event_id = p_event_id),
    'guestAccessEnabled', v_event.guest_access_enabled,
    'quizAnswers', (select count(*) from public.quiz_answer where event_id = p_event_id),
    'quizAsked', (select count(*) from public.quiz_question where event_id = p_event_id and asked_at is not null),
    'rsvpAnswers', (select count(*) from public.guest_rsvp where event_id = p_event_id),
    'rsvpOptions', (select count(*) from public.event_rsvp_option where event_id = p_event_id),
    'rsvpDeadlineSet', v_event.rsvp_deadline is not null
  );
end;
$$;

create or replace function public.reset_event(p_event_id integer, p_parts text[], p_starter_questions jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  c_order constant text[] :=
    array['guesses', 'aiUsage', 'seating', 'guests', 'venue', 'orders', 'questions', 'guestLinks', 'quiz', 'rsvp'];
  v_parts text[];
  v_before jsonb;
  v_questions_added integer := 0;
  v_keys_replaced integer := 0;
begin
  if p_parts is null or coalesce(cardinality(p_parts), 0) = 0 then
    raise exception 'NO_PARTS' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_parts) as part where part is null or part <> all (c_order)) then
    raise exception 'UNKNOWN_PART' using errcode = 'P0001';
  end if;

  -- Implications: no guests means no guesses, AI attempts, seats, quiz answers or RSVP answers (the part `rsvp` also
  -- clears the dish options and the deadline); no tables means no seats. Orders stand alone: without their guest or
  -- table they stay, unassigned.
  v_parts := p_parts;
  if 'guests' = any (v_parts) then
    v_parts := v_parts || array['guesses', 'aiUsage', 'seating', 'quiz', 'rsvp'];
  end if;
  if 'venue' = any (v_parts) then
    v_parts := v_parts || array['seating'];
  end if;
  select array_agg(part order by ord) into v_parts
    from unnest(c_order) with ordinality as o (part, ord)
    where part = any (v_parts);

  if 'questions' = any (v_parts) and (
    p_starter_questions is null
    or jsonb_typeof(p_starter_questions) <> 'array'
    or jsonb_array_length(p_starter_questions) = 0
  ) then
    raise exception 'NO_STARTER_QUESTIONS' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(3003, p_event_id);
  perform pg_advisory_xact_lock(3008, p_event_id);
  perform pg_advisory_xact_lock(3013, p_event_id);
  perform 1 from public.event where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_before := public.reset_counts(p_event_id);

  -- Dependents first: guesses, AI attempts, seats, quiz answers and order lines before the guests and tables they
  -- point at.
  if 'guesses' = any (v_parts) then
    update public.event
      set correct_amount_grosze = null, guess_intake_open = true
      where id = p_event_id;
    delete from public.guess where event_id = p_event_id;
  end if;

  if 'aiUsage' = any (v_parts) then
    delete from public.ai_topic where event_id = p_event_id;
  end if;

  if 'seating' = any (v_parts) then
    delete from public.seat_assignment where event_id = p_event_id;
    -- Snapshot tables and seats go with their snapshot (on delete cascade).
    delete from public.seating_snapshot where event_id = p_event_id;
  end if;

  if 'quiz' = any (v_parts) then
    delete from public.quiz_run where event_id = p_event_id;
    delete from public.quiz_score where event_id = p_event_id;
    delete from public.quiz_answer where event_id = p_event_id;
    update public.quiz_question
      set asked_at = null, closed_at = null
      where event_id = p_event_id and (asked_at is not null or closed_at is not null);
  end if;

  -- RSVP: the answers, the client's dish options and the deadline (RSVP off). Attendance is guest.is_absent, the guest
  -- list's own state (the draw and the publish honour it), so it stays as it is: a guest who answered „no” stays
  -- absent (and now counts as marked by the organizer). The event row is already locked, so no guest's save
  -- (save_guest_rsvp takes it `for share`) lands half before and half after.
  if 'rsvp' = any (v_parts) then
    delete from public.guest_rsvp where event_id = p_event_id;
    delete from public.event_rsvp_option where event_id = p_event_id;
    update public.event set rsvp_deadline = null where id = p_event_id and rsvp_deadline is not null;
  end if;

  if 'orders' = any (v_parts) then
    delete from public.order_item where event_id = p_event_id;
    delete from public.drink_item where event_id = p_event_id;
  end if;

  if 'guests' = any (v_parts) then
    delete from public.guest_group where event_id = p_event_id;
    delete from public.guest where event_id = p_event_id;
  end if;

  if 'venue' = any (v_parts) then
    delete from public.venue_plan where event_id = p_event_id;
    delete from public.venue_table where event_id = p_event_id;
    delete from public.venue_room where event_id = p_event_id;
  end if;

  if 'questions' = any (v_parts) then
    delete from public.question where event_id = p_event_id;
    insert into public.question (event_id, category, text)
    select p_event_id, x.category, x.text
      from rows from (jsonb_to_recordset(p_starter_questions) as (category text, text text))
        with ordinality as x (category, text, ord)
      order by x.ord
    on conflict (event_id, text_key) do nothing;
    get diagnostics v_questions_added = row_count;
  end if;

  if 'guestLinks' = any (v_parts) then
    -- The same expression as the column default (S-05): 18 random bytes in base64url.
    update public.guest
      set access_key = translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_')
      where event_id = p_event_id;
    get diagnostics v_keys_replaced = row_count;
    update public.event set guest_access_enabled = false where id = p_event_id;
  end if;

  return jsonb_build_object(
    'parts', to_jsonb(v_parts),
    'before', v_before,
    'questionsAdded', v_questions_added,
    'guestKeysReplaced', v_keys_replaced
  );
end;
$$;

comment on function public.reset_counts (integer) is
  'Counts of what each reset part would remove (also the RSVP answers, options and whether a deadline is set).';
comment on function public.reset_event (integer, text[], jsonb) is
  'Resets the chosen parts of one event in one transaction (implied parts added; parts up to quiz and rsvp).';

revoke execute on function public.reset_counts (integer) from public, anon, authenticated;
revoke execute on function public.reset_event (integer, text[], jsonb) from public, anon, authenticated;
grant execute on function public.reset_counts (integer) to service_role;
grant execute on function public.reset_event (integer, text[], jsonb) to service_role;
