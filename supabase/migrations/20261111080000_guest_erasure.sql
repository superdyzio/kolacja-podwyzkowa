-- guest-erasure (PR #4 review, the user's decision 1; GDPR art. 17): deleting a guest erases their name from every
-- published snapshot of the event and from the TV, in the same transaction as the delete — no republish needed.
--
-- Until now a published snapshot kept a deleted guest's name (seating_snapshot_seat.guest_id `on delete set null`,
-- guest_name kept) and the TV, the tablet, the prints and every tablemate's phone showed it until the next publish;
-- the older snapshots kept it until the retention purge. A „person” on the TV (tv_spotlight) kept it until hidden.
--
-- 1. seating_snapshot.erased_seats: how many seats of the snapshot were erased since its publish (only ever grows).
--    Snapshot ids are never reused, so (id, erased_seats) names what the TV shows: the TV's polling token carries it
--    ("<snapshot id>-<erased>.<plan version>…" once it is above 0) and the guest's token folds it into its hashed part,
--    so screens drop the name on their next poll. Snapshots are immutable EXCEPT for this erasure.
-- 2. tv_spotlight.guest_id: the guest a „person” row shows (composite foreign key to guest (event_id, id),
--    on delete cascade: the row goes with the guest, also after a rename). Null for questions and topics.
-- 3. Trigger guest_erase_published (BEFORE delete on guest — after it, the foreign key has already nulled guest_id):
--    deletes the guest's seat rows in every snapshot (the seat then reads as empty everywhere, exactly like a seat
--    nobody had: TV, phones, tablet, floors, prints, export, offline copies, fingerprints, restore, history), bumps
--    those snapshots' erased_seats (rows locked in id order, so two deletes never deadlock on them) and deletes a
--    „person” row still showing the guest by name without a guest id (written by the code of before this migration
--    during the deploy window). The retention purge and the reset delete the snapshots and the spotlight BEFORE the
--    guests, so there the trigger finds nothing.
-- 4. Backfill — NOT data-preserving on purpose (the user's decision 1): the names of guests deleted BEFORE this
--    migration (seat rows with guest_id null) are deleted and their snapshots bumped, so a live TV drops them on its
--    next poll after the deploy; „person” rows get their guest by name (any letter case), and the ones whose guest is
--    gone (deleted, or renamed since the draw) are deleted — the TV goes back to the plan.
--
-- Old code on the migrated database: it reads snapshots without erased_seats (its tokens just do not notice an erasure
-- until the next publish), shows an erased seat as empty, and inserts „person” rows without a guest id (the trigger's
-- name match covers them). Migration BEFORE the code, as always.

-- 1. The erasure counter ---------------------------------------------------------------------------------------------

alter table public.seating_snapshot
  add column erased_seats integer not null default 0,
  add constraint seating_snapshot_erased_seats check (erased_seats >= 0);

comment on column public.seating_snapshot.erased_seats is
  'guest-erasure: seats erased from this snapshot since its publish (a deleted guest); part of the TV and guest tokens.';

comment on table public.seating_snapshot is
  'A published seating arrangement (immutable except for erasure: a deleted guest''s seats are removed and erased_seats '
  'grows); id = published version, the highest id is what the TV shows.';

comment on table public.seating_snapshot_seat is
  'Who sat where in a published snapshot, with the display name at publish time; a deleted guest''s rows are deleted '
  '(guest-erasure).';

-- 2. The guest a „person” on the TV shows -----------------------------------------------------------------------------

alter table public.tv_spotlight
  add column guest_id bigint,
  add constraint tv_spotlight_guest_fkey foreign key (event_id, guest_id)
    references public.guest (event_id, id) on delete cascade,
  add constraint tv_spotlight_guest_person check (guest_id is null or kind = 'person');

comment on column public.tv_spotlight.guest_id is
  'guest-erasure: the guest a ''person'' row shows (the row goes with the guest); null for questions and topics.';

-- 3. Erasure on delete -----------------------------------------------------------------------------------------------

create function public.guest_erase_published()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_snapshots bigint[];
begin
  -- The event itself is being deleted (its cascade deletes the guests): its snapshots and spotlight go with it, and a
  -- snapshot row updated twice in this transaction would re-check its foreign key against the deleted event.
  if not exists (select 1 from public.event where id = old.event_id) then
    return old;
  end if;

  with erased as (
    delete from public.seating_snapshot_seat
    where guest_id = old.id
    returning snapshot_id
  )
  select coalesce(array_agg(distinct snapshot_id order by snapshot_id), '{}') into v_snapshots from erased;

  if cardinality(v_snapshots) > 0 then
    perform 1 from public.seating_snapshot where id = any (v_snapshots) order by id for update;
    update public.seating_snapshot set erased_seats = erased_seats + 1 where id = any (v_snapshots);
  end if;

  -- A „person” row with the guest's id goes by the foreign key's cascade; one without (old code) by the name.
  delete from public.tv_spotlight
  where event_id = old.event_id
    and kind = 'person'
    and guest_id is null
    and lower(text) = lower(old.display_name);

  return old;
end;
$$;

revoke execute on function public.guest_erase_published () from public, anon, authenticated;
grant execute on function public.guest_erase_published () to service_role;

comment on function public.guest_erase_published () is
  'guest-erasure: before a guest is deleted, removes their seats from every published snapshot (bumping erased_seats) '
  'and a TV „person” row showing them by name.';

create trigger guest_erase_published
before delete on public.guest
for each row execute function public.guest_erase_published();

-- 4. Backfill: names left behind by guests deleted before this migration ---------------------------------------------

with erased as (
  delete from public.seating_snapshot_seat
  where guest_id is null
  returning snapshot_id
),
counted as (
  select snapshot_id, count(*)::integer as seats from erased group by snapshot_id
)
update public.seating_snapshot s
set erased_seats = s.erased_seats + counted.seats
from counted
where s.id = counted.snapshot_id;

update public.tv_spotlight s
set guest_id = g.id
from public.guest g
where s.kind = 'person'
  and s.guest_id is null
  and g.event_id = s.event_id
  and lower(g.display_name) = lower(s.text);

delete from public.tv_spotlight where kind = 'person' and guest_id is null;
