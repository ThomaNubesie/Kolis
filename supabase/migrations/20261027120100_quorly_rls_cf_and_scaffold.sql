-- Quorly project (slhdhapvawjsinzplysd) — enable RLS on tables flagged by the
-- Supabase Security Advisor as rls_disabled_in_public (2026-10-27).
--
-- All four are backend-managed or empty, so deny-all is correct: no policies means
-- the anon/authenticated roles get zero rows, while the service role (edge functions,
-- apply.mjs via the Management API) bypasses RLS and keeps working. Idempotent.
--
-- Routed to the Quorly project by apply.mjs because the filename contains "quorly"/cf_.
alter table public.cf_file_reminders enable row level security;
alter table public.cf_migrations    enable row level security;
alter table public.drivers          enable row level security;
alter table public.passengers       enable row level security;
