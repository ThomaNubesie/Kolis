-- A driver carries at most 3 active parcels. Enforced in accept + hidden in the
-- available list when the driver is already at 3.
create or replace function public.kolis_accept_parcel(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean := false; cnt int;
begin
  select count(*) into cnt from public.kolis_parcels
    where driver_id = auth.uid() and status in ('matched','picked_up','in_transit');
  if cnt >= 3 then return false; end if;

  update public.kolis_parcels p
    set driver_id = auth.uid(), status = 'matched'
  where p.id = p_id and p.driver_id is null and p.status = 'requested'
    and exists (select 1 from public.queue_entries q
                where q.driver_id = auth.uid() and q.zone_id = p.pickup_zone and q.destination_region = p.to_region);
  if found then ok := true; end if;
  return ok;
end; $$;
grant execute on function public.kolis_accept_parcel(uuid) to authenticated;

create or replace function public.kolis_available_parcels()
returns table(id uuid, code text, size text, to_city text, pickup_zone text, price_cents int, dropoff_type text)
language sql security definer set search_path = public as $$
  select p.id, p.code, p.size, p.to_city, p.pickup_zone, p.price_cents, p.dropoff_type
  from public.kolis_parcels p
  join public.queue_entries q
    on q.zone_id = p.pickup_zone and q.destination_region = p.to_region
  where p.dropoff_type = 'zone' and p.status = 'requested' and p.driver_id is null
    and q.driver_id = auth.uid()
    and (select count(*) from public.kolis_parcels c
         where c.driver_id = auth.uid() and c.status in ('matched','picked_up','in_transit')) < 3;
$$;
grant execute on function public.kolis_available_parcels() to authenticated;
