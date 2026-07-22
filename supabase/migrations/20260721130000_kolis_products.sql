-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PRODUCTS catalog (per-business). Phase 1.                                 ║
-- ║  Each business has a private catalog; product numbers are unique within   ║
-- ║  the org as {PREFIX}-{00001} (mirrors the KL-#### parcel-code approach).  ║
-- ║  Billing is SHIPPING-ONLY: products become the line-items/manifest of a   ║
-- ║  shipment (Phase 2); Kolis bills shipping exactly as today.               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Per-org product code prefix + running sequence ──
alter table public.kolis_orgs
  add column if not exists product_code_prefix text,
  add column if not exists product_seq bigint not null default 0;

-- Derive a 3-letter uppercase prefix from the org name on first use (editable).
create or replace function public.kolis_org_product_prefix(p_org uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v text;
begin
  select product_code_prefix into v from public.kolis_orgs where id = p_org;
  if coalesce(nullif(btrim(v),''),'') <> '' then return v; end if;
  select upper(regexp_replace(coalesce(name,''), '[^A-Za-z]', '', 'g')) into v
    from public.kolis_orgs where id = p_org;
  v := coalesce(nullif(left(v, 3), ''), 'ORG');
  update public.kolis_orgs set product_code_prefix = v
    where id = p_org and coalesce(nullif(btrim(product_code_prefix),''),'') = '';
  return v;
end; $$;

-- ── 2. Products table ──
create table if not exists public.kolis_org_products (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.kolis_orgs(id) on delete cascade,
  product_code         text not null,
  name                 text not null,
  description          text,
  price_cents          int  not null default 0,      -- per unit
  currency             text not null default 'CAD',
  qty_in_stock         int  not null default 0,
  low_stock_at         int  not null default 0,
  allow_backorder      bool not null default false,   -- if false, orders block at 0 stock
  sku                  text,
  category             text,
  weight_g             int,
  default_size         text,                          -- envelope|small|large (feeds ship quote)
  declared_value_cents int,                           -- informational: feeds insurance/label
  tax_class            text not null default 'standard', -- reserved (shipping-only billing today)
  handling_notes       text,
  image_url            text,                          -- public URL in org-products bucket
  active               bool not null default true,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  unique (org_id, product_code)
);
create index if not exists idx_kolis_org_products_org on public.kolis_org_products(org_id);

-- RLS on, no policies: access only via the SECURITY DEFINER RPCs below.
alter table public.kolis_org_products enable row level security;

-- ── 3. Per-org code generator: PREFIX-00001, unique within the org ──
create or replace function public.kolis_gen_product_code(p_org uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_prefix text; v_seq bigint; v_code text;
begin
  v_prefix := public.kolis_org_product_prefix(p_org);
  loop
    update public.kolis_orgs set product_seq = product_seq + 1
      where id = p_org returning product_seq into v_seq;
    v_code := v_prefix || '-' || lpad(v_seq::text, 5, '0');
    exit when not exists (
      select 1 from public.kolis_org_products where org_id = p_org and product_code = v_code);
  end loop;
  return v_code;
end; $$;

-- ── 4. CRUD RPCs (role gate: owner/admin/shipper) ──
create or replace function public.kolis_org_product_save(
  p_org uuid, p_id uuid, p_name text, p_description text, p_price_cents int,
  p_qty int, p_low_stock_at int, p_sku text, p_category text, p_weight_g int,
  p_default_size text, p_declared_value_cents int, p_handling_notes text,
  p_image_url text, p_active bool default true, p_allow_backorder bool default false)
returns public.kolis_org_products
language plpgsql security definer set search_path to 'public' as $$
declare v public.kolis_org_products;
begin
  if coalesce(kolis_org_role(p_org),'') not in ('owner','admin','shipper') then raise exception 'forbidden'; end if;
  if coalesce(nullif(btrim(p_name),''),'') = '' then raise exception 'name_required'; end if;
  if p_id is null then
    insert into public.kolis_org_products(
      org_id, product_code, name, description, price_cents, qty_in_stock, low_stock_at,
      sku, category, weight_g, default_size, declared_value_cents, handling_notes,
      image_url, active, allow_backorder)
    values (
      p_org, public.kolis_gen_product_code(p_org), btrim(p_name), nullif(btrim(p_description),''),
      greatest(coalesce(p_price_cents,0),0), greatest(coalesce(p_qty,0),0), greatest(coalesce(p_low_stock_at,0),0),
      nullif(btrim(p_sku),''), nullif(btrim(p_category),''), p_weight_g, nullif(btrim(p_default_size),''),
      p_declared_value_cents, nullif(btrim(p_handling_notes),''), nullif(btrim(p_image_url),''),
      coalesce(p_active,true), coalesce(p_allow_backorder,false))
    returning * into v;
  else
    update public.kolis_org_products set
      name=btrim(p_name), description=nullif(btrim(p_description),''),
      price_cents=greatest(coalesce(p_price_cents,0),0), qty_in_stock=greatest(coalesce(p_qty,0),0),
      low_stock_at=greatest(coalesce(p_low_stock_at,0),0), sku=nullif(btrim(p_sku),''),
      category=nullif(btrim(p_category),''), weight_g=p_weight_g, default_size=nullif(btrim(p_default_size),''),
      declared_value_cents=p_declared_value_cents, handling_notes=nullif(btrim(p_handling_notes),''),
      image_url=nullif(btrim(p_image_url),''), active=coalesce(p_active,true),
      allow_backorder=coalesce(p_allow_backorder,false), updated_at=now()
    where id=p_id and org_id=p_org returning * into v;
    if v.id is null then raise exception 'not_found'; end if;
  end if;
  return v;
end; $$;

create or replace function public.kolis_org_products_list(
  p_org uuid, p_search text default null, p_status text default null)
returns setof public.kolis_org_products
language sql stable security definer set search_path to 'public' as $$
  select * from public.kolis_org_products p
  where p.org_id = p_org and coalesce(kolis_org_role(p_org),'') <> ''
    and (p_search is null or p_search = ''
      or p.name ilike '%'||p_search||'%' or p.product_code ilike '%'||p_search||'%'
      or p.sku ilike '%'||p_search||'%' or p.category ilike '%'||p_search||'%')
    and (p_status is null or p_status = '' or p_status = 'all'
      or (p_status = 'in_stock' and p.qty_in_stock > p.low_stock_at)
      or (p_status = 'low'      and p.qty_in_stock <= p.low_stock_at and p.qty_in_stock > 0)
      or (p_status = 'out'      and p.qty_in_stock <= 0))
  order by p.name;
$$;

create or replace function public.kolis_org_product_get(p_org uuid, p_id uuid)
returns public.kolis_org_products
language sql stable security definer set search_path to 'public' as $$
  select * from public.kolis_org_products p
  where p.id = p_id and p.org_id = p_org and coalesce(kolis_org_role(p_org),'') <> '';
$$;

create or replace function public.kolis_org_product_delete(p_org uuid, p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(kolis_org_role(p_org),'') not in ('owner','admin','shipper') then raise exception 'forbidden'; end if;
  delete from public.kolis_org_products where id = p_id and org_id = p_org;
end; $$;

-- ── 5. Bulk import: array of rows → generated codes; returns per-row result ──
create or replace function public.kolis_org_products_bulk_import(p_org uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; v_created int := 0; v_failed int := 0; v_errors jsonb := '[]'::jsonb; i int := 0;
begin
  if coalesce(kolis_org_role(p_org),'') not in ('owner','admin','shipper') then raise exception 'forbidden'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    i := i + 1;
    begin
      if coalesce(nullif(btrim(r->>'name'),''),'') = '' then raise exception 'name required'; end if;
      insert into public.kolis_org_products(
        org_id, product_code, name, description, price_cents, qty_in_stock, low_stock_at,
        sku, category, weight_g, default_size, image_url)
      values (
        p_org, public.kolis_gen_product_code(p_org), btrim(r->>'name'), nullif(btrim(r->>'description'),''),
        greatest(coalesce((r->>'price_cents')::int, round(coalesce((r->>'price')::numeric,0)*100)::int, 0),0),
        greatest(coalesce((r->>'qty')::int,0),0), greatest(coalesce((r->>'low_stock_at')::int,0),0),
        nullif(btrim(r->>'sku'),''), nullif(btrim(r->>'category'),''), (r->>'weight_g')::int,
        nullif(btrim(r->>'default_size'),''), nullif(btrim(r->>'image_url'),''));
      v_created := v_created + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object('row', i, 'name', r->>'name', 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('created', v_created, 'failed', v_failed, 'errors', v_errors);
end; $$;

-- ── 6. Product-image storage bucket (mirrors org-logos: public read, org-write) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-products', 'org-products', true, 5242880,
        array['image/png','image/jpeg','image/jpg','image/webp','image/gif'])
on conflict (id) do nothing;

-- path convention: {org_id}/{product_id}.{ext}
drop policy if exists "org products public read" on storage.objects;
create policy "org products public read" on storage.objects
  for select using (bucket_id = 'org-products');

drop policy if exists "org members write products" on storage.objects;
create policy "org members write products" on storage.objects
  for insert with check (
    bucket_id = 'org-products'
    and coalesce(kolis_org_role(((storage.foldername(name))[1])::uuid),'') in ('owner','admin','shipper'));

drop policy if exists "org members update products" on storage.objects;
create policy "org members update products" on storage.objects
  for update using (
    bucket_id = 'org-products'
    and coalesce(kolis_org_role(((storage.foldername(name))[1])::uuid),'') in ('owner','admin','shipper'));

drop policy if exists "org members delete products" on storage.objects;
create policy "org members delete products" on storage.objects
  for delete using (
    bucket_id = 'org-products'
    and coalesce(kolis_org_role(((storage.foldername(name))[1])::uuid),'') in ('owner','admin','shipper'));
