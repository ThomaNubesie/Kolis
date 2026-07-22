-- Fix: a Kolis courier shows "Off-queue member" even when on the LoadQ line,
-- because the queue match was kolis_profiles.id = queue_entries.driver_id and a
-- courier's Kolis account and LoadQ driver account are different accounts.
-- Add an explicit link (loadq_driver_id) and match the queue against it.

alter table public.kolis_profiles
  add column if not exists loadq_driver_id uuid references public.drivers(id);

-- Admin candidate list (parcel detail page: "LoadQ #N" vs "Off-queue member")
create or replace function public.kolis_admin_candidates(p_id uuid)
 returns table(driver_id uuid, name text, queue_pos integer, carrying integer, source text)
 language sql stable security definer set search_path to 'public'
as $function$
  with target as (select to_region from public.kolis_parcels where id = p_id)
  select pr.id,
         coalesce(nullif(btrim(d.full_name), ''), pr.full_name) as name,
         q.position as queue_pos,
         (select count(*) from public.kolis_parcels c
            where c.driver_id = pr.id and c.status in ('matched','dispatched','picked_up','in_transit'))::int as carrying,
         case when q.driver_id is not null then 'queue' else 'member' end as source
  from public.kolis_profiles pr
  left join public.drivers d on d.id = coalesce(pr.loadq_driver_id, pr.id)
  left join public.queue_entries q
         on q.driver_id = coalesce(pr.loadq_driver_id, pr.id) and q.end_reason is null
        and q.destination_region = (select to_region from target)
  where public.kolis_admin_has_cap('parcels')
    and pr.identity_verified
    and pr.role in ('courier','both')
    and (q.driver_id is not null
         or not exists (select 1 from public.queue_entries q2
                          where q2.driver_id = coalesce(pr.loadq_driver_id, pr.id) and q2.end_reason is null))
  order by (q.position is null), q.position nulls last
  limit 40;
$function$;

-- Courier's own available-parcels feed
create or replace function public.kolis_available_parcels()
 returns table(id uuid, code text, size text, from_city text, to_city text, to_region text, dropoff_type text, pickup_zone text, pickup_hub_name text, driver_payout_cents integer, is_request boolean)
 language sql stable security definer set search_path to 'public'
as $function$
  with me as (
    select
      exists (select 1 from public.kolis_profiles
              where id = auth.uid() and identity_verified and role in ('courier','both')) as is_member,
      (select count(*) from public.kolis_parcels
       where driver_id = auth.uid() and status in ('matched','picked_up','in_transit')) as carrying,
      coalesce((select loadq_driver_id from public.kolis_profiles where id = auth.uid()), auth.uid()) as drv_id
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
                        where q.driver_id = me.drv_id and q.destination_region = p.to_region and q.end_reason is null))
          or
          (p.dropoff_type = 'door' and p.status = 'requested'
            and exists (select 1 from public.queue_entries q
                        where q.driver_id = me.drv_id and q.destination_region = p.to_region
                          and q.end_reason is null and coalesce(q.position, 1) >= 2))
          or
          (p.dropoff_type = 'door' and p.status = 'requested'
            and not exists (select 1 from public.queue_entries q3 where q3.driver_id = me.drv_id and q3.end_reason is null)
            and not exists (select 1 from public.queue_entries q4
                            where q4.destination_region = p.to_region and q4.end_reason is null and coalesce(q4.position,1) >= 2))
        )
      )
    );
$function$;
