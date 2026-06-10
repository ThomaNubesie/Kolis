-- Stage 4: receipts + server-side amount-walling.
-- Couriers must never see the sender's price; senders never see the payout.

alter table public.kolis_parcels add column if not exists delivered_at timestamptz;

-- Proposals RPC: drop price_cents (amount-walling), resolve the hub NAME (not uuid).
drop function if exists public.kolis_available_parcels();
create function public.kolis_available_parcels()
returns table(id uuid, code text, size text, to_city text, to_region text,
              dropoff_type text, pickup_zone text, pickup_hub_name text, pickup_addr text,
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
  select p.id, p.code, p.size, p.to_city, p.to_region,
         p.dropoff_type, p.pickup_zone, h.name as pickup_hub_name, p.pickup_addr,
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

-- Carrying RPC: courier's carried parcels with hub NAME + payout only (no price).
create or replace function public.kolis_carrying()
returns table(id uuid, code text, size text, to_city text, to_region text,
              dropoff_type text, pickup_zone text, pickup_hub_name text, pickup_addr text,
              driver_payout_cents integer, status text)
language sql security definer set search_path to 'public'
as $$
  select p.id, p.code, p.size, p.to_city, p.to_region,
         p.dropoff_type, p.pickup_zone, h.name as pickup_hub_name, p.pickup_addr,
         p.driver_payout_cents, p.status
  from public.kolis_parcels p
  left join public.kolis_hubs h on h.id = p.pickup_hub
  where p.driver_id = auth.uid()
    and p.status in ('matched','picked_up','in_transit')
  order by p.created_at asc;
$$;
grant execute on function public.kolis_carrying() to authenticated;

-- Receipt RPC: role-appropriate. Sender sees price; courier sees payout. Walled.
create or replace function public.kolis_parcel_receipt(p_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  p public.kolis_parcels;
  base jsonb;
begin
  select * into p from public.kolis_parcels where id = p_id;
  if not found then return null; end if;
  if me is null or (me <> p.sender_id and me <> coalesce(p.driver_id, '00000000-0000-0000-0000-000000000000')) then
    return null;
  end if;
  base := jsonb_build_object(
    'id', p.id, 'code', p.code,
    'from_city', p.from_city, 'to_city', p.to_city,
    'size', p.size, 'dropoff_type', p.dropoff_type, 'status', p.status,
    'delivered_at', p.delivered_at, 'created_at', p.created_at,
    'role', case when me = p.sender_id then 'sender' else 'courier' end
  );
  if me = p.sender_id then
    return base || jsonb_build_object('price_cents', p.price_cents);
  else
    return base || jsonb_build_object('payout_cents', p.driver_payout_cents);
  end if;
end;
$$;
grant execute on function public.kolis_parcel_receipt(uuid) to authenticated;
-- Wall off anon: receipt is auth.uid()-gated, so revoke the default PUBLIC grant.
revoke execute on function public.kolis_parcel_receipt(uuid) from public, anon;
