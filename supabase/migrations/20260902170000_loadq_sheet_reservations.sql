-- ============================================================================
-- LoadQ: a client's reservation must look the same on the sheet as in the app
--                                                                  2026-09-02
--
-- Thomas: "just to make sure if a client reserves it shows as it does on the
-- app?" It did not. Three real problems, all fixed here.
--
-- 1. THE SHEET COULD NOT SEE A RESERVATION.
--    When a passenger claims a seat and the driver confirms it, the app's
--    services/claims.ts bumps BOTH `seats_boarded` and `seats_locked`, and
--    writes 'locked' into `seat_states`. `loadq_sheet` returned only
--    `seats_boarded`, so the tablet drew a plain filled seat with no way to
--    tell a paying reservation from a driver-tapped board. Now it returns
--    `seat_states`, `seats_locked`, and the confirmed passengers' names, so a
--    locked seat renders yellow on the tablet exactly as it does on the phone.
--
-- 2. THE SHEET COULD SILENTLY DESTROY A RESERVATION.
--    `loadq_list_seats` did `seats_boarded = p_seats` outright. A writer typing
--    "2" on a car that already had 3 confirmed claims would push the count
--    BELOW `seats_locked` and out of step with `seat_states` and `seat_claims`
--    — the passenger keeps their booking row while the car shows a free seat.
--    Seats are now floored at `seats_locked` and the per-seat array is edited
--    rather than replaced: a 'locked' seat is never touched by the tablet.
--    Releasing a reservation stays where it belongs, with the driver.
--
-- 3. CAPACITY WAS OFF BY ONE.
--    The app counts PASSENGER seats — `Math.max(vehicle.seats - 1, 1)`, the
--    driver excluded (my-loading.tsx:42, queue.tsx:457). `loadq_list_seats`
--    validated against the full `vehicles.seats`, so the sheet would have
--    accepted 7 boarded in a 7-seat Sienna where the app tops out at 6.
--    `capacity` is now returned alongside `seats` and is what gets enforced.
--
-- Nothing has gone wrong in production from any of this: `seat_claims` is
-- empty and no queue entry has ever carried `seats_locked > 0`. This lands
-- before the first reservation, not after it.
-- ============================================================================
set check_function_bodies = off;

-- --------------------------------------------------------------- seat map ---
-- One definition of "what does each seat look like", shared by every function
-- below so the sheet and the app can't drift apart.
--
-- `seat_states` is authoritative when the driver has been tapping seats. When
-- it is absent — the usual case for a car added from the sheet — synthesize it
-- the way the app's fallback does: locked seats first, then boarded, then
-- empty (queue.tsx:634 draws `filled = i < boarded`, `locked = i < locked`).
create or replace function public.loadq_seat_map(
  p_states jsonb, p_boarded int, p_locked int, p_cap int)
returns jsonb language sql immutable as $function$
  select coalesce(jsonb_agg(
    case
      when jsonb_typeof(p_states) = 'array'
       and (p_states -> i) #>> '{}' in ('boarded','locked','disputed','empty')
        then (p_states -> i) #>> '{}'
      when i < greatest(coalesce(p_locked,0),0)                     then 'locked'
      when i < greatest(coalesce(p_boarded,0),0)                    then 'boarded'
      else 'empty'
    end order by i), '[]'::jsonb)
  from generate_series(0, greatest(coalesce(p_cap,0),0) - 1) i;
$function$;

