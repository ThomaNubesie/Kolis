-- Kolis hubs (staffed drop-off depots) + which LoadQ zones are Kolis-enabled.
-- Managed from the Kolis admin (writes gated on public.drivers.is_admin).
-- We never modify LoadQ's own `zones` table — Kolis enablement is a side table.

create table if not exists public.kolis_hubs (
  id         uuid primary key default gen_random_uuid(),
  city       text not null,
  name       text not null,
  address    text,
  hours      text default 'Open daily 7am – 9pm',
  latitude   double precision,
  longitude  double precision,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.kolis_hubs enable row level security;
create policy "kolis_hubs_read" on public.kolis_hubs for select using (true);
create policy "kolis_hubs_admin_all" on public.kolis_hubs for all
  using (exists (select 1 from public.drivers d where d.id = auth.uid() and d.is_admin))
  with check (exists (select 1 from public.drivers d where d.id = auth.uid() and d.is_admin));

create table if not exists public.kolis_zone_settings (
  zone_id       text primary key references public.zones(id) on delete cascade,
  kolis_enabled boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table public.kolis_zone_settings enable row level security;
create policy "kolis_zone_settings_read" on public.kolis_zone_settings for select using (true);
create policy "kolis_zone_settings_admin_all" on public.kolis_zone_settings for all
  using (exists (select 1 from public.drivers d where d.id = auth.uid() and d.is_admin))
  with check (exists (select 1 from public.drivers d where d.id = auth.uid() and d.is_admin));
