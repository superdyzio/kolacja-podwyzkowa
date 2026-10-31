-- tv-spotlight: what the organizer puts on the TV over the seating plan — a drawn question, an AI topic or a randomly
-- drawn present guest — so the whole room sees it.
--
-- tv_spotlight: at most one live row per event in practice. Every show INSERTS a new row and then deletes the event's
--   older rows; hiding deletes them all. The identity id is therefore the last part of the TV polling token
--   ("<snapshot id>.<plan version>.<spotlight id>", 0 = nothing shown): monotonic and never reused, so every show —
--   also the same text again after hiding it — is a new version for the TV. Readers take the newest row, so a show
--   cut off between its insert and its delete is harmless (the next show or hide cleans up).
-- The text is stored only because the organizer explicitly sent it to the TV (the one exception to "AI topic text is
--   never stored"; a guest's topic can never get here): question 5–300, topic ≤ 300, a guest's name ≤ 40 characters,
--   all within 1–300 here. Any reset clears it (the app deletes the rows after reset_event).
--
-- Access model as in the earlier migrations: browser roles get nothing; only the server (service role) reads and
-- writes, with plain inserts and deletes.

create table public.tv_spotlight (
  id bigint generated always as identity primary key,
  event_id smallint not null default 1 references public.event (id) on delete cascade,
  kind text not null,
  text text not null,
  shown_at timestamptz not null default now(),
  constraint tv_spotlight_kind_known check (kind in ('question', 'topic', 'person')),
  constraint tv_spotlight_text_length check (char_length(text) between 1 and 300)
);

comment on table public.tv_spotlight is
  'What the organizer shows on the TV over the seating (question, AI topic or drawn guest); newest row wins, id = TV token part.';

create index tv_spotlight_event_id_idx on public.tv_spotlight (event_id, id desc);

alter table public.tv_spotlight enable row level security;
revoke all on table public.tv_spotlight from anon, authenticated;
