-- ============================================================================
-- LoadQ: let the sheet handle a driver who is not in the database yet
-- 2026-09-01
--
-- A new name turns up on the paper list every few days — GUY, ISSOU BIJIMINMA,
-- MOHAMED FOAD, Stéphane, Prince, Roby. Today that means messaging Thomas, who
-- messages an assistant, who creates the driver by hand. The sheet should just
-- do it.
--
-- Two things had to be fixed first, both found by impersonating Dieudonné and
-- actually calling the functions:
--
-- 1. `queue_entries_require_eligible` lets ADMINS through but nobody else, so a
--    LIST WRITER could not queue any unverified driver — and 30 of 160 drivers
--    are unverified, including every temp account. A brand-new driver is never
--    verified, so the new-person case was impossible by construction. List
--    writers now pass the same way admins do.
--
-- 2. When it did block, it surfaced a raw Postgres exception. On a tablet in a
--    parking lot that is useless. loadq_list_add now catches it and returns a
--    readable error like every other failure.
--
-- What this deliberately does NOT do: it does not create an auth login, and it
-- does not mark the driver verified. They can be queued and driven with — which
-- is what actually happens today — but they still have to sign up properly to
-- use the app. Thomas calls these "none registered drivers"; this just stops the
-- paperwork blocking the morning.
-- ============================================================================
set check_function_bodies = off;

create or replace function public.queue_entries_require_eligible()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare d public.drivers;
begin
  if auth.uid() is null then return new; end if;
  if exists (select 1 from public.drivers a where a.id = auth.uid() and a.is_admin) then return new; end if;
  -- A list writer is trusted to build the line, exactly as an admin is. Without
  -- this they cannot queue an unverified driver, which is most new drivers.
  if exists (select 1 from public.loadq_list_writer w where w.driver_id = auth.uid()) then return new; end if;
  select * into d from public.drivers where id = new.driver_id;
  if d.id is null then raise exception 'driver profile required to join the queue'; end if;
  if d.blocked then raise exception 'account is blocked'; end if;
  if not coalesce(d.verified, false) then raise exception 'account must be verified to join the queue'; end if;
  return new;
end $function$;

-- Turn any remaining trigger exception into a readable result instead of a 500.
create or replace function public.loadq_list_add(
  p_zone text, p_dest text, p_driver uuid, p_vehicle uuid default null, p_pos int default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_vehicle uuid; v_pos int; v_id uuid;
begin
  if not public.loadq_can_write_list(p_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;

  if exists (select 1 from public.queue_entries where driver_id = p_driver and status <> 'ended') then
    return jsonb_build_object('ok',false,'error','already_queued',
      'zone', (select zone_id from public.queue_entries where driver_id=p_driver and status<>'ended' limit 1));
  end if;

  v_vehicle := coalesce(
    p_vehicle,
    (select dv.vehicle_id from public.loadq_driver_default_vehicle dv where dv.driver_id = p_driver),
    (select v.id from public.vehicles v where v.driver_id = p_driver and v.is_active order by v.created_at limit 1));
  if v_vehicle is null then return jsonb_build_object('ok',false,'error','no_active_vehicle'); end if;

  v_pos := coalesce(p_pos, (select coalesce(max(position),0)+1 from public.queue_entries
                             where zone_id = p_zone and destination_region = p_dest and status <> 'ended'));
  if exists (select 1 from public.queue_entries where zone_id=p_zone and destination_region=p_dest
               and position=v_pos and status in ('waiting','loading','standby')) then
    return jsonb_build_object('ok',false,'error','position_taken','position',v_pos);
  end if;

  begin
    insert into public.queue_entries (zone_id, driver_id, vehicle_id, position, status,
                                      destination_region, seats_boarded, seats_locked, seat_states,
                                      joined_at, added_by)
    values (p_zone, p_driver, v_vehicle, v_pos, 'waiting', p_dest, 0, 0, '[]'::jsonb, now(), auth.uid())
    returning id into v_id;
  exception when others then
    return jsonb_build_object('ok',false,'error','rejected','detail',SQLERRM);
  end;

  perform public.loadq_sync_loader(p_zone, p_dest);
  return jsonb_build_object('ok',true,'entry_id',v_id,'position',v_pos);
end $function$;

-- Create a driver + car from the sheet and put them on the line in one call.
-- `p_alias` is what the writer actually typed, recorded so the same shorthand
-- resolves next time without anyone teaching it.
create or replace function public.loadq_list_new_driver(
  p_zone text, p_dest text,
  p_name text, p_phone text default null,
  p_make text default null, p_model text default null,
  p_color text default null, p_seats int default null,
  p_plate text default null, p_type text default 'suv',
  p_pos int default null, p_alias text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_driver uuid; v_veh uuid; v_name text := nullif(trim(coalesce(p_name,'')),'');
        v_plate text; v_add jsonb; v_existing uuid;
begin
  if not public.loadq_can_write_list(p_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;
  if v_name is null then return jsonb_build_object('ok',false,'error','name_required'); end if;
  if coalesce(p_seats,0) < 1 then return jsonb_build_object('ok',false,'error','seats_required'); end if;
  if coalesce(p_type,'suv') not in ('suv','sedan','minibus','van','bush_taxi') then
    return jsonb_build_object('ok',false,'error','bad_vehicle_type'); end if;

  -- Guard against creating a duplicate of someone who is already here under a
  -- name the writer did not recognise. Refuse and point at them instead.
  select id into v_existing from public.drivers
   where public.loadq_fold(full_name) = public.loadq_fold(v_name) limit 1;
  if v_existing is not null then
    return jsonb_build_object('ok',false,'error','driver_exists','driver_id',v_existing,
      'name', (select full_name from public.drivers where id = v_existing));
  end if;

  insert into public.drivers (full_name, phone, verified, blocked)
  values (v_name, nullif(regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g'),''), false, false)
  returning id into v_driver;

  -- Placeholder plate when they have not given one, following RAVIS-TEMP etc.
  v_plate := coalesce(nullif(trim(coalesce(p_plate,'')),''),
                      upper(regexp_replace(split_part(v_name,' ',1),'[^A-Za-z]','','g')) || '-TEMP');
  insert into public.vehicles (driver_id, type, make, model, plate, color, seats, is_active)
  values (v_driver, coalesce(p_type,'suv'),
          upper(coalesce(nullif(trim(coalesce(p_make,'')),''),'Unknown')),
          coalesce(nullif(trim(coalesce(p_model,'')),''),'(temp)'),
          v_plate, nullif(trim(coalesce(p_color,'')),''), p_seats, true)
  returning id into v_veh;

  if nullif(trim(coalesce(p_alias,'')),'') is not null then
    perform public.loadq_alias_add(p_alias, v_driver, 'learned from the sheet');
  end if;

  v_add := public.loadq_list_add(p_zone, p_dest, v_driver, v_veh, p_pos);
  return jsonb_build_object('ok', coalesce((v_add->>'ok')::boolean,false),
    'driver_id', v_driver, 'vehicle_id', v_veh, 'plate', v_plate,
    'placeholder_plate', nullif(trim(coalesce(p_plate,'')),'') is null,
    'position', v_add->'position', 'error', v_add->>'error');
end $function$;

revoke all on function public.loadq_list_new_driver(text,text,text,text,text,text,text,int,text,text,int,text) from public, anon;
grant execute on function public.loadq_list_new_driver(text,text,text,text,text,text,text,int,text,text,int,text)
  to authenticated, service_role;