-- ------------------------------------------------------------- the sheet ----
create or replace function public.loadq_sheet(p_zone text, p_dest text)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select coalesce(jsonb_agg(x order by pos), '[]'::jsonb) from (
    select qe.position as pos,
      jsonb_build_object(
        'entry_id', qe.id, 'position', qe.position, 'status', qe.status,
        'driver_id', d.id, 'name', d.full_name,
        'verified', coalesce(d.verified,false), 'subscription', d.subscription_status,
        'vehicle_id', v.id, 'make', v.make, 'model', v.model, 'color', v.color,
        'seats', v.seats, 'plate', v.plate,
        -- what the app calls capacity: passenger seats, driver excluded
        'capacity', greatest(coalesce(v.seats,0) - 1, 0),
        'car', case when v.id is null then null else concat_ws(' ', v.make, v.model) end,
        'placeholder_plate', coalesce(v.plate,'') like '%-TEMP' or coalesce(v.plate,'') = 'HHHHH',
        'seats_boarded', coalesce(qe.seats_boarded,0),
        'seats_locked', coalesce(qe.seats_locked,0),
        'seat_states', public.loadq_seat_map(qe.seat_states, qe.seats_boarded,
                                             qe.seats_locked, greatest(coalesce(v.seats,0)-1,0)),
        -- Confirmed claims in confirmation order — the same order the app maps
        -- them onto locked seats — so the tablet can name who reserved.
        'reserved_by', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'claim_id', sc.id, 'passenger_id', p.id, 'name', p.full_name,
                   'phone', p.phone, 'confirmed_at', sc.confirmed_at)
                 order by sc.confirmed_at)
          from public.seat_claims sc
          left join public.passengers p on p.id = sc.passenger_id
          where sc.queue_entry_id = qe.id and sc.status = 'confirmed'), '[]'::jsonb),
        'claims_pending', (
          select count(*) from public.seat_claims sc
          where sc.queue_entry_id = qe.id and sc.status = 'pending'),
        'load_start_at', qe.load_start_at, 'load_deadline', qe.load_deadline,
        'joined_at', qe.joined_at,
        'paused_at', qe.paused_at, 'pause_until', qe.pause_until, 'pause_reason', qe.pause_reason,
        'pause_label_fr', (select r.label_fr from public.loadq_pause_reason r where r.code = qe.pause_reason),
        'paused_by_name', (select w.full_name from public.drivers w where w.id = qe.paused_by),
        'overdue', qe.pause_until is not null and qe.pause_until < now(),
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

-- ------------------------------------------------------------------ seats ---
-- Set the head count. Fills or empties seats from the back, and steps over
-- anything a passenger holds.
create or replace function public.loadq_list_seats(p_entry uuid, p_seats int)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_zone text; v_cap int; v_name text; v_locked int; v_map jsonb;
        v_states text[]; v_have int; i int;
