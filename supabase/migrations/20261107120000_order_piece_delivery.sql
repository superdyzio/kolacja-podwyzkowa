-- guest-delivered: every PIECE of an order line is marked as delivered on its own — by the organizer („Wydane”) or
-- by a guest on their phone (their own dishes and the dishes for the middle of the table they sit at in the latest
-- published snapshot) — and the app shows who marked it. Additive only: order_item.delivered stays and is kept in
-- step (true = every piece marked), so pages still running the old code and a rollback see the same thing.
--
-- order_piece: one row per marked piece (1 … quantity of its line); no row = not delivered yet. marked_by 'organizer'
--   or 'guest' (guest_id = who; set null when that guest is deleted). The first mark of a piece is kept.
-- order_item_fit_pieces (trigger): a quantity change drops the marks above the new quantity and recomputes delivered.
-- guest_published_table_id(): the table (venue_table id) the guest sits at in the latest published snapshot, or null.
-- guest_order_lines(): what a guest's phone shows — their own lines and the lines for their table, with the marked
--   pieces (marker ids are mapped to "you" / "guest" / "organizer" by the app; never sent to a phone). No prices.
-- set_order_pieces(): marks or unmarks pieces of one line under a row lock on that line. A guest (p_guest_id set) may
--   touch only their own lines and the lines of their table (else ITEM_NOT_FOUND, like an unknown line) and may not
--   undo an organizer's mark (MARKED_BY_ORGANIZER); a piece outside 1 … quantity → PIECE_OUT_OF_RANGE.
--
-- Access model as in the earlier migrations: browser roles get nothing; only the server (service role).

create table public.order_piece (
  order_item_id bigint not null references public.order_item (id) on delete cascade,
  piece smallint not null,
  event_id smallint not null default 1 references public.event (id) on delete cascade,
  marked_by text not null,
  guest_id bigint references public.guest (id) on delete set null,
  marked_at timestamptz not null default now(),
  constraint order_piece_pkey primary key (order_item_id, piece),
  constraint order_piece_piece_range check (piece between 1 and 99),
  constraint order_piece_marked_by check (marked_by in ('guest', 'organizer')),
  constraint order_piece_guest_marks_only check (marked_by = 'guest' or guest_id is null)
);

comment on table public.order_piece is
  'A delivered piece of an order line (1 … quantity), who marked it (organizer or a guest) and when.';

create index order_piece_event_id_idx on public.order_piece (event_id);
create index order_piece_guest_id_idx on public.order_piece (guest_id);

alter table public.order_piece enable row level security;
revoke all on table public.order_piece from anon, authenticated;

-- Lines the organizer already ticked keep being delivered: every piece, marked by the organizer.
insert into public.order_piece (order_item_id, piece, event_id, marked_by, marked_at)
select item.id, piece.n, item.event_id, 'organizer', item.updated_at
  from public.order_item item
  cross join lateral generate_series(1, item.quantity) as piece (n)
  where item.delivered;

create function public.order_item_fit_pieces()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.order_piece where order_item_id = new.id and piece > new.quantity;
  new.delivered := (select count(*) from public.order_piece where order_item_id = new.id) >= new.quantity;
  return new;
end;
$$;

create trigger order_item_fit_pieces
  before update of quantity on public.order_item
  for each row
  when (new.quantity is distinct from old.quantity)
  execute function public.order_item_fit_pieces();

create function public.guest_published_table_id(p_guest_id bigint)
returns bigint
language sql
stable
set search_path = ''
as $$
  select snapshot_table.table_id
    from public.seating_snapshot_seat seat
    join public.seating_snapshot_table snapshot_table on snapshot_table.id = seat.snapshot_table_id
    where seat.guest_id = p_guest_id
      and seat.snapshot_id = (
        select max(snapshot.id)
          from public.seating_snapshot snapshot
          join public.guest guest on guest.event_id = snapshot.event_id
          where guest.id = p_guest_id
      );
