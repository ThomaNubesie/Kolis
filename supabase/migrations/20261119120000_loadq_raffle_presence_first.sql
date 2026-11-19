-- Raffle: confirm presence FIRST, enter the code second.
--
-- Until now one tap did both: the app sent coordinates and the code together, so
-- holding the code was almost the whole game — and the code is now texted to five
-- people at 06:01, one screenshot away from a group chat. Splitting the two means a
-- forwarded code is useless unless that driver stood in the lot during check-in.
--
--   05:00–06:02  loadq_raffle_checkin(zone, lat, lng, accuracy, device)  -> presence
--   06:02–07:00  loadq_raffle_draw(zone, code)                           -> the number
--
-- Times come from loadq_raffle_config (checkin_opens_local / checkin_closes_local /
-- draw_opens_local / draw_at_local), so moving the window moves both steps.

-- 1. Presence. Geofence + accuracy, inside the check-in window. No code, no number.
create or replace function public.loadq_raffle_checkin(
  p_zone text, p_lat double precision, p_lng double precision,
  p_accuracy double precision, p_device text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare uid uuid := auth.uid(); c public.loadq_raffle_config; r public.loadq_raffle_round;
        veh record; dist double precision; rid uuid; k text; svc date;
        opens timestamptz; closes timestamptz; new_id uuid;
begin
  if uid is null then return jsonb_build_object('error','auth_required'); end if;
  select * into c from public.loadq_raffle_config where zone_id = p_zone and enabled;
  if not found then return jsonb_build_object('error','not_open'); end if;
  if not public.loadq_raffle_eligible(uid) then return jsonb_build_object('error','not_eligible'); end if;
  if c.test_mode and c.allowed_driver_ids is not null and not (uid = any(c.allowed_driver_ids))
    then return jsonb_build_object('error','not_eligible'); end if;

  select v.id, v.seats into veh from public.vehicles v
    where v.driver_id = uid and v.is_active order by v.id limit 1;
  if veh.id is null then return jsonb_build_object('error','no_vehicle'); end if;

  svc    := (now() at time zone c.timezone)::date;
  opens  := (svc + c.checkin_opens_local)  at time zone c.timezone;
  closes := (svc + coalesce(c.checkin_closes_local, c.draw_at_local)) at time zone c.timezone;
  if now() < opens  then return jsonb_build_object('error','not_open','opens_at',opens); end if;
  if now() >= closes then return jsonb_build_object('error','checkin_closed','closed_at',closes); end if;

  -- Presence is the whole point of this step, so the geofence is never skipped here.
  if p_lat is null or p_lng is null then return jsonb_build_object('error','location_required'); end if;
  if p_accuracy is not null and p_accuracy > c.max_gps_accuracy_m
    then return jsonb_build_object('error','low_gps_accuracy','accuracy_m',p_accuracy); end if;
  dist := public.loadq_haversine_m(p_lat, p_lng, c.geofence_lat, c.geofence_lng);
  if dist > c.geofence_radius_m
    then return jsonb_build_object('error','not_at_lot','distance_m',round(dist)); end if;

  rid := public.loadq_raffle_ensure_round(p_zone);
  if rid is null then return jsonb_build_object('error','not_open'); end if;
  select * into r from public.loadq_raffle_round where id = rid for update;

  if c.one_checkin_per_device and p_device is not null
     and exists (select 1 from public.loadq_raffle_entry e
                  where e.round_id = r.id and e.device_id = p_device and e.driver_id <> uid)
    then return jsonb_build_object('error','duplicate_device'); end if;

  k := encode(digest(r.seed_reveal || uid::text, 'sha256'), 'hex');
  insert into public.loadq_raffle_entry(round_id, driver_id, vehicle_id, raffle_key,
        device_id, geo_lat, geo_lng, geo_accuracy_m, geo_ok, code_ok, status)
  values (r.id, uid, veh.id, k, p_device, p_lat, p_lng, p_accuracy, true, false, 'checked_in')
  on conflict (round_id, driver_id) do nothing
  returning id into new_id;
  if new_id is null then return jsonb_build_object('ok',true,'already_present',true); end if;

  return jsonb_build_object('ok',true,'present',true,'distance_m',round(dist),
    'draw_opens_at',(svc + coalesce(c.draw_opens_local, c.draw_at_local)) at time zone c.timezone);
end $$;

-- 2. The draw. Code only, and only for a driver whose presence was confirmed earlier.
create or replace function public.loadq_raffle_draw(p_zone text, p_code text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare uid uuid := auth.uid(); c public.loadq_raffle_config; r public.loadq_raffle_round;
        mine public.loadq_raffle_entry; rid uuid; ticket int; svc date;
        dopens timestamptz; dcloses timestamptz;
begin
  if uid is null then return jsonb_build_object('error','auth_required'); end if;
  select * into c from public.loadq_raffle_config where zone_id = p_zone and enabled;
  if not found then return jsonb_build_object('error','not_open'); end if;

  svc     := (now() at time zone c.timezone)::date;
  dopens  := (svc + coalesce(c.draw_opens_local, c.checkin_opens_local)) at time zone c.timezone;
  dcloses := (svc + c.draw_at_local) at time zone c.timezone;
  if now() <  dopens  then return jsonb_build_object('error','draw_not_open','opens_at',dopens); end if;
  if now() >= dcloses then return jsonb_build_object('error','draw_closed'); end if;

  select id into rid from public.loadq_raffle_round
    where zone_id = p_zone and service_date = svc;
  if rid is null then return jsonb_build_object('error','not_open'); end if;
  select * into r from public.loadq_raffle_round where id = rid for update;  -- serialises the hat

  select * into mine from public.loadq_raffle_entry where round_id = rid and driver_id = uid;
  -- This is the rule: no presence, no draw. Holding the code is not enough.
  if mine.id is null or not coalesce(mine.geo_ok, false)
    then return jsonb_build_object('error','no_checkin'); end if;
  if mine.assigned_number is not null
    then return jsonb_build_object('ok',true,'already_drawn',true,'number',mine.assigned_number); end if;
  if c.require_code and not (p_code is not null and btrim(p_code) = r.code)
    then return jsonb_build_object('error','bad_code'); end if;

  ticket := public.loadq_raffle_ticket(rid);
  update public.loadq_raffle_entry
     set assigned_number = ticket, code_ok = true, status = 'drawn'
   where id = mine.id;

  return jsonb_build_object('ok',true,'number',ticket,'final',true);
end $$;

-- 3. The old single-tap entry must not become a side door around the new rule.
create or replace function public.loadq_raffle_enter(
  p_zone text, p_lat double precision, p_lng double precision,
  p_accuracy double precision, p_code text, p_device text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
begin
  -- Superseded by checkin + draw (2026-11-19). An old build calling this gets a clear
  -- error rather than silently drawing a number without confirmed presence.
  return jsonb_build_object('error','update_required',
    'detail','Check in at the lot first, then enter the code when the draw opens.');
end $$;

-- 4. Status: which phase we are in, and what this driver may do next.
create or replace function public.loadq_raffle_status(p_zone text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c public.loadq_raffle_config; rid uuid;
        r public.loadq_raffle_round; mine public.loadq_raffle_entry;
        elig boolean; admin boolean; svc date;
        opens timestamptz; closes timestamptz; dopens timestamptz; dcloses timestamptz;
        phase text;
begin
  if uid is null then return jsonb_build_object('error','auth_required'); end if;
  select * into c from public.loadq_raffle_config where zone_id = p_zone;
  rid := public.loadq_raffle_ensure_round(p_zone);
  if rid is not null then select * into r from public.loadq_raffle_round where id = rid; end if;

  svc     := (now() at time zone c.timezone)::date;
  opens   := (svc + c.checkin_opens_local) at time zone c.timezone;
  closes  := (svc + coalesce(c.checkin_closes_local, c.draw_at_local)) at time zone c.timezone;
  dopens  := (svc + coalesce(c.draw_opens_local, c.checkin_opens_local)) at time zone c.timezone;
  dcloses := (svc + c.draw_at_local) at time zone c.timezone;

  elig  := public.loadq_raffle_eligible(uid)
           and (coalesce(c.test_mode,false) = false
                or c.allowed_driver_ids is null
                or uid = any(c.allowed_driver_ids));
  admin := public.loadq_raffle_is_admin(p_zone);
  if rid is not null then
    select * into mine from public.loadq_raffle_entry where round_id = rid and driver_id = uid;
  end if;

  phase := case when now() <  opens   then 'before'
                when now() <  closes  then 'checkin'
                when now() <  dcloses then 'draw'
                else 'closed' end;

  return jsonb_build_object(
    'zone', p_zone, 'round_id', r.id, 'status', coalesce(r.status,'none'), 'phase', phase,
    'checkin_opens_at', opens, 'checkin_closes_at', closes,
    'draw_opens_at', dopens, 'draw_at', dcloses,
    'test_mode', coalesce(c.test_mode,false), 'is_admin', coalesce(admin,false),
    'seed_commit', r.seed_commit, 'eligible', coalesce(elig,false),
    'checked_in', mine.id is not null and coalesce(mine.geo_ok,false),
    'my_number', mine.assigned_number,
    'entrant_count', coalesce((select count(*) from public.loadq_raffle_entry where round_id = r.id),0),
    -- admins may still act outside the window, to test
    'can_checkin', coalesce(elig and mine.id is null and (phase = 'checkin' or admin), false),
    'can_draw',    coalesce(elig and mine.id is not null and coalesce(mine.geo_ok,false)
                            and mine.assigned_number is null and (phase = 'draw' or admin), false)
  );
end $$;

grant execute on function public.loadq_raffle_checkin(text,double precision,double precision,double precision,text) to authenticated;
grant execute on function public.loadq_raffle_draw(text,text) to authenticated;
