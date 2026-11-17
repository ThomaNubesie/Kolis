-- Consumer (app) price, now owned by the database.
--
-- The app used to compute the price itself (constants/pricing.ts):
--   hub / zone : $10 + $0.10/km
--   door       : $5  + $0.20/km
--   × size (envelope 0.75, small 1.0, large 1.6) × Halifax 1.3, rounded to the dollar
-- That formula is ported here unchanged, then door-to-door gets a distance fee on
-- top: $0.25/km, i.e. $50 for Ottawa → Montréal (200 km), extrapolated by distance.
-- The door fee is Kolis margin: the courier's payout is computed on the base price
-- only, exactly as before the fee existed.
--
-- kolis_estimate_price_cents (the business / API formula) is NOT touched here.

create or replace function public.kolis_consumer_price(p_size text, p_drop text, p_from text, p_to text)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  km       int     := public.kolis_route_km(p_from, p_to);
  is_door  boolean := coalesce(p_drop, 'door') = 'door';
  mult     numeric := case coalesce(p_size, 'small') when 'envelope' then 0.75 when 'large' then 1.6 else 1.0 end;
  hx       numeric := case when public.kolis_region_code(p_from) = 'halifax' or public.kolis_region_code(p_to) = 'halifax' then 1.3 else 1.0 end;
  base     int;
  door_fee int;
begin
  base := round((case when is_door then 5 + 0.20 * km else 10 + 0.10 * km end) * mult * hx);
  door_fee := case when is_door then round(0.25 * km) else 0 end;
  return jsonb_build_object(
    'km',             km,
    'base_cents',     base * 100,
    'door_fee_cents', door_fee * 100,
    'price_cents',    (base + door_fee) * 100,
    'payout_cents',   public.kolis_driver_payout_cents(base * 100, coalesce(p_drop, 'door'))
  );
end $$;

create or replace function public.kolis_quote(p_size text, p_drop text, p_from text, p_to text)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.kolis_consumer_price(p_size, p_drop, p_from, p_to);
$$;
grant execute on function public.kolis_quote(text, text, text, text) to anon, authenticated;
