-- ============================================================================
-- LoadQ: pause a driver on the sheet — 2026-09-02
--
-- Thomas: a driver on a break or called away should be pausable, with a counter,
-- and "only pause on the list and it is the admin of the tablet that pauses" —
-- so this is writer-gated only. Drivers cannot pause themselves, which also
-- removes any need for an abuse cap.
--
-- Why this is worth building: 168 queue entries have ended in `timeout_2h`
-- against 704 real departures — roughly one in five dies on the clock. Some of
-- those are people who stepped away for a legitimate reason and lost their slot.
--
-- Design: a NEW status 'paused', not a flag on 'waiting'.
--   * `loadq_sync_loader` already picks the front from ('loading','waiting',
--     'standby'), so a paused car is skipped with no change to that function.
--   * The watchdog's expiry and end-of-day sweeps also filter on those statuses,
--     so the 2-hour timeout stops applying to a paused driver for free. That is
--     exactly the "suspend the clock" behaviour asked for.
--   * BUT the unique position index has the same predicate, so a bare new status
--     would UNRESERVE the number and let someone else take it. The index is
--     therefore widened to include 'paused' — that is the whole point: you keep
--     your place.
--
-- NOTE ON RESUMING. A paused driver keeps their number, so if the line moves
-- past them they will be the lowest active position on resume and will load
-- next, ahead of people who waited. That is the literal meaning of "you keep
-- your place", and the pause is authorised by the writer — but it IS a queue
-- jump from the point of view of #4..#8. Flagged to Thomas; change here if he
-- wants resume-to-back or resume-behind-the-loader instead.
-- ============================================================================
set check_function_bodies = off;

alter table public.queue_entries drop constraint if exists queue_entries_status_check;
alter table public.queue_entries add constraint queue_entries_status_check
  check (status = any (array['waiting','loading','called_back','penalised','ended','standby','paused']));

alter table public.queue_entries add column if not exists paused_at    timestamptz;
alter table public.queue_entries add column if not exists pause_until  timestamptz;
alter table public.queue_entries add column if not exists pause_reason text;
alter table public.queue_entries add column if not exists paused_by    uuid;

-- Keep the number reserved while paused — without this the slot is free and the
-- next person to join takes it, which defeats the feature entirely.
drop index if exists queue_entries_zone_dest_position_uniq;
create unique index queue_entries_zone_dest_position_uniq
  on public.queue_entries (zone_id, coalesce(destination_region, ''::text), "position")
  where (status = any (array['waiting','loading','standby','paused']));

-- Reasons carry their own default duration; the writer can override.
create table if not exists public.loadq_pause_reason (
  code        text primary key,
  label_fr    text not null,
  label_en    text not null,
  minutes     int  not null,
  ends_day    boolean not null default false,
  sort_order  int  not null default 0
);
insert into public.loadq_pause_reason (code, label_fr, label_en, minutes, ends_day, sort_order) values
  ('break',      'Pause courte',        'Short break',       15, false, 1),
  ('fuel',       'Essence',             'Fuel',              20, false, 2),
  ('emergency',  'Urgence',             'Emergency',         60, false, 3),
  ('mechanical', 'Problème mécanique',  'Mechanical issue', 240, true,  4)
on conflict (code) do update
  set label_fr = excluded.label_fr, label_en = excluded.label_en,
      minutes = excluded.minutes, ends_day = excluded.ends_day, sort_order = excluded.sort_order;

create or replace function public.loadq_pause_reasons()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', code, 'label_fr', label_fr, 'label_en', label_en,
    'minutes', minutes, 'ends_day', ends_day) order by sort_order), '[]'::jsonb)
  from public.loadq_pause_reason;
$function$;

