-- LoadQ — the pickup RPCs stop answering to strangers.
--
-- Enabling RLS on loadq_pickup_requests closes the front door and leaves the windows open:
-- every function that reads or writes that table is SECURITY DEFINER, so RLS does not apply
-- to any of them, and all nine were executable by anon. Fixing the table alone would have
-- been a false sense of security.
--
-- THE ONE THAT MATTERS
--
--   create function loadq_pickup_mark_paid(p_ref text) ... security definer as $$
--     update loadq_pickup_requests set paid_at = now(), status = 'pending'
--      where pay_ref = upper(p_ref) and paid_at is null and status = 'quoted';
--   $$
--
-- No authorisation check of any kind, granted to anon and to PUBLIC. Anybody holding the
-- publishable key could mark a pickup paid. Not even a guessing game: request a quote, read
-- your own LQ- reference off the screen, call this, ride for nothing. It has no client callers
-- at all — only loadq-interac-inbound, with the service role — so it becomes service_role
-- only. The admin path already exists separately as loadq_admin_mark_paid, which checks
-- drivers.is_admin before doing the same thing.
--
-- THE OTHER EIGHT
--
-- All are called from signed-in contexts and nothing else: the Expo app under LoadQ/app and
-- LoadQ/services (passenger and driver screens, all behind the auth redirect) and the staff
-- browser UI in Kolis/admin-web. No .html page or browser script in LoadQ, loadq-site,
-- loadq-business or Kolis calls any of them anonymously. They keep `authenticated`; they lose
-- `anon`, which was never used.
--
-- loadq_admin_unpaid is the one that was already defending itself — it reads drivers.is_admin
-- and returns '[]' to everyone else, which is why anon got an empty array rather than the
-- unpaid list. Its grant is tightened anyway: a function should not rely solely on its own
-- body when the grant can say the same thing.
--
-- Postgres grants EXECUTE on every new function to PUBLIC, and anon inherits through PUBLIC,
-- so revoking from anon alone would do nothing. PUBLIC goes first, then the roles that should
-- have it are named explicitly.

-- ── no session, no answer ───────────────────────────────────────────────────
revoke all on function public.loadq_my_pickup(uuid)              from public, anon;
revoke all on function public.loadq_pickup_receipt(uuid)         from public, anon;
revoke all on function public.loadq_pickup_mark(uuid)            from public, anon;
revoke all on function public.loadq_pickup_run(uuid)             from public, anon;
revoke all on function public.loadq_abandoned_pickups(integer)   from public, anon;
revoke all on function public.loadq_pickup_followup(uuid, text)  from public, anon;
revoke all on function public.loadq_my_unrated_trips()           from public, anon;
revoke all on function public.loadq_admin_unpaid()               from public, anon;

grant execute on function public.loadq_my_pickup(uuid)             to authenticated, service_role;
grant execute on function public.loadq_pickup_receipt(uuid)        to authenticated, service_role;
grant execute on function public.loadq_pickup_mark(uuid)           to authenticated, service_role;
grant execute on function public.loadq_pickup_run(uuid)            to authenticated, service_role;
grant execute on function public.loadq_abandoned_pickups(integer)  to authenticated, service_role;
grant execute on function public.loadq_pickup_followup(uuid, text) to authenticated, service_role;
grant execute on function public.loadq_my_unrated_trips()          to authenticated, service_role;
grant execute on function public.loadq_admin_unpaid()              to authenticated, service_role;

-- ── marking money received is not a thing a browser does ────────────────────
revoke all on function public.loadq_pickup_mark_paid(text) from public, anon, authenticated;
grant execute on function public.loadq_pickup_mark_paid(text) to service_role;

comment on function public.loadq_pickup_mark_paid(text) is
  'Marks a quoted pickup paid. No authorisation check in the body, so it is service_role only '
  'and called from loadq-interac-inbound. A person marking a payment received by hand uses '
  'loadq_admin_mark_paid, which verifies drivers.is_admin.';
