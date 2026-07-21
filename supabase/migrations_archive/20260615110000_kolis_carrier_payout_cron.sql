-- Phase 3c: schedule the monthly carrier payout close (previous calendar month).
do $$ begin perform cron.unschedule('kolis-carrier-payout-close'); exception when others then null; end $$;
select cron.schedule('kolis-carrier-payout-close', '0 4 1 * *', $cron$
  select public.kolis_close_carrier_payouts(
    (date_trunc('month', now()) - interval '1 month')::date,
    (date_trunc('month', now()) - interval '1 day')::date) $cron$);
