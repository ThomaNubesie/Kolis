-- ═══════════════════════════════════════════════════════════════════════════
-- Auto-sync LoadQ pickup zones → Kolis hubs.
-- Every LoadQ zone is also a Kolis hub. A trigger keeps kolis_hubs in lock-step
-- with public.zones: insert→create hub, update→update hub, delete→deactivate
-- hub (never hard-delete — a parcel may reference it). Hubs are linked to their
-- source zone by kolis_hubs.zone_id. Manually-added hubs have zone_id = null and
-- are left untouched by the sync.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.kolis_hubs add column if not exists zone_id text;
-- unique link (NULLs are distinct, so manual hubs with null zone_id are fine)
create unique index if not exists kolis_hubs_zone_id on public.kolis_hubs(zone_id);

-- LoadQ region code → Kolis display city (constants/cities.ts names).
create or replace function public.kolis_zone_city(p_region text)
returns text language sql immutable set search_path to 'public' as $$
  select case lower(coalesce(p_region,''))
    when 'gatineau' then 'Gatineau' when 'montreal' then 'Montréal'
    when 'ottawa' then 'Ottawa'     when 'quebec'   then 'Québec'
    when 'toronto' then 'Toronto'
    else initcap(coalesce(p_region,'')) end;
$$;

-- The sync itself (SECURITY DEFINER: writes kolis_hubs regardless of who edits a zone).
create or replace function public.kolis_sync_zone_to_hub()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    update public.kolis_hubs set is_active = false where zone_id = old.id;
    return old;
  end if;
  insert into public.kolis_hubs (zone_id, city, name, address, latitude, longitude, is_active)
  values (new.id, public.kolis_zone_city(new.region), new.name, new.address,
          new.latitude, new.longitude, coalesce(new.is_active, true))
  on conflict (zone_id) do update set
    city      = excluded.city,
    name      = excluded.name,
    address   = excluded.address,
    latitude  = excluded.latitude,
    longitude = excluded.longitude,
    is_active = excluded.is_active;
  return new;
end; $$;

-- ── One-time reconcile of the hubs that already exist ───────────────────────
-- Link the 11 hubs already mirrored from zones (matched on exact coordinates),
-- preserving their clean reverse-geocoded addresses.
update public.kolis_hubs h set zone_id = z.id
from public.zones z
where h.zone_id is null and h.latitude = z.latitude and h.longitude = z.longitude;

-- Create a hub for any zone not yet linked (safety net).
insert into public.kolis_hubs (zone_id, city, name, address, latitude, longitude, is_active)
select z.id, public.kolis_zone_city(z.region), z.name, z.address, z.latitude, z.longitude, coalesce(z.is_active,true)
from public.zones z
where not exists (select 1 from public.kolis_hubs h where h.zone_id = z.id);

-- ── Live trigger ────────────────────────────────────────────────────────────
drop trigger if exists kolis_zone_hub_sync on public.zones;
create trigger kolis_zone_hub_sync
  after insert or update or delete on public.zones
  for each row execute function public.kolis_sync_zone_to_hub();
