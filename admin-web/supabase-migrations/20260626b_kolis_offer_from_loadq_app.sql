-- Make the courier parcel feed + accept work when called from the LoadQ app,
-- where auth.uid() is the LoadQ driver account (not the Kolis profile id).
-- Resolve the courier by kolis_profiles.id = auth.uid() OR loadq_driver_id = auth.uid();
-- use the Kolis id for ownership/offers and the LoadQ id for queue matching.

create or replace function public.kolis_available_parcels()
 returns table(id uuid, code text, size text, from_city text, to_city text, to_region text, dropoff_type text, pickup_zone text, pickup_hub_name text, driver_payout_cents integer, is_request boolean)
 language sql stable security definer set search_path to 'public'
as $function$
  with me as (
    select kp.id as kp_id,
           coalesce(kp.loadq_driver_id, kp.id) as loadq_id,
           (kp.identity_verified and kp.role in ('courier','both')) as is_member
    from public.kolis_profiles kp
    where kp.id = auth.uid() or kp.loadq_driver_id = auth.uid()
    order by (kp.id = auth.uid()) desc
    limit 1
  )
  select p.id, p.code, p.size, p.from_city, p.to_city, p.to_region,
         p.dropoff_type, p.pickup_zone, h.name as pickup_hub_name,
         p.driver_payout_cents,
         (p.preferred_driver_id = me.kp_id and p.offer_expires_at > now()) as is_request
  from public.kolis_parcels p
  left join public.kolis_hubs h on h.id = p.pickup_hub,
       me
  where coalesce(me.is_member, false)
    and (select count(*) from public.kolis_parcels c
         where c.driver_id = me.kp_id and c.status in ('matched','picked_up','in_transit')) < 3
    and p.driver_id is null
    and p.sender_id <> me.kp_id
    and p.status in ('requested','received_at_hub')
    and (
      (p.preferred_driver_id = me.kp_id and p.offer_expires_at > now())
      or
      ( not (p.preferred_driver_id is not null and p.preferred_driver_id <> me.kp_id
             and p.offer_expires_at is not null and p.offer_expires_at > now())
        and (
          (p.dropoff_type = 'hub' and p.status = 'received_at_hub'
            and exists (select 1 from public.queue_entries q
                        where q.driver_id = me.loadq_id and q.destination_region = p.to_region and q.end_reason is null))
          or
          (p.dropoff_type = 'door' and p.status = 'requested'
            and exists (select 1 from public.queue_entries q
                        where q.driver_id = me.loadq_id and q.destination_region = p.to_region
                          and q.end_reason is null and coalesce(q.position, 1) >= 2))
          or
          (p.dropoff_type = 'door' and p.status = 'requested'
            and not exists (select 1 from public.queue_entries q3 where q3.driver_id = me.loadq_id and q3.end_reason is null)
            and not exists (select 1 from public.queue_entries q4
                            where q4.destination_region = p.to_region and q4.end_reason is null and coalesce(q4.position,1) >= 2))
        )
      )
    );
$function$;

create or replace function public.kolis_accept_parcel(p_id uuid)
 returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare v_kp uuid; v_loadq uuid; cnt int;
begin
  select kp.id, coalesce(kp.loadq_driver_id, kp.id) into v_kp, v_loadq
  from public.kolis_profiles kp
  where (kp.id = auth.uid() or kp.loadq_driver_id = auth.uid())
    and kp.identity_verified and kp.role in ('courier','both')
  order by (kp.id = auth.uid()) desc limit 1;
  if v_kp is null then return false; end if;

  select count(*) into cnt from public.kolis_parcels
    where driver_id = v_kp and status in ('matched','picked_up','in_transit');
  if cnt >= 3 then return false; end if;

  update public.kolis_parcels p
    set driver_id = v_kp, status = 'matched', preferred_driver_id = null, offer_expires_at = null
  where p.id = p_id and p.driver_id is null
    and p.sender_id <> v_kp
    and p.status in ('requested','received_at_hub')
    and (
      (p.preferred_driver_id = v_kp and p.offer_expires_at > now())
      or
      ( not (p.preferred_driver_id is not null and p.preferred_driver_id <> v_kp
             and p.offer_expires_at is not null and p.offer_expires_at > now())
        and (
          exists (select 1 from public.queue_entries q
                  where q.driver_id = v_loadq and q.destination_region = p.to_region and q.end_reason is null
                    and (p.dropoff_type = 'hub' or coalesce(q.position,1) >= 2))
          or
          (p.dropoff_type = 'door'
            and not exists (select 1 from public.queue_entries q3 where q3.driver_id = v_loadq and q3.end_reason is null))
        )
      )
    );
  return found;
end; $function$;
