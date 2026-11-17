-- ============================================================================
-- LoadQ Morning Raffle — LAUNCH (open to all) + admin test-anytime rule.
--   * Open to every eligible driver; real finalize writes the queue (test_mode off).
--   * The 4 feature-admins may TAP the raffle anytime to test, but a tap OUTSIDE
--     the official 06:00–07:15 window is a DEMO — it returns a number but does NOT
--     register (no DB write, never counts). In-window taps register normally.
-- ============================================================================

-- 1) Flip UG to launch: open to all, real draw, keep the 4 as feature-admins.
update public.loadq_raffle_config
   set enabled = true, test_mode = false, allowed_driver_ids = null, updated_at = now()
 where zone_id = 'ottawa-universal-grocery';

-- 2) status: add is_admin + broaden can_raffle so admins see the button anytime.
create or replace function public.loadq_raffle_status(p_zone text)
returns jsonb language plpgsql security definer set search_path to public as $$
declare uid uuid := auth.uid(); c public.loadq_raffle_config; rid uuid;
        r public.loadq_raffle_round; mine public.loadq_raffle_entry;
        elig boolean; admin boolean; open_now boolean; mynum int;
begin
  if uid is null then return jsonb_build_object('error','auth_required'); end if;
  select * into c from public.loadq_raffle_config where zone_id = p_zone;
  rid := public.loadq_raffle_ensure_round(p_zone);
  if rid is not null then select * into r from public.loadq_raffle_round where id = rid; end if;
  elig  := public.loadq_raffle_eligible(uid)
           and (coalesce(c.test_mode,false) = false or uid = any(c.allowed_driver_ids));
  admin := public.loadq_raffle_is_admin(p_zone);
  if rid is not null then select * into mine from public.loadq_raffle_entry where round_id = rid and driver_id = uid; end if;
  open_now := r.id is not null and r.status = 'open' and now() >= r.checkin_opens_at and now() < r.draw_at;
  if mine.id is not null then
    mynum := coalesce(mine.assigned_number,
      (select count(*)+1 from public.loadq_raffle_entry e where e.round_id = r.id and e.raffle_key < mine.raffle_key));
  end if;
  return jsonb_build_object(
    'zone', p_zone, 'round_id', r.id, 'status', coalesce(r.status,'none'),
    'test_mode', coalesce(c.test_mode,false), 'is_admin', coalesce(admin,false),
    'window_open', coalesce(open_now,false), 'draw_at', r.draw_at, 'seed_commit', r.seed_commit,
    'entrant_count', coalesce((select count(*) from public.loadq_raffle_entry where round_id = r.id),0),
    'eligible', coalesce(elig,false), 'already_raffled', mine.id is not null, 'my_number', mynum,
    -- admins may raffle anytime (to test); everyone else only during the window
    'can_raffle', coalesce(coalesce(elig,false) and mine.id is null and (open_now or coalesce(admin,false)), false)
  );
end; $$;