$$;

comment on function public.guest_published_table_id (bigint) is
  'The venue_table id the guest sits at in the latest published snapshot, or null (unseated, unpublished).';

create function public.guest_order_lines(p_guest_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', item.id,
        'name', item.name,
        'note', item.note,
        'quantity', item.quantity,
        'own', item.guest_id is not distinct from p_guest_id,
        'pieces', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object('piece', piece.piece, 'markedBy', piece.marked_by, 'guestId', piece.guest_id)
              order by piece.piece
            )
              from public.order_piece piece
              where piece.order_item_id = item.id
          ),
          '[]'::jsonb
        )
      )
      order by (item.guest_id is not distinct from p_guest_id) desc, item.id
    ),
    '[]'::jsonb
  )
    from public.order_item item
    cross join (select public.guest_published_table_id(p_guest_id) as table_id) mine
    where item.guest_id = p_guest_id
      or (mine.table_id is not null and item.table_id = mine.table_id);
$$;

comment on function public.guest_order_lines (bigint) is
  'A guest''s own order lines and their table''s lines (latest snapshot) with the marked pieces, as JSON; no prices.';

create function public.set_order_pieces(
  p_item_id bigint,
  p_pieces integer[],
  p_delivered boolean,
  p_guest_id bigint
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_item record;
  v_pieces integer[];
begin
  select id, event_id, quantity, guest_id, table_id into v_item
    from public.order_item
    where id = p_item_id
    for update;
  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_guest_id is not null and not (
    v_item.guest_id is not distinct from p_guest_id
    or (v_item.table_id is not null and v_item.table_id is not distinct from public.guest_published_table_id(p_guest_id))
  ) then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- null = every piece of the line („Wydane” for the whole line).
  v_pieces := coalesce(p_pieces, array(select generate_series(1, v_item.quantity)));
  if cardinality(v_pieces) = 0
    or exists (select 1 from unnest(v_pieces) as wanted (n) where n is null or n < 1 or n > v_item.quantity) then
    raise exception 'PIECE_OUT_OF_RANGE' using errcode = 'P0001';
  end if;

  if p_delivered then
    insert into public.order_piece (order_item_id, piece, event_id, marked_by, guest_id)
    select distinct v_item.id, wanted.n, v_item.event_id,
        case when p_guest_id is null then 'organizer' else 'guest' end, p_guest_id
      from unnest(v_pieces) as wanted (n)
    on conflict (order_item_id, piece) do nothing;
  else
    if p_guest_id is not null and exists (
      select 1 from public.order_piece
        where order_item_id = v_item.id and piece = any (v_pieces) and marked_by = 'organizer'
    ) then
      raise exception 'MARKED_BY_ORGANIZER' using errcode = 'P0001';
    end if;
    delete from public.order_piece where order_item_id = v_item.id and piece = any (v_pieces);
  end if;

  update public.order_item
    set delivered = (select count(*) from public.order_piece where order_item_id = v_item.id) >= v_item.quantity,
        updated_at = now()
    where id = v_item.id;
end;
$$;

comment on function public.set_order_pieces (bigint, integer[], boolean, bigint) is
  'Marks (or unmarks) pieces of an order line as delivered by the organizer (p_guest_id null) or a guest.';

revoke execute on function public.order_item_fit_pieces () from public, anon, authenticated;
revoke execute on function public.guest_published_table_id (bigint) from public, anon, authenticated;
revoke execute on function public.guest_order_lines (bigint) from public, anon, authenticated;
revoke execute on function public.set_order_pieces (bigint, integer[], boolean, bigint) from public, anon, authenticated;

grant execute on function public.guest_published_table_id (bigint) to service_role;
grant execute on function public.guest_order_lines (bigint) to service_role;
grant execute on function public.set_order_pieces (bigint, integer[], boolean, bigint) to service_role;
