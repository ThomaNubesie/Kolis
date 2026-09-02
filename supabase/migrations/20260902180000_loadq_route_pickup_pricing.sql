-- ============================================================================
-- LoadQ: route-pickup corridor and pricing, as data that survives a rebuild
--                                                                  2026-09-02
--
-- These five rows are read by `loadq-ride-quote` on every call, so they can be
-- retuned without a redeploy. That is the point of them — but it also meant the
-- live values existed nowhere except the database, and a rebuild from
-- migrations would have silently reverted the corridor to 4 km and the fee to a
-- flat $12.99. This makes the current settings reproducible.
--
-- WHY THESE NUMBERS. A customer booked a pickup on 1 September and it never
-- reached a driver: her address was 7.2 km off the Universal Grocery →
-- Montréal route against a 4.0 km corridor, so the app offered her three
-- downtown gas bars instead of a price and the request died there. The
-- corridor went to 12 km. At 12 km a flat fee asks a driver to drive ~24 km
-- round trip for the price of a 4 km one, so the fee follows the distance:
--
--     fee = base + max(0, off_route_km - free_km) * per_km,  capped at max
--
--         0–4 km   $12.99          8 km   $22.99
--            5 km  $15.49         10 km   $27.99
--          6.8 km  $19.99         12 km   $32.99
--
-- `off_route_km` is ONE WAY and the driver pays it twice, out and back, which
-- is why per_km sits above a plain per-km running cost. The cap binds at
-- 12.8 km — just past the corridor, so it is a backstop, not a price anyone
-- reaches in practice.
--
-- Retuning in production stays a one-row UPDATE. Change it here too, or the
-- next rebuild quietly undoes it.
-- ============================================================================

insert into public.loadq_settings (key, value) values
  -- how far off a driver's route an address can be and still be quoted
  ('route_pickup_max_off_route_m', '12000'),
  -- base fee, covering the first `free_km` of detour
  ('route_pickup_fee_cents',        '1299'),
  -- detour distance the base already covers (the old corridor width)
  ('route_pickup_free_km',             '4'),
  -- charged per km beyond that
  ('route_pickup_per_km_cents',      '250'),
  -- ceiling, so one long pickup can't run away from the seat fare
  ('route_pickup_fee_max_cents',    '3500')
on conflict (key) do update set value = excluded.value;
