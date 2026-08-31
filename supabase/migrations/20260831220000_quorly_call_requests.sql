-- Quorly — "Book a 15-minute call" requests from quorly.ca.
--
-- Applied to production 2026-08-31. The outreach email has always promised a call
-- and linked to ?book=1, which nothing handled: the most interested reader we get
-- landed on the marketing homepage with nothing to do. This is the other end of
-- that link, mirroring kolis_call_requests on the Kolis side.
--
-- A board writes in as an organization rather than a business, and holds a role on
-- it. prospect_id ties a booking back to the cold email that produced it.
create table if not exists public.quorly_call_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization text,
  role text,
  phone text,
  email text,
  preferred text,
  note text,
  lang text default 'en',
  status text default 'new',
  email_id text,
  prospect_id uuid,
  created_at timestamptz default now()
);

alter table public.quorly_call_requests enable row level security;

-- Writes come only from the edge function (service role); reads are for operators.
drop policy if exists quorly_call_requests_read on public.quorly_call_requests;
create policy quorly_call_requests_read on public.quorly_call_requests for select
  using (exists (select 1 from public.quorly_outreach_admins a where a.user_id = auth.uid()));

create index if not exists quorly_call_requests_created_idx on public.quorly_call_requests (created_at desc);
