-- S-04 reshuffle-draft-and-publish: write a drawn draft (or a restored published snapshot) into the working seating
-- arrangement in one step (PRD US-02, FR-009, FR-010).
--
-- Draw model: the draft IS the working arrangement (seat_assignment). The organizer's browser computes the draft
-- (src/lib/seating/draw.ts); the server re-checks the hard rules against the current data (validateDraft in
-- src/lib/seating/draft.ts) or maps an older snapshot back onto today's venue (restoreSeats, same file), and then
-- calls replace_seating() with the rows of every NON-pinned guest who gets a seat. Pinned rows are never touched
-- (pins are locks, S-03), absent non-pinned guests lose their seats. The TV and phones keep showing the latest
-- snapshot until the organizer publishes (publish_seating(), S-03).
--
-- Atomic: one transaction under the same advisory lock as seat_guest() and publish_seating(), so a publish never
-- copies half a draft. Any constraint violation (a guest or seat twice, a seat held by a pinned row, a guest or table
-- deleted meanwhile, a seat above the table's count) aborts the whole call and leaves the arrangement as it was;
-- the app answers "changed meanwhile, draw again".
--
-- Access model as in the earlier migrations: browser roles cannot call it.

create function public.replace_seating(p_seats jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(3003);

  -- Lock the tables involved (stable order) so a concurrent seat-count change waits instead of racing the range
  -- check.
  perform 1 from public.venue_table
    where id in (select x.table_id from jsonb_to_recordset(p_seats) as x (guest_id bigint, table_id bigint, seat integer))
    order by id
    for share;

  delete from public.seat_assignment where not is_pinned;

  insert into public.seat_assignment (guest_id, table_id, seat)
  select x.guest_id, x.table_id, x.seat
    from jsonb_to_recordset(p_seats) as x (guest_id bigint, table_id bigint, seat integer);
end;
$$;

comment on function public.replace_seating (jsonb) is
  'Replaces every non-pinned working seat with the given rows [{guest_id, table_id, seat}] atomically (draft / restore).';

revoke execute on function public.replace_seating (jsonb) from public, anon, authenticated;
grant execute on function public.replace_seating (jsonb) to service_role;
