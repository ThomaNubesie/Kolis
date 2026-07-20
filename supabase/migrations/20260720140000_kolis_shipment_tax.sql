-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Sales tax on every shipment. price_cents stays the pre-tax subtotal; tax  ║
-- ║  is the org province rate (kolis_tax_rate) applied per shipment; total =   ║
-- ║  subtotal + tax. Charged for PAYG, shown in quotes/receipts.               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
alter table public.kolis_parcels add column if not exists tax_cents int;  -- set when charged (PAYG); null = not yet taxed

-- The org's applicable tax rate + label, for portal display.
create or replace function public.kolis_org_tax(p_org uuid)
returns jsonb language plpgsql security definer set search_path to 'public' stable as $$
declare v_country text; v_prov text; v_rate numeric;
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  select coalesce(country,'CA'), province into v_country, v_prov from public.kolis_orgs where id = p_org;
  v_rate := public.kolis_tax_rate(v_country, v_prov);
  return jsonb_build_object(
    'rate', v_rate, 'province', v_prov, 'country', v_country,
    'label', case when v_country <> 'CA' then 'VAT'
                  when upper(coalesce(v_prov,'ON')) in ('ON','NB','NL','NS','PE') then 'HST'
                  when upper(coalesce(v_prov,'ON')) = 'QC' then 'GST+QST'
                  else 'GST' end);
end; $$;
grant execute on function public.kolis_org_tax(uuid) to authenticated;

-- Bulk quote now returns per-row tax + subtotal/tax/grand total (per-shipment
-- rounding, so it matches what PAYG actually charges shipment-by-shipment).
create or replace function public.kolis_org_bulk_quote(p_org uuid, p_pickup jsonb, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' stable as $$
declare r jsonb; res jsonb := '[]'::jsonb; i int := 0; v_price int; v_tax int; v_dtype text; v_from text; v_hub uuid;
        subtotal int := 0; tax_total int := 0; v_rate numeric;
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  select public.kolis_tax_rate(coalesce(country,'CA'), province) into v_rate from public.kolis_orgs where id = p_org;
  v_rate := coalesce(v_rate, 0);
  v_dtype := coalesce(p_pickup->>'dropoff_type','door');
  v_hub := nullif(p_pickup->>'hub_id','')::uuid;
  v_from := coalesce(nullif(p_pickup->>'from_city',''),'Ottawa');
  if v_dtype='hub' and v_hub is not null then select coalesce(nullif(city,''),v_from) into v_from from public.kolis_hubs where id=v_hub; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i+1;
    v_price := coalesce(public.kolis_org_price_cents(p_org, coalesce(r->>'size','small'), v_dtype, v_from, coalesce(r->>'to_city','')), 0);
    v_tax := round(v_price * v_rate);
    subtotal := subtotal + v_price;
    tax_total := tax_total + v_tax;
    res := res || jsonb_build_object('index',i,'price_cents',v_price,'tax_cents',v_tax);
  end loop;
  return jsonb_build_object('rows',res,'total_cents',subtotal,'subtotal_cents',subtotal,
                            'tax_cents',tax_total,'tax_rate',v_rate,'grand_total_cents',subtotal+tax_total);
end; $$;
