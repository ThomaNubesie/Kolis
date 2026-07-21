-- Admin "assign" becomes a targeted Accept/Decline request (not a silent
-- force-match), plus push-token storage for couriers and an is_request flag.
-- (Applied live 2026-06-12.)

-- 1. assign -> propose to one driver with a 60-min exclusive window
create or replace function public.kolis_admin_assign(p_id uuid, p_driver uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if public.kolis_admin_role() not in ('owner','admin','dispatcher') then
    raise exception 'forbidden';
  end if;
  update public.kolis_parcels
     set preferred_driver_id = p_driver,
         offer_expires_at    = now() + interval '60 minutes',
         driver_id           = null,
         status              = case when dropoff_type = 'hub' then 'received_at_hub' else 'requested' end
   where id = p_id;
end; $$;

-- 2. decline a targeted request -> return to the pool
create or replace function public.kolis_decline_parcel(p_id uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  update public.kolis_parcels
     set preferred_driver_id = null, offer_expires_at = null
   where id = p_id and preferred_driver_id = auth.uid() and driver_id is null;
  return found;
end; $$;
grant execute on function public.kolis_decline_parcel(uuid) to authenticated;

-- 3. couriers have no drivers row -> their own push-token slot
alter table public.kolis_profiles add column if not exists push_token text;

-- 4. available parcels: exclusive targeting + is_request flag
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

-- 5. accept honors the exclusive window
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
