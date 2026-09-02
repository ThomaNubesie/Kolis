-- ============================================================================
-- LoadQ: at Universal Grocery, the list is the point of truth — 2026-09-02
--
-- Thomas: "all drivers don't fill their seats nor click departed. I want this to
-- happen on the list, so the next person is not promoted till the admin marks
-- their seats and marks them gone." And: "the list for UG is only for UG."
--
-- So promotion becomes MANUAL, and only at ottawa-universal-grocery. Berri,
-- Namur, Shell and Laval keep behaving exactly as they do today.
--
-- Two things promote a driver today, and both have to stand down for that zone:
--   1. `loadq_sync_loader` — promotes the lowest active car whenever the loader
--      stops loading. Called after every add, depart and move.
--   2. the `queue-close-watchdog` edge function — runs every minute and promotes
--      on its own after a grace period. Handled separately; this migration only
--      covers the database half.
--
-- THE TRADE, stated plainly: with this on, if nobody marks a driver departed the
-- line STOPS. No timer rescues it. That is the cost of the number being true
-- rather than guessed, and it is why this is per-zone and starts at one zone.
-- ============================================================================
set check_function_bodies = off;

alter table public.zones add column if not exists manual_promotion boolean not null default false;
comment on column public.zones.manual_promotion is
  'When true, nothing auto-promotes the next car: an admin must record the seats
   and mark the loader departed on the sheet. Set for ottawa-universal-grocery
   2026-09-02. The watchdog must honour this too.';

update public.zones set manual_promotion = true where id = 'ottawa-universal-grocery';

-- `p_force` lets an explicit, human-triggered departure advance the line even in
-- a manual zone. Everything else (adds, moves, the watchdog) leaves it alone.
create or replace function public.loadq_sync_loader(p_zone text, p_dest text, p_force boolean default false)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare front_id uuid; front_status text; mins int; v_manual boolean;
begin
  select coalesce(manual_promotion,false) into v_manual from public.zones where id = p_zone;
  -- In a manual zone the line only moves when a person says so.
  if coalesce(v_manual,false) and not coalesce(p_force,false) then return; end if;

  select id, status, coalesce(load_minutes_override, 180)
    into front_id, front_status, mins
  from public.queue_entries
  where zone_id = p_zone and (destination_region is not distinct from p_dest)
    and status in ('loading','waiting','standby')
  order by position asc
  limit 1;

  if front_id is null then return; end if;
  if front_status = 'loading' then return; end if;   -- already loading; leave its clock alone

  update public.queue_entries
     set status = 'waiting', load_start_at = null, load_deadline = null
   where zone_id = p_zone and (destination_region is not distinct from p_dest)
     and status = 'loading' and id <> front_id;

  update public.queue_entries
     set status = 'loading', load_start_at = now(),
         load_deadline = now() + make_interval(mins => mins),
         expiry_stage = 0, expiry_msg_at = null
   where id = front_id;
end $function$;

-- Replacing a function by adding a defaulted argument leaves the OLD 2-arg one in
-- place, and every 2-argument call then fails "is not unique". Drop it.
drop function if exists public.loadq_sync_loader(text, text);

