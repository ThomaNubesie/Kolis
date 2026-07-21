-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Tax follows the DESTINATION province (place of supply for delivery), not  ║
-- ║  the shipper's province. Map the to_city → province → kolis_tax_rate.      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create or replace function public.kolis_city_province(p_city text)
returns text language sql immutable set search_path to 'public' as $$
  select case public.kolis_region_code(p_city)
    -- Ontario
    when 'ottawa' then 'ON' when 'kingston' then 'ON' when 'toronto' then 'ON'
    when 'mississauga' then 'ON' when 'hamilton' then 'ON' when 'london' then 'ON'
    when 'kitchener' then 'ON' when 'waterloo' then 'ON' when 'cambridge' then 'ON'
    when 'guelph' then 'ON' when 'windsor' then 'ON' when 'barrie' then 'ON'
    when 'oshawa' then 'ON' when 'brampton' then 'ON' when 'markham' then 'ON'
    when 'vaughan' then 'ON' when 'scarborough' then 'ON' when 'etobicoke' then 'ON'
    when 'kanata' then 'ON' when 'nepean' then 'ON' when 'orleans' then 'ON'
    when 'gloucester' then 'ON' when 'cornwall' then 'ON' when 'brockville' then 'ON'
    when 'belleville' then 'ON' when 'peterborough' then 'ON' when 'niagara' then 'ON'
    when 'sudbury' then 'ON' when 'richmond' then 'ON' when 'ajax' then 'ON' when 'whitby' then 'ON'
    -- Quebec
    when 'gatineau' then 'QC' when 'montreal' then 'QC' when 'quebec' then 'QC'
    when 'sherbrooke' then 'QC' when 'laval' then 'QC' when 'longueuil' then 'QC'
    when 'levis' then 'QC' when 'terrebonne' then 'QC' when 'drummondville' then 'QC'
    when 'granby' then 'QC' when 'trois-rivieres' then 'QC' when 'saguenay' then 'QC'
    when 'brossard' then 'QC' when 'repentigny' then 'QC' when 'saint-jerome' then 'QC'
    -- Other provinces (majors)
    when 'vancouver' then 'BC' when 'victoria' then 'BC' when 'burnaby' then 'BC' when 'surrey' then 'BC'
    when 'calgary' then 'AB' when 'edmonton' then 'AB'
    when 'winnipeg' then 'MB' when 'regina' then 'SK' when 'saskatoon' then 'SK'
    when 'halifax' then 'NS' when 'moncton' then 'NB' when 'fredericton' then 'NB'
    when 'charlottetown' then 'PE'
    else 'ON' end;  -- unknown destination → default ON
$$;

-- Destination tax rate for a shipment to p_city.
create or replace function public.kolis_dest_tax_rate(p_city text, p_country text default 'CA')
returns numeric language sql stable set search_path to 'public' as $$
  select public.kolis_tax_rate(coalesce(p_country,'CA'), public.kolis_city_province(p_city));
$$;
grant execute on function public.kolis_dest_tax_rate(text, text) to authenticated;

-- Bulk quote: tax per row from its destination province.
create or replace function public.kolis_org_bulk_quote(p_org uuid, p_pickup jsonb, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' stable as $$
declare r jsonb; res jsonb := '[]'::jsonb; i int := 0; v_price int; v_tax int; v_rate numeric; v_dtype text; v_from text; v_hub uuid;
        subtotal int := 0; tax_total int := 0; rate_seen numeric := null; mixed boolean := false;
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  v_dtype := coalesce(p_pickup->>'dropoff_type','door');
  v_hub := nullif(p_pickup->>'hub_id','')::uuid;
  v_from := coalesce(nullif(p_pickup->>'from_city',''),'Ottawa');
  if v_dtype='hub' and v_hub is not null then select coalesce(nullif(city,''),v_from) into v_from from public.kolis_hubs where id=v_hub; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i+1;
    v_price := coalesce(public.kolis_org_price_cents(p_org, coalesce(r->>'size','small'), v_dtype, v_from, coalesce(r->>'to_city','')), 0);
    v_rate := public.kolis_dest_tax_rate(coalesce(r->>'to_city',''));
    v_tax := round(v_price * v_rate);
    if rate_seen is null then rate_seen := v_rate; elsif rate_seen <> v_rate then mixed := true; end if;
    subtotal := subtotal + v_price; tax_total := tax_total + v_tax;
    res := res || jsonb_build_object('index',i,'price_cents',v_price,'tax_cents',v_tax,'tax_rate',v_rate);
  end loop;
  return jsonb_build_object('rows',res,'total_cents',subtotal,'subtotal_cents',subtotal,
                            'tax_cents',tax_total,'tax_rate', case when mixed then null else rate_seen end,
                            'grand_total_cents',subtotal+tax_total);
end; $$;

-- Shipments list: include tax_cents (stored if charged, else estimated by destination).
drop function if exists public.kolis_org_shipments(uuid, text, text);
create function public.kolis_org_shipments(p_org uuid, p_filter text default 'all', p_search text default null)
returns table(id uuid, code text, status text, dropoff_type text, size text, from_city text, to_city text,
              recipient_name text, recipient_phone text, recipient_email text, dropoff_addr text, pickup_addr text,
              driver_id uuid, price_cents integer, billing_mode text, created_at timestamptz, client_id uuid, contents text, tax_cents integer)
language plpgsql security definer set search_path to 'public' stable as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  return query
    select p.id,p.code,p.status,p.dropoff_type,p.size,p.from_city,p.to_city,
           p.recipient_name,p.recipient_phone,p.recipient_email,p.dropoff_addr,p.pickup_addr,
           p.driver_id,p.price_cents,p.billing_mode,p.created_at,p.client_id,p.contents_description,
           coalesce(p.tax_cents, round(p.price_cents * public.kolis_dest_tax_rate(p.to_city))::int)
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

-- Client history: add tax_cents per parcel.
create or replace function public.kolis_org_client_history(p_org uuid, p_client_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.id, 'code', p.code, 'created_at', p.created_at, 'status', p.status,
      'from_city', p.from_city, 'to_city', p.to_city, 'dropoff_type', p.dropoff_type,
      'size', p.size, 'price_cents', p.price_cents, 'dropoff_addr', p.dropoff_addr,
      'contents', p.contents_description,
      'tax_cents', coalesce(p.tax_cents, round(p.price_cents * public.kolis_dest_tax_rate(p.to_city))::int)
    ) as x
    from public.kolis_parcels p
    where p.org_id = p_org and p.client_id = p_client_id
      and coalesce(public.kolis_org_role(p_org),'') <> ''
  ) t;
$$;
