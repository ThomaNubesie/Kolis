-- A seat had ONE stripe_session_id, and re-pressing the card button overwrote it.
--
-- On 2026-09-14 a passenger paid at 14:37:09 on the link issued at 14:16; the button was
-- pressed again at 14:37:34 and the paid session id was discarded. The $30 was real and
-- sitting in Stripe, the sheet said unpaid, and a reconciler that checked only the current
-- session confirmed the wrong answer. The car could not have departed — no car may depart
-- owing — over money that had already been collected.
--
-- Payment evidence must never be overwritten. Sessions are kept, all of them.
create table if not exists public.loadq_seat_sessions (
  id             uuid primary key default gen_random_uuid(),
  seat_id        uuid not null references public.loadq_seats(id) on delete cascade,
  session_id     text not null unique,
  created_at     timestamptz not null default now(),
  checked_at     timestamptz,
  last_status    text,   -- Stripe payment_status at the last check
  session_status text    -- Stripe session status; 'expired' is terminal
);
create index if not exists loadq_seat_sessions_seat on public.loadq_seat_sessions(seat_id);
alter table public.loadq_seat_sessions enable row level security;
-- No policies: SECURITY DEFINER functions and the service role only, like the rest of the till.

comment on table public.loadq_seat_sessions is
  'Every Stripe Checkout session ever issued for a seat. Append-only — a superseded session may still be the one that was paid.';
comment on column public.loadq_seat_sessions.session_status is
  'Stripe''s own session status at the last check. ''expired'' is terminal — the sweep stops asking.';

-- Keep whatever the single column still holds, so nothing already issued is lost.
insert into public.loadq_seat_sessions(seat_id, session_id)
select s.id, s.stripe_session_id
  from public.loadq_seats s
 where s.stripe_session_id is not null and s.stripe_session_id <> 'pending'
on conflict (session_id) do nothing;

-- Records the session instead of replacing it. stripe_session_id survives as "the most
-- recent one", which is all the UI needs; the history is what the money depends on.
create or replace function public.loadq_seat_set_session(p_seat uuid, p_session text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare s public.loadq_seats; v_prior int;
begin
  select * into s from loadq_seats where id = p_seat;
  if s.id is null then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.loadq_seat_may_manage(s.entry_id) then
    return json_build_object('ok', false, 'error', 'forbidden'); end if;
  if s.status = 'paid' then return json_build_object('ok', false, 'error', 'already_paid'); end if;

  -- 'pending' is loadq-seat-pay's permission probe before it has a session to record.
  if btrim(coalesce(p_session,'')) not in ('', 'pending') then
    insert into loadq_seat_sessions(seat_id, session_id)
    values (p_seat, btrim(p_session))
    on conflict (session_id) do nothing;

    update loadq_seats set stripe_session_id = btrim(p_session), updated_at = now()
     where id = p_seat;
  end if;

  select count(*) into v_prior from loadq_seat_sessions where seat_id = p_seat;
  return json_build_object('ok', true, 'fare_cents', s.fare_cents,
                           'reference', s.reference, 'sessions', v_prior);
end $$;

-- Every still-answerable session for seats that are awaiting payment. The reconciler walks
-- this, not just the latest id, so a superseded-but-paid session is still found.
--
-- Bounded on purpose: the sweep runs every minute. A session Stripe calls 'expired' can never
-- become paid, and one older than Stripe's own 24h ceiling is not pending — re-asking about
-- either, forever, is a slow leak of API calls for no information.
create or replace function public.loadq_seat_open_sessions(p_seat uuid default null, p_entry uuid default null)
returns json language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select json_agg(json_build_object(
             'seat_id', s.id, 'seat_no', s.seat_no, 'entry_id', s.entry_id,
             'reference', s.reference, 'fare_cents', s.fare_cents,
             'session_id', ss.session_id, 'issued_at', ss.created_at)
           order by ss.created_at)
      from loadq_seats s
      join loadq_seat_sessions ss on ss.seat_id = s.id
     where s.status = 'awaiting'
       and (p_seat  is null or s.id = p_seat)
       and (p_entry is null or s.entry_id = p_entry)
       and coalesce(ss.session_status, '') <> 'expired'
       and ss.created_at > now() - interval '24 hours'), '[]'::json)
$$;

-- Every minute, because a seat that is paid but shows unpaid physically holds up a car.
-- Until the Stripe webhook endpoint exists this sweep is the ONLY thing that settles a card
-- seat; once it exists, this stays as the safety net for the day a webhook is missed.
select cron.schedule('loadq-seat-reconcile', '* * * * *', $cron$
  select net.http_post(
    url := 'https://kzjptcpjpwlxfofzhyku.supabase.co/functions/v1/loadq-seat-reconcile',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb) $cron$);
