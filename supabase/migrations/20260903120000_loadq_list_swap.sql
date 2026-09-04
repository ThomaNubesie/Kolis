-- ============================================================================
-- LoadQ: switch two drivers around on the sheet — 2026-09-03
--
-- Thomas: "on the digital list the admin should be able to switch drivers
-- around." The ⇄ button already existed, but it was wrong in three ways.
--
-- 1. IT RENUMBERED THE WHOLE LINE. `loadq_admin_move` rebuilds positions as a
--    contiguous 1..N. On a sheet copied from paper that is destructive: this
--    morning's list ran 1,2,3,4,5,6,7,8,9,10,12,13 with #11 deliberately held
--    for a driver we hadn't identified yet. One move would have closed that gap
--    and shifted every number below it away from what the drivers were told.
--    Swapping two entries leaves every other number, and every hole, alone.
--
-- 2. IT COULD NEVER WORK FOR DIEUDONNÉ. `loadq_list_move` verifies the code and
--    then calls `loadq_admin_move`, which begins `if not loadq_is_admin() then
--    raise`. SECURITY DEFINER does not change auth.uid(), so the writer who
--    actually holds the tablet was refused after entering a correct code. Same
--    fault as loadq_list_depart had, found the same way. The work is inlined
--    here under the writer gate instead of borrowing an admin-only helper.
--
-- 3. THERE WAS NO CODE TO ENTER. `loadq_admin_code_current` mints the code
--    lazily, the first time an admin opens the panel — and nobody ever had.
--    `loadq_admin_code` is empty, so every code Dieudonné typed came back
--    'bad_code', identical to a typo, while quietly spending one of the five
--    attempts an hour that lock him out. `loadq_verify_admin_code` now says
--    'no_code_issued' and does NOT count that as a failed attempt, so the
--    tablet can tell him to ask Thomas to open the code rather than implying
--    he got it wrong.
--
-- A swap is refused once anyone is aboard either car. Moving a number is
-- bookkeeping; moving a car with passengers in it is not, and the person who
-- climbed into seat 3 of #4 did not agree to be in #9.
-- ============================================================================
set check_function_bodies = off;

create or replace function public.loadq_verify_admin_code(p_code text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_fails int; v_ok boolean; v_start timestamptz; v_exists boolean;
begin
  select count(*) into v_fails from public.loadq_admin_code_attempt
   where driver_id = auth.uid() and not ok and at > now() - interval '1 hour';
  if v_fails >= 5 then
    return jsonb_build_object('ok',false,'error','too_many_attempts','retry_after_minutes',
      (select ceil(extract(epoch from (min(at) + interval '1 hour' - now()))/60)
         from public.loadq_admin_code_attempt
        where driver_id = auth.uid() and not ok and at > now() - interval '1 hour'));
  end if;

  v_start := public.loadq_code_window_start();
  select exists(select 1 from public.loadq_admin_code where valid_from = v_start) into v_exists;
  -- No code exists for this window yet: that is our failing, not the writer's.
  -- Say so, and do not spend one of their five attempts on it.
  if not v_exists then
    return jsonb_build_object('ok',false,'error','no_code_issued');
  end if;

  select exists(select 1 from public.loadq_admin_code
                 where valid_from = v_start and code = trim(coalesce(p_code,''))) into v_ok;
  insert into public.loadq_admin_code_attempt (driver_id, ok) values (auth.uid(), v_ok);
  return jsonb_build_object('ok', v_ok, 'error', case when v_ok then null else 'bad_code' end);
end $function$;

-- ------------------------------------------------------------------ swap ----
create or replace function public.loadq_list_swap(p_a uuid, p_b uuid, p_code text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  a_zone text; a_dest text; a_pos int; a_name text; a_status text; a_boarded int;
  b_zone text; b_dest text; b_pos int; b_name text; b_status text; b_boarded int;
  v_is_admin boolean; v_chk jsonb;
begin
  if p_a = p_b then return jsonb_build_object('ok',false,'error','same_entry'); end if;

  select qe.zone_id, qe.destination_region, qe.position, d.full_name, qe.status,
         coalesce(qe.seats_boarded,0)
    into a_zone, a_dest, a_pos, a_name, a_status, a_boarded
  from public.queue_entries qe join public.drivers d on d.id = qe.driver_id where qe.id = p_a;
  select qe.zone_id, qe.destination_region, qe.position, d.full_name, qe.status,
         coalesce(qe.seats_boarded,0)
    into b_zone, b_dest, b_pos, b_name, b_status, b_boarded
  from public.queue_entries qe join public.drivers d on d.id = qe.driver_id where qe.id = p_b;

  if a_zone is null or b_zone is null then
    return jsonb_build_object('ok',false,'error','not_found'); end if;
  if a_zone <> b_zone or coalesce(a_dest,'') <> coalesce(b_dest,'') then
    return jsonb_build_object('ok',false,'error','different_line'); end if;
  if 'ended' in (a_status, b_status) then
    return jsonb_build_object('ok',false,'error','already_departed'); end if;

  if not public.loadq_can_write_list(a_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;

  -- Passengers are already sitting in one of these cars: their number is not
  -- ours to trade any more.
  if a_boarded > 0 or b_boarded > 0 then
    return jsonb_build_object('ok',false,'error','passengers_aboard',
      'driver', case when a_boarded > 0 then a_name else b_name end,
      'seats_boarded', greatest(a_boarded, b_boarded));
  end if;

  v_is_admin := coalesce((select d.is_admin from public.drivers d where d.id = auth.uid()), false);
  if not v_is_admin then
    v_chk := public.loadq_verify_admin_code(p_code);
    if not coalesce((v_chk->>'ok')::boolean,false) then
      return jsonb_build_object('ok',false,'error',coalesce(v_chk->>'error','bad_code'),
                                'retry_after_minutes', v_chk->'retry_after_minutes');
    end if;
  end if;

  -- (zone, dest, position) is unique among active rows, so park one of them on
  -- a negative number for the length of the statement rather than colliding.
  update public.queue_entries set position = -abs(a_pos) - 1000 where id = p_a;
  update public.queue_entries set position = a_pos where id = p_b;
  update public.queue_entries set position = b_pos where id = p_a;

  -- Deliberately NOT calling loadq_sync_loader: at a manual-promotion zone the
  -- line only advances when a person marks a departure, and a swap is not one.
  -- Whoever was loading keeps loading, under their new number.
  return jsonb_build_object('ok',true,
    'a', jsonb_build_object('driver',a_name,'from',a_pos,'to',b_pos,'status',a_status),
    'b', jsonb_build_object('driver',b_name,'from',b_pos,'to',a_pos,'status',b_status),
    'approved_by_code', not v_is_admin);
end $function$;

revoke all on function public.loadq_list_swap(uuid,uuid,text) from public, anon;
grant execute on function public.loadq_list_swap(uuid,uuid,text) to authenticated, service_role;
