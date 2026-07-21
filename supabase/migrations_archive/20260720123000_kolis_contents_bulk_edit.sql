-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Contents everywhere: expose it in the shipments list, capture it in bulk ║
-- ║  creation, and make it editable while a shipment is still editable.       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 1) Shipments list now returns contents (drop+recreate: return signature changes).
drop function if exists public.kolis_org_shipments(uuid, text, text);
create function public.kolis_org_shipments(p_org uuid, p_filter text default 'all', p_search text default null)
returns table(id uuid, code text, status text, dropoff_type text, size text, from_city text, to_city text,
              recipient_name text, recipient_phone text, recipient_email text, dropoff_addr text, pickup_addr text,
              driver_id uuid, price_cents integer, billing_mode text, created_at timestamptz, client_id uuid, contents text)
language plpgsql security definer set search_path to 'public' stable as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  return query
    select p.id,p.code,p.status,p.dropoff_type,p.size,p.from_city,p.to_city,
           p.recipient_name,p.recipient_phone,p.recipient_email,p.dropoff_addr,p.pickup_addr,
           p.driver_id,p.price_cents,p.billing_mode,p.created_at,p.client_id,p.contents_description
    from public.kolis_parcels p
    where p.org_id = p_org
      and (p_filter = 'all'
        or (p_filter = 'active'    and p.status not in ('delivered','cancelled'))
        or (p_filter = 'delivered' and p.status = 'delivered'))
      and (p_search is null or p_search = ''
        or p.code ilike '%'||p_search||'%' or p.to_city ilike '%'||p_search||'%'
        or p.recipient_name ilike '%'||p_search||'%')
    order by p.created_at desc;
end; $$;
grant execute on function public.kolis_org_shipments(uuid, text, text) to authenticated;

