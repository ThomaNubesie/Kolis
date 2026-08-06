-- Surface HUB drop-off scheduling slots on the admin parcel-DETAIL RPC (additive).
-- The list RPC kolis_admin_parcels already returns pickup_slot/dropoff_slot; this
-- adds the same two columns to the single-parcel detail view. (Applied via MCP.)
create or replace function public.kolis_admin_parcel(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select case when not public.kolis_admin_has_cap('parcels') then null else (
    select jsonb_build_object(
      'id', p.id, 'code', p.code, 'status', p.status, 'dropoff_type', p.dropoff_type, 'size', p.size,
      'from_city', p.from_city, 'to_city', p.to_city, 'to_region', p.to_region,
      'recipient_name', p.recipient_name, 'recipient_phone', p.recipient_phone, 'recipient_email', p.recipient_email,
      'dropoff_addr', p.dropoff_addr, 'pickup_addr', p.pickup_addr,
      'contents_description', p.contents_description, 'declared_value_cents', p.declared_value_cents,
      'insured', p.insured, 'insurance_premium_cents', p.insurance_premium_cents,
      'price_cents', p.price_cents, 'driver_payout_cents', p.driver_payout_cents, 'delivery_code', p.delivery_code,
      'driver_id', p.driver_id, 'driver_name', coalesce(d.full_name, dp.full_name),
      'preferred_driver_id', p.preferred_driver_id,
      'preferred_driver_name', coalesce(pd.full_name, pdp.full_name),
      'offer_expires_at', p.offer_expires_at,
      'sender_name', coalesce(sp.verified_name, sp.full_name), 'sender_email', sp.email,
      'pickup_hub_name', h.name, 'created_at', p.created_at, 'delivered_at', p.delivered_at,
      'has_pi', (p.stripe_payment_intent_id is not null),
      'pickup_slot', p.pickup_slot, 'dropoff_slot', p.dropoff_slot
    )
    from public.kolis_parcels p
    left join public.drivers d on d.id = p.driver_id
    left join public.kolis_profiles dp on dp.id = p.driver_id
    left join public.drivers pd on pd.id = p.preferred_driver_id
    left join public.kolis_profiles pdp on pdp.id = p.preferred_driver_id
    left join public.kolis_profiles sp on sp.id = p.sender_id
    left join public.kolis_hubs h on h.id = p.pickup_hub
    where p.id = p_id) end;
$function$;
