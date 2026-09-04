-- Meetings and bookings: every read and write.
--
-- All of these go through cf_is_member_deep, which already refuses a SUSPENDED member,
-- so suspension applies here for free: a suspended member is neither called to a
-- meeting, nor able to see one exists, nor able to book an officer.

create or replace function public.cf_meetings(p_form uuid, p_past boolean default false)
returns jsonb language sql stable security definer set search_path = public as $function$
  select case when not public.cf_is_member_deep(p_form) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'title', m.title, 'description', m.description,
      'starts_at', m.starts_at, 'duration_min', m.duration_min,
      'ends_at', m.starts_at + make_interval(mins => m.duration_min),
      'status', m.status,
      -- The room token is the access control, so it is only ever handed to a member,
      -- and only while the meeting stands.
      'room', case when m.status = 'scheduled' then m.room else null end,
      'live', (now() >= m.starts_at - interval '5 minutes'
               and now() <  m.starts_at + make_interval(mins => m.duration_min)
               and m.status = 'scheduled'),
      'called_by', coalesce((select pr.name from public.cf_profiles pr where pr.user_id = m.created_by),
                            (select mem.name from public.cf_members mem
                              where mem.form_id = m.form_id and mem.user_id = m.created_by limit 1)),
      'yes',   (select count(*) from public.cf_meeting_rsvps r where r.meeting_id = m.id and r.response = 'yes'),
      'no',    (select count(*) from public.cf_meeting_rsvps r where r.meeting_id = m.id and r.response = 'no'),
      'maybe', (select count(*) from public.cf_meeting_rsvps r where r.meeting_id = m.id and r.response = 'maybe'),
      'called', (select count(*) from public.cf_members mm
                  where mm.form_id = m.form_id and mm.status = 'active'
                    and coalesce(mm.suspended,false) = false),
      'my_rsvp', (select r.response from public.cf_meeting_rsvps r
                   where r.meeting_id = m.id and r.user_id = auth.uid()),
      'mine', m.created_by = auth.uid()
    ) order by m.starts_at desc)
    from public.cf_meetings m
   where m.form_id = p_form
     and case when p_past
              then m.starts_at + make_interval(mins => m.duration_min) <  now()
              else m.starts_at + make_interval(mins => m.duration_min) >= now() end
  ), '[]'::jsonb) end;
$function$;

create or replace function public.cf_meeting_create(
  p_form uuid, p_title text, p_starts_at timestamptz,
  p_duration_min integer default 60, p_description text default null
) returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_id uuid;
begin
  if not public.cf_is_admin_deep(p_form) then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;
  if nullif(trim(coalesce(p_title,'')),'') is null then
    return jsonb_build_object('ok', false, 'error', 'title_required');
  end if;
  if p_starts_at is null then
    return jsonb_build_object('ok', false, 'error', 'time_required');
  end if;

  insert into public.cf_meetings(form_id, title, description, starts_at, duration_min, created_by)
    values (p_form, trim(p_title), nullif(trim(coalesce(p_description,'')),''),
            p_starts_at, greatest(5, least(600, coalesce(p_duration_min, 60))), auth.uid())
    returning id into v_id;

  -- Whoever calls the meeting is attending it.
  insert into public.cf_meeting_rsvps(meeting_id, user_id, response)
    values (v_id, auth.uid(), 'yes') on conflict do nothing;

  return jsonb_build_object('ok', true, 'meeting_id', v_id);
end $function$;

create or replace function public.cf_meeting_rsvp(p_meeting uuid, p_response text)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_form uuid;
begin
  select form_id into v_form from public.cf_meetings where id = p_meeting;
  if v_form is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.cf_is_member_deep(v_form) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  if p_response not in ('yes','no','maybe') then
    return jsonb_build_object('ok', false, 'error', 'bad_response');
  end if;
  insert into public.cf_meeting_rsvps(meeting_id, user_id, response, at)
    values (p_meeting, auth.uid(), p_response, now())
    on conflict (meeting_id, user_id) do update set response = excluded.response, at = now();
  return jsonb_build_object('ok', true, 'response', p_response);
