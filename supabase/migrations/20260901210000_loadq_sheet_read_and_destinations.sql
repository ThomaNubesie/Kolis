-- ============================================================================
-- LoadQ: the sheet's read side, and a destinations data fix — 2026-09-01
--
-- Thomas chose option B: each (zone, destination) is its OWN numbered line,
-- matching `queue_entries_zone_dest_position_uniq` and matching what the driver
-- app shows. So the sheet picks a zone AND a destination, and numbers run from 1
-- within that pair. UG→Montréal #5 and UG→Québec #5 both exist and are different
-- cars — that is correct, not a clash.
--
-- Two data bugs in `destinations`, both fixed here (verified unreferenced by
-- queue_entries and loading_history first, so nothing breaks):
--   code 'sherbrooke\n  '  — a newline INSIDE a code can never match a
--                            destination_region, so that destination was unusable
--   name 'Québec \n  City' — renders with a literal line break in every picker
-- ============================================================================
set check_function_bodies = off;

update public.destinations set code = btrim(regexp_replace(code, '[\n\r]+', '', 'g'))
 where code <> btrim(regexp_replace(code, '[\n\r]+', '', 'g'));
update public.destinations set name = btrim(regexp_replace(name, '\s*[\n\r]+\s*', ' ', 'g'))
 where name <> btrim(regexp_replace(name, '\s*[\n\r]+\s*', ' ', 'g'));

-- --------------------------------------------------------------- the sheet ---
-- One call renders the whole sheet. Returns everything a row needs including the
-- vehicle fields `car-render` keys off (make/model/colour), who added the row,
-- and whether the driver is verified — the sheet can add someone unverified, so
-- it should be able to SHOW that rather than hide it.
create or replace function public.loadq_sheet(p_zone text, p_dest text)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select coalesce(jsonb_agg(x order by pos), '[]'::jsonb) from (
    select qe.position as pos,
      jsonb_build_object(
        'entry_id', qe.id, 'position', qe.position, 'status', qe.status,
        'driver_id', d.id, 'name', d.full_name,
        'verified', coalesce(d.verified,false),
        'subscription', d.subscription_status,
        'vehicle_id', v.id,
        'make', v.make, 'model', v.model, 'color', v.color, 'seats', v.seats,
        'plate', v.plate,
        'car', case when v.id is null then null else concat_ws(' ', v.make, v.model) end,
        'placeholder_plate', coalesce(v.plate,'') like '%-TEMP' or coalesce(v.plate,'') = 'HHHHH',
        'seats_boarded', qe.seats_boarded,
        'load_start_at', qe.load_start_at, 'load_deadline', qe.load_deadline,
        'joined_at', qe.joined_at,
        -- null added_by = the driver signed themselves in through the app
        'added_by', qe.added_by,
        'added_by_name', (select w.full_name from public.drivers w where w.id = qe.added_by),
        'self_joined', qe.added_by is null,
        'return_zone', (select z.zone_id from public.loadq_return_zone z where z.driver_id = d.id)
      ) as x
    from public.queue_entries qe
    join public.drivers d on d.id = qe.driver_id
    left join public.vehicles v on v.id = qe.vehicle_id
    where qe.zone_id = p_zone
      and coalesce(qe.destination_region,'') = coalesce(p_dest,'')
      and qe.status <> 'ended'
  ) s;
$function$;

-- Which zone/destination lines exist, so the picker is data-driven rather than a
-- hardcoded list. Includes lines that are empty right now but were used in the
-- last 30 days, so a seasonal destination does not vanish from the picker just
-- because nobody is on it this minute.
create or replace function public.loadq_sheet_lines()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with live as (
    select zone_id, coalesce(destination_region,'') dest, count(*) cars,
           sum(coalesce((select vv.seats from public.vehicles vv where vv.id = qe.vehicle_id),0)) seats
    from public.queue_entries qe where status <> 'ended' group by 1,2
  ),
  recent as (
    select zone_id, coalesce(destination_region,'') dest, count(*) trips
    from public.loading_history where ended_at > now() - interval '30 days' group by 1,2
  ),
  merged as (
    select coalesce(l.zone_id, r.zone_id) zone_id,
           coalesce(l.dest, r.dest) dest,
           coalesce(l.cars,0) cars, coalesce(l.seats,0) seats, coalesce(r.trips,0) trips
    from live l full outer join recent r on r.zone_id = l.zone_id and r.dest = l.dest
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'zone_id', m.zone_id,
    'zone_name', z.name,
    'destination', m.dest,
    'destination_name', coalesce(dd.name, initcap(m.dest)),
    'cars', m.cars, 'seats', m.seats, 'trips_30d', m.trips
  ) order by m.trips desc, m.zone_id), '[]'::jsonb)
  from merged m
  left join public.zones z on z.id = m.zone_id
  left join public.destinations dd on dd.code = m.dest
  where m.zone_id is not null;
$function$;

revoke all on function public.loadq_sheet(text,text) from public, anon;
revoke all on function public.loadq_sheet_lines() from public, anon;
grant execute on function public.loadq_sheet(text,text) to authenticated, service_role;
grant execute on function public.loadq_sheet_lines() to authenticated, service_role;
