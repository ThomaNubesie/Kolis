-- ============================================================================
-- LoadQ: who may write the daily sheet, and who wrote each row — 2026-09-01
--
-- Phase 0b of the tablet sign-in sheet. Thomas: "the list writer is assigned
-- each morning" → "dieudonne or me". So the pool is TWO trusted people, not a
-- rotation among 130 drivers.
--
-- That makes a dated per-day assignment pure ceremony: a standing allowlist is
-- simpler and has the same safety, because whoever of the two is on site writes.
-- If the pool ever widens beyond people who are all trusted, revisit — that is
-- when a dated assignment and hand-off actually start earning their complexity.
--
-- Deliberately NOT done by making Dieudonné `drivers.is_admin`: that would hand
-- him the whole admin surface (payouts, document review, pricing) to let him
-- type names into a queue. This grants exactly the sheet.
-- ============================================================================
set check_function_bodies = off;

create table if not exists public.loadq_list_writer (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid not null references public.drivers(id) on delete cascade,
  zone_id     text references public.zones(id) on delete cascade,       -- null = every zone; zones PK is `id`, not `zone_id`
  note        text,
  created_at  timestamptz not null default now()
);
-- A primary key cannot hold an expression, so uniqueness ("one row per driver per
-- zone, treating null as all-zones") is enforced by an index instead.
create unique index if not exists loadq_list_writer_uq
  on public.loadq_list_writer (driver_id, coalesce(zone_id, ''));

-- Attribution: nothing currently records who put a driver in the queue. Without
-- it a wrong number is untraceable.
alter table public.queue_entries add column if not exists added_by uuid references public.drivers(id);
create index if not exists queue_entries_added_by on public.queue_entries (added_by) where added_by is not null;

insert into public.loadq_list_writer (driver_id, zone_id, note)
select d.id, null, 'standing list writer (Thomas 2026-09-01)'
from public.drivers d
where public.loadq_fold(d.full_name) in (public.loadq_fold('Thomas Shalo'), public.loadq_fold('Dieudonné Yoba'))
on conflict (driver_id, coalesce(zone_id, '')) do nothing;

-- May the caller write the sheet for this zone? Admins always can.
create or replace function public.loadq_can_write_list(p_zone text default null)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select coalesce((select d.is_admin from public.drivers d where d.id = auth.uid()), false)
      or exists (select 1 from public.loadq_list_writer w
                  where w.driver_id = auth.uid()
                    and (w.zone_id is null or w.zone_id = p_zone));
$function$;

-- What the tablet asks on load: am I allowed to write, and who am I?
create or replace function public.loadq_list_writer_me()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select jsonb_build_object(
    'driver_id', auth.uid(),
    'name', (select d.full_name from public.drivers d where d.id = auth.uid()),
    'is_admin', coalesce((select d.is_admin from public.drivers d where d.id = auth.uid()), false),
    'can_write', public.loadq_can_write_list(null),
    'writers', coalesce((select jsonb_agg(jsonb_build_object('driver_id', w.driver_id, 'name', d.full_name)
                          order by d.full_name)
                         from public.loadq_list_writer w join public.drivers d on d.id = w.driver_id), '[]'::jsonb)
  );
$function$;

-- Add a driver to the sheet. Gated on the allowlist, stamps `added_by`, refuses
-- a position that is already taken and a driver already queued anywhere — the
-- one-active-entry-per-driver rule is enforced in the DB and a clear error here
-- beats a constraint violation surfacing on a tablet in a parking lot.
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

  insert into public.queue_entries (zone_id, driver_id, vehicle_id, position, status,
                                    destination_region, seats_boarded, seats_locked, seat_states,
                                    joined_at, added_by)
  values (p_zone, p_driver, v_vehicle, v_pos, 'waiting', p_dest, 0, 0, '[]'::jsonb, now(), auth.uid())
  returning id into v_id;

  perform public.loadq_sync_loader(p_zone, p_dest);
  return jsonb_build_object('ok',true,'entry_id',v_id,'position',v_pos);
end $function$;

-- Cross a name out = depart. Same gate. Returns enough to offer an undo.
create or replace function public.loadq_list_depart(p_entry uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_zone text; v_dest text; v_pos int; v_driver uuid; v_vehicle uuid; v_status text;
begin
  select zone_id, destination_region, position, driver_id, vehicle_id, status
    into v_zone, v_dest, v_pos, v_driver, v_vehicle, v_status
  from public.queue_entries where id = p_entry;
  if v_zone is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not public.loadq_can_write_list(v_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;

  perform public.loadq_admin_depart(p_entry);
  -- everything needed to put them back if the swipe was a mistake
  return jsonb_build_object('ok',true,'undo', jsonb_build_object(
    'zone', v_zone, 'dest', v_dest, 'position', v_pos,
    'driver_id', v_driver, 'vehicle_id', v_vehicle, 'was_status', v_status));
end $function$;

alter table public.loadq_list_writer enable row level security;
revoke all on function public.loadq_list_add(text,text,uuid,uuid,int) from public, anon;
revoke all on function public.loadq_list_depart(uuid) from public, anon;
grant execute on function public.loadq_can_write_list(text)  to authenticated, service_role;
grant execute on function public.loadq_list_writer_me()      to authenticated, service_role;
grant execute on function public.loadq_list_add(text,text,uuid,uuid,int) to authenticated, service_role;
grant execute on function public.loadq_list_depart(uuid)     to authenticated, service_role;