end $function$;

create or replace function public.cf_meeting_cancel(p_meeting uuid)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_form uuid;
begin
  select form_id into v_form from public.cf_meetings where id = p_meeting;
  if v_form is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.cf_is_admin_deep(v_form) then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;
  update public.cf_meetings set status = 'cancelled' where id = p_meeting;
  return jsonb_build_object('ok', true);
end $function$;

-- Reached from the room page: proves this caller may enter, and returns the token.
create or replace function public.cf_meeting_room(p_meeting uuid)
returns jsonb language sql stable security definer set search_path = public as $function$
  select case when m.id is null then jsonb_build_object('error','not_found')
              when not public.cf_is_member_deep(m.form_id) then jsonb_build_object('error','not_member')
              when m.status <> 'scheduled' then jsonb_build_object('error','cancelled')
         else jsonb_build_object(
              'ok', true, 'title', m.title, 'room', m.room,
              'starts_at', m.starts_at, 'duration_min', m.duration_min,
              'where', (select f.name from public.cf_forms f where f.id = m.form_id),
              'me', coalesce((select pr.name from public.cf_profiles pr where pr.user_id = auth.uid()), 'Member'))
         end
    from (select * from public.cf_meetings where id = p_meeting) m
   right join (select 1) _ on true;
$function$;

-- ===== Bookings =====

create or replace function public.cf_officers(p_org uuid)
returns jsonb language sql stable security definer set search_path = public as $function$
  select case when not public.cf_is_member_deep(p_org) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', m.user_id, 'name', coalesce(m.name, m.email),
      'title', m.title, 'color', m.color,
      'bookable', exists(select 1 from public.cf_availability a
                          where a.org_id = p_org and a.user_id = m.user_id and a.active)
    ) order by (m.title is null), lower(coalesce(m.name, m.email)))
    from public.cf_members m
   where m.form_id = p_org and m.status = 'active'
     and coalesce(m.suspended,false) = false
     and m.user_id is not null
  ), '[]'::jsonb) end;
$function$;

create or replace function public.cf_availability_get(p_org uuid, p_user uuid default null)
returns jsonb language sql stable security definer set search_path = public as $function$
  select case when not public.cf_is_member_deep(p_org) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'weekday', a.weekday, 'start_min', a.start_min,
      'end_min', a.end_min, 'slot_min', a.slot_min, 'tz', a.tz)
      order by a.weekday, a.start_min)
    from public.cf_availability a
   where a.org_id = p_org and a.active
     and a.user_id = coalesce(p_user, auth.uid())
  ), '[]'::jsonb) end;
$function$;

-- Replace the caller's whole week in one call: simpler to reason about than diffing
-- rows, and a half-applied timetable is worse than none.
create or replace function public.cf_availability_set(p_org uuid, p_rules jsonb, p_tz text default 'America/Toronto')
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_n int := 0;
begin
  if not public.cf_is_member_deep(p_org) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  delete from public.cf_availability where org_id = p_org and user_id = auth.uid();
  insert into public.cf_availability(org_id, user_id, weekday, start_min, end_min, slot_min, tz)
  select p_org, auth.uid(),
         (r->>'weekday')::int, (r->>'start_min')::int, (r->>'end_min')::int,
         coalesce((r->>'slot_min')::int, 30), coalesce(p_tz, 'America/Toronto')
    from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb)) r
   where (r->>'end_min')::int > (r->>'start_min')::int;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'rules', v_n);
end $function$;