-- --------------------------------------------------------------- seats ------
-- Record how many people actually got in. This is the number the trip is worth,
-- so it is typed by a person, not inferred.
create or replace function public.loadq_list_seats(p_entry uuid, p_seats int)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_zone text; v_cap int; v_name text;
begin
  select qe.zone_id, coalesce(v.seats, 0), d.full_name into v_zone, v_cap, v_name
  from public.queue_entries qe
  join public.drivers d on d.id = qe.driver_id
  left join public.vehicles v on v.id = qe.vehicle_id
  where qe.id = p_entry;
  if v_zone is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not public.loadq_can_write_list(v_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;
  if p_seats < 0 then return jsonb_build_object('ok',false,'error','negative'); end if;
  if v_cap > 0 and p_seats > v_cap then
    return jsonb_build_object('ok',false,'error','over_capacity','capacity',v_cap); end if;

  update public.queue_entries set seats_boarded = p_seats where id = p_entry;
  return jsonb_build_object('ok',true,'driver',v_name,'seats_boarded',p_seats,'capacity',v_cap);
end $function$;

-- ------------------------------------------------------------- departed -----
-- Marking someone gone is the ONLY thing that advances a manual line. Takes the
-- final seat count so the number recorded in loading_history is the real one.
create or replace function public.loadq_list_depart(p_entry uuid, p_seats int default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_zone text; v_dest text; v_pos int; v_driver uuid; v_vehicle uuid;
        v_status text; v_name text; v_seats int; v_next jsonb;
begin
  select qe.zone_id, qe.destination_region, qe.position, qe.driver_id, qe.vehicle_id,
         qe.status, d.full_name, coalesce(p_seats, qe.seats_boarded, 0)
    into v_zone, v_dest, v_pos, v_driver, v_vehicle, v_status, v_name, v_seats
  from public.queue_entries qe join public.drivers d on d.id = qe.driver_id
  where qe.id = p_entry;
  if v_zone is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not public.loadq_can_write_list(v_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;

  if p_seats is not null then
    update public.queue_entries set seats_boarded = p_seats where id = p_entry;
  end if;

  perform public.loadq_admin_depart(p_entry, v_seats);
  -- force: this is the human saying the car has gone, so the line may advance.
  perform public.loadq_sync_loader(v_zone, v_dest, true);

  select jsonb_build_object('position', qe.position, 'name', d.full_name)
    into v_next
  from public.queue_entries qe join public.drivers d on d.id = qe.driver_id
  where qe.zone_id = v_zone and coalesce(qe.destination_region,'') = coalesce(v_dest,'')
    and qe.status = 'loading' limit 1;

  return jsonb_build_object('ok',true,'driver',v_name,'seats',v_seats,'now_loading',v_next,
    'undo', jsonb_build_object('zone',v_zone,'dest',v_dest,'position',v_pos,
      'driver_id',v_driver,'vehicle_id',v_vehicle,'was_status',v_status,'seats',v_seats));
end $function$;

-- The sheet needs to know a zone is manual so it can say WHY the next car is held.
create or replace function public.loadq_sheet_lines()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with live as (
    select zone_id, coalesce(destination_region,'') dest, count(*) cars,
           sum(coalesce((select vv.seats from public.vehicles vv where vv.id = qe.vehicle_id),0)) seats,
           sum(coalesce(qe.seats_boarded,0)) boarded
    from public.queue_entries qe where status <> 'ended' group by 1,2
  ),
  recent as (
    select zone_id, coalesce(destination_region,'') dest, count(*) trips
    from public.loading_history where ended_at > now() - interval '30 days' group by 1,2
  ),
  merged as (
    select coalesce(l.zone_id, r.zone_id) zone_id, coalesce(l.dest, r.dest) dest,
           coalesce(l.cars,0) cars, coalesce(l.seats,0) seats,
           coalesce(l.boarded,0) boarded, coalesce(r.trips,0) trips
    from live l full outer join recent r on r.zone_id = l.zone_id and r.dest = l.dest
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'zone_id', m.zone_id, 'zone_name', z.name,
    'destination', m.dest, 'destination_name', coalesce(dd.name, initcap(m.dest)),
    'cars', m.cars, 'seats', m.seats, 'boarded', m.boarded, 'trips_30d', m.trips,
    'manual_promotion', coalesce(z.manual_promotion,false)
  ) order by m.trips desc, m.zone_id), '[]'::jsonb)
  from merged m
  left join public.zones z on z.id = m.zone_id
  left join public.destinations dd on dd.code = m.dest
  where m.zone_id is not null;
$function$;

revoke all on function public.loadq_list_seats(uuid,int) from public, anon;
grant execute on function public.loadq_list_seats(uuid,int)       to authenticated, service_role;
grant execute on function public.loadq_list_depart(uuid,int)      to authenticated, service_role;
grant execute on function public.loadq_sync_loader(text,text,boolean) to authenticated, service_role;
