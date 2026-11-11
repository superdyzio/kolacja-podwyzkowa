-- retention-preview (PR #4 review, the user's decision 6): before an owner shortens the restaurant's guest data term,
-- the panel says how many events would lose their guests' data at once because of the change.
--
-- retention_change_preview(p_restaurant_id, p_days, p_now) → one row { events, latest_event_date }: the restaurant's
-- events (never venue templates) that still hold guest data (event_has_guest_data), are past their term under p_days
-- (guest_data_expired) and are NOT past it under the restaurant's current term — the ones the change itself costs (an
-- event already past the current term loses its data on its next read or the daily run anyway). latest_event_date = the
-- latest such event's date (null when there is none). The same rule as the purge (guest_data_expired, Warsaw days),
-- the time is the caller's (p_now). Read-only; nothing is purged here.
--
-- Additive (one new function): old code on the migrated database never calls it. Migration BEFORE the code: the
-- owner's form asks for the preview before saving a shorter term.

create function public.retention_change_preview(p_restaurant_id integer, p_days integer, p_now timestamptz)
returns table (events integer, latest_event_date date)
language sql
stable
set search_path = ''
as $$
  select count(*)::integer, max(e.event_date)
    from public.event e
    join public.restaurant r on r.id = e.restaurant_id
    where e.restaurant_id = p_restaurant_id
      and not e.is_template
      and public.guest_data_expired(e.event_date, p_days, p_now)
      and not public.guest_data_expired(e.event_date, r.guest_retention_days, p_now)
      and public.event_has_guest_data(e.id);
$$;

revoke execute on function public.retention_change_preview (integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.retention_change_preview (integer, integer, timestamptz) to service_role;

comment on function public.retention_change_preview (integer, integer, timestamptz) is
  'retention-preview: how many events of the restaurant (no templates) with guest data a term of p_days would purge '
  'at once that the current term keeps, and the latest such event''s date.';
