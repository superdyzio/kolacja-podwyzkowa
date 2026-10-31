-- ai-spend: what the AI topics cost and why they fail, for the organizer (follow-up to S-08).
--
-- ai_topic gains, per attempt:
--   model                        which model answered (null for the mock provider);
--   input_tokens, output_tokens  the provider's own token counts for an answer it billed — a success, or a failure
--                                after the provider answered (refusal, cut-off, empty, off-limits); null when nothing
--                                was billed (mock, timeout, network, HTTP errors);
--   failure_kind, http_status    why a failed attempt failed (AiFailureKind in src/lib/ai-topics/provider.ts) and the
--                                provider's HTTP status. No CHECK on the kind: the failure write is best effort, and a
--                                new kind must never make it fail (the attempt would stay pending and lose the reason).
-- ai_topic_tokens() sums the tokens per model; the prices live in the app (src/lib/ai-topics/cost.ts), so the estimate
-- follows a price change without a migration. Resetting "aiUsage" deletes the rows: the estimate restarts with the
-- counters. Nothing here reaches guests or the TV.

alter table public.ai_topic
  add column model text,
  add column input_tokens integer,
  add column output_tokens integer,
  add column failure_kind text,
  add column http_status smallint,
  add constraint ai_topic_tokens_not_negative check (
    (input_tokens is null or input_tokens >= 0) and (output_tokens is null or output_tokens >= 0)
  );

-- Billed tokens of the evening per model (rows without token counts left out), read-only.
create function public.ai_topic_tokens(p_event_id smallint)
returns table (model text, input_tokens bigint, output_tokens bigint)
language sql
stable
set search_path = ''
as $$
  select
    attempt.model,
    coalesce(sum(attempt.input_tokens), 0)::bigint,
    coalesce(sum(attempt.output_tokens), 0)::bigint
  from public.ai_topic as attempt
  where attempt.event_id = p_event_id
    and (attempt.input_tokens is not null or attempt.output_tokens is not null)
  group by attempt.model
  order by attempt.model nulls first;
$$;

comment on function public.ai_topic_tokens (smallint) is
  'Billed AI topic tokens of the evening per model, for the organizer''s cost estimate.';

revoke execute on function public.ai_topic_tokens (smallint) from public, anon, authenticated;
grant execute on function public.ai_topic_tokens (smallint) to service_role;
