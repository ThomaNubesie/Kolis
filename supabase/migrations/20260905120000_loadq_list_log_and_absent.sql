-- ============================================================================
-- LoadQ: a record of every hand-made change, and marking a driver absent
--                                                                  2026-09-05
--
-- Thomas: "when people switch places there should be a record. if someone has
-- to load and they are not present they can be marked absent and they are
-- removed from the list to be reinserted when they come back by admin."
--
-- Both of these are the kind of thing drivers argue about at the lot — a lost
-- place, a number that moved, a car that was skipped. Until now the sheet kept
-- no history at all: a swap rewrote two numbers and left nothing behind, so the
-- only account of what happened was whoever was standing there. `loadq_list_log`
-- is the answer to "who moved me, and when".
--
-- ABSENT, in full. The driver is removed from the line entirely — no number
-- held, nobody blocked behind them — and if they were the loader, the next car
-- is promoted immediately, because the whole point is that the line cannot wait
-- for someone who is not here. Their old position is kept in the log, so when
-- they come back an admin can put them back exactly where they were if that is
-- the fair answer, or at the back if it is not.
--
-- Marking absent is a WRITER action: it has to be, or the line stops every time
-- Thomas is unreachable. Reinserting is ADMIN (or the twice-daily code), because
-- putting someone back into a numbered queue is the part that takes a place away
-- from everyone behind them.
-- ============================================================================
set check_function_bodies = off;

create table if not exists public.loadq_list_log (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  zone_id      text not null,
  destination  text,
  action       text not null,     -- swap | absent | reinsert | depart
  actor_id     uuid,              -- who did it (auth.uid())
  actor_name   text,              -- denormalised: drivers get renamed, history should not change
  driver_id    uuid,
  driver_name  text,
  other_driver_id uuid,           -- swap: the person on the other side
  other_driver_name text,
  from_pos     int,
  to_pos       int,
  seats        int,               -- depart: how many were aboard
  by_code      boolean not null default false,  -- approved with the admin code rather than by an admin
  note         text
);
comment on table public.loadq_list_log is
  'Append-only record of hand-made changes to a queue line: swaps, absences,
   reinsertions and departures. Written by the loadq_list_* functions. This is
   what settles an argument about who moved whom.';

create index if not exists loadq_list_log_zone_at on public.loadq_list_log (zone_id, at desc);
create index if not exists loadq_list_log_driver  on public.loadq_list_log (driver_id, at desc);

alter table public.loadq_list_log enable row level security;
-- Written only through the SECURITY DEFINER functions below; readable by any
-- writer of that zone through loadq_list_history().
revoke all on public.loadq_list_log from public, anon, authenticated;

