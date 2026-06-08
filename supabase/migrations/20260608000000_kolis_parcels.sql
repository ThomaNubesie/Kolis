-- Kolis schema, added to the shared LoadQ Supabase project. All Kolis objects are
-- namespaced `kolis_*` so they're clearly Kolis's and never collide with LoadQ.
-- Carriers are LoadQ queue drivers (public.drivers); at the Ottawa/Montréal hubs,
-- ops can also dispatch with an off-platform driver. The SENDER'S identity is
-- masked from drivers via a PII-free view, not just the UI.

create table if not exists public.kolis_parcels (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  sender_id     uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'requested'
                check (status in ('requested','received_at_hub','matched','dispatched','picked_up','in_transit','delivered','cancelled')),
  dropoff_type  text not null check (dropoff_type in ('door','zone','hub')),
  size          text not null check (size in ('envelope','small','large')),
  from_city     text not null,
  to_city       text not null,
  pickup_zone   text references public.zones(id),   -- LoadQ loading zone (zone mode)
  pickup_addr   text,                                -- door pickup address — never shown to drivers raw
  pickup_hub    uuid,                                -- kolis_hubs.id (hub mode)
  dropoff_zone  text,
  dropoff_addr  text,
  price_cents   integer not null,
  -- Carrier: a LoadQ platform driver OR an off-platform driver entered by hub ops.
  driver_id            uuid references public.drivers(id),
  external_driver_name text,
  external_driver_veh  text,
  recipient_name   text,
  recipient_phone  text,
  delivery_code text not null default lpad((floor(random()*10000))::int::text, 4, '0'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.kolis_parcels enable row level security;

create policy "kolis_parcels_sender_select" on public.kolis_parcels for select using (auth.uid() = sender_id);
create policy "kolis_parcels_sender_insert" on public.kolis_parcels for insert with check (auth.uid() = sender_id);
create policy "kolis_parcels_sender_update" on public.kolis_parcels for update using (auth.uid() = sender_id);
create policy "kolis_parcels_driver_select" on public.kolis_parcels for select using (auth.uid() = driver_id);
create policy "kolis_parcels_driver_update" on public.kolis_parcels for update using (auth.uid() = driver_id);

-- Anti-disintermediation: drivers read parcels through this PII-free view only.
-- sender_id, sender PII, recipient_phone and pickup_addr are intentionally excluded.
create or replace view public.kolis_parcels_for_drivers
with (security_invoker = true) as
select
  id, code, status, dropoff_type, size, from_city, to_city,
  pickup_zone, pickup_hub, dropoff_zone, dropoff_addr, price_cents,
  driver_id, delivery_code, created_at
from public.kolis_parcels;

grant select on public.kolis_parcels_for_drivers to authenticated;
