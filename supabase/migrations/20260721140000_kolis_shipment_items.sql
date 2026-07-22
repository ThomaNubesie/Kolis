-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PRODUCTS Phase 2 — product → client → shipping order.                     ║
-- ║  A shipment can carry product line-items (the manifest / packing list).   ║
-- ║  Billing stays SHIPPING-ONLY: Kolis prices shipping exactly as today; the ║
-- ║  goods value is informational (feeds declared value / insurance) and is   ║
-- ║  NOT charged. Creating an order decrements product stock.                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Manifest value on the parcel (informational; not billed) ──
alter table public.kolis_parcels
  add column if not exists goods_value_cents int not null default 0;

-- ── Line-items table ──
create table if not exists public.kolis_shipment_items (
  id               uuid primary key default gen_random_uuid(),
  parcel_id        uuid not null references public.kolis_parcels(id) on delete cascade,
  product_id       uuid references public.kolis_org_products(id) on delete set null,
  name_snapshot    text not null,          -- captured at order time (catalog may change later)
  unit_price_cents int  not null,
  qty              int  not null check (qty > 0),
  line_cents       int  not null,
  tax_class        text not null default 'standard',
  created_at       timestamptz default now()
);
create index if not exists idx_kolis_shipment_items_parcel on public.kolis_shipment_items(parcel_id);
alter table public.kolis_shipment_items enable row level security;

-- ── Shipping-cost preview (role-gated wrapper over the pricing engine) ──
create or replace function public.kolis_org_ship_quote(
  p_org uuid, p_size text, p_dropoff_type text, p_from_city text, p_to_city text)
returns int language plpgsql stable security definer set search_path to 'public' as $$
begin
  if coalesce(kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  return public.kolis_org_price_cents(p_org, p_size, p_dropoff_type, p_from_city, p_to_city);
end; $$;

-- ── Create a shipping order for a client from catalog products ──
-- Reuses kolis_org_create_shipment for all pricing/code/payout/status/credit
-- logic, then attaches the client, the line-items, and decrements stock.
create or replace function public.kolis_org_create_product_order(
  p_org uuid, p_client_id uuid, p_dropoff_type text, p_size text,
  p_from_city text, p_to_city text, p_dropoff_addr text default null,
  p_pickup_addr text default null, p_items jsonb default '[]'::jsonb, p_insured boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_client public.kolis_org_clients;
  v_ship jsonb; v_parcel_id uuid;
  r jsonb; v_prod public.kolis_org_products; v_qty int;
  v_goods int := 0; v_contents text := '';
begin
  if coalesce(kolis_org_role(p_org),'') not in ('owner','admin','shipper') then raise exception 'forbidden'; end if;
  select * into v_client from public.kolis_org_clients where id = p_client_id and org_id = p_org;
  if v_client.id is null then raise exception 'client_not_found'; end if;
  if coalesce(jsonb_array_length(p_items), 0) = 0 then raise exception 'no_items'; end if;

  -- Pass 1: validate products, build the goods value + contents summary
  for r in select * from jsonb_array_elements(p_items) loop
    select * into v_prod from public.kolis_org_products where id = (r->>'product_id')::uuid and org_id = p_org;
    if v_prod.id is null then raise exception 'product_not_found'; end if;
    v_qty := greatest(coalesce((r->>'qty')::int, 1), 1);
    v_goods := v_goods + v_prod.price_cents * v_qty;
    v_contents := v_contents || case when v_contents = '' then '' else ', ' end || v_qty || '× ' || v_prod.name;
  end loop;

  -- Create the shipment (shipping priced/coded/charged exactly as a normal order).
  -- Declared value = goods value so insurance (if chosen) covers the contents.
  v_ship := public.kolis_org_create_shipment(
    p_org, p_dropoff_type, p_size, p_from_city, p_to_city,
    v_client.full_name, v_client.mobile, v_client.email,
    coalesce(nullif(btrim(p_dropoff_addr), ''), v_client.address),
    p_pickup_addr, v_contents, v_goods, p_insured, null, null);
  v_parcel_id := (v_ship->>'id')::uuid;

  -- Pass 2: race-safe stock decrement + line-item insert
  for r in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(coalesce((r->>'qty')::int, 1), 1);
    update public.kolis_org_products
      set qty_in_stock = qty_in_stock - v_qty, updated_at = now()
      where id = (r->>'product_id')::uuid and org_id = p_org
        and (allow_backorder or qty_in_stock >= v_qty)
      returning * into v_prod;
    if v_prod.id is null then raise exception 'insufficient_stock'; end if;
    insert into public.kolis_shipment_items(parcel_id, product_id, name_snapshot, unit_price_cents, qty, line_cents, tax_class)
      values (v_parcel_id, v_prod.id, v_prod.name, v_prod.price_cents, v_qty, v_prod.price_cents * v_qty, v_prod.tax_class);
  end loop;

  -- Link the client + record the manifest value on the parcel
  update public.kolis_parcels set client_id = p_client_id, goods_value_cents = v_goods
    where id = v_parcel_id and org_id = p_org;

  return v_ship || jsonb_build_object('goods_value_cents', v_goods, 'item_count', jsonb_array_length(p_items));
end; $$;

-- ── List the line-items of a shipment (for the order confirmation / history) ──
create or replace function public.kolis_org_shipment_items(p_org uuid, p_parcel_id uuid)
returns setof public.kolis_shipment_items
language sql stable security definer set search_path to 'public' as $$
  select i.* from public.kolis_shipment_items i
  join public.kolis_parcels p on p.id = i.parcel_id
  where i.parcel_id = p_parcel_id and p.org_id = p_org and coalesce(kolis_org_role(p_org),'') <> ''
  order by i.created_at;
$$;
