-- Insurance premium = 5% of declared value, added to the charge (company
-- revenue, not part of the courier payout).
alter table public.kolis_parcels
  add column if not exists insurance_premium_cents integer not null default 0;

-- Sender receipt should reflect the full amount paid (shipping + premium).
create or replace function public.kolis_parcel_receipt(p_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  p public.kolis_parcels;
  base jsonb;
begin
  select * into p from public.kolis_parcels where id = p_id;
  if not found then return null; end if;
  if me is null or (me <> p.sender_id and me <> coalesce(p.driver_id, '00000000-0000-0000-0000-000000000000')) then
    return null;
  end if;
  base := jsonb_build_object(
    'id', p.id, 'code', p.code,
    'from_city', p.from_city, 'to_city', p.to_city,
    'size', p.size, 'dropoff_type', p.dropoff_type, 'status', p.status,
    'delivered_at', p.delivered_at, 'created_at', p.created_at,
    'role', case when me = p.sender_id then 'sender' else 'courier' end
  );
  if me = p.sender_id then
    return base || jsonb_build_object(
      'price_cents', p.price_cents,
      'insurance_premium_cents', coalesce(p.insurance_premium_cents, 0),
      'insured', p.insured);
  else
    return base || jsonb_build_object('payout_cents', p.driver_payout_cents);
  end if;
end;
$$;
revoke execute on function public.kolis_parcel_receipt(uuid) from public, anon;
