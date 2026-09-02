-- ============================================================================
-- LoadQ alias search — multi-car dedupe, default cars, fuzzy fallback
-- 2026-09-01
--
-- Three problems the first search trials exposed:
--
-- 1. A driver with two active cars was returned TWICE ("thomas" gave Thomas
--    Shalo once for the Audi and once for the Odyssey). On the tablet that is
--    the same man listed twice with no way to tell which row is which — the
--    worst possible thing to put in front of someone signing in quickly.
--    Fixed: one row per driver, cars returned as an array.
--
-- 2. There was no record of WHICH car a two-car driver actually runs. That
--    knowledge sat hardcoded in a local script (Thomas → Odyssey, Fabio →
--    Sienna). Moved into `loadq_driver_default_vehicle` so the tablet, the
--    posting script and anything else agree.
--
-- 3. pg_trgm was installed but never used, so a typo ("sedrna") returned
--    nothing at all. Now falls back to trigram similarity when nothing matches
--    by prefix — which is exactly when a tired thumb needs it most.
-- ============================================================================
set check_function_bodies = off;

create table if not exists public.loadq_driver_default_vehicle (
  driver_id  uuid primary key references public.drivers(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

-- The two known two-car drivers. Matched by plate so a new car cannot silently
-- inherit the default.
insert into public.loadq_driver_default_vehicle (driver_id, vehicle_id, note)
select v.driver_id, v.id, 'confirmed with Thomas 2026-08'
from public.vehicles v
where v.is_active and replace(v.plate,' ','') in ('DHPY491','DHWC905')
on conflict (driver_id) do update set vehicle_id = excluded.vehicle_id;

create or replace function public.loadq_search_drivers(p_q text, p_limit int default 8)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with q as (select public.loadq_fold(trim(coalesce(p_q,''))) as t),
  hits as (
    select d.id,
           min(case
             when a.alias is not null and public.loadq_fold(a.alias) = (select t from q)
               then (case when a.is_default then 0 else 1 end)
             when public.loadq_fold(d.full_name) = (select t from q) then 0
             when a.alias is not null and public.loadq_fold(a.alias) like (select t from q) || '%' then 2
             when public.loadq_fold(d.full_name) like (select t from q) || '%' then 3
             when exists (select 1 from unnest(string_to_array(public.loadq_fold(d.full_name),' ')) w
                          where w like (select t from q) || '%') then 4
             when public.loadq_fold(d.full_name) like '%' || (select t from q) || '%' then 5
             else 6 end) as rank,          -- 6 = matched only on plate
           (array_agg(a.alias order by a.is_default desc)
              filter (where a.alias is not null
                and public.loadq_fold(a.alias) like (select t from q) || '%'))[1] as via_alias,
           bool_or(coalesce(a.is_default,false)) as is_default
    from public.drivers d
    left join public.loadq_driver_alias a on a.driver_id = d.id
    left join public.vehicles v on v.driver_id = d.id and v.is_active
    where (select t from q) <> ''
      and (
        public.loadq_fold(d.full_name) like '%' || (select t from q) || '%'
        or public.loadq_fold(coalesce(a.alias,'')) like (select t from q) || '%'
        or replace(lower(coalesce(v.plate,'')),' ','') like '%' || replace((select t from q),' ','') || '%'
      )
    group by d.id
  ),
  -- Nothing matched by prefix or substring? Fall back to trigram similarity so a
  -- typo still finds the driver. Only consulted when `hits` is empty, so it never
  -- pollutes a good result set.
  fuzzy as (
    select d.id,
           7 as rank,
           (array_agg(a.alias order by similarity(public.loadq_fold(a.alias), (select t from q)) desc)
              filter (where a.alias is not null))[1] as via_alias,
           bool_or(coalesce(a.is_default,false)) as is_default
    from public.drivers d
    left join public.loadq_driver_alias a on a.driver_id = d.id
    where (select t from q) <> ''
      and not exists (select 1 from hits)
      and length((select t from q)) >= 4
      and (
        similarity(public.loadq_fold(d.full_name), (select t from q)) > 0.3
        or similarity(public.loadq_fold(coalesce(a.alias,'')), (select t from q)) > 0.4
      )
    group by d.id
  ),
  all_hits as (select * from hits union all select * from fuzzy),
  ranked as (
    select h.rank, d.full_name as nm, d.id as did, h.via_alias, h.is_default,
           -- the car to show: the recorded default, else the only active one
           coalesce(dv.vehicle_id, (select vv.id from public.vehicles vv
              where vv.driver_id = d.id and vv.is_active order by vv.created_at limit 1)) as show_vehicle
    from all_hits h
    join public.drivers d on d.id = h.id
    left join public.loadq_driver_default_vehicle dv on dv.driver_id = d.id
    order by h.rank, d.full_name
    limit greatest(1, coalesce(p_limit, 8))
  )
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'driver_id', r.did,
      'name', r.nm,
      'matched_alias', r.via_alias,
      'is_default', r.is_default,
      'fuzzy', r.rank = 7,
      'blocked', (select coalesce(dd.blocked,false) from public.drivers dd where dd.id = r.did),
      'vehicle_id', v.id,
      'car', case when v.id is null then null else concat_ws(' ', v.make, v.model) end,
      'plate', v.plate,
      'color', v.color,
      'seats', v.seats,
      'has_car', v.id is not null,
      -- every active car, so a two-car driver can be offered a choice instead of
      -- appearing twice in the list
      'vehicles', coalesce((select jsonb_agg(jsonb_build_object(
            'vehicle_id', vv.id, 'car', concat_ws(' ', vv.make, vv.model),
            'plate', vv.plate, 'color', vv.color, 'seats', vv.seats,
            'is_default', vv.id = v.id) order by vv.created_at)
          from public.vehicles vv where vv.driver_id = r.did and vv.is_active), '[]'::jsonb),
      'on_line', (select qe.zone_id from public.queue_entries qe
                   where qe.driver_id = r.did and qe.status <> 'ended' limit 1),
      'return_zone', (select z.zone_id from public.loadq_return_zone z where z.driver_id = r.did)
    ))
    from ranked r
    left join public.vehicles v on v.id = r.show_vehicle
  ), '[]'::jsonb);
$function$;

revoke all on function public.loadq_search_drivers(text,int) from public, anon;
grant execute on function public.loadq_search_drivers(text,int) to authenticated, service_role;