-- 2) Bulk creation captures per-recipient contents (same signature → replace).
create or replace function public.kolis_org_bulk_ship(p_org uuid, p_pickup jsonb, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; res jsonb := '[]'::jsonb; i int := 0; v_id uuid; v_code text; v_price int;
        v_dtype text; v_size text; v_from text; v_hub uuid; v_pickaddr text; v_status text; v_payg boolean; v_billing text;
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin','shipper') then raise exception 'forbidden'; end if;
  if (select status from public.kolis_orgs where id = p_org) <> 'active' then raise exception 'org_inactive'; end if;
  select coalesce(payg,false) into v_payg from public.kolis_orgs where id = p_org;
  v_billing := case when v_payg then 'card' else 'invoice' end;

  v_dtype := coalesce(p_pickup->>'dropoff_type','door');
  if v_dtype not in ('door','zone','hub') then raise exception 'bad_dropoff'; end if;
  v_hub := nullif(p_pickup->>'hub_id','')::uuid;
  v_pickaddr := nullif(p_pickup->>'pickup_addr','');
  v_from := coalesce(nullif(p_pickup->>'from_city',''), 'Ottawa');
  if v_dtype = 'hub' and v_hub is not null then
    select coalesce(nullif(city,''), v_from) into v_from from public.kolis_hubs where id = v_hub;
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      v_size := coalesce(r->>'size','small');
      if v_size not in ('envelope','small','large') then raise exception 'bad_size'; end if;
      if coalesce(r->>'to_city','') = '' then raise exception 'missing to_city'; end if;
      v_price := public.kolis_org_price_cents(p_org, v_size, v_dtype, v_from, r->>'to_city');
      if not v_payg then perform public.kolis_check_credit(p_org, v_price); end if;
      v_status := case when v_dtype='hub' then 'received_at_hub' else 'requested' end;
      insert into public.kolis_parcels(
        code, sender_id, status, dropoff_type, size, from_city, to_city, to_region,
        price_cents, driver_payout_cents, billing_mode, org_id, client_id,
        pickup_hub, pickup_addr,
        recipient_name, recipient_phone, recipient_email, recipient_lang, dropoff_addr,
        contents_description, insurance_premium_cents)
      values (
        public.kolis_gen_parcel_code(), auth.uid(), v_status, v_dtype, v_size, v_from, r->>'to_city', public.kolis_region_code(r->>'to_city'),
        v_price, public.kolis_driver_payout_cents(v_price, v_dtype), v_billing, p_org, nullif(r->>'client_id','')::uuid,
        case when v_dtype='hub' then v_hub else null end,
        case when v_dtype<>'hub' then v_pickaddr else null end,
        nullif(r->>'to_name',''), nullif(r->>'to_phone',''), nullif(r->>'to_email',''),
        case when lower(coalesce(r->>'lang','')) in ('en','fr') then lower(r->>'lang') else null end,
        nullif(r->>'to_address',''),
        nullif(r->>'contents',''), 0)
      returning id, code into v_id, v_code;
      res := res || jsonb_build_object('index',i,'ok',true,'id',v_id,'code',v_code,'price_cents',v_price,'to_name',r->>'to_name');
    exception when others then
      res := res || jsonb_build_object('index',i,'ok',false,'error',sqlerrm,'to_name',r->>'to_name');
    end;
  end loop;
  return jsonb_build_object('results', res, 'payg', v_payg);
end; $$;

-- 3) Edit a shipment can now change contents too (drop old sig, add trailing p_contents).
drop function if exists public.kolis_org_update_shipment(uuid,uuid,text,text,text,text,text,text,text,text);
create function public.kolis_org_update_shipment(
  p_org uuid, p_parcel uuid, p_dropoff_type text default null, p_size text default null, p_to_city text default null,
  p_recipient_name text default null, p_recipient_phone text default null, p_recipient_email text default null,
  p_dropoff_addr text default null, p_pickup_addr text default null, p_contents text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_p public.kolis_parcels%rowtype; v_dtype text; v_size text; v_city text; v_new int; v_old int;
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin','shipper') then raise exception 'forbidden'; end if;
  select * into v_p from public.kolis_parcels where id = p_parcel and org_id = p_org;
  if not found then raise exception 'not_found'; end if;
  if v_p.driver_id is not null or v_p.status not in ('requested','received_at_hub') then raise exception 'shipment_locked'; end if;

  v_dtype := coalesce(nullif(btrim(p_dropoff_type),''), v_p.dropoff_type);
  v_size  := coalesce(nullif(btrim(p_size),''), v_p.size);
  v_city  := coalesce(nullif(btrim(p_to_city),''), v_p.to_city);
  if v_dtype not in ('door','zone','hub') then raise exception 'bad_dropoff'; end if;
  if v_size not in ('envelope','small','large') then raise exception 'bad_size'; end if;

  v_old := v_p.price_cents;
  v_new := public.kolis_org_price_cents(p_org, v_size, v_dtype, v_p.from_city, v_city);

  update public.kolis_parcels set
    dropoff_type = v_dtype, size = v_size, to_city = v_city,
    to_region = public.kolis_region_code(v_city),
    recipient_name  = coalesce(p_recipient_name,  recipient_name),
    recipient_phone = coalesce(p_recipient_phone, recipient_phone),
    recipient_email = coalesce(p_recipient_email, recipient_email),
    dropoff_addr    = coalesce(p_dropoff_addr,    dropoff_addr),
    pickup_addr     = coalesce(p_pickup_addr,     pickup_addr),
    contents_description = coalesce(p_contents, contents_description),
    price_cents = v_new,
    driver_payout_cents = public.kolis_driver_payout_cents(v_new, v_dtype)
  where id = p_parcel;

  return jsonb_build_object('id', v_p.id, 'code', v_p.code,
    'old_price_cents', v_old, 'new_price_cents', v_new, 'delta_cents', v_new - v_old,
    'billing_mode', v_p.billing_mode, 'stripe_payment_intent_id', v_p.stripe_payment_intent_id);
end; $$;
grant execute on function public.kolis_org_update_shipment(uuid,uuid,text,text,text,text,text,text,text,text,text) to authenticated;
