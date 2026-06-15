-- Block self-booking: a sender must never see or accept their own parcel as a
-- courier. Adds `p.sender_id <> auth.uid()` to both the offer list and accept
-- RPCs (defense in depth: hidden from the list AND rejected on accept).
-- (Applied live 2026-06-15.)

-- offer list: exclude own parcels
drop function if exists public.kolis_available_parcels();
create or replace function public.kolis_available_parcels()
returns table(id uuid, code text, size text, from_city text, to_city text, to_region text,
              dropoff_type text, pickup_zone text, pickup_hub_name text, driver_payout_cents integer,
              is_request boolean)
language sql security definer set search_path to 'public' as $function$
  with me as (
    select
      exists (select 1 from public.kolis_profiles
              where id = auth.uid() and identity_verified and role in ('courier','both')) as is_member,
      (select count(*) from public.kolis_parcels
       where driver_id = auth.uid() and status in ('matched','picked_up','in_transit')) as carrying
  )
  select p.id, p.code, p.size, p.from_city, p.to_city, p.to_region,
         p.dropoff_type, p.pickup_zone, h.name as pickup_hub_name,
         p.driver_payout_cents,
         (p.preferred_driver_id = auth.uid() and p.offer_expires_at > now()) as is_request
  from public.kolis_parcels p
  left join public.kolis_hubs h on h.id = p.pickup_hub,
       me
  where me.is_member and me.carrying < 3 and p.driver_id is null
    and p.sender_id <> auth.uid()
    and p.status in ('requested','received_at_hub')
    and (
      (p.preferred_driver_id = auth.uid() and p.offer_expires_at > now())
      or
      ( not (p.preferred_driver_id is not null and p.preferred_driver_id <> auth.uid()
             and p.offer_expires_at is not null and p.offer_expires_at > now())
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
        )
      )
    );
$function$;

-- accept: reject own parcels
create or replace function public.kolis_accept_parcel(p_id uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $function$
declare cnt int;
begin
  if not exists (select 1 from public.kolis_profiles
                 where id = auth.uid() and identity_verified and role in ('courier','both')) then
    return false;
  end if;
  select count(*) into cnt from public.kolis_parcels
    where driver_id = auth.uid() and status in ('matched','picked_up','in_transit');
  if cnt >= 3 then return false; end if;

  update public.kolis_parcels p
    set driver_id = auth.uid(), status = 'matched',
        preferred_driver_id = null, offer_expires_at = null
  where p.id = p_id and p.driver_id is null
    and p.sender_id <> auth.uid()
    and p.status in ('requested','received_at_hub')
    and (
      (p.preferred_driver_id = auth.uid() and p.offer_expires_at > now())
      or
      ( not (p.preferred_driver_id is not null and p.preferred_driver_id <> auth.uid()
             and p.offer_expires_at is not null and p.offer_expires_at > now())
        and (
          exists (select 1 from public.queue_entries q
                  where q.driver_id = auth.uid() and q.destination_region = p.to_region and q.end_reason is null
                    and (p.dropoff_type = 'hub' or coalesce(q.position,1) >= 2))
          or
          (p.dropoff_type = 'door'
            and not exists (select 1 from public.queue_entries q3 where q3.driver_id = auth.uid() and q3.end_reason is null))
        )
      )
    );
  return found;
end; $function$;
