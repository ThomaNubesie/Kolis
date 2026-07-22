-- A parcel's driver_id can be a Kolis courier (kolis_profiles, possibly no
-- LoadQ drivers row) OR a LoadQ queue driver (drivers, possibly no
-- kolis_profiles row). Both are auth.users, so the FK must target auth.users.
-- Previously it referenced drivers(id), which blocked assigning Kolis-only
-- couriers (kolis_parcels_driver_id_fkey violation). (Applied live 2026-06-12.)
alter table public.kolis_parcels
  drop constraint if exists kolis_parcels_driver_id_fkey;
alter table public.kolis_parcels
  add constraint kolis_parcels_driver_id_fkey
  foreign key (driver_id) references auth.users(id) on delete set null;
