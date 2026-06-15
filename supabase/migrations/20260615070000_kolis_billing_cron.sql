-- ═══════════════════════════════════════════════════════════════════════════
-- Kolis for Business — Phase 3a: schedule the monthly billing close.
-- Pure-SQL close on the 1st of each month for the previous calendar month.
-- (Stripe issuance is driven separately by kolis-issue-invoices; its poller
-- cron is added at go-live together with KOLIS_CRON_SECRET.)
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin perform cron.unschedule('kolis-billing-close'); exception when others then null; end $$;

select cron.schedule('kolis-billing-close', '0 2 1 * *', $cron$
  select public.kolis_close_billing_period(
    (date_trunc('month', now()) - interval '1 month')::date,
    (date_trunc('month', now()) - interval '1 day')::date)
$cron$);
