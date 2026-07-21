-- Door privacy: proposals expose only the pickup CITY; the exact street address
-- is revealed to the assigned courier (kolis_carrying) after they accept.

drop function if exists public.kolis_available_parcels();
create function public.kolis_available_parcels()
returns table(id uuid, code text, size text, from_city text, to_city text, to_region text,
              dropoff_type text, pickup_zone text, pickup_hub_name text,
              driver_payout_cents integer)
language sql security definer set search_path to 'public'
as $$
  with me as (
    select
      exists (select 1 from public.kolis_profiles
              where id = auth.uid() and identity_verified and role in ('courier','both')) as is_member,
      (select count(*) from public.kolis_parcels
       where driver_id = auth.uid() and status in ('matched','picked_up','in_transit')) as carrying
  )
  select p.id, p.code, p.size, p.from_city, p.to_city, p.to_region,
         p.dropoff_type, p.pickup_zone, h.name as pickup_hub_name,
         p.driver_payout_cents
  from public.kolis_parcels p
  left join public.kolis_hubs h on h.id = p.pickup_hub,
       me
  where me.is_member and me.carrying < 3 and p.driver_id is null
    and (
      (p.dropoff_type = 'hub' and p.status = 'received_at_hub'
        and exists (select 1 from public.queue_entries q
                    where q.driver_id = auth.uid() and q.destination_region = p.to_region and q.end_reason is null))
      or
      (p.dropoff_type = 'door' and p.status = 'requested'
        and exists (select 1 from public.queue_entries q
                    where q.driver_id = auth.uid() and q.destination_region = p.to_region
                      and q.end_reason is null and coalesce(q.position, 1) >= 2))
      or
      (p.dropoff_type = 'door' and p.status = 'requested'
        and not exists (select 1 from public.queue_entries q3 where q3.driver_id = auth.uid() and q3.end_reason is null)
        and not exists (select 1 from public.queue_entries q4
                        where q4.destination_region = p.to_region and q4.end_reason is null and coalesce(q4.position,1) >= 2))
    );
$$;
grant execute on function public.kolis_available_parcels() to authenticated;

-- Carrying RPC: now includes from_city + the full pickup_addr (post-accept).
drop function if exists public.kolis_carrying();
create function public.kolis_carrying()
returns table(id uuid, code text, size text, from_city text, to_city text, to_region text,
              dropoff_type text, pickup_zone text, pickup_hub_name text, pickup_addr text,
              driver_payout_cents integer, status text)
language sql security definer set search_path to 'public'
as $$
  select p.id, p.code, p.size, p.from_city, p.to_city, p.to_region,
         p.dropoff_type, p.pickup_zone, h.name as pickup_hub_name, p.pickup_addr,
         p.driver_payout_cents, p.status
  from public.kolis_parcels p
  left join public.kolis_hubs h on h.id = p.pickup_hub
  where p.driver_id = auth.uid()
    and p.status in ('matched','picked_up','in_transit')
  order by p.created_at asc;
$$;
grant execute on function public.kolis_carrying() to authenticated;

-- Wall off anon: these are auth.uid()-gated, so revoke the default PUBLIC grant.
revoke execute on function public.kolis_available_parcels() from public, anon;
revoke execute on function public.kolis_carrying() from public, anon;