-- Free slots for one officer.
--
-- The series value is cast back to ::date on purpose. generate_series over two dates
-- with an interval step resolves to the TIMESTAMPTZ overload, and
-- "timestamptz AT TIME ZONE tz" STRIPS a zone, whereas what is needed here is
-- "timestamp AT TIME ZONE tz", which ATTACHES one. Without the cast every slot came
-- out as a naive timestamp hours adrift — 09:00 Toronto surfaced as 05:00.
create or replace function public.cf_slots(p_org uuid, p_host uuid, p_days integer default 14)
returns jsonb language sql stable security definer set search_path = public as $function$
  select case when not public.cf_is_member_deep(p_org) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('at', s.at, 'slot_min', s.slot_min) order by s.at)
      from (
        select ((d.day::date + make_interval(mins => g.m)) at time zone a.tz) as at, a.slot_min
          from public.cf_availability a
          cross join lateral generate_series(
                 (now() at time zone a.tz)::date,
                 (now() at time zone a.tz)::date + (greatest(1, least(60, p_days)) - 1),
                 interval '1 day') as d(day)
          cross join lateral generate_series(a.start_min, a.end_min - a.slot_min, a.slot_min) as g(m)
         where a.org_id = p_org and a.user_id = p_host and a.active
           and extract(dow from d.day::date) = a.weekday
      ) s
     where s.at > now() + interval '30 minutes'          -- nothing imminent
       and not exists (select 1 from public.cf_bookings b
                        where b.host_user_id = p_host and b.status = 'booked' and b.starts_at = s.at)
       and not exists (select 1 from public.cf_meetings mt
                        join public.cf_members mm on mm.form_id = mt.form_id and mm.user_id = p_host
                       where mt.status = 'scheduled'
                         and s.at < mt.starts_at + make_interval(mins => mt.duration_min)
                         and s.at + make_interval(mins => s.slot_min) > mt.starts_at)
  ), '[]'::jsonb) end;
$function$;

create or replace function public.cf_book(
  p_org uuid, p_host uuid, p_at timestamptz, p_duration integer default 30, p_note text default null
) returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_id uuid;
begin
  if not public.cf_is_member_deep(p_org) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  if p_host = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'cannot_book_yourself');
  end if;
  if not exists (select 1 from public.cf_members m
                  where m.form_id = p_org and m.user_id = p_host and m.status = 'active'
                    and coalesce(m.suspended,false) = false) then
    return jsonb_build_object('ok', false, 'error', 'host_not_available');
  end if;
  if p_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'in_the_past');
  end if;
  -- The offered slot must still be one the engine would offer; re-checked here so a
  -- stale page cannot book a window the officer has since withdrawn.
  if not exists (select 1 from jsonb_array_elements(public.cf_slots(p_org, p_host, 60)) s
                  where (s->>'at')::timestamptz = p_at) then
    return jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  end if;

  begin
    insert into public.cf_bookings(org_id, host_user_id, guest_user_id, starts_at, duration_min, note)
      values (p_org, p_host, auth.uid(), p_at, greatest(5, least(600, coalesce(p_duration, 30))),
              nullif(trim(coalesce(p_note,'')),''))
      returning id into v_id;
  exception when unique_violation then
    -- The partial unique index caught a race: someone booked this instant first.
    return jsonb_build_object('ok', false, 'error', 'slot_just_taken');
  end;

  return jsonb_build_object('ok', true, 'booking_id', v_id);
end $function$;

-- Everything the caller has coming up, across every organisation: meetings they are
-- called to, and bookings on either side of the table.
create or replace function public.cf_my_agenda()
returns jsonb language sql stable security definer set search_path = public as $function$
  select jsonb_build_object(
    'meetings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', mt.id, 'title', mt.title, 'starts_at', mt.starts_at,
        'duration_min', mt.duration_min, 'room', mt.room,
        'where', f.name, 'form_id', mt.form_id,
        'my_rsvp', (select r.response from public.cf_meeting_rsvps r
                     where r.meeting_id = mt.id and r.user_id = auth.uid()),
        'live', (now() >= mt.starts_at - interval '5 minutes'
                 and now() < mt.starts_at + make_interval(mins => mt.duration_min))
      ) order by mt.starts_at)
      from public.cf_meetings mt
      join public.cf_forms f on f.id = mt.form_id
      join public.cf_members mm on mm.form_id = mt.form_id and mm.user_id = auth.uid()
     where mt.status = 'scheduled'
       and mm.status = 'active' and coalesce(mm.suspended,false) = false
       and mt.starts_at + make_interval(mins => mt.duration_min) >= now()), '[]'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'starts_at', b.starts_at, 'duration_min', b.duration_min,
        'room', b.room, 'note', b.note,
        'im_host', b.host_user_id = auth.uid(),
        'with', coalesce((select pr.name from public.cf_profiles pr
                           where pr.user_id = case when b.host_user_id = auth.uid()
                                                   then b.guest_user_id else b.host_user_id end), 'Member'),
        'where', (select f.name from public.cf_forms f where f.id = b.org_id),
        'live', (now() >= b.starts_at - interval '5 minutes'
                 and now() < b.starts_at + make_interval(mins => b.duration_min))
      ) order by b.starts_at)
      from public.cf_bookings b
     where b.status = 'booked'
       and (b.host_user_id = auth.uid() or b.guest_user_id = auth.uid())
       and b.starts_at + make_interval(mins => b.duration_min) >= now()), '[]'::jsonb));
