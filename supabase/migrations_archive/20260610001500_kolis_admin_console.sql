-- ═══════════════════════════════════════════════════════════════════════════
-- Kolis Admin Console — foundation + RPCs (roles, parcels ops, claims, members,
-- team & access keys, driver candidates). All access goes through SECURITY
-- DEFINER RPCs gated by kolis_admin_role(); tables are locked to anon/authenticated.
-- (Applied live as 5 migrations; consolidated here for reproducibility.)
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto;

create table if not exists public.kolis_admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','dispatcher','finance','support')),
  invited_email text, invited_by uuid, created_at timestamptz not null default now());
alter table public.kolis_admin_roles enable row level security;
alter table public.kolis_profiles add column if not exists suspended boolean not null default false;

create table if not exists public.kolis_claims (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references public.kolis_parcels(id) on delete cascade,
  type text not null check (type in ('lost','damaged','other')),
  status text not null default 'open' check (status in ('open','approved','denied')),
  refund_cents integer, refund_method text check (refund_method in ('card','interac')),
  note text, opened_by uuid, resolved_by uuid, resolved_at timestamptz, created_at timestamptz not null default now());
alter table public.kolis_claims enable row level security;

create table if not exists public.kolis_access_keys (
  id uuid primary key default gen_random_uuid(), name text not null, prefix text not null, key_hash text not null,
  scopes text[] not null default '{}', created_by uuid, created_at timestamptz not null default now(),
  last_used_at timestamptz, revoked_at timestamptz);
alter table public.kolis_access_keys enable row level security;

create table if not exists public.kolis_admin_invites (
  email text primary key, role text not null check (role in ('admin','dispatcher','finance','support')),
  invited_by uuid, created_at timestamptz not null default now());
alter table public.kolis_admin_invites enable row level security;

revoke all on public.kolis_admin_roles, public.kolis_claims, public.kolis_access_keys, public.kolis_admin_invites from anon, authenticated;

-- Role helpers
create or replace function public.kolis_admin_role() returns text language sql security definer set search_path to 'public' stable as $$
  select coalesce((select role from public.kolis_admin_roles where user_id = auth.uid()),
                  (select 'owner' from public.drivers where id = auth.uid() and is_admin)); $$;
create or replace function public.kolis_is_staff() returns boolean language sql security definer set search_path to 'public' stable as $$
  select public.kolis_admin_role() is not null; $$;

-- NOTE: the full RPC bodies (kolis_admin_overview, kolis_admin_parcels, kolis_admin_parcel,
-- kolis_admin_assign / change_driver / unassign / reroute, kolis_admin_members, kolis_admin_suspend,
-- kolis_admin_claims, kolis_open_claim, kolis_deny_claim, kolis_admin_team, kolis_admin_invite,
-- kolis_admin_remove_staff, kolis_claim_admin_invite, kolis_admin_create_key, kolis_admin_keys,
-- kolis_admin_revoke_key, kolis_admin_candidates) are applied live on project kzjptcpjpwlxfofzhyku
-- via the migrations: kolis_admin_core_rpcs, kolis_admin_claims_rpcs, kolis_admin_team_and_keys,
-- kolis_admin_driver_candidates. Each is SECURITY DEFINER, gated by kolis_admin_role(), granted to
-- authenticated and revoked from anon/public. See the project migration history for exact bodies.

grant execute on function public.kolis_admin_role(), public.kolis_is_staff() to authenticated;
revoke execute on function public.kolis_admin_role(), public.kolis_is_staff() from public, anon;
