-- Store the hosted Stripe Checkout session id for card freight bookings
-- (verified + captured via kolis-freight-book confirm/capture).
alter table public.kolis_freight_requests
  add column if not exists stripe_checkout_session text;
