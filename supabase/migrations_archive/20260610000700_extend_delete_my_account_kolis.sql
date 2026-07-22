-- Account deletion must also clear the shared Kolis data (parcels, payout email,
-- profile). Safe for CX/LoadQ callers too: a non-Kolis user simply has no rows.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path to 'public'
as $function$
  declare v_uid uuid := auth.uid();
  begin
    if v_uid is null then raise exception 'not authenticated'; end if;
    -- LoadQ / ConcordXpress
    delete from public.queue_entries   where driver_id    = v_uid;
    delete from public.loading_history where driver_id    = v_uid;
    delete from public.trips           where passenger_id = v_uid or driver_id = v_uid;
    delete from public.messages        where sender_id    = v_uid or recipient_id = v_uid;
    delete from public.user_reports    where reporter_id  = v_uid or reported_id = v_uid;
    delete from public.user_blocks     where blocker_id   = v_uid or blocked_id = v_uid;
    delete from public.vehicles        where driver_id    = v_uid;
    -- Kolis (shared project)
    delete from public.kolis_parcels       where sender_id = v_uid or driver_id = v_uid;
    delete from public.kolis_driver_payout where driver_id = v_uid;
    delete from public.kolis_profiles      where id        = v_uid;
    -- Identity rows last
    delete from public.drivers         where id           = v_uid;
    delete from public.passengers      where id           = v_uid;
  end;
$function$;
