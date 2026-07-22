-- Guarantee kolis_parcels.to_region is always the canonical region code
-- (lowercase first word of the destination city, accents stripped) — the same
-- value used by queue_entries.destination_region, so dispatch/queue matching
-- lines up. Mirrors the app's constants/geo.ts regionCode(). This protects
-- against older app builds that wrote a province code (e.g. "QC").
-- (Applied live 2026-06-12.)

create or replace function public.kolis_region_code(p_city text)
returns text
language sql immutable
as $$
  select translate(
           lower(split_part(btrim(coalesce(p_city,'')), ' ', 1)),
           'áàâäéèêëíìîïóòôöúùûüç',
           'aaaaeeeeiiiioooouuuuc'
         );
$$;

create or replace function public.kolis_parcels_set_region()
returns trigger
language plpgsql
as $$
begin
  if new.to_city is not null and btrim(new.to_city) <> '' then
    new.to_region := public.kolis_region_code(new.to_city);
  end if;
  return new;
end; $$;

drop trigger if exists trg_kolis_parcels_set_region on public.kolis_parcels;
create trigger trg_kolis_parcels_set_region
  before insert or update of to_city, to_region on public.kolis_parcels
  for each row execute function public.kolis_parcels_set_region();

-- Backfill existing rows to the canonical code.
update public.kolis_parcels
   set to_region = public.kolis_region_code(to_city)
 where to_city is not null and btrim(to_city) <> ''
   and to_region is distinct from public.kolis_region_code(to_city);
