-- S-07 question-base-and-draw: the event's conversation questions (PRD US-03, FR-014, FR-015).
--
-- question: one question with exactly one category — 'kontrowersyjne' (spicy, opinion-splitting), 'generyczne'
--   (easy, for anyone) or 'refleksyjne' (deeper, personal). The same values name the AI-topic categories of S-08
--   (src/lib/questions/categories.ts). The text is stored already normalized by the app (src/lib/questions/text.ts:
--   NFC, single spaces, trimmed, 5–300 characters).
-- text_key: lower(text), generated. Questions are unique per event regardless of letter case ACROSS ALL categories,
--   so the same question never sits in two categories and a starter question the organizer moved to another category
--   is not added again. Being a plain column, it is also a PostgREST on_conflict target: the app inserts with
--   "on conflict (event_id, text_key) do nothing" (supabase-js upsert with ignoreDuplicates) and counts what was
--   really added from the returned rows (pastes and the idempotent starter load).
-- The starter base (~30 per category) lives in the app (src/lib/questions/seed.ts) and is inserted when the event is
--   created and on the organizer's "Wczytaj bazę startową"; this migration adds no rows.
--
-- Access model as in the earlier migrations: browser roles get nothing. Guests and the TV never read this table:
-- a guest receives only the one question the server drew for them, the TV nothing.

create table public.question (
  id bigint generated always as identity primary key,
  event_id smallint not null default 1 references public.event (id) on delete cascade,
  category text not null,
  text text not null,
  text_key text generated always as (lower(text)) stored,
  created_at timestamptz not null default now(),
  constraint question_category_known check (category in ('kontrowersyjne', 'generyczne', 'refleksyjne')),
  constraint question_text_format check (
    char_length(text) between 5 and 300
    and text !~ '^[[:space:]]'
    and text !~ '[[:space:]]$'
    and text !~ '[[:space:]]{2}'
    and text !~ '[\t\n\r]'
  ),
  constraint question_text_unique unique (event_id, text_key)
);

comment on table public.question is
  'Conversation question with one category; unique per event case-insensitively (text_key) across categories.';
comment on column public.question.text_key is
  'lower(text): the uniqueness key and the on_conflict target for idempotent inserts.';

create index question_event_category_idx on public.question (event_id, category);

alter table public.question enable row level security;

revoke all on table public.question from anon, authenticated;
