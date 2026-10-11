-- LoadQ — the eleven tables that answered anyone holding the publishable key.
--
-- After loadq_pickup_requests was closed, these were what remained: RLS off, and the default
-- Supabase grants of SELECT, INSERT, UPDATE and DELETE to anon. Checked against production
-- with the publishable key — the one that ships inside the web page — before changing
-- anything:
--
--   GET /rest/v1/loadq_pickup_drivers?select=driver_id,lat,lng,on_duty
--     -> 200. Live GPS for 56 drivers: 45.4086,-75.6755 and the rest, which is central
--        Ottawa. anon also held UPDATE and DELETE, so those positions could be moved or
--        erased by anybody who had ever loaded the site.
--   GET /rest/v1/kolis_call_links?select=token,email,contact_name,phone  -> 200, with tokens
--   GET /rest/v1/cf_migrations                                          -> 200, the schema history
--
-- WHO ACTUALLY USES THEM
--
-- Searching LoadQ, loadq-site, loadq-business, Kolis and Kolis-site: ten of the eleven have
-- no client access of any kind. They are reached by edge functions holding the service role,
-- by SECURITY DEFINER functions, or only by migrations. loadq_region_centres,
-- loadq_doc_expiry_warnings and kolis_call_links have no code references anywhere at all.
--
-- Not one of the eleven is read by an anonymous caller. The public board reaches
-- loadq_tax_rates, but through loadq_close_departure, which is SECURITY DEFINER and therefore
-- unaffected by any of this.
--
-- So anon loses everything, and authenticated loses everything it was never using.

alter table public.loadq_pickup_drivers         enable row level security;
alter table public.loadq_pickup_runs            enable row level security;
alter table public.loadq_driver_default_vehicle enable row level security;
alter table public.loadq_region_centres         enable row level security;
alter table public.loadq_setting_defs           enable row level security;
alter table public.loadq_tax_rates              enable row level security;
alter table public.loadq_pause_reason           enable row level security;
alter table public.loadq_alias_seed_misses      enable row level security;
alter table public.loadq_doc_expiry_warnings    enable row level security;
alter table public.kolis_call_links             enable row level security;
alter table public.cf_migrations                enable row level security;

-- RLS alone would be enough, but the grant is what made this reachable and it should not
-- survive: the next person who disables RLS for a debugging session would reopen all of it
-- without noticing. service_role is untouched — it bypasses RLS by design — and the owner,
-- which is what supabase/apply.mjs runs as through the Management API, bypasses it too, so
-- the migration runner keeps writing cf_migrations.
revoke all on public.loadq_pickup_drivers         from anon, authenticated;
revoke all on public.loadq_pickup_runs            from anon, authenticated;
revoke all on public.loadq_driver_default_vehicle from anon, authenticated;
revoke all on public.loadq_region_centres         from anon, authenticated;
revoke all on public.loadq_setting_defs           from anon, authenticated;
revoke all on public.loadq_tax_rates              from anon, authenticated;
revoke all on public.loadq_pause_reason           from anon, authenticated;
revoke all on public.loadq_alias_seed_misses      from anon, authenticated;
revoke all on public.loadq_doc_expiry_warnings    from anon, authenticated;
revoke all on public.kolis_call_links             from anon, authenticated;
revoke all on public.cf_migrations                from anon, authenticated;

-- ── the one table a signed-in app really does read ──────────────────────────
-- The feeder screen asks whether this driver is on duty:
--
--   supabase.from("loadq_pickup_drivers").select("on_duty").eq("driver_id", user.id)
--
-- behind auth.getUser(), in LoadQ/app/(app)/feeder.tsx. That is the only direct client read
-- of any of these eleven, and RLS with no policy would have broken it — a policy-less table
-- refuses authenticated just as firmly as anon, which is the trap in doing this by rote.
--
-- The policy says exactly what the screen does and nothing more: a driver may read their own
-- row. Not other drivers' positions, and not writes — the location updates come from
-- loadq-pickup and loadq-ride-cascade with the service role.
--
-- All 56 driver_id values are auth user ids (checked against auth.users), so auth.uid() is
-- the right thing to compare against.
drop policy if exists loadq_pickup_drivers_own_row on public.loadq_pickup_drivers;
create policy loadq_pickup_drivers_own_row on public.loadq_pickup_drivers
  for select to authenticated
  using (driver_id = auth.uid());

-- A policy does nothing without the privilege behind it.
grant select on public.loadq_pickup_drivers to authenticated;

comment on table public.loadq_pickup_drivers is
  'Driver duty state and last known position. Contains live GPS. RLS: a signed-in driver may '
  'read their own row; everything else goes through the service role.';
comment on table public.kolis_call_links is
  'Call-link tokens with contact details. RLS on, no policies — service role only. If a public '
  'page ever needs to resolve a token, give it a SECURITY DEFINER function, not a policy.';

-- ── keep the ledger honest ──────────────────────────────────────────────────
-- apply.mjs treats a name present here as already run, which is what makes a re-run a no-op.
-- These four went in through the Management API rather than through apply.mjs, so without
-- this they would look unapplied and someone would run them again. Three are idempotent; the
-- policy above is guarded with drop ... if exists for the same reason.
insert into public.cf_migrations (name, applied_by) values
  ('20261010000000_loadq_interac_is_logged.sql',            'claude-code (mcp)'),
  ('20261010010000_loadq_pickup_requests_rls.sql',           'claude-code (mcp)'),
  ('20261010020000_loadq_pickup_rpcs_need_a_session.sql',    'claude-code (mcp)'),
  ('20261011000000_loadq_tables_that_answered_anyone.sql',   'claude-code (mcp)')
on conflict do nothing;
