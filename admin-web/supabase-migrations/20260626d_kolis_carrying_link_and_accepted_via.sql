-- (1) accepted_via marks which app a parcel was accepted in, so the accepting
--     app owns the live tracking (no double GPS reporting).
-- (2) kolis_carrying must resolve the courier bidirectionally (kolis id OR
--     linked loadq_driver_id) — a LoadQ-accepted parcel's driver_id is the Kolis
--     id, so the LoadQ app (auth = LoadQ id) wouldn't otherwise see it.
alter table public.kolis_parcels add column if not exists accepted_via text;

drop function if exists public.kolis_accept_parcel(uuid);
create or replace function public.kolis_accept_parcel(p_id uuid, p_via text default null)
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
    set driver_id = v_kp, status = 'matched', preferred_driver_id = null, offer_expires_at = null,
        accepted_via = coalesce(p_via, p.accepted_via)
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
grant execute on function public.kolis_accept_parcel(uuid, text) to authenticated;

drop function if exists public.kolis_carrying();
create or replace function public.kolis_carrying()
 returns table(id uuid, code text, size text, from_city text, to_city text, to_region text, dropoff_type text, pickup_zone text, pickup_hub_name text, pickup_addr text, driver_payout_cents integer, status text, accepted_via text)
 language sql stable security definer set search_path to 'public'
as $function$
  with me as (
    select coalesce((select kp.id from public.kolis_profiles kp
                     where kp.id = auth.uid() or kp.loadq_driver_id = auth.uid()
                     order by (kp.id = auth.uid()) desc limit 1), auth.uid()) as kp_id
  )
  select p.id, p.code, p.size, p.from_city, p.to_city, p.to_region,
         p.dropoff_type, p.pickup_zone, h.name as pickup_hub_name, p.pickup_addr,
         p.driver_payout_cents, p.status, p.accepted_via
  from public.kolis_parcels p
  left join public.kolis_hubs h on h.id = p.pickup_hub, me
  where p.driver_id = me.kp_id
    and p.status in ('matched','picked_up','in_transit')
  order by p.created_at asc;
$function$;
grant execute on function public.kolis_carrying() to authenticated;
