-- The passenger gets a receipt too.
--
-- Until now only the driver did. A passenger who paid $30 by card had nothing from LoadQ at
-- all — at best a Stripe email with no trip, no driver and no plate on it, and for an Interac
-- seat nothing whatsoever. The person who needs it most is the one expensing the trip or
-- proving they were in a particular car on a particular evening.
--
-- Sent AFTER the car leaves, from the frozen departure record, so the receipt describes a
-- journey that actually happened rather than a booking that might still change.
alter table public.loadq_seats
  add column if not exists receipt_sent_at timestamptz,
  add column if not exists passenger_email text;

comment on column public.loadq_seats.receipt_sent_at is
  'When the passenger''s own receipt went out. Stamped only on a successful send, so an unsent one keeps showing as unsent.';
comment on column public.loadq_seats.passenger_email is
  'Captured from Stripe Checkout. The only email we ever hold for a passenger — an Interac seat has none.';

-- loadq_seat_card_record now takes the address.
--
-- Passengers were getting an SMS receipt but no email even when they had typed an address into
-- Stripe Checkout: the webhook stores event.data.object and is idempotent on the payment
-- intent, so whichever of checkout.session.completed / payment_intent.succeeded landed FIRST
-- won. A PaymentIntent carries no customer_details.email, so when it won the race the address
-- was lost. Late-arriving events may now fill it in even when the charge is already recorded,
-- which is what makes the event order stop mattering.
create or replace function public.loadq_seat_card_record(
  p_seat uuid, p_intent text, p_amount int, p_currency text default 'cad',
  p_event text default null, p_raw jsonb default null, p_email text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare s public.loadq_seats; v_status text; v_email text := nullif(btrim(coalesce(p_email,'')),'');
begin
  if nullif(btrim(coalesce(p_intent,'')),'') is null then
    return json_build_object('ok', false, 'error', 'no_intent'); end if;

  if exists (select 1 from loadq_card_inbound where payment_intent = btrim(p_intent)) then
    if v_email is not null and p_seat is not null then
      update loadq_seats set passenger_email = coalesce(passenger_email, v_email), updated_at = now()
       where id = p_seat and passenger_email is null;
    end if;
    return json_build_object('ok', true, 'already', true, 'email_filled', v_email is not null);
  end if;

  select * into s from loadq_seats where id = p_seat;
  if s.id is null then
    insert into loadq_card_inbound(payment_intent, amount_cents, currency, status, event_id, raw)
    values (btrim(p_intent), p_amount, lower(coalesce(p_currency,'cad')), 'orphan', p_event, p_raw);
    return json_build_object('ok', false, 'error', 'no_such_seat');
  end if;

  -- The charge must be for what the seat costs. A short payment is not a paid seat, and
  -- silently accepting it would put the shortfall on the driver at departure.
  v_status := case when p_amount = s.fare_cents then 'succeeded' else 'mismatch' end;

  insert into loadq_card_inbound(payment_intent, seat_id, entry_id, reference, amount_cents,
                                 currency, status, event_id, raw)
  values (btrim(p_intent), s.id, s.entry_id, s.reference, p_amount,
          lower(coalesce(p_currency,'cad')), v_status, p_event, p_raw);

  if v_status <> 'succeeded' then
    return json_build_object('ok', false, 'error', 'amount_mismatch',
      'expected', s.fare_cents, 'received', p_amount);
  end if;

  update loadq_seats
     set status = 'paid', method = 'card', paid_at = coalesce(paid_at, now()),
         stripe_payment_intent = btrim(p_intent),
         passenger_email = coalesce(passenger_email, v_email), updated_at = now()
   where id = s.id and status <> 'paid';

  return json_build_object('ok', true, 'seat_no', s.seat_no, 'entry_id', s.entry_id);
end $$;

create or replace function public.loadq_seat_receipt_sent(p_seat uuid, p_via text default null)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  update loadq_seats set receipt_sent_at = now(), updated_at = now()
   where id = p_seat and receipt_sent_at is null;
  return found;
end $$;

-- Paid card seats with a session but no address — what the backfill sweep asks Stripe about.
create or replace function public.loadq_seats_missing_email()
returns json language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select json_agg(json_build_object('seat_id', s.id, 'reference', s.reference,
                                      'session_id', s.stripe_session_id,
                                      'intent', s.stripe_payment_intent))
      from loadq_seats s
     where s.status = 'paid' and s.method = 'card' and s.passenger_email is null
       and s.stripe_session_id is not null and s.stripe_session_id <> 'pending'
       and s.paid_at > now() - interval '30 days'), '[]'::json)
$$;

create or replace function public.loadq_seat_set_email(p_seat uuid, p_email text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  update loadq_seats set passenger_email = nullif(btrim(p_email),''), updated_at = now()
   where id = p_seat and passenger_email is null;
  return found;
end $$;

revoke execute on function public.loadq_seats_missing_email()       from public, anon, authenticated;
revoke execute on function public.loadq_seat_set_email(uuid, text)  from public, anon, authenticated;
grant  execute on function public.loadq_seats_missing_email()       to service_role;
grant  execute on function public.loadq_seat_set_email(uuid, text)  to service_role;

-- Every two minutes. A receipt should arrive while the passenger is still in the car thinking
-- about the trip, not whenever someone next opens the tablet.
select cron.schedule('loadq-passenger-receipt', '*/2 * * * *', $cron$
  select net.http_post(
    url := 'https://kzjptcpjpwlxfofzhyku.supabase.co/functions/v1/loadq-passenger-receipt',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb) $cron$);
