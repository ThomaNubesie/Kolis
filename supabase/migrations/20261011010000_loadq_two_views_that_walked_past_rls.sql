-- LoadQ — two views that walked past the RLS on their own base tables.
--
-- With the eleven tables closed, the audit for "RLS off and anon can reach it" returns
-- nothing. Running the same question against VIEWS returns two, and a view is the quieter
-- version of the bug: it is owned by postgres and, unless it is declared security_invoker,
-- selecting it runs as its owner and reads straight past whatever RLS protects the tables
-- underneath. The grant on the view is then the only thing standing there.
--
-- Checked against production with the publishable key:
--
--   GET /rest/v1/drivers?select=full_name,phone                  -> 200 but empty: RLS works
--   GET /rest/v1/loadq_undertaking_status?select=full_name,phone,email
--     -> 200 with the roster. Real driver names, phone numbers and email addresses, out of
--        the same `drivers` table that had just refused to answer directly.
--
-- loadq_undertaking_status: NOTHING READS IT
--
-- No reference in LoadQ, loadq-site, loadq-business, Kolis or Kolis-site. So both roles lose
-- it, and it becomes an invoker view as well — belt and braces, because the failure here was
-- never the grant on its own but the grant combined with a definer view. If it is ever wanted
-- on a compliance screen, it comes back as a SECURITY DEFINER function with an is_admin check,
-- the way loadq_admin_unpaid already does it.
alter view public.loadq_undertaking_status set (security_invoker = true);
revoke all on public.loadq_undertaking_status from anon, authenticated;

comment on view public.loadq_undertaking_status is
  'Driver undertaking state, including name, phone and email from drivers. Nothing reads it. '
  'security_invoker and no grants: it used to hand the whole roster to anyone with the '
  'publishable key. A screen that needs this gets a definer function with an admin check.';

-- network_trip_stats: THE APP READS IT, ANON WAS NEVER MEANT TO
--
-- LoadQ/services/trips.ts reads it from the signed-in app, and the migration that created it
-- granted select to `authenticated` and nobody else. anon's access came from the Supabase
-- default grant on a new public object, not from intent — the author had already written the
-- right line next to the wrong default.
--
-- It stays a definer view on purpose. It is a seven-day aggregate of trip counts and gross by
-- zone, which is exactly the sort of thing an aggregate view is for, and making it invoker
-- would subject it to the per-row RLS on trips and quietly change what the app's own screen
-- shows. The fix here is the grant, not the view.
revoke all on public.network_trip_stats from anon;

comment on view public.network_trip_stats is
  'Seven-day trip counts and gross by zone. Deliberately a definer aggregate; authenticated '
  'only. anon had select from the Supabase default grant, never by intent.';

insert into public.cf_migrations (name, applied_by) values
  ('20261011010000_loadq_two_views_that_walked_past_rls.sql', 'claude-code (mcp)')
on conflict do nothing;
