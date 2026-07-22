-- Public live-tracking by parcel code — powers the recipient link
-- (business.kolis.ca/track/{code}), the Kolis app track screen, and the
-- admin/business live panels. Safe fields only (no payout, sender, or address;
-- driver FIRST name only). Driver position comes from the source that OWNS this
-- parcel's tracking: kolis_driver_locations for 'kolis'-accepted, drivers
-- current_lat/lng (via the linked loadq_driver_id) for 'loadq'-accepted.
create or replace function public.kolis_track_by_code(p_code text)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v record;
  v_lat double precision; v_lng double precision; v_at timestamptz;
  v_dest_lat double precision; v_dest_lng double precision;
  v_dist_km double precision; v_eta_min int;
  v_name text; v_first text;
begin
  select * into v from public.kolis_parcels where code = p_code;
  if not found then return null; end if;

  if v.driver_id is not null then
    if coalesce(v.accepted_via,'') = 'kolis' then
      select lat, lng, updated_at into v_lat, v_lng, v_at
      from public.kolis_driver_locations where kolis_id = v.driver_id;
    else
      select d.current_lat, d.current_lng, d.location_at into v_lat, v_lng, v_at
      from public.drivers d
      where d.id = coalesce((select loadq_driver_id from public.kolis_profiles where id = v.driver_id), v.driver_id);
    end if;
    select coalesce(nullif(btrim(dd.full_name),''), pr.full_name) into v_name
    from public.kolis_profiles pr
    left join public.drivers dd on dd.id = coalesce(pr.loadq_driver_id, pr.id)
    where pr.id = v.driver_id;
    v_first := nullif(split_part(coalesce(v_name,''), ' ', 1), '');
  end if;

  -- representative destination coords (any zone in the to_region)
  select latitude, longitude into v_dest_lat, v_dest_lng
  from public.zones where region = v.to_region and latitude is not null limit 1;

  if v_lat is not null and v_dest_lat is not null then
    v_dist_km := 6371 * acos(least(1, greatest(-1,
      cos(radians(v_lat)) * cos(radians(v_dest_lat)) * cos(radians(v_dest_lng) - radians(v_lng))
      + sin(radians(v_lat)) * sin(radians(v_dest_lat)))));
    v_eta_min := round((v_dist_km / 80.0) * 60);  -- ~80 km/h average
  end if;

  return jsonb_build_object(
    'code', v.code,
    'status', v.status,
    'dropoff_type', v.dropoff_type,
    'from_city', v.from_city,
    'to_city', v.to_city,
    'driver_first_name', v_first,
    'driver_lat', v_lat, 'driver_lng', v_lng, 'driver_updated_at', v_at,
    'dest_lat', v_dest_lat, 'dest_lng', v_dest_lng,
    'distance_km', round(v_dist_km::numeric, 1), 'eta_minutes', v_eta_min,
    'stale', (v_at is null or v_at < now() - interval '10 minutes')
  );
end; $function$;
grant execute on function public.kolis_track_by_code(text) to anon, authenticated;