$function$;

create or replace function public.cf_booking_cancel(p_booking uuid)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_h uuid; v_g uuid;
begin
  select host_user_id, guest_user_id into v_h, v_g from public.cf_bookings where id = p_booking;
  if v_h is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if auth.uid() not in (v_h, v_g) then return jsonb_build_object('ok', false, 'error', 'not_yours'); end if;
  update public.cf_bookings set status = 'cancelled' where id = p_booking;
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.cf_booking_room(p_booking uuid)
returns jsonb language sql stable security definer set search_path = public as $function$
  select case when b.id is null then jsonb_build_object('error','not_found')
              when auth.uid() not in (b.host_user_id, b.guest_user_id) then jsonb_build_object('error','not_yours')
              when b.status <> 'booked' then jsonb_build_object('error','cancelled')
         else jsonb_build_object('ok', true, 'room', b.room,
              'title', 'Quorly · ' || coalesce((select f.name from public.cf_forms f where f.id = b.org_id), ''),
              'starts_at', b.starts_at, 'duration_min', b.duration_min,
              'me', coalesce((select pr.name from public.cf_profiles pr where pr.user_id = auth.uid()), 'Member'))
         end
    from (select * from public.cf_bookings where id = p_booking) b
   right join (select 1) _ on true;
$function$;

revoke all on function public.cf_meetings(uuid, boolean) from public;
revoke all on function public.cf_meeting_create(uuid, text, timestamptz, integer, text) from public;
revoke all on function public.cf_meeting_rsvp(uuid, text) from public;
revoke all on function public.cf_meeting_cancel(uuid) from public;
revoke all on function public.cf_meeting_room(uuid) from public;
revoke all on function public.cf_officers(uuid) from public;
revoke all on function public.cf_availability_get(uuid, uuid) from public;
revoke all on function public.cf_availability_set(uuid, jsonb, text) from public;
revoke all on function public.cf_slots(uuid, uuid, integer) from public;
revoke all on function public.cf_book(uuid, uuid, timestamptz, integer, text) from public;
revoke all on function public.cf_my_agenda() from public;
revoke all on function public.cf_booking_cancel(uuid) from public;
revoke all on function public.cf_booking_room(uuid) from public;

grant execute on function public.cf_meetings(uuid, boolean) to authenticated;
grant execute on function public.cf_meeting_create(uuid, text, timestamptz, integer, text) to authenticated;
grant execute on function public.cf_meeting_rsvp(uuid, text) to authenticated;
grant execute on function public.cf_meeting_cancel(uuid) to authenticated;
grant execute on function public.cf_meeting_room(uuid) to authenticated;
grant execute on function public.cf_officers(uuid) to authenticated;
grant execute on function public.cf_availability_get(uuid, uuid) to authenticated;
grant execute on function public.cf_availability_set(uuid, jsonb, text) to authenticated;
grant execute on function public.cf_slots(uuid, uuid, integer) to authenticated;
grant execute on function public.cf_book(uuid, uuid, timestamptz, integer, text) to authenticated;
grant execute on function public.cf_my_agenda() to authenticated;
grant execute on function public.cf_booking_cancel(uuid) to authenticated;
grant execute on function public.cf_booking_room(uuid) to authenticated;
