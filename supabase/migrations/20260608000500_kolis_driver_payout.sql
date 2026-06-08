-- Driver payout per parcel (set on create = share of price; hub/zone ~2/3,
-- door 45%). Returned in the available-parcels offer so drivers see their cut.
alter table public.kolis_parcels add column if not exists driver_payout_cents integer;

drop function if exists public.kolis_available_parcels();
create function public.kolis_available_parcels()
returns table(id uuid, code text, size text, to_city text, pickup_zone text, price_cents int, driver_payout_cents int, dropoff_type text)
language sql security definer set search_path = public as $$
  select p.id, p.code, p.size, p.to_city, p.pickup_zone, p.price_cents, p.driver_payout_cents, p.dropoff_type
  from public.kolis_parcels p
  join public.queue_entries q
    on q.zone_id = p.pickup_zone and q.destination_region = p.to_region
  where p.dropoff_type = 'zone' and p.status = 'requested' and p.driver_id is null
    and q.driver_id = auth.uid()
    and (select count(*) from public.kolis_parcels c
         where c.driver_id = auth.uid() and c.status in ('matched','picked_up','in_transit')) < 3;
$$;
grant execute on function public.kolis_available_parcels() to authenticated;
