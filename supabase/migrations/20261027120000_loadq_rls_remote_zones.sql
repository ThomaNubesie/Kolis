-- Enable RLS on public.kolis_remote_zones.
-- Supabase Security Advisor flagged this as rls_disabled_in_public (2026-10-27):
-- with RLS off, the anon key could read/insert/update/delete every row.
--
-- The table is non-sensitive reference data (region_code, province, example_town),
-- so we keep it publicly READABLE but remove anon/authenticated writes — the
-- service role still writes it. Idempotent: safe to re-run.
alter table public.kolis_remote_zones enable row level security;

drop policy if exists kolis_remote_zones_public_read on public.kolis_remote_zones;
create policy kolis_remote_zones_public_read
  on public.kolis_remote_zones
  for select
  to anon, authenticated
  using (true);
