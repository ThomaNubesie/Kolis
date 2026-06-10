-- Kolis user profile (senders + couriers): role, name, email, country, and
-- verification/founding state. One row per auth user; self-access via RLS.
create table if not exists public.kolis_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text,                              -- 'sender' | 'courier' | 'both'
  full_name text,
  email text,
  country text default 'CA',
  identity_verified boolean default false,
  verification_fee_paid boolean default false,
  is_founding boolean default false,
  founding_number int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.kolis_profiles enable row level security;
do $$ begin
  create policy kolis_profiles_self_sel on public.kolis_profiles for select using (auth.uid() = id);
  create policy kolis_profiles_self_ins on public.kolis_profiles for insert with check (auth.uid() = id);
  create policy kolis_profiles_self_upd on public.kolis_profiles for update using (auth.uid() = id);
exception when duplicate_object then null; end $$;
