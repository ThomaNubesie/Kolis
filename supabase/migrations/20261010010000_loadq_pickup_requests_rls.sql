-- LoadQ — a passenger's name, phone and front door stop being public.
--
-- loadq_pickup_requests had RLS disabled while anon held the default Supabase grants. Verified
-- against production with nothing but the publishable key — the one that ships inside the web
-- page — before writing this:
--
--     GET  /rest/v1/loadq_pickup_requests?select=contact_name,contact_phone,pickup_address
--       -> 200, real passengers, with phone numbers and street addresses
--     POST /rest/v1/loadq_pickup_requests
--       -> 201, a row created by a stranger
--
-- Reading is bad. Writing is worse, and DELETE was granted too, so the whole table could have
-- been emptied by anyone who had ever loaded the site.
--
-- WHY NO POLICIES
--
-- Every path that legitimately touches this table already bypasses RLS:
--   • supabase/functions/loadq-pickup and loadq-interac-inbound use the service role key
--   • all fifteen loadq_* functions that read or write it are SECURITY DEFINER
-- and a search of LoadQ, loadq-site, loadq-business and Kolis found no client code that
-- reaches the table directly — only those two edge functions name it at all.
--
-- So RLS with no policy is exactly right: it denies the one caller that should never have had
-- access (a browser holding the publishable key) and changes nothing for the callers that
-- should. A policy here would be granting access nobody asked for. If a screen ever does need
-- to read the table directly, it gets a policy then, written against what it actually needs.
alter table public.loadq_pickup_requests enable row level security;

-- RLS already stops anon and authenticated. The grant should not be there either: it is the
-- Supabase default on every new public table, it is what made this reachable, and leaving it
-- means the next person to disable RLS for a debugging session reopens the hole without
-- noticing. service_role is unaffected by both — it bypasses RLS by design.
revoke all on public.loadq_pickup_requests from anon, authenticated;

comment on table public.loadq_pickup_requests is
  'Passenger pickup requests. Contains PII: name, phone, street address and coordinates. '
  'RLS on with no policies — reached only through the SECURITY DEFINER loadq_* functions and '
  'the service role. Do not add a blanket policy; give a screen the narrowest one it needs.';
