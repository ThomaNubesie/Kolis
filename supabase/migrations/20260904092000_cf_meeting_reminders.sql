-- The hour-before reminder.
--
-- A meeting people said yes to a week ago is one they have forgotten by the day.
-- reminded_at is what makes this safe to run every five minutes: the row is stamped
-- BEFORE the send is queued, so a slow or retried run cannot text the assembly twice.
-- At worst somebody misses a reminder; never do they get two.
create or replace function public.cf_meeting_reminders()
returns jsonb language plpgsql security definer set search_path = public as $function$
declare r record; v_sent int := 0;
        v_url text := 'https://slhdhapvawjsinzplysd.supabase.co/functions/v1/cf-meeting-notify';
        v_hdr jsonb := jsonb_build_object('Content-Type','application/json',
                                          'x-kolis-secret','kolis_notify_9f3a2c7b1e6d4084');
begin
  for r in
    select 'meeting'::text as kind, id from public.cf_meetings
     where status = 'scheduled' and reminded_at is null
       and starts_at between now() and now() + interval '65 minutes'
    union all
    select 'booking'::text, id from public.cf_bookings
     where status = 'booked' and reminded_at is null
       and starts_at between now() and now() + interval '65 minutes'
  loop
    if r.kind = 'meeting' then
      update public.cf_meetings set reminded_at = now() where id = r.id;
    else
      update public.cf_bookings set reminded_at = now() where id = r.id;
    end if;

    perform net.http_post(url := v_url, headers := v_hdr,
      body := jsonb_build_object('kind', r.kind, 'id', r.id, 'reminder', true));
    v_sent := v_sent + 1;
  end loop;
  return jsonb_build_object('ok', true, 'reminded', v_sent);
end $function$;

revoke all on function public.cf_meeting_reminders() from public;

-- select cron.schedule('cf-meeting-reminders', '*/5 * * * *',
--                      $$select public.cf_meeting_reminders();$$);
-- (scheduled once in production; left commented so re-running this file is harmless)
