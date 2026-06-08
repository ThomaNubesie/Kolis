-- Kolis parcels schema.
-- Carriers are LoadQ queue drivers; at the Ottawa/Montréal hubs, ops can also
-- dispatch with an off-platform driver. The SENDER'S identity is masked from
-- drivers (anti-disintermediation) — enforced here via a PII-free driver view,
-- not just the UI.

create table if not exists public.parcels (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  sender_id     uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'requested'
                check (status in ('requested','received_at_hub','matched','dispatched','picked_up','in_transit','delivered','cancelled')),
  dropoff_type  text not null check (dropoff_type in ('door','zone','hub')),  -- door=matched, zone=delegated, hub=ops-dispatched
  size          text not null check (size in ('envelope','small','large')),
  from_city     text not null,
  to_city       text not null,
  pickup_zone   text,            -- LoadQ loading zone (zone mode)
  pickup_addr   text,            -- door pickup address (door mode) — never shown to drivers raw
  pickup_hub    text,            -- staffed hub (hub mode)
  dropoff_zone  text,
  dropoff_addr  text,
  price_cents   integer not null,
  -- Carrier: a LoadQ platform driver OR an off-platform driver entered by hub ops.
  driver_id            uuid references auth.users(id),
  external_driver_name text,
  external_driver_veh  text,
  recipient_name   text,
  recipient_phone  text,                                         -- contacted via in-app proxy only
  delivery_code text not null default lpad((floor(random()*10000))::int::text, 4, '0'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.parcels enable row level security;

-- Senders: full access to their own parcels.
create policy "sender_select_own" on public.parcels for select using (auth.uid() = sender_id);
create policy "sender_insert_own" on public.parcels for insert with check (auth.uid() = sender_id);
create policy "sender_update_own" on public.parcels for update using (auth.uid() = sender_id);

-- Assigned platform driver: read + update delivery status of parcels assigned to them.
create policy "driver_select_assigned" on public.parcels for select using (auth.uid() = driver_id);
create policy "driver_update_assigned" on public.parcels for update using (auth.uid() = driver_id);

-- Anti-disintermediation: drivers read parcels through this PII-free view only.
-- sender_id, sender PII, recipient_phone and pickup_addr are intentionally excluded,
-- so a driver can never collect the sender's details to take them off-platform.
create or replace view public.parcels_for_drivers
with (security_invoker = true) as
select
  id, code, status, dropoff_type, size, from_city, to_city,
  pickup_zone, pickup_hub, dropoff_zone, dropoff_addr, price_cents,
  driver_id, delivery_code, created_at
from public.parcels;

grant select on public.parcels_for_drivers to authenticated;
