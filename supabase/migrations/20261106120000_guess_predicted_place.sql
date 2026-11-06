-- guess-place: next to the guess of the dinner's cost a guest may predict their own final place in the ranking. The
-- ranking is still measured from the amount only; the prediction decides a consolation prize (the organizer's
-- ranking lights everyone who hit their place). Additive only: existing guesses get no prediction, and
-- save_guest_guess stays as it is for the code that runs between `supabase db push` and the deploy.
--
-- guess.predicted_place: null = no prediction; 1 … 100 here (MAX_GUESTS), the app also refuses anything above the
--   current number of guests. Deleting the guess (or the guest, or a reset of the guesses) deletes the prediction.
-- save_guest_guess_with_place(): the guest's own save of the amount AND the prediction together (null clears it),
--   under the same intake lock as save_guest_guess. A new name, not an overload: PostgREST could not pick between
--   save_guest_guess(a, b) and save_guest_guess(a, b, c default …) for a two-argument call. save_guest_guess keeps
--   the stored prediction (its upsert does not name the column), which is what phones with the old page send.

alter table public.guess
  add column predicted_place integer,
  add constraint guess_predicted_place_range check (predicted_place is null or predicted_place between 1 and 100);

comment on column public.guess.predicted_place is
  'The guest''s optional prediction of their own final place in the ranking (1 … number of guests), null = none.';

create function public.save_guest_guess_with_place(
  p_guest_id bigint,
  p_amount_grosze integer,
  p_predicted_place integer
)
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

  -- Holds the event row against a concurrent close until this transaction ends (as save_guest_guess).
  perform 1 from public.event where id = v_event_id and guess_intake_open for share;
  if not found then
    raise exception 'INTAKE_CLOSED' using errcode = 'P0001';
  end if;

  insert into public.guess (guest_id, event_id, amount_grosze, predicted_place, entered_by, updated_at)
  values (p_guest_id, v_event_id, p_amount_grosze, p_predicted_place, 'guest', now())
  on conflict (guest_id) do update
    set amount_grosze = excluded.amount_grosze,
        predicted_place = excluded.predicted_place,
        entered_by = 'guest',
        updated_at = now();
end;
$$;

comment on function public.save_guest_guess_with_place (bigint, integer, integer) is
  'Saves or replaces a guest''s own guess and place prediction while intake is open (atomic against a close).';

revoke execute on function public.save_guest_guess_with_place (bigint, integer, integer)
  from public, anon, authenticated;
