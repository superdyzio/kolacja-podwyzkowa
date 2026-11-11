-- pub-quiz (S-28; PRD v2 FR-049; NFR-014, NFR-021, NFR-023): the client prepares a pub quiz (e.g. about the person
-- celebrated) and runs it on the TV; guests answer on their phones; there is a score and a result. The quiz is the
-- paid S-17 module `pubQuiz` (its gate is the app's, at the edge — these tables and functions never look at it).
--
-- Additive: four new tables, a sequence and functions; reset_counts / reset_event are replaced with the SAME
-- signatures (the part `quiz` is added). No existing row changes.
--
-- quiz_question: the client's questions (text, 2–4 options, the correct one), in creation order (id). asked_at is set
--   when the question goes on the TV (from then on it is locked for editing and never asked again), closed_at when
--   the client closes it (from then on its answers count). Only the reset part `quiz` clears both.
-- quiz_run: at most one row per event while a quiz runs: the phase (intro → question → reveal → … → results) and the
--   question on the TV. `revision` comes from a global sequence on every change (never reused, like snapshot and
--   spotlight ids): the TV polling token's quiz part.
-- quiz_answer: one row per guest and question (changeable while the question is open); goes with the guest
--   (privacy-retention purges guests, so answers go too).
-- quiz_score: the standings MATERIALIZED when the client shows the results (points, competition place), so the
--   phones' poll never ranks; goes with the guest too.
--
-- Concurrency: every run change takes pg_advisory_xact_lock(3013, event) and the run row FOR UPDATE; a guest's answer
-- locks the run row FOR SHARE and is refused unless its question is the OPEN one, so an answer never lands after a
-- committed close (the save_guest_guess pattern).
--
-- Access model as in the earlier migrations: browser roles get nothing; only the server (service role) reads and
-- writes, through these functions and plain PostgREST queries on quiz_question.

-- 1. Options: 2–4 non-empty texts of at most 80 characters, distinct in any letter case. -------------------------

create function public.quiz_options_valid(p_options text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_options is not null
    and array_ndims(p_options) = 1
    and cardinality(p_options) between 2 and 4
    and not exists (
      select 1 from unnest(p_options) as option_text (value)
      where option_text.value is null or char_length(option_text.value) not between 1 and 80
    )
    and (select count(distinct lower(option_text.value)) from unnest(p_options) as option_text (value))
      = cardinality(p_options);
$$;

revoke execute on function public.quiz_options_valid (text[]) from public, anon, authenticated;

comment on function public.quiz_options_valid (text[]) is
  'pub-quiz: 2–4 options, each 1–80 characters, distinct in any letter case (the CHECK of quiz_question.options).';

-- 2. The questions. -----------------------------------------------------------------------------------------------

create table public.quiz_question (
  id bigint generated always as identity primary key,
  event_id integer not null references public.event (id) on delete cascade,
  text text not null,
  options text[] not null,
  correct_option smallint not null,
  asked_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint quiz_question_event_id_id_key unique (event_id, id),
  constraint quiz_question_text_length check (char_length(text) between 1 and 200),
  constraint quiz_question_options_valid check (public.quiz_options_valid(options)),
  constraint quiz_question_correct_in_range check (correct_option >= 0 and correct_option < cardinality(options)),
  constraint quiz_question_closed_after_asked check (closed_at is null or asked_at is not null)
);

alter table public.quiz_question enable row level security;
revoke all on table public.quiz_question from anon, authenticated;

comment on table public.quiz_question is
  'pub-quiz: the client''s questions (2–4 options, one correct); asked_at = shown (locked), closed_at = answers count.';

-- 3. The run (one row per event while a quiz runs). ----------------------------------------------------------------

create sequence public.quiz_run_revision_seq;
revoke all on sequence public.quiz_run_revision_seq from anon, authenticated;

create table public.quiz_run (
  event_id integer primary key references public.event (id) on delete cascade,
  phase text not null,
  question_id bigint,
  revision bigint not null default nextval('public.quiz_run_revision_seq'),
  updated_at timestamptz not null default now(),
  constraint quiz_run_phase_known check (phase in ('intro', 'question', 'reveal', 'results')),
  constraint quiz_run_question_fkey foreign key (event_id, question_id)
    references public.quiz_question (event_id, id) on delete set null (question_id)
);

alter table public.quiz_run enable row level security;
revoke all on table public.quiz_run from anon, authenticated;

comment on table public.quiz_run is
  'pub-quiz: the running quiz of an event (phase, the question on the TV, revision = TV token part; never reused).';

-- 4. The answers (one per guest and question). ---------------------------------------------------------------------

create table public.quiz_answer (
  question_id bigint not null,
  guest_id bigint not null,
  event_id integer not null,
  choice smallint not null,
  answered_at timestamptz not null default now(),
  primary key (question_id, guest_id),
  constraint quiz_answer_choice_range check (choice between 0 and 3),
  constraint quiz_answer_question_fkey foreign key (event_id, question_id)
    references public.quiz_question (event_id, id) on delete cascade,
  constraint quiz_answer_guest_fkey foreign key (event_id, guest_id)
    references public.guest (event_id, id) on delete cascade
);

create index quiz_answer_event_idx on public.quiz_answer (event_id);
create index quiz_answer_guest_idx on public.quiz_answer (guest_id);

alter table public.quiz_answer enable row level security;
revoke all on table public.quiz_answer from anon, authenticated;

comment on table public.quiz_answer is
  'pub-quiz: a guest''s answer (option index) to one question; changeable while the question is open.';

-- 5. The standings shown at „Pokaż wyniki” (materialized). ---------------------------------------------------------

create table public.quiz_score (
  event_id integer not null references public.event (id) on delete cascade,
  guest_id bigint not null,
  points integer not null,
  place integer not null,
  primary key (event_id, guest_id),
  constraint quiz_score_points_range check (points >= 0),
  constraint quiz_score_place_range check (place >= 1),
  constraint quiz_score_guest_fkey foreign key (event_id, guest_id)
    references public.guest (event_id, id) on delete cascade
);

alter table public.quiz_score enable row level security;
revoke all on table public.quiz_score from anon, authenticated;

comment on table public.quiz_score is
  'pub-quiz: points and competition place per player, computed when the client shows the results.';

-- 6. The client's actions. start: the intro on the TV; ask: a never-asked question goes on the TV (open); close: the
-- open question closes (its answers count) and the TV reveals the correct option; results: the standings are
-- computed and shown; end: the quiz leaves the TV (an open question is closed first, so every asked question ends
-- closed). Never start / ask / results while a question is open. Raises INVALID_ACTION, EVENT_NOT_FOUND (also a
-- template), QUESTION_OPEN, QUESTION_NOT_FOUND (not this event's), QUESTION_ASKED, NO_OPEN_QUESTION.

create function public.quiz_run_action(p_event_id integer, p_action text, p_question_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_phase text;
  v_question bigint;
  v_exists boolean;
  v_asked timestamptz;
begin
  if p_action is null or p_action not in ('start', 'ask', 'close', 'results', 'end') then
    raise exception 'INVALID_ACTION' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(3013, p_event_id);
  perform 1 from public.event where id = p_event_id and not is_template;
  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select r.phase, r.question_id into v_phase, v_question
  from public.quiz_run r
  where r.event_id = p_event_id
  for update;

  if p_action = 'end' then
    if v_phase = 'question' and v_question is not null then
      update public.quiz_question set closed_at = now()
      where event_id = p_event_id and id = v_question and closed_at is null;
    end if;
    delete from public.quiz_run where event_id = p_event_id;
    return;
  end if;

  if p_action = 'close' then
    if v_phase is distinct from 'question' or v_question is null then
      raise exception 'NO_OPEN_QUESTION' using errcode = 'P0001';
    end if;
    update public.quiz_question set closed_at = now()
    where event_id = p_event_id and id = v_question and closed_at is null;
    update public.quiz_run
    set phase = 'reveal', revision = nextval('public.quiz_run_revision_seq'), updated_at = now()
    where event_id = p_event_id;
    return;
  end if;

  -- A question deleted while on the TV leaves phase 'question' without a question (FK set null): not open.
  if v_phase = 'question' and v_question is not null then
    raise exception 'QUESTION_OPEN' using errcode = 'P0001';
  end if;

  if p_action = 'ask' then
    select true, q.asked_at into v_exists, v_asked
    from public.quiz_question q
    where q.event_id = p_event_id and q.id = p_question_id
    for update;
    if v_exists is null then
      raise exception 'QUESTION_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_asked is not null then
      raise exception 'QUESTION_ASKED' using errcode = 'P0001';
    end if;
    update public.quiz_question set asked_at = now() where event_id = p_event_id and id = p_question_id;
    insert into public.quiz_run (event_id, phase, question_id, revision, updated_at)
    values (p_event_id, 'question', p_question_id, nextval('public.quiz_run_revision_seq'), now())
    on conflict (event_id) do update
      set phase = excluded.phase,
          question_id = excluded.question_id,
          revision = excluded.revision,
          updated_at = excluded.updated_at;
    return;
  end if;

  if p_action = 'results' then
    -- Players: guests with at least one answer to a closed question; 1 point per correct one; competition places.
    delete from public.quiz_score where event_id = p_event_id;
    insert into public.quiz_score (event_id, guest_id, points, place)
    select p_event_id, standing.guest_id, standing.points,
      (rank() over (order by standing.points desc))::integer
    from (
      select a.guest_id, (count(*) filter (where a.choice = q.correct_option))::integer as points
      from public.quiz_answer a
      join public.quiz_question q on q.id = a.question_id and q.event_id = a.event_id
      where a.event_id = p_event_id and q.closed_at is not null
      group by a.guest_id
    ) as standing;
  end if;

  insert into public.quiz_run (event_id, phase, question_id, revision, updated_at)
  values (
    p_event_id,
    case when p_action = 'results' then 'results' else 'intro' end,
    null,
    nextval('public.quiz_run_revision_seq'),
    now()
  )
  on conflict (event_id) do update
    set phase = excluded.phase,
        question_id = null,
        revision = excluded.revision,
        updated_at = excluded.updated_at;
end;
$$;

revoke execute on function public.quiz_run_action (integer, text, bigint) from public, anon, authenticated;

comment on function public.quiz_run_action (integer, text, bigint) is
  'pub-quiz: start / ask / close / results / end of an event''s quiz, under the per-event quiz lock.';

-- 7. A guest's answer: only to the event's OPEN question (anything else — unknown, another event's, not asked yet,
-- closed, no quiz — is QUIZ_CLOSED, one code for all); an option index of that question (else OPTION_OUT_OF_RANGE);
-- a guest of the event (else GUEST_NOT_FOUND). The run row is locked FOR SHARE: a close waits for the answers in
-- flight and every later answer sees the question closed.

create function public.save_quiz_answer(p_event_id integer, p_guest_id bigint, p_question_id bigint, p_choice integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_phase text;
  v_question bigint;
  v_options integer;
begin
  select r.phase, r.question_id into v_phase, v_question
  from public.quiz_run r
  where r.event_id = p_event_id
  for share;
  if v_phase is distinct from 'question' or v_question is null or v_question is distinct from p_question_id then
    raise exception 'QUIZ_CLOSED' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.guest where id = p_guest_id and event_id = p_event_id) then
    raise exception 'GUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  select cardinality(q.options) into v_options
  from public.quiz_question q
  where q.event_id = p_event_id and q.id = p_question_id;
  if p_choice is null or v_options is null or p_choice < 0 or p_choice >= v_options then
    raise exception 'OPTION_OUT_OF_RANGE' using errcode = 'P0001';
  end if;

  insert into public.quiz_answer (question_id, guest_id, event_id, choice, answered_at)
  values (p_question_id, p_guest_id, p_event_id, p_choice, now())
  on conflict (question_id, guest_id) do update
    set choice = excluded.choice, answered_at = excluded.answered_at;
end;
$$;

revoke execute on function public.save_quiz_answer (integer, bigint, bigint, integer) from public, anon, authenticated;

comment on function public.save_quiz_answer (integer, bigint, bigint, integer) is
  'pub-quiz: saves a guest''s answer to the event''s open question (QUIZ_CLOSED for every other question id).';

-- 8. The guest's own quiz for the phone's poll (one round trip; both the 204 and the 200 path call it while the
-- module is on). Null without a run (or for a guest of another event). The correct option only once the question is
-- closed (reveal); the own answer, the own points (correct answers to closed questions) and, at the results, the own
-- place among the players. Nothing about other guests.

create function public.quiz_guest_state(p_event_id integer, p_guest_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'phase', r.phase,
    'total', (select count(*) from public.quiz_question q where q.event_id = r.event_id),
    'closed', (
      select count(*) from public.quiz_question q where q.event_id = r.event_id and q.closed_at is not null
    ),
    'question', case
      when r.phase in ('question', 'reveal') and shown.id is not null then jsonb_build_object(
        'id', shown.id,
        'number', (
          select count(*) from public.quiz_question q where q.event_id = r.event_id and q.id <= shown.id
        ),
        'text', shown.text,
        'options', to_jsonb(shown.options),
        'correct', case when r.phase = 'reveal' then shown.correct_option end
      )
    end,
    'answer', case
      when r.phase in ('question', 'reveal') and shown.id is not null then (
        select a.choice from public.quiz_answer a where a.question_id = shown.id and a.guest_id = g.id
      )
    end,
    'points', (
      select count(*)
      from public.quiz_answer a
      join public.quiz_question q on q.id = a.question_id and q.event_id = a.event_id
      where a.guest_id = g.id and a.event_id = r.event_id and q.closed_at is not null
        and a.choice = q.correct_option
    ),
    'result', case
      when r.phase = 'results' then (
        select jsonb_build_object(
          'place', s.place,
          'players', (select count(*) from public.quiz_score other where other.event_id = r.event_id)
        )
        from public.quiz_score s
        where s.event_id = r.event_id and s.guest_id = g.id
      )
    end
  )
  from public.quiz_run r
  join public.guest g on g.id = p_guest_id and g.event_id = r.event_id
  left join public.quiz_question shown on shown.event_id = r.event_id and shown.id = r.question_id
  where r.event_id = p_event_id;
$$;

revoke execute on function public.quiz_guest_state (integer, bigint) from public, anon, authenticated;

comment on function public.quiz_guest_state (integer, bigint) is
  'pub-quiz: the guest''s own quiz (phase, the shown question, own answer, own points, own place) or null.';

-- 9. The TV: the token part (<revision>-<answers of the event>; null without a run) and the whole state. The state's
-- `version` is computed by the version function inside the same statement, so the TV page and its poll agree.
-- Before the results nothing names a guest; per-option counts only once the question is closed.

create function public.quiz_tv_version(p_event_id integer)
returns text
language sql
stable
set search_path = ''
as $$
  select r.revision::text || '-' || (
    select count(*) from public.quiz_answer a where a.event_id = r.event_id
  )::text
  from public.quiz_run r
  where r.event_id = p_event_id;
$$;

revoke execute on function public.quiz_tv_version (integer) from public, anon, authenticated;

comment on function public.quiz_tv_version (integer) is
  'pub-quiz: the TV token part of the event''s quiz (<revision>-<answer count>) or null without a run.';

create function public.quiz_tv_state(p_event_id integer)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'version', public.quiz_tv_version(r.event_id),
    'phase', r.phase,
    'total', (select count(*) from public.quiz_question q where q.event_id = r.event_id),
    'closed', (
      select count(*) from public.quiz_question q where q.event_id = r.event_id and q.closed_at is not null
    ),
    'question', case
      when r.phase in ('question', 'reveal') and shown.id is not null then jsonb_build_object(
        'number', (
          select count(*) from public.quiz_question q where q.event_id = r.event_id and q.id <= shown.id
        ),
        'text', shown.text,
        'options', to_jsonb(shown.options),
        'answered', (
          select count(*) from public.quiz_answer a where a.question_id = shown.id and a.event_id = r.event_id
        ),
        'correct', case when r.phase = 'reveal' then shown.correct_option end,
        'counts', case when r.phase = 'reveal' then (
          select jsonb_agg(
            (
              select count(*) from public.quiz_answer a
              where a.question_id = shown.id and a.event_id = r.event_id and a.choice = slot.n
            )
            order by slot.n
          )
          from generate_series(0, cardinality(shown.options) - 1) as slot (n)
        ) end
      )
    end,
    'results', case
      when r.phase = 'results' then jsonb_build_object(
        'players', (select count(*) from public.quiz_score s where s.event_id = r.event_id),
        -- Every player on places 1–3 (TV_RESULTS_PLACES); the app orders names and cuts the list.
        'top', coalesce((
          select jsonb_agg(jsonb_build_object('place', s.place, 'name', g.display_name, 'points', s.points))
          from public.quiz_score s
          join public.guest g on g.id = s.guest_id and g.event_id = s.event_id
          where s.event_id = r.event_id and s.place <= 3
        ), '[]'::jsonb)
      )
    end
  )
  from public.quiz_run r
  left join public.quiz_question shown on shown.event_id = r.event_id and shown.id = r.question_id
  where r.event_id = p_event_id;
$$;

revoke execute on function public.quiz_tv_state (integer) from public, anon, authenticated;

comment on function public.quiz_tv_state (integer) is
  'pub-quiz: what the TV shows of the event''s quiz (no ids; names only at the results) or null without a run.';

-- 10. The client's board: the run, every question with its per-option counts, the live standings (guests with at
-- least one answer to a closed question) and the number of guests. Null for an unknown event or a template.

create function public.quiz_board(p_event_id integer)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'run', (
      select jsonb_build_object('phase', r.phase, 'questionId', r.question_id)
      from public.quiz_run r
      where r.event_id = e.id
    ),
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'text', q.text,
          'options', to_jsonb(q.options),
          'correct', q.correct_option,
          'askedAt', q.asked_at,
          'closedAt', q.closed_at,
          'counts', (
            select jsonb_agg(
              (
                select count(*) from public.quiz_answer a
                where a.question_id = q.id and a.event_id = q.event_id and a.choice = slot.n
              )
              order by slot.n
            )
            from generate_series(0, cardinality(q.options) - 1) as slot (n)
          )
        )
        order by q.id
      )
      from public.quiz_question q
      where q.event_id = e.id
    ), '[]'::jsonb),
    'standings', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'guestId', standing.guest_id,
          'name', g.display_name,
          'points', standing.points,
          'answered', standing.answered
        )
      )
      from (
        select a.guest_id,
          count(*) filter (where a.choice = q.correct_option) as points,
          count(*) as answered
        from public.quiz_answer a
        join public.quiz_question q on q.id = a.question_id and q.event_id = a.event_id
        where a.event_id = e.id and q.closed_at is not null
        group by a.guest_id
      ) as standing
      join public.guest g on g.id = standing.guest_id and g.event_id = e.id
    ), '[]'::jsonb),
    'guestCount', (select count(*) from public.guest where event_id = e.id)
  )
  from public.event e
  where e.id = p_event_id and not e.is_template;
$$;

revoke execute on function public.quiz_board (integer) from public, anon, authenticated;

comment on function public.quiz_board (integer) is
  'pub-quiz: the client''s quiz board (run, questions with per-option counts, live standings, guest count).';

-- 11. Reset: the part `quiz` (answers, standings and the run go; every question can be asked again; the questions
-- stay). Copies of the latest versions (20261109120000_multi_tenant_events.sql) with the same signatures; `guests`
-- implies `quiz`; the reset also takes the quiz lock (3013, event).

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
    'quizAsked', (select count(*) from public.quiz_question where event_id = p_event_id and asked_at is not null)
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
    array['guesses', 'aiUsage', 'seating', 'guests', 'venue', 'orders', 'questions', 'guestLinks', 'quiz'];
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

  -- Implications: no guests means no guesses, AI attempts, seats or quiz answers; no tables means no seats. Orders
  -- stand alone: without their guest or table they stay, unassigned.
  v_parts := p_parts;
  if 'guests' = any (v_parts) then
    v_parts := v_parts || array['guesses', 'aiUsage', 'seating', 'quiz'];
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
