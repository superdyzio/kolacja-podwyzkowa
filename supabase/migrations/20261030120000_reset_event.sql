-- organizer-reset: the organizer's „Reset danych” — chosen parts of the event's data wiped in one transaction
-- (user request 2026-10-30; e.g. clearing the rehearsal before the dinner).
--
-- Parts (ids shared with src/lib/reset/parts.ts, which owns the Polish labels and texts):
--   guesses     every guess deleted, the correct amount cleared, guess intake open again;
--   aiUsage     every AI topic attempt deleted (the evening's pool and every guest's quota start from zero);
--   seating     the working arrangement (pins included) and ALL published snapshots deleted: the TV and phones show
--               nothing published, the neighbour history starts from zero;
--   guests      every guest and group deleted — implies guesses, aiUsage and seating;
--   venue       the plan image, every room and table deleted — implies seating;
--   questions   every question deleted, then the starter base inserted (the rows come as p_starter_questions from
--               starterQuestionRows() in src/lib/questions/seed.ts, so the 90 texts have one source);
--   guestLinks  a fresh access key for every guest (printed cards stop working) and guest access switched off.
-- The event row itself, its name and the organizer and TV keys never change.
--
-- Invariants:
--   * DELETE only (never TRUNCATE … RESTART IDENTITY): snapshot ids keep growing, so the TV and guest polling tokens
--     ("<snapshot id>.<plan version>") never come back to a value a screen already shows.
--   * One transaction, locks in a fixed order matching every writer's first lock: advisory 3003 (seat_guest,
--     publish_seating, replace_seating), advisory 3008 (reserve_ai_topic), then the event row FOR UPDATE, which waits
--     for in-flight save_guest_guess calls (they hold it FOR SHARE) before any guess is deleted.
--   * Implications are expanded here as well as in the app; an empty list or an unknown id raises before anything
--     is touched.
--   * The counts returned as "before" are read inside this transaction after the locks, so the organizer's summary
--     says exactly what was removed.
--
-- Access model as in the earlier migrations: browser roles cannot call either function.

-- What the reset would remove, per kind (read-only). Raises EVENT_NOT_FOUND.
create function public.reset_counts(p_event_id smallint)
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
    'questions', (select count(*) from public.question where event_id = p_event_id),
    'guestAccessEnabled', v_event.guest_access_enabled
  );
end;
$$;

comment on function public.reset_counts (smallint) is
  'Counts of what the organizer reset would remove (guesses, AI attempts, seats, snapshots, guests, venue, questions).';

-- Resets the chosen parts atomically and returns
--   { "parts": [expanded ids in canonical order], "before": reset_counts(), "questionsAdded": n,
--     "guestKeysReplaced": n }.
-- Raises NO_PARTS, UNKNOWN_PART, NO_STARTER_QUESTIONS (questions chosen without starter rows) or EVENT_NOT_FOUND.
create function public.reset_event(p_event_id smallint, p_parts text[], p_starter_questions jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  c_order constant text[] := array['guesses', 'aiUsage', 'seating', 'guests', 'venue', 'questions', 'guestLinks'];
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

  -- Implications: no guests means no guesses, AI attempts or seats; no tables means no seats.
  v_parts := p_parts;
  if 'guests' = any (v_parts) then
    v_parts := v_parts || array['guesses', 'aiUsage', 'seating'];
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

  perform pg_advisory_xact_lock(3003);
  perform pg_advisory_xact_lock(3008);
  perform 1 from public.event where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_before := public.reset_counts(p_event_id);

  -- Dependents first: guesses, AI attempts and seats before the guests and tables they point at.
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

comment on function public.reset_event (smallint, text[], jsonb) is
  'The organizer reset: wipes the chosen parts (with implied ones) in one transaction; keys and the event row stay.';

revoke execute on function public.reset_counts (smallint) from public, anon, authenticated;
grant execute on function public.reset_counts (smallint) to service_role;

revoke execute on function public.reset_event (smallint, text[], jsonb) from public, anon, authenticated;
grant execute on function public.reset_event (smallint, text[], jsonb) to service_role;
