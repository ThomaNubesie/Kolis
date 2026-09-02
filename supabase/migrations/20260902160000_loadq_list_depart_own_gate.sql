-- ============================================================================
-- LoadQ: list writers can actually mark a driver departed — 2026-09-02
--
-- `loadq_list_depart` delegated the real work to `loadq_admin_depart`, which
-- opens with `if not loadq_is_admin() then raise exception 'not authorized'`.
-- SECURITY DEFINER does not change auth.uid(), so for Dieudonné — a list writer
-- but NOT an admin — every departure raised "not authorized".
--
-- Which means the sheet's core action has never worked for the person it was
-- built for. Found by running it as him rather than as an admin; applying the
-- migration proved nothing.
--
-- The work is inlined here under the WRITER gate instead. `loadq_admin_depart`
-- is left exactly as it is for the admin surfaces that already call it.
-- ============================================================================
set check_function_bodies = off;

create or replace function public.loadq_list_depart(p_entry uuid, p_seats int default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare r public.queue_entries; v_name text; v_seats int; v_next jsonb;
begin
  select * into r from public.queue_entries where id = p_entry;
  if r.id is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not public.loadq_can_write_list(r.zone_id) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;
  if r.status = 'ended' then return jsonb_build_object('ok',false,'error','already_departed'); end if;

  select full_name into v_name from public.drivers where id = r.driver_id;
  v_seats := coalesce(p_seats, r.seats_boarded, 0);

  insert into public.loading_history
    (driver_id, zone_id, destination_region, vehicle_id, load_start_at, ended_at, end_reason, seats_filled)
  values (r.driver_id, r.zone_id, r.destination_region, r.vehicle_id, r.load_start_at, now(), 'departed', v_seats);

  update public.queue_entries
     set status = 'ended', end_reason = 'departed', seats_boarded = v_seats
   where id = p_entry;

  update public.trips set status = 'departed'
   where queue_entry_id = p_entry and status in ('held','boarded');

  -- force: a person has said the car is gone, so a manual line may advance.
  perform public.loadq_sync_loader(r.zone_id, r.destination_region, true);

  select jsonb_build_object('position', qe.position, 'name', d.full_name) into v_next
  from public.queue_entries qe join public.drivers d on d.id = qe.driver_id
  where qe.zone_id = r.zone_id
    and coalesce(qe.destination_region,'') = coalesce(r.destination_region,'')
    and qe.status = 'loading' limit 1;

  return jsonb_build_object('ok',true,'driver',v_name,'seats',v_seats,'now_loading',v_next,
    'undo', jsonb_build_object('zone',r.zone_id,'dest',r.destination_region,'position',r.position,
      'driver_id',r.driver_id,'vehicle_id',r.vehicle_id,'was_status',r.status,'seats',v_seats));
end $function$;

grant execute on function public.loadq_list_depart(uuid,int) to authenticated, service_role;