-- Small helper so every function records the actor the same way.
create or replace function public.loadq_log(
  p_zone text, p_dest text, p_action text, p_driver uuid, p_other uuid,
  p_from int, p_to int, p_seats int, p_by_code boolean, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  insert into public.loadq_list_log (zone_id, destination, action, actor_id, actor_name,
    driver_id, driver_name, other_driver_id, other_driver_name, from_pos, to_pos, seats, by_code, note)
  values (p_zone, p_dest, p_action, auth.uid(),
    (select d.full_name from public.drivers d where d.id = auth.uid()),
    p_driver, (select d.full_name from public.drivers d where d.id = p_driver),
    p_other,  (select d.full_name from public.drivers d where d.id = p_other),
    p_from, p_to, p_seats, coalesce(p_by_code,false), p_note);
end $function$;

-- ------------------------------------------------------------------ swap ----
-- Unchanged behaviour; now leaves a record of both halves.
create or replace function public.loadq_list_swap(p_a uuid, p_b uuid, p_code text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  a_zone text; a_dest text; a_pos int; a_name text; a_status text; a_boarded int; a_driver uuid;
  b_zone text; b_dest text; b_pos int; b_name text; b_status text; b_boarded int; b_driver uuid;
  v_is_admin boolean; v_chk jsonb;
begin
  if p_a = p_b then return jsonb_build_object('ok',false,'error','same_entry'); end if;

  select qe.zone_id, qe.destination_region, qe.position, d.full_name, qe.status,
         coalesce(qe.seats_boarded,0), d.id
    into a_zone, a_dest, a_pos, a_name, a_status, a_boarded, a_driver
  from public.queue_entries qe join public.drivers d on d.id = qe.driver_id where qe.id = p_a;
  select qe.zone_id, qe.destination_region, qe.position, d.full_name, qe.status,
         coalesce(qe.seats_boarded,0), d.id
    into b_zone, b_dest, b_pos, b_name, b_status, b_boarded, b_driver
  from public.queue_entries qe join public.drivers d on d.id = qe.driver_id where qe.id = p_b;

  if a_zone is null or b_zone is null then
    return jsonb_build_object('ok',false,'error','not_found'); end if;
  if a_zone <> b_zone or coalesce(a_dest,'') <> coalesce(b_dest,'') then
    return jsonb_build_object('ok',false,'error','different_line'); end if;
  if 'ended' in (a_status, b_status) then
    return jsonb_build_object('ok',false,'error','already_departed'); end if;
  if not public.loadq_can_write_list(a_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;
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

  update public.queue_entries set position = -abs(a_pos) - 1000 where id = p_a;
  update public.queue_entries set position = a_pos where id = p_b;
  update public.queue_entries set position = b_pos where id = p_a;

  -- One row per person, so a driver's own history reads correctly from either side.
  perform public.loadq_log(a_zone, a_dest, 'swap', a_driver, b_driver, a_pos, b_pos, null, not v_is_admin, null);
  perform public.loadq_log(a_zone, a_dest, 'swap', b_driver, a_driver, b_pos, a_pos, null, not v_is_admin, null);

  return jsonb_build_object('ok',true,
    'a', jsonb_build_object('driver',a_name,'from',a_pos,'to',b_pos,'status',a_status),
    'b', jsonb_build_object('driver',b_name,'from',b_pos,'to',a_pos,'status',b_status),
    'approved_by_code', not v_is_admin);
end $function$;

-- ---------------------------------------------------------------- absent ----
-- Called when the line reaches someone who is not at the lot.
create or replace function public.loadq_list_absent(p_entry uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_zone text; v_dest text; v_pos int; v_driver uuid; v_name text;
        v_status text; v_boarded int; v_next jsonb;
begin
  select qe.zone_id, qe.destination_region, qe.position, qe.driver_id, d.full_name,
         qe.status, coalesce(qe.seats_boarded,0)
    into v_zone, v_dest, v_pos, v_driver, v_name, v_status, v_boarded
  from public.queue_entries qe join public.drivers d on d.id = qe.driver_id where qe.id = p_entry;
  if v_zone is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_status = 'ended' then return jsonb_build_object('ok',false,'error','already_departed'); end if;
  if not public.loadq_can_write_list(v_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;

  -- Someone is sitting in that car. Whatever is going on, it is not absence.
  if v_boarded > 0 then
    return jsonb_build_object('ok',false,'error','passengers_aboard','seats_boarded',v_boarded);
  end if;

  update public.queue_entries
     set status = 'ended', end_reason = 'absent',
         load_start_at = null, load_deadline = null
   where id = p_entry;

  perform public.loadq_log(v_zone, v_dest, 'absent', v_driver, null, v_pos, null, null, false, p_note);

  -- They were the loader and they are not here: the line moves on now. This is
  -- the one automatic promotion a manual zone still allows, because a person
  -- just made the decision that causes it.
  if v_status = 'loading' then
    perform public.loadq_sync_loader(v_zone, v_dest, true);
  end if;

  select jsonb_build_object('position', qe.position, 'name', d.full_name) into v_next
  from public.queue_entries qe join public.drivers d on d.id = qe.driver_id
  where qe.zone_id = v_zone and coalesce(qe.destination_region,'') = coalesce(v_dest,'')
    and qe.status = 'loading' limit 1;

  return jsonb_build_object('ok',true,'driver',v_name,'was_position',v_pos,
    'was_loading', v_status = 'loading', 'now_loading', v_next);
end $function$;

-- -------------------------------------------------------------- reinsert ----
-- They came back. Admin (or the twice-daily code) decides where they go: their
-- old number if that is fair, the back of the line if it is not.
create or replace function public.loadq_list_reinsert(
  p_driver uuid, p_zone text, p_dest text, p_pos int default null, p_code text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_is_admin boolean; v_chk jsonb; v_name text; v_veh uuid; v_pos int; v_add jsonb; v_was int;
begin
  if not public.loadq_can_write_list(p_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;

  select full_name into v_name from public.drivers where id = p_driver;
  if v_name is null then return jsonb_build_object('ok',false,'error','no_such_driver'); end if;

  if exists (select 1 from public.queue_entries where driver_id = p_driver and status <> 'ended') then
    return jsonb_build_object('ok',false,'error','already_queued'); end if;

  v_is_admin := coalesce((select d.is_admin from public.drivers d where d.id = auth.uid()), false);
  if not v_is_admin then
    v_chk := public.loadq_verify_admin_code(p_code);
    if not coalesce((v_chk->>'ok')::boolean,false) then
      return jsonb_build_object('ok',false,'error',coalesce(v_chk->>'error','bad_code'),
                                'retry_after_minutes', v_chk->'retry_after_minutes');
    end if;
  end if;

  -- the number they held when they were marked absent, for the record
  select from_pos into v_was from public.loadq_list_log
   where driver_id = p_driver and action = 'absent' and zone_id = p_zone
     and coalesce(destination,'') = coalesce(p_dest,'')
   order by at desc limit 1;

  select id into v_veh from public.vehicles
   where driver_id = p_driver and is_active order by created_at limit 1;
  if v_veh is null then return jsonb_build_object('ok',false,'error','no_active_vehicle'); end if;

  v_add := public.loadq_list_add(p_zone, p_dest, p_driver, v_veh, p_pos);
  if not coalesce((v_add->>'ok')::boolean,false) then return v_add; end if;
  v_pos := (v_add->>'position')::int;

  perform public.loadq_log(p_zone, p_dest, 'reinsert', p_driver, null, v_was, v_pos,
                           null, not v_is_admin, null);

  return jsonb_build_object('ok',true,'driver',v_name,'position',v_pos,
    'was_position',v_was,'same_place', v_was is not null and v_was = v_pos,
    'approved_by_code', not v_is_admin);
end $function$;

-- Who was marked absent on this line today, so the sheet can offer them back
-- with one tap instead of the writer having to remember the name.
create or replace function public.loadq_list_absent_today(p_zone text, p_dest text)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select case when not public.loadq_can_write_list(p_zone) then '[]'::jsonb
    else coalesce(jsonb_agg(jsonb_build_object(
      'driver_id', l.driver_id, 'name', l.driver_name, 'was_position', l.from_pos,
      'at', l.at, 'minutes_ago', round(extract(epoch from (now() - l.at))/60)::int,
      'marked_by', l.actor_name, 'note', l.note) order by l.at desc), '[]'::jsonb) end
  from public.loadq_list_log l
  where l.zone_id = p_zone and coalesce(l.destination,'') = coalesce(p_dest,'')
    and l.action = 'absent' and l.at > now() - interval '18 hours'
    -- not if they have already been put back
    and not exists (select 1 from public.queue_entries qe
                     where qe.driver_id = l.driver_id and qe.status <> 'ended');
$function$;

-- The history behind a line, for settling an argument.
create or replace function public.loadq_list_history(p_zone text, p_dest text, p_limit int default 40)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select case when not public.loadq_can_write_list(p_zone) then '[]'::jsonb
    else coalesce(jsonb_agg(jsonb_build_object(
      'at', l.at, 'action', l.action, 'actor', l.actor_name,
      'driver', l.driver_name, 'other', l.other_driver_name,
      'from', l.from_pos, 'to', l.to_pos, 'seats', l.seats,
      'by_code', l.by_code, 'note', l.note) order by l.at desc), '[]'::jsonb) end
  from (select * from public.loadq_list_log
         where zone_id = p_zone and coalesce(destination,'') = coalesce(p_dest,'')
         order by at desc limit greatest(1, least(coalesce(p_limit,40), 200))) l;
$function$;

revoke all on function public.loadq_list_absent(uuid,text)                 from public, anon;
revoke all on function public.loadq_list_reinsert(uuid,text,text,int,text) from public, anon;
grant execute on function public.loadq_list_absent(uuid,text)                 to authenticated, service_role;
grant execute on function public.loadq_list_reinsert(uuid,text,text,int,text) to authenticated, service_role;
grant execute on function public.loadq_list_absent_today(text,text)           to authenticated, service_role;
grant execute on function public.loadq_list_history(text,text,int)            to authenticated, service_role;
