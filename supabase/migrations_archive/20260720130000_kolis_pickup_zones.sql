-- Active LoadQ zones a shipper can drop a parcel at, for the "LoadQ zone" pickup
-- option. Lat/lng let the portal show distance from the sender's position.
create or replace function public.kolis_pickup_zones()
returns table(id text, name text, region text, address text, latitude double precision, longitude double precision)
language sql security definer set search_path to 'public' stable as $$
  select id, name, region, address, latitude, longitude
  from public.zones
  where is_active = true and latitude is not null and longitude is not null
  order by region, name;
$$;
revoke all on function public.kolis_pickup_zones() from anon;
grant execute on function public.kolis_pickup_zones() to authenticated;
