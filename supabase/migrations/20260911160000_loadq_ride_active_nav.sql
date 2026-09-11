-- LoadQ driver ride-navigation support.
--
-- Closes the gap that stranded ride LQ-46B0D on 2026-09-05: a driver could ACCEPT
-- a route_pickup offer (loadq_ride_offer_respond) but there was no RPC that handed
-- the assigned driver the pickup COORDINATES or the passenger's phone, and no way
-- to mark "on my way". So the accept flow dead-ended — no ETA, no navigation, the
-- trip never advanced past `assigned`.
--
-- Adds:
--   loadq_ride_active()          -> the driver's current active ride, full detail,
--                                   gated to the assigned driver (auth.uid()).
--   loadq_ride_start(request_id) -> assigned -> en_route ("On my way").
--
-- Everything else the screen needs already exists:
--   loadq_ride_driver_offers()   list pending offers
--   loadq_ride_offer_respond()   accept / decline
--   loadq_ride_driver_ping()     push location (auto-flips to picked_up within 50 m)
--   loadq_ride_mark_picked_up()  manual picked_up
--   loadq_ride_complete()        finish

-- Full active ride for the assigned driver. Returns {active:false} when none, so
-- the caller always gets one JSON object.
create or replace function public.loadq_ride_active()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare r record; p record; z record;
begin
  select * into r
  from public.loadq_ride_requests
  where driver_id = auth.uid()
    and status in ('assigned', 'en_route', 'picked_up')
  order by created_at desc
  limit 1;

  if r.id is null then
    return jsonb_build_object('active', false);
  end if;

  select full_name, phone into p from public.passengers where id = r.passenger_id;
  select name, address into z from public.zones where id = r.departure_zone_id;

  return jsonb_build_object(
    'active',         true,
    'request_id',     r.id,
    'status',         r.status,
    'kind',           r.kind,
    'seats',          r.seats,
    'fare_cents',     r.fare_cents,
    'off_route_km',   r.off_route_km,
    'payment_method', r.payment_method,
    'payment_status', r.payment_status,
    'pickup_label',   coalesce(r.pickup_label, r.origin_address),
    'pickup_lat',     r.pickup_lat,
    'pickup_lng',     r.pickup_lng,
    'dest_region',    r.dest_region,
    'dest_address',   r.dest_address,
    'dest_lat',       r.dest_lat,
    'dest_lng',       r.dest_lng,
    'passenger_name', p.full_name,
    'passenger_phone', p.phone,
    'departure_zone', z.name,
    'departure_addr', z.address,
    'driver_loc_at',  r.driver_loc_at,
    'picked_up_at',   r.picked_up_at,
    'created_at',     r.created_at
  );
end $$;

-- "On my way": assigned -> en_route. Idempotent; stamps started_at once.
create or replace function public.loadq_ride_start(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record;
begin
  select * into r from public.loadq_ride_requests where id = p_request_id;
  if r.id is null then return jsonb_build_object('error', 'not_found'); end if;
  if r.driver_id is null or r.driver_id <> auth.uid() then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if r.status = 'en_route' then
    return jsonb_build_object('ok', true, 'status', 'en_route');
  end if;
  if r.status <> 'assigned' then
    return jsonb_build_object('ok', false, 'status', r.status);
  end if;
  update public.loadq_ride_requests
    set status = 'en_route', started_at = coalesce(started_at, now())
    where id = p_request_id;
  return jsonb_build_object('ok', true, 'status', 'en_route');
end $$;

grant execute on function public.loadq_ride_active()        to authenticated, anon, service_role;
grant execute on function public.loadq_ride_start(uuid)     to authenticated, anon, service_role;
