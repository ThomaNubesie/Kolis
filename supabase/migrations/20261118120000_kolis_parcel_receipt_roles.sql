-- Receipt walls: the sender sees the price, the courier sees their payout — and
-- now both are computed independently instead of either/or.
--
-- Two bugs in the old version:
--   * It recognised the courier only as `auth.uid() = driver_id`. A courier signed
--     in with their linked LoadQ identity (driver_id is their Kolis profile) got
--     NULL back — no payout receipt after delivering.
--   * When the caller was BOTH sender and courier of a parcel (the App Review
--     account's test parcel) it returned only the sender view, so the courier
--     app's payout read as undefined and showed "C$NaN".
create or replace function public.kolis_parcel_receipt(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p public.kolis_parcels;
  is_sender boolean;
  is_courier boolean;
  out jsonb;
begin
  select * into p from public.kolis_parcels where id = p_id;
  if not found or me is null then return null; end if;
  is_sender  := me = p.sender_id;
  is_courier := p.driver_id is not null and p.driver_id = public.kolis_courier_self();
  if not is_sender and not is_courier then return null; end if;

  out := jsonb_build_object(
    'id', p.id, 'code', p.code,
    'from_city', p.from_city, 'to_city', p.to_city,
    'size', p.size, 'dropoff_type', p.dropoff_type, 'status', p.status,
    'delivered_at', p.delivered_at, 'created_at', p.created_at,
    'role', case when is_courier and not is_sender then 'courier' when is_sender and not is_courier then 'sender' else 'both' end
  );
  if is_sender then
    out := out || jsonb_build_object('price_cents', p.price_cents,
      'insurance_premium_cents', coalesce(p.insurance_premium_cents, 0), 'insured', p.insured);
  end if;
  if is_courier then
    out := out || jsonb_build_object('payout_cents', p.driver_payout_cents);
  end if;
  return out;
end $$;
