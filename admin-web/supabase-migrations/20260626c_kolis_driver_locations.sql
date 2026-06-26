-- Where a Kolis courier's live GPS lives while they carry a parcel. Couriers are
-- kolis_profiles, which had no location columns. The Kolis app reports here in
-- the background (kolis_report_location). The live-tracking view reads this for
-- Kolis-tracked parcels; drivers.current_lat/lng remains the LoadQ-tracked source.
create table if not exists public.kolis_driver_locations (
  kolis_id   uuid primary key references public.kolis_profiles(id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  updated_at timestamptz not null default now()
);

alter table public.kolis_driver_locations enable row level security;
drop policy if exists kolis_driver_loc_self on public.kolis_driver_locations;
create policy kolis_driver_loc_self on public.kolis_driver_locations
  for all to authenticated using (kolis_id = auth.uid()) with check (kolis_id = auth.uid());

create or replace function public.kolis_report_location(p_lat double precision, p_lng double precision)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.kolis_driver_locations(kolis_id, lat, lng, updated_at)
  values (auth.uid(), p_lat, p_lng, now())
  on conflict (kolis_id) do update set lat = excluded.lat, lng = excluded.lng, updated_at = now();
$$;
grant execute on function public.kolis_report_location(double precision, double precision) to authenticated;