begin
  select qe.zone_id, greatest(coalesce(v.seats,0) - 1, 0), d.full_name,
         coalesce(qe.seats_locked,0),
         public.loadq_seat_map(qe.seat_states, qe.seats_boarded, qe.seats_locked,
                               greatest(coalesce(v.seats,0)-1,0))
    into v_zone, v_cap, v_name, v_locked, v_map
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
  -- A reserved seat is a booking, not a tally. The tablet may not undo one.
  if p_seats < v_locked then
    return jsonb_build_object('ok',false,'error','below_reserved','reserved',v_locked); end if;

  select array_agg(value #>> '{}' order by ordinality)
    into v_states from jsonb_array_elements(v_map) with ordinality;
  v_states := coalesce(v_states, '{}');

  -- top up from the front, release from the back — never touching 'locked'
  v_have := (select count(*) from unnest(v_states) s where s in ('boarded','locked','disputed'));
  i := 1;
  while v_have < p_seats and i <= array_length(v_states,1) loop
    if v_states[i] = 'empty' then v_states[i] := 'boarded'; v_have := v_have + 1; end if;
    i := i + 1;
  end loop;
  i := coalesce(array_length(v_states,1), 0);
  while v_have > p_seats and i >= 1 loop
    if v_states[i] = 'boarded' then v_states[i] := 'empty'; v_have := v_have - 1; end if;
    i := i - 1;
  end loop;

  update public.queue_entries
     set seats_boarded = v_have,
         seat_states = to_jsonb(v_states)
   where id = p_entry;

  return jsonb_build_object('ok',true,'driver',v_name,'seats_boarded',v_have,
    'capacity',v_cap,'reserved',v_locked,'seat_states',to_jsonb(v_states));
end $function$;

-- Tap one seat. This is what the seat drawing on the tablet calls, and it is
-- the honest version of the interaction: a locked seat says no rather than
-- quietly becoming a plain boarded seat.
create or replace function public.loadq_list_seat_toggle(p_entry uuid, p_index int)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_zone text; v_cap int; v_name text; v_map jsonb; v_states text[]; v_cur text; v_have int;
begin
  select qe.zone_id, greatest(coalesce(v.seats,0) - 1, 0), d.full_name,
         public.loadq_seat_map(qe.seat_states, qe.seats_boarded, qe.seats_locked,
                               greatest(coalesce(v.seats,0)-1,0))
    into v_zone, v_cap, v_name, v_map
  from public.queue_entries qe
  join public.drivers d on d.id = qe.driver_id
  left join public.vehicles v on v.id = qe.vehicle_id
  where qe.id = p_entry;
  if v_zone is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not public.loadq_can_write_list(v_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;
  if p_index < 0 or p_index >= v_cap then
    return jsonb_build_object('ok',false,'error','no_such_seat','capacity',v_cap); end if;

  select array_agg(value #>> '{}' order by ordinality)
    into v_states from jsonb_array_elements(v_map) with ordinality;
  v_cur := v_states[p_index + 1];
  if v_cur = 'locked' then
    return jsonb_build_object('ok',false,'error','seat_reserved'); end if;
  if v_cur = 'disputed' then
    return jsonb_build_object('ok',false,'error','seat_disputed'); end if;

  v_states[p_index + 1] := case when v_cur = 'boarded' then 'empty' else 'boarded' end;
  v_have := (select count(*) from unnest(v_states) s where s in ('boarded','locked','disputed'));

  update public.queue_entries
     set seats_boarded = v_have, seat_states = to_jsonb(v_states)
   where id = p_entry;

  return jsonb_build_object('ok',true,'driver',v_name,'seats_boarded',v_have,
    'capacity',v_cap,'seat_states',to_jsonb(v_states));
end $function$;

-- --------------------------------------------------------------- departed ---
-- Same floor as above: a departure may not record fewer people than were
-- reserved, or `loading_history` under-counts a trip that was actually paid.
create or replace function public.loadq_list_depart(p_entry uuid, p_seats int default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_zone text; v_dest text; v_pos int; v_driver uuid; v_vehicle uuid;
        v_status text; v_name text; v_seats int; v_locked int; v_cap int; v_next jsonb;
begin
  select qe.zone_id, qe.destination_region, qe.position, qe.driver_id, qe.vehicle_id,
         qe.status, d.full_name, coalesce(p_seats, qe.seats_boarded, 0),
         coalesce(qe.seats_locked,0), greatest(coalesce(v.seats,0)-1,0)
    into v_zone, v_dest, v_pos, v_driver, v_vehicle, v_status, v_name, v_seats, v_locked, v_cap
  from public.queue_entries qe
  join public.drivers d on d.id = qe.driver_id
  left join public.vehicles v on v.id = qe.vehicle_id
  where qe.id = p_entry;
  if v_zone is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not public.loadq_can_write_list(v_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;
  if p_seats is not null and p_seats < v_locked then
    return jsonb_build_object('ok',false,'error','below_reserved','reserved',v_locked); end if;
  if p_seats is not null and v_cap > 0 and p_seats > v_cap then
    return jsonb_build_object('ok',false,'error','over_capacity','capacity',v_cap); end if;

  if p_seats is not null then
    perform public.loadq_list_seats(p_entry, p_seats);
  end if;

  perform public.loadq_admin_depart(p_entry, v_seats);
  -- force: this is the human saying the car has gone, so the line may advance.
  perform public.loadq_sync_loader(v_zone, v_dest, true);

  select jsonb_build_object('position', qe.position, 'name', d.full_name)
    into v_next
  from public.queue_entries qe join public.drivers d on d.id = qe.driver_id
  where qe.zone_id = v_zone and coalesce(qe.destination_region,'') = coalesce(v_dest,'')
    and qe.status = 'loading' limit 1;

  return jsonb_build_object('ok',true,'driver',v_name,'seats',v_seats,'reserved',v_locked,
    'now_loading',v_next,
    'undo', jsonb_build_object('zone',v_zone,'dest',v_dest,'position',v_pos,
      'driver_id',v_driver,'vehicle_id',v_vehicle,'was_status',v_status,'seats',v_seats));
end $function$;

revoke all on function public.loadq_list_seat_toggle(uuid,int) from public, anon;
grant execute on function public.loadq_seat_map(jsonb,int,int,int)  to authenticated, service_role;
grant execute on function public.loadq_list_seats(uuid,int)         to authenticated, service_role;
grant execute on function public.loadq_list_seat_toggle(uuid,int)   to authenticated, service_role;
grant execute on function public.loadq_list_depart(uuid,int)        to authenticated, service_role;
