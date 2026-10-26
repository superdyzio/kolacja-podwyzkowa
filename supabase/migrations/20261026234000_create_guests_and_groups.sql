-- S-01 guest-list-and-groups: guests, inseparable groups and absences (PRD FR-001, FR-002, FR-003).
--
-- guest: one person at the dinner, shown everywhere by display_name (first name or nickname). Names are stored
--   already normalized by the app (src/lib/guests/names.ts: NFC, single spaces, trimmed, 1–40 characters) and are
--   unique per event regardless of letter case, so two guests can never look the same on the TV plan or QR cards.
-- guest_group: an inseparable group of 2–5 guests (pair by default). A guest belongs to at most one group
--   (guest.group_id). Groups are created only through create_guest_group() (atomic, row-locked, validated) and
--   dissolved by deleting the guest_group row (members' group_id is set to null). A group that drops below
--   2 members (a member deleted) is dissolved automatically by a trigger.
-- is_absent: an absent guest gets no seat (S-03/S-04); absence does not change group membership.
--
-- Access model as in the event migration: browser roles get nothing. RLS on, no policies, privileges revoked
-- (Supabase grants anon/authenticated everything on new tables and EXECUTE on new functions by default).

create table public.guest_group (
  id bigint generated always as identity primary key,
  event_id smallint not null default 1 references public.event (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.guest_group is 'Inseparable group of 2–5 guests; members point to it via guest.group_id.';

create table public.guest (
  id bigint generated always as identity primary key,
  event_id smallint not null default 1 references public.event (id) on delete cascade,
  display_name text not null,
  is_absent boolean not null default false,
  group_id bigint references public.guest_group (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint guest_display_name_format check (
    char_length(display_name) between 1 and 40
    and display_name !~ '^[[:space:]]'
    and display_name !~ '[[:space:]]$'
    and display_name !~ '[[:space:]]{2}'
    and display_name !~ '[\t\n\r]'
  )
);

comment on table public.guest is 'Dinner guest: display name (unique per event, case-insensitive), absence and optional group.';

create unique index guest_display_name_key on public.guest (event_id, lower(display_name));

create index guest_group_id_idx on public.guest (group_id);

-- Atomic group creation. Raises GROUP_SIZE (not 2–5 distinct ids), GUEST_NOT_FOUND (an id does not exist) or
-- GUEST_ALREADY_GROUPED (someone is already in a group); the app maps these messages to statuses.
create function public.create_guest_group(p_guest_ids bigint[])
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_ids bigint[];
  v_count integer;
  v_group_id bigint;
begin
  select coalesce(array_agg(distinct guest_id), '{}')
    into v_ids
    from unnest(p_guest_ids) as guest_id
    where guest_id is not null;

  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count < 2 or v_count > 5 then
    raise exception 'GROUP_SIZE' using errcode = 'P0001';
  end if;

  -- Lock the members so two concurrent creations cannot both take the same guest.
  perform 1 from public.guest where id = any (v_ids) order by id for update;

  if (select count(*) from public.guest where id = any (v_ids)) <> v_count then
    raise exception 'GUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.guest where id = any (v_ids) and group_id is not null) then
    raise exception 'GUEST_ALREADY_GROUPED' using errcode = 'P0001';
  end if;

  insert into public.guest_group default values returning id into v_group_id;
  update public.guest set group_id = v_group_id where id = any (v_ids);
  return v_group_id;
end;
$$;

comment on function public.create_guest_group (bigint[]) is
  'Creates an inseparable group of 2–5 existing, ungrouped guests atomically; returns the new group id.';

-- Keeps every group at 2+ members: when a member leaves a group (deleted, or group_id changed), a group left with
-- fewer than 2 members is deleted, which sets the remaining member's group_id to null. Re-entry (that update fires
-- this trigger again for the already-deleted group) is a harmless no-op delete.
create function public.dissolve_undersized_guest_group()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.group_id is not null and (tg_op = 'DELETE' or new.group_id is distinct from old.group_id) then
    delete from public.guest_group as g
      where g.id = old.group_id
        and (select count(*) from public.guest where group_id = old.group_id) < 2;
  end if;
  return null;
end;
$$;

create trigger guest_dissolve_undersized_group
  after delete or update of group_id on public.guest
  for each row
  execute function public.dissolve_undersized_guest_group();

alter table public.guest_group enable row level security;
alter table public.guest enable row level security;

revoke all on table public.guest_group from anon, authenticated;
revoke all on table public.guest from anon, authenticated;

revoke execute on function public.create_guest_group (bigint[]) from public, anon, authenticated;
revoke execute on function public.dissolve_undersized_guest_group () from public, anon, authenticated;
grant execute on function public.create_guest_group (bigint[]) to service_role;