-- 3) enter: admin taps outside the window return a non-registered demo number.
create or replace function public.loadq_raffle_enter(p_zone text, p_lat double precision,
        p_lng double precision, p_accuracy double precision, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path to public as $$
declare uid uuid := auth.uid(); c public.loadq_raffle_config; r public.loadq_raffle_round;
        veh record; dist double precision; k text; rid uuid; new_id uuid; prov int;
        svc date; opens timestamptz; draws timestamptz; in_window boolean; admin boolean;
begin
  if uid is null then return jsonb_build_object('error','auth_required'); end if;
  select * into c from public.loadq_raffle_config where zone_id = p_zone and enabled;
  if not found then return jsonb_build_object('error','not_open'); end if;
  if not public.loadq_raffle_eligible(uid) then return jsonb_build_object('error','not_eligible'); end if;
  if c.test_mode and not (uid = any(c.allowed_driver_ids)) then return jsonb_build_object('error','not_eligible'); end if;
  select v.id, v.seats into veh from public.vehicles v where v.driver_id = uid and v.is_active order by v.id limit 1;
  if veh.id is null then return jsonb_build_object('error','no_vehicle'); end if;

  svc := (now() at time zone c.timezone)::date;
  opens := (svc + c.checkin_opens_local) at time zone c.timezone;
  draws := (svc + c.draw_at_local)       at time zone c.timezone;
  in_window := now() >= opens and now() < draws;
  admin := public.loadq_raffle_is_admin(p_zone);

  -- Outside the official window: admins get a demo (no registration); others are out.
  if not in_window then
    if admin then
      return jsonb_build_object('ok',true,'test',true,'registered',false,
        'provisional_position', (1 + floor(random()*9))::int,
        'note','Test tap — not registered (outside '||to_char(opens,'HH24:MI')||'–'||to_char(draws,'HH24:MI')||').');
    end if;
    return jsonb_build_object('error', case when now() < opens then 'not_open' else 'window_closed' end);
  end if;

  -- In window: real registration (geofence + code enforced).
  rid := public.loadq_raffle_ensure_round(p_zone);
  if rid is null then return jsonb_build_object('error','not_open'); end if;
  select * into r from public.loadq_raffle_round where id = rid for update;
  if r.status <> 'open' then return jsonb_build_object('error','not_open'); end if;

  if c.require_geofence then
    if p_lat is null or p_lng is null then return jsonb_build_object('error','location_required'); end if;
    if p_accuracy is not null and p_accuracy > c.max_gps_accuracy_m then return jsonb_build_object('error','low_gps_accuracy'); end if;
    dist := public.loadq_haversine_m(p_lat, p_lng, c.geofence_lat, c.geofence_lng);
    if dist > c.geofence_radius_m then return jsonb_build_object('error','not_at_lot','distance_m',round(dist)); end if;
  end if;
  if c.require_code and not (p_code is not null and p_code = r.code) then return jsonb_build_object('error','bad_code'); end if;
  if c.one_checkin_per_device and p_device is not null
     and exists(select 1 from public.loadq_raffle_entry e where e.round_id = r.id and e.device_id = p_device and e.driver_id <> uid) then
    return jsonb_build_object('error','duplicate_device');
  end if;

  k := encode(digest(r.seed_reveal || uid::text, 'sha256'),'hex');
  insert into public.loadq_raffle_entry(round_id, driver_id, vehicle_id, raffle_key,
        device_id, geo_lat, geo_lng, geo_accuracy_m, geo_ok, code_ok)
  values (r.id, uid, veh.id, k, p_device, p_lat, p_lng, p_accuracy, true, true)
  on conflict (round_id, driver_id) do nothing
  returning id into new_id;
  if new_id is null then return jsonb_build_object('error','already_raffled'); end if;

  prov := (select count(*)+1 from public.loadq_raffle_entry where round_id = r.id and raffle_key < k);
  return jsonb_build_object('ok',true,'registered',true,'entry_id',new_id,'provisional_position',prov,
           'entrant_count',(select count(*) from public.loadq_raffle_entry where round_id = r.id),
           'note','final at '||to_char(draws,'HH24:MI'));
end; $$;

-- 4) finalize: never clobber the real line on an EMPTY draw (transition safety —
--    while few drivers have the app, a 0-entrant 7:15 draw must leave the hand-
--    posted UG line untouched).
create or replace function public.loadq_raffle_finalize(p_round uuid)
returns jsonb language plpgsql security definer set search_path to public as $$
declare r public.loadq_raffle_round; n int := 0; e record; test boolean; cnt int;
begin
  select * into r from public.loadq_raffle_round where id = p_round for update;
  if not found then return jsonb_build_object('error','no_round'); end if;
  if r.status = 'drawn' then return jsonb_build_object('ok',true,'already',true); end if;
  test := coalesce((select test_mode from public.loadq_raffle_config where zone_id = r.zone_id), false);
  select count(*) into cnt from public.loadq_raffle_entry where round_id = r.id;
  update public.loadq_raffle_round set status = 'locked' where id = r.id;

  if cnt = 0 then
    -- no one raffled: close the round, touch nothing
    update public.loadq_raffle_round set status='drawn', drawn_at=now(), entrant_count=0 where id=r.id;
    return jsonb_build_object('ok',true,'entrants',0,'skipped_empty',true);
  end if;

  if not test then
    delete from public.queue_entries where zone_id = r.zone_id and status <> 'ended';
    delete from public.queue_entries where status <> 'ended'
      and driver_id in (select driver_id from public.loadq_raffle_entry where round_id = r.id);
  end if;

  for e in select * from public.loadq_raffle_entry where round_id = r.id
             order by raffle_key asc, driver_id asc loop
    n := n + 1;
    if not test then
      insert into public.queue_entries(zone_id, driver_id, vehicle_id, position, status,
            destination_region, seats_boarded, seats_locked, seat_states, joined_at)
      values (r.zone_id, e.driver_id, e.vehicle_id, n, 'waiting', r.destination_region,
              0, 0, '[]'::jsonb, now());
    end if;
    update public.loadq_raffle_entry set assigned_number = n, status = 'drawn' where id = e.id;
  end loop;

  update public.loadq_raffle_round set status='drawn', drawn_at=now(), entrant_count=n where id=r.id;
  if n > 0 and not test then perform public.loadq_sync_loader(r.zone_id, r.destination_region); end if;
  return jsonb_build_object('ok',true,'entrants',n,'dry_run',test);
end; $$;

select 'loadq raffle launched (open to all; admins test anytime; empty-draw safe)' as status,
       (select enabled||'/'||(not test_mode)::text from public.loadq_raffle_config where zone_id='ottawa-universal-grocery') as enabled_live;
