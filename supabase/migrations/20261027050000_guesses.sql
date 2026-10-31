-- S-06 guesses-and-ranking: guests' guesses of the final raise amount, the intake switch and the correct amount
-- (PRD US-04, FR-017, FR-018, FR-019, FR-020, Guardrails, Access Control).
--
-- guess: at most one guess per guest (guest_id is the primary key), the amount in integer grosze
--   (0 … 1 000 000 000 = 10 000 000,00 zł; no floating point anywhere). entered_by tells a guest's own guess from one
--   the organizer typed in for them. Deleting the guest deletes the guess.
-- event.guess_intake_open: the organizer's switch (FR-019). Open by default: guests can guess as soon as guest access
--   is on. While closed, guests cannot save or change a guess; the organizer still can (proxy entries, FR-018).
-- event.correct_amount_grosze: the correct amount (FR-020), null until the organizer enters it. The ranking is
--   computed by the app (src/lib/guesses/ranking.ts) and shown to the organizer only.
--
-- Guests write only through save_guest_guess(): it locks the event row FOR SHARE while intake is open and upserts in
-- the same transaction. Closing intake is an UPDATE of that row, so it waits for in-flight saves, and a save waiting
-- behind a close re-reads the flag and is refused: no guest guess lands after a committed close.
--
-- Access model as in the earlier migrations: browser roles get nothing. Guests and the TV never read this table
-- directly; the guest's phone gets only its own guess and the intake flag through the server.

alter table public.event
  add column guess_intake_open boolean not null default true,
  add column correct_amount_grosze integer,
  add constraint event_correct_amount_range
    check (correct_amount_grosze is null or correct_amount_grosze between 0 and 1000000000);

comment on column public.event.guess_intake_open is
  'Guess intake switch (FR-019): guests may save or change their guess only while true (the default).';
comment on column public.event.correct_amount_grosze is
  'The correct raise amount in grosze (FR-020), null until entered; the organizer-only ranking is measured from it.';

create table public.guess (
  guest_id bigint primary key references public.guest (id) on delete cascade,
  event_id smallint not null default 1 references public.event (id) on delete cascade,
  amount_grosze integer not null,
  entered_by text not null default 'guest',
  updated_at timestamptz not null default now(),
  constraint guess_amount_range check (amount_grosze between 0 and 1000000000),
  constraint guess_entered_by_known check (entered_by in ('guest', 'organizer'))
);

comment on table public.guess is
  'One guess of the final raise amount per guest, in integer grosze; entered by the guest or by the organizer.';

-- The guest's own save (FR-017): refused once intake is closed. Raises GUEST_NOT_FOUND or INTAKE_CLOSED; the app maps
-- these messages to statuses.
create function public.save_guest_guess(p_guest_id bigint, p_amount_grosze integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_event_id smallint;
begin
  select event_id into v_event_id from public.guest where id = p_guest_id;
  if not found then
    raise exception 'GUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Holds the event row against a concurrent close until this transaction ends.
  perform 1 from public.event where id = v_event_id and guess_intake_open for share;
  if not found then
    raise exception 'INTAKE_CLOSED' using errcode = 'P0001';
  end if;

  insert into public.guess (guest_id, event_id, amount_grosze, entered_by, updated_at)
  values (p_guest_id, v_event_id, p_amount_grosze, 'guest', now())
  on conflict (guest_id) do update
    set amount_grosze = excluded.amount_grosze,
        entered_by = 'guest',
        updated_at = now();
end;
$$;

comment on function public.save_guest_guess (bigint, integer) is
  'Saves or replaces a guest''s own guess while intake is open (atomic against a concurrent close).';

alter table public.guess enable row level security;

revoke all on table public.guess from anon, authenticated;

revoke execute on function public.save_guest_guess (bigint, integer) from public, anon, authenticated;
grant execute on function public.save_guest_guess (bigint, integer) to service_role;
