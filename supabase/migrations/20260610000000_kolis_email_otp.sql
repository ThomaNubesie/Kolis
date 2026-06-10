-- Email verification OTP store for Kolis signup (phone stays the primary Supabase
-- auth identity; email is verified separately). Service-role only.
create table if not exists public.kolis_email_otp (
  email text primary key,
  otp text not null,
  expires timestamptz not null,
  attempts int not null default 0,
  updated_at timestamptz default now()
);
alter table public.kolis_email_otp enable row level security;
-- no policies: only the service role (edge functions) reads/writes this table.
