-- ═══════════════════════════════════════════════════════════════════════════
-- Kolis for Business — Phase 3b: schedule daily credit enforcement.
-- Suspends orgs over their credit limit or with an overdue invoice. Payment
-- (kolis_apply_stripe_invoice_event) un-suspends.
-- ═══════════════════════════════════════════════════════════════════════════
do $$ begin perform cron.unschedule('kolis-enforce-suspensions'); exception when others then null; end $$;
select cron.schedule('kolis-enforce-suspensions', '30 3 * * *', $cron$ select public.kolis_enforce_suspensions() $cron$);
