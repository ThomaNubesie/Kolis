-- Concord Express / Kolis · Business sales outreach: tracking + 3-touch follow-up engine.
-- Recipients + an append-only event log fed by the Resend webhook. Follow-ups go
-- out at +4 / +10 / +18 days from the initial send, auto-stopping on click, bounce,
-- a manual "replied" flag, or after the 3rd touch.

create table if not exists public.concord_outreach (
  id uuid primary key default gen_random_uuid(),
  business_name   text not null,
  email           text not null unique,
  status          text not null default 'active',   -- active | clicked | replied | bounced | stopped | done
  touch_count     int  not null default 0,          -- 0 = initial only; follow-ups 1..3
  initial_sent_at timestamptz default now(),
  last_sent_at    timestamptz,
  next_due_at     timestamptz,                       -- when the next follow-up is due
  opened_at       timestamptz,
  clicked_at      timestamptz,
  bounced_at      timestamptz,
  notes           text,
  created_at      timestamptz not null default now()
);

create table if not exists public.concord_outreach_events (
  id uuid primary key default gen_random_uuid(),
  email           text,
  type            text,        -- delivered | opened | clicked | bounced | complained
  resend_email_id text,
  link            text,
  created_at      timestamptz not null default now()
);
create index if not exists concord_outreach_events_email_idx on public.concord_outreach_events(email);

revoke all on public.concord_outreach from anon, authenticated;
revoke all on public.concord_outreach_events from anon, authenticated;

-- Follow-up cadence: +4 / +10 / +18 days from the initial send.
create or replace function public.concord_next_due(p_initial timestamptz, p_touch int) returns timestamptz
  language sql immutable as $$
  select case p_touch
    when 0 then p_initial + interval '4 days'
    when 1 then p_initial + interval '10 days'
    when 2 then p_initial + interval '18 days'
    else null end;
$$;

-- Register a recipient when their initial email is sent (idempotent on email).
create or replace function public.concord_outreach_add(p_name text, p_email text) returns uuid
  language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  insert into public.concord_outreach(business_name, email, initial_sent_at, last_sent_at, touch_count, next_due_at, status)
    values (p_name, lower(p_email), now(), now(), 0, public.concord_next_due(now(),0), 'active')
  on conflict (email) do update set business_name = excluded.business_name
  returning id into v_id;
  return v_id;
end; $$;

-- Staff-readable status snapshot.
create or replace function public.concord_outreach_status() returns setof public.concord_outreach
  language sql security definer set search_path=public as $$
  select * from public.concord_outreach order by created_at desc;
$$;

revoke all on function public.concord_outreach_add(text,text) from anon, authenticated, public;
revoke all on function public.concord_outreach_status() from anon, authenticated, public;
