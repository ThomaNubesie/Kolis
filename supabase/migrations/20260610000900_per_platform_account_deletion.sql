-- Per-platform deletion: deleting one app's account leaves the other intact.
-- The shared auth login is removed ONLY when no other platform still uses it.
-- Supersedes the all-platforms behaviour in 20260610000800.

-- LoadQ account deletion (scoped to LoadQ data). Keeps the login if a Kolis
-- profile still exists.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path to 'public'
as $function$
  declare v_uid uuid := auth.uid();
          has_kolis boolean;
  begin
    if v_uid is null then raise exception 'not authenticated'; end if;
    delete from public.queue_entries   where driver_id    = v_uid;
    delete from public.loading_history where driver_id    = v_uid;
    delete from public.trips           where passenger_id = v_uid or driver_id = v_uid;
    delete from public.messages        where sender_id    = v_uid or recipient_id = v_uid;
    delete from public.user_reports    where reporter_id  = v_uid or reported_id = v_uid;
    delete from public.user_blocks     where blocker_id   = v_uid or blocked_id = v_uid;
    delete from public.vehicles        where driver_id    = v_uid;
    delete from public.drivers         where id           = v_uid;
    delete from public.passengers      where id           = v_uid;
    select exists(select 1 from public.kolis_profiles where id = v_uid) into has_kolis;
    if not has_kolis then
      delete from auth.users where id = v_uid;   -- no other platform → remove login
    end if;
  end;
$function$;

-- Kolis account deletion (scoped to Kolis data). Keeps the login if a LoadQ
-- driver/passenger record still exists (e.g. a courier who also drives LoadQ).
create or replace function public.delete_kolis_account()
returns void
language plpgsql security definer set search_path to 'public'
as $function$
  declare v_uid uuid := auth.uid();
          has_loadq boolean;
  begin
    if v_uid is null then raise exception 'not authenticated'; end if;
    delete from public.kolis_parcels       where sender_id = v_uid or driver_id = v_uid;
    delete from public.kolis_driver_payout where driver_id = v_uid;
    delete from public.kolis_profiles      where id        = v_uid;
    select exists(select 1 from public.drivers where id = v_uid)
        or exists(select 1 from public.passengers where id = v_uid) into has_loadq;
    if not has_loadq then
      delete from auth.users where id = v_uid;   -- no LoadQ presence → remove login
    end if;
  end;
$function$;
grant execute on function public.delete_kolis_account() to authenticated;
revoke execute on function public.delete_kolis_account() from public, anon;