-- ------------------------------------------------------------------ pause ---
create or replace function public.loadq_list_pause(
  p_entry uuid, p_reason text default 'break', p_minutes int default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_zone text; v_dest text; v_status text; v_boarded int; v_name text;
        v_mins int; v_ends boolean;
begin
  select qe.zone_id, qe.destination_region, qe.status, coalesce(qe.seats_boarded,0), d.full_name
    into v_zone, v_dest, v_status, v_boarded, v_name
  from public.queue_entries qe join public.drivers d on d.id = qe.driver_id
  where qe.id = p_entry;
  if v_zone is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not public.loadq_can_write_list(v_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;
  if v_status = 'paused' then return jsonb_build_object('ok',false,'error','already_paused'); end if;
  if v_status = 'ended'  then return jsonb_build_object('ok',false,'error','already_departed'); end if;

  -- Refused once anyone is aboard: pausing then would leave passengers sitting
  -- in a stationary car with no explanation.
  if v_boarded > 0 then
    return jsonb_build_object('ok',false,'error','passengers_aboard','seats_boarded',v_boarded);
  end if;

  select minutes, ends_day into v_mins, v_ends from public.loadq_pause_reason where code = p_reason;
  if v_mins is null then return jsonb_build_object('ok',false,'error','unknown_reason'); end if;
  v_mins := greatest(1, coalesce(p_minutes, v_mins));

  update public.queue_entries
     set status = 'paused', paused_at = now(), pause_until = now() + make_interval(mins => v_mins),
         pause_reason = p_reason, paused_by = auth.uid(),
         load_start_at = null, load_deadline = null     -- if they were the loader, stop the clock
   where id = p_entry;

  -- The front car may have just become free; promote whoever is now lowest.
  perform public.loadq_sync_loader(v_zone, v_dest);

  return jsonb_build_object('ok',true,'driver',v_name,'reason',p_reason,
    'minutes',v_mins,'ends_day',coalesce(v_ends,false),
    'pause_until',(select pause_until from public.queue_entries where id = p_entry),
    'was_loading', v_status = 'loading');
end $function$;

-- ----------------------------------------------------------------- resume ---
create or replace function public.loadq_list_resume(p_entry uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_zone text; v_dest text; v_pos int; v_name text; v_paused timestamptz; v_front int;
begin
  select qe.zone_id, qe.destination_region, qe.position, qe.paused_at, d.full_name
    into v_zone, v_dest, v_pos, v_paused, v_name
  from public.queue_entries qe join public.drivers d on d.id = qe.driver_id
  where qe.id = p_entry and qe.status = 'paused';
  if v_zone is null then return jsonb_build_object('ok',false,'error','not_paused'); end if;
  if not public.loadq_can_write_list(v_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;

  select min(position) into v_front from public.queue_entries
   where zone_id = v_zone and coalesce(destination_region,'') = coalesce(v_dest,'')
     and status in ('waiting','loading','standby');

  update public.queue_entries
     set status = 'waiting', paused_at = null, pause_until = null,
         pause_reason = null, paused_by = null
   where id = p_entry;

  perform public.loadq_sync_loader(v_zone, v_dest);

  return jsonb_build_object('ok',true,'driver',v_name,'position',v_pos,
    'paused_minutes', round(extract(epoch from (now() - v_paused))/60),
    -- true when the line moved past them: they will now load next, ahead of
    -- drivers who waited. Surfaced so the sheet can say so out loud.
    'jumped_ahead', v_front is not null and v_pos < v_front);
end $function$;

-- The sheet needs the pause fields to draw the badge and run the counter.
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
        'car', case when v.id is null then null else concat_ws(' ', v.make, v.model) end,
        'placeholder_plate', coalesce(v.plate,'') like '%-TEMP' or coalesce(v.plate,'') = 'HHHHH',
        'seats_boarded', qe.seats_boarded,
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

revoke all on function public.loadq_list_pause(uuid,text,int) from public, anon;
revoke all on function public.loadq_list_resume(uuid) from public, anon;
grant execute on function public.loadq_list_pause(uuid,text,int) to authenticated, service_role;
grant execute on function public.loadq_list_resume(uuid)         to authenticated, service_role;
grant execute on function public.loadq_pause_reasons()           to authenticated, service_role;
