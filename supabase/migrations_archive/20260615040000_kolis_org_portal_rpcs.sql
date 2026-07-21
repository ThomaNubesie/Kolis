-- ═══════════════════════════════════════════════════════════════════════════
-- Kolis for Business — Phase 2: portal RPCs (shipper + carrier) + authoritative
-- SQL pricing. All SECURITY DEFINER, gated by kolis_org_role(p_org) with
-- coalesce(...) so non-members are rejected. Org shipments are billing_mode
-- 'invoice' (no per-parcel PaymentIntent). Carrier reads are PII-scrubbed.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Authoritative pricing in SQL (mirror of constants/pricing.ts + geo.ts).
-- KEEP IN SYNC with constants/pricing.ts: HUB_BASE/PER_KM, DOOR_BASE/PER_KM,
-- SIZE_MULT, DRIVER_SHARE, ROUTE_KM. estimatePrice rounds to whole dollars, then
-- the app multiplies by 100 — so cents are dollars*100.
create or replace function public.kolis_region_code(p_city text)
returns text language sql immutable set search_path to 'public' as $$
  select translate(lower((regexp_split_to_array(coalesce(trim(p_city),''), '\s+'))[1]),
                   'áàâäéèêëíìîïóòôöúùûüç','aaaaeeeeiiiioooouuuuc');
$$;

create or replace function public.kolis_route_km(p_from text, p_to text)
returns int language plpgsql immutable set search_path to 'public' as $$
declare a text; b text; k text;
begin
  a := public.kolis_region_code(p_from); b := public.kolis_region_code(p_to);
  if a is null or b is null or a = '' or b = '' or a = b then return 30; end if;
  k := case when a < b then a || '-' || b else b || '-' || a end;
  return case k
    when 'montreal-ottawa' then 200 when 'kingston-ottawa' then 195 when 'ottawa-toronto' then 450
    when 'gatineau-ottawa' then 20  when 'ottawa-quebec' then 480 when 'ottawa-trois-rivieres' then 360
    when 'ottawa-sherbrooke' then 380 when 'chicoutimi-ottawa' then 660 when 'moncton-ottawa' then 1100
    when 'montreal-quebec' then 250 when 'montreal-trois-rivieres' then 140 when 'montreal-toronto' then 540
    when 'kingston-montreal' then 290 when 'gatineau-montreal' then 200 when 'montreal-sherbrooke' then 150
    when 'chicoutimi-montreal' then 460 when 'moncton-montreal' then 1100
    when 'quebec-trois-rivieres' then 130 when 'chicoutimi-quebec' then 210 when 'quebec-sherbrooke' then 240
    when 'kingston-toronto' then 260
    else 250 end;
end; $$;

create or replace function public.kolis_estimate_price_cents(p_size text, p_drop text, p_from text, p_to text)
returns int language plpgsql immutable set search_path to 'public' as $$
declare km int; base numeric; mult numeric;
begin
  km := public.kolis_route_km(p_from, p_to);
  base := case when p_drop = 'door' then 5 + 0.20*km else 10 + 0.10*km end;
  mult := case p_size when 'envelope' then 0.75 when 'large' then 1.6 else 1.0 end;
  return (round(base * mult))::int * 100;
end; $$;

create or replace function public.kolis_driver_payout_cents(p_price_cents int, p_drop text)
returns int language sql immutable set search_path to 'public' as $$
  select (round(p_price_cents * case when p_drop = 'door' then 0.45 else (2.0/3.0) end))::int;
$$;

-- Unique human code, matching the app's KL-#### format.
create or replace function public.kolis_gen_parcel_code()
returns text language plpgsql volatile set search_path to 'public' as $$
declare c text;
begin
  loop
    c := 'KL-' || lpad((floor(random()*9000)+1000)::int::text, 4, '0');
    exit when not exists (select 1 from public.kolis_parcels where code = c);
  end loop;
  return c;
end; $$;

-- ── Address book ─────────────────────────────────────────────────────────────
create table if not exists public.kolis_org_addresses (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.kolis_orgs(id) on delete cascade,
  label     text,
  name      text,
  line1     text,
  city      text,
  province  text,
  postal    text,
  phone     text,
  created_at timestamptz not null default now());
alter table public.kolis_org_addresses enable row level security;
revoke all on public.kolis_org_addresses from anon, authenticated;
create index if not exists kolis_org_addresses_org on public.kolis_org_addresses(org_id);

-- ╔═══════════════════════ SHIPPER RPCs ══════════════════════════════════════╗
create or replace function public.kolis_org_overview(p_org uuid)
returns jsonb language plpgsql security definer set search_path to 'public' stable as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  return (select jsonb_build_object(
    'in_transit',   count(*) filter (where status in ('matched','dispatched','picked_up','in_transit')),
    'awaiting',     count(*) filter (where status in ('requested','received_at_hub') and driver_id is null),
    'delivered_30d',count(*) filter (where status='delivered' and delivered_at > now() - interval '30 days'),
    'total',        count(*),
    'accrued_cents',coalesce(sum(price_cents + coalesce(insurance_premium_cents,0))
                      filter (where status='delivered' and billing_mode='invoice' and billed_invoice_id is null),0)
  ) from public.kolis_parcels where org_id = p_org);
end; $$;

create or replace function public.kolis_org_shipments(p_org uuid, p_filter text default 'all', p_search text default null)
returns table(id uuid, code text, status text, dropoff_type text, size text, from_city text, to_city text,
              recipient_name text, driver_id uuid, price_cents int, billing_mode text, created_at timestamptz)
language plpgsql security definer set search_path to 'public' stable as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  return query
    select p.id,p.code,p.status,p.dropoff_type,p.size,p.from_city,p.to_city,
           p.recipient_name,p.driver_id,p.price_cents,p.billing_mode,p.created_at
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

create or replace function public.kolis_org_create_shipment(
  p_org uuid, p_dropoff_type text, p_size text, p_from_city text, p_to_city text,
  p_recipient_name text default null, p_recipient_phone text default null, p_recipient_email text default null,
  p_dropoff_addr text default null, p_pickup_addr text default null, p_contents text default null,
  p_declared_value_cents int default null, p_insured boolean default false, p_client_ref text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_code text; v_price int; v_status text;
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin','shipper') then raise exception 'forbidden'; end if;
  if (select status from public.kolis_orgs where id = p_org) <> 'active' then raise exception 'org_inactive'; end if;
  if p_dropoff_type not in ('door','zone','hub') then raise exception 'bad_dropoff'; end if;
  if p_size not in ('envelope','small','large') then raise exception 'bad_size'; end if;

  -- idempotency: same client_ref returns the existing shipment
  if p_client_ref is not null then
    select id, code into v_id, v_code from public.kolis_parcels where org_id = p_org and client_ref = p_client_ref;
    if v_id is not null then return jsonb_build_object('id',v_id,'code',v_code,'dedup',true); end if;
  end if;

  v_price  := public.kolis_estimate_price_cents(p_size, p_dropoff_type, p_from_city, p_to_city);
  v_status := case when p_dropoff_type = 'hub' then 'received_at_hub' else 'requested' end;

  insert into public.kolis_parcels(
    code, sender_id, status, dropoff_type, size, from_city, to_city, to_region,
    price_cents, driver_payout_cents, billing_mode, org_id, client_ref,
    recipient_name, recipient_phone, recipient_email, dropoff_addr, pickup_addr,
    contents_description, declared_value_cents, insured,
    insurance_premium_cents)
  values (
    public.kolis_gen_parcel_code(), auth.uid(), v_status, p_dropoff_type, p_size, p_from_city, p_to_city,
    public.kolis_region_code(p_to_city),
    v_price, public.kolis_driver_payout_cents(v_price, p_dropoff_type), 'invoice', p_org, p_client_ref,
    p_recipient_name, p_recipient_phone, p_recipient_email, p_dropoff_addr, p_pickup_addr,
    p_contents, p_declared_value_cents, coalesce(p_insured,false),
    case when p_insured and p_declared_value_cents is not null then round(p_declared_value_cents * 0.05)::int else 0 end)
  returning id, code into v_id, v_code;

  return jsonb_build_object('id', v_id, 'code', v_code);
end; $$;

create or replace function public.kolis_org_bulk_create(p_org uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; res jsonb := '[]'::jsonb; i int := 0; v_id uuid; v_code text; v_price int; v_drop text; v_size text;
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin','shipper') then raise exception 'forbidden'; end if;
  if (select status from public.kolis_orgs where id = p_org) <> 'active' then raise exception 'org_inactive'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      v_drop := coalesce(r->>'dropoff_type','door');
      v_size := coalesce(r->>'size','small');
      if v_drop not in ('door','zone','hub') then raise exception 'bad_dropoff'; end if;
      if v_size not in ('envelope','small','large') then raise exception 'bad_size'; end if;
      if coalesce(r->>'to_city','') = '' then raise exception 'missing to_city'; end if;

      if r ? 'client_ref' and r->>'client_ref' is not null then
        select id, code into v_id, v_code from public.kolis_parcels where org_id = p_org and client_ref = r->>'client_ref';
        if v_id is not null then
          res := res || jsonb_build_object('index',i,'ok',true,'id',v_id,'code',v_code,'dedup',true); continue;
        end if;
      end if;

      v_price := public.kolis_estimate_price_cents(v_size, v_drop, r->>'from_city', r->>'to_city');
      insert into public.kolis_parcels(
        code, sender_id, status, dropoff_type, size, from_city, to_city, to_region,
        price_cents, driver_payout_cents, billing_mode, org_id, client_ref,
        recipient_name, recipient_phone, recipient_email, dropoff_addr, contents_description,
        declared_value_cents, insured)
      values (
        public.kolis_gen_parcel_code(), auth.uid(),
        case when v_drop='hub' then 'received_at_hub' else 'requested' end,
        v_drop, v_size, r->>'from_city', r->>'to_city', public.kolis_region_code(r->>'to_city'),
        v_price, public.kolis_driver_payout_cents(v_price, v_drop), 'invoice', p_org, nullif(r->>'client_ref',''),
        r->>'to_name', r->>'to_phone', r->>'to_email', r->>'to_address', r->>'contents',
        nullif(r->>'declared_value_cents','')::int, coalesce((r->>'insured')::boolean,false))
      returning id, code into v_id, v_code;
      res := res || jsonb_build_object('index',i,'ok',true,'id',v_id,'code',v_code);
    exception when others then
      res := res || jsonb_build_object('index',i,'ok',false,'error',sqlerrm);
    end;
  end loop;
  return res;
end; $$;

create or replace function public.kolis_org_addresses(p_org uuid)
returns setof public.kolis_org_addresses language plpgsql security definer set search_path to 'public' stable as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  return query select * from public.kolis_org_addresses where org_id = p_org order by label, name;
end; $$;

create or replace function public.kolis_org_save_address(
  p_org uuid, p_label text, p_name text, p_line1 text, p_city text, p_province text, p_postal text, p_phone text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin','shipper') then raise exception 'forbidden'; end if;
  insert into public.kolis_org_addresses(org_id,label,name,line1,city,province,postal,phone)
  values (p_org,p_label,p_name,p_line1,p_city,p_province,p_postal,p_phone) returning id into v_id;
  return v_id;
end; $$;

-- ── Team / seats ─────────────────────────────────────────────────────────────
create or replace function public.kolis_org_team(p_org uuid)
returns jsonb language plpgsql security definer set search_path to 'public' stable as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id',m.user_id,'role',m.role,'full_name',pr.full_name,'email',pr.email) order by m.created_at)
      from public.kolis_org_members m left join public.kolis_profiles pr on pr.id = m.user_id
      where m.org_id = p_org),'[]'::jsonb),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('email',i.email,'role',i.role) order by i.created_at)
      from public.kolis_org_invites i where i.org_id = p_org and i.accepted_at is null),'[]'::jsonb));
end; $$;

create or replace function public.kolis_org_invite_member(p_org uuid, p_email text, p_role text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin') then raise exception 'forbidden'; end if;
  if p_role not in ('owner','admin','finance','shipper','dispatcher','driver') then raise exception 'bad_role'; end if;
  insert into public.kolis_org_invites(org_id,email,role,invited_by)
  values (p_org, lower(trim(p_email)), p_role, auth.uid())
  on conflict (org_id, lower(email)) do update set role = excluded.role, accepted_at = null, invited_by = auth.uid()
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.kolis_org_set_role(p_org uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin') then raise exception 'forbidden'; end if;
  if p_role not in ('owner','admin','finance','shipper','dispatcher','driver') then raise exception 'bad_role'; end if;
  -- never strip the last owner
  if p_role <> 'owner' and (select role from public.kolis_org_members where org_id=p_org and user_id=p_user) = 'owner'
     and (select count(*) from public.kolis_org_members where org_id=p_org and role='owner') <= 1 then
    raise exception 'cannot_demote_last_owner';
  end if;
  update public.kolis_org_members set role = p_role where org_id = p_org and user_id = p_user;
end; $$;

create or replace function public.kolis_org_remove_member(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin') then raise exception 'forbidden'; end if;
  if (select role from public.kolis_org_members where org_id=p_org and user_id=p_user) = 'owner'
     and (select count(*) from public.kolis_org_members where org_id=p_org and role='owner') <= 1 then
    raise exception 'cannot_remove_last_owner';
  end if;
  delete from public.kolis_org_members where org_id = p_org and user_id = p_user;
end; $$;

-- ╔═══════════════════════ CARRIER / FLEET RPCs ══════════════════════════════╗
-- PII-scrubbed: never returns sender_id, pickup_addr, or recipient contact.
create or replace function public.kolis_carrier_dispatch_board(p_org uuid)
returns table(id uuid, code text, size text, dropoff_type text, from_city text, to_city text,
              status text, driver_id uuid, driver_name text, driver_payout_cents int, mine boolean)
language plpgsql security definer set search_path to 'public' stable as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  return query
    select p.id,p.code,p.size,p.dropoff_type,p.from_city,p.to_city,p.status,p.driver_id,
           pr.full_name as driver_name, p.driver_payout_cents,
           (p.carrier_org_id = p_org) as mine
    from public.kolis_parcels p
    left join public.kolis_profiles pr on pr.id = p.driver_id
    -- the fleet's own parcels, plus the open invoice-mode pool it may claim.
    -- Personal card-mode parcels are NOT shown here — they deliver via the
    -- existing 4-digit-code escrow capture, never the carrier board.
    where p.carrier_org_id = p_org
       or (p.carrier_org_id is null and p.driver_id is null
           and p.status in ('requested','received_at_hub') and p.billing_mode = 'invoice')
    order by (p.carrier_org_id = p_org) desc, p.created_at desc;
end; $$;

create or replace function public.kolis_carrier_drivers(p_org uuid)
returns table(user_id uuid, role text, full_name text, identity_verified boolean, kolis_role text)
language plpgsql security definer set search_path to 'public' stable as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  return query
    select m.user_id, m.role, pr.full_name, coalesce(pr.identity_verified,false), pr.role
    from public.kolis_org_members m
    left join public.kolis_profiles pr on pr.id = m.user_id
    where m.org_id = p_org
    order by pr.full_name;
end; $$;

create or replace function public.kolis_carrier_assign(p_org uuid, p_parcel uuid, p_driver uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin','dispatcher') then raise exception 'forbidden'; end if;
  -- driver must be a member of this fleet AND a verified Kolis courier
  if not exists (select 1 from public.kolis_org_members where org_id = p_org and user_id = p_driver) then
    raise exception 'driver_not_in_fleet';
  end if;
  if not exists (select 1 from public.kolis_profiles where id = p_driver and identity_verified and role in ('courier','both')) then
    raise exception 'driver_not_verified';
  end if;
  update public.kolis_parcels
     set driver_id = p_driver, carrier_org_id = p_org, status = 'matched',
         preferred_driver_id = null, offer_expires_at = null
   where id = p_parcel and driver_id is null
     and status in ('requested','received_at_hub')
     and billing_mode = 'invoice'      -- card-mode parcels use the escrow/code flow
     and sender_id <> p_driver;        -- self-booking guard
  return found;
end; $$;

create or replace function public.kolis_carrier_advance_status(p_org uuid, p_parcel uuid, p_to text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_cur text;
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin','dispatcher') then raise exception 'forbidden'; end if;
  select status into v_cur from public.kolis_parcels
   where id = p_parcel and carrier_org_id = p_org and billing_mode = 'invoice';
  if v_cur is null then raise exception 'not_found'; end if;
  if not ((v_cur='matched' and p_to='picked_up')
       or (v_cur='picked_up' and p_to='in_transit')
       or (v_cur='in_transit' and p_to='delivered')) then
    raise exception 'illegal_transition';
  end if;
  update public.kolis_parcels
     set status = p_to, delivered_at = case when p_to='delivered' then now() else delivered_at end
   where id = p_parcel and carrier_org_id = p_org;
  return found;
end; $$;

-- ── Grants ──────────────────────────────────────────────────────────────────
grant execute on function
  public.kolis_region_code(text), public.kolis_route_km(text,text),
  public.kolis_estimate_price_cents(text,text,text,text), public.kolis_driver_payout_cents(int,text),
  public.kolis_org_overview(uuid),
  public.kolis_org_shipments(uuid,text,text),
  public.kolis_org_create_shipment(uuid,text,text,text,text,text,text,text,text,text,text,int,boolean,text),
  public.kolis_org_bulk_create(uuid,jsonb),
  public.kolis_org_addresses(uuid), public.kolis_org_save_address(uuid,text,text,text,text,text,text,text),
  public.kolis_org_team(uuid), public.kolis_org_invite_member(uuid,text,text),
  public.kolis_org_set_role(uuid,uuid,text), public.kolis_org_remove_member(uuid,uuid),
  public.kolis_carrier_dispatch_board(uuid), public.kolis_carrier_drivers(uuid),
  public.kolis_carrier_assign(uuid,uuid,uuid), public.kolis_carrier_advance_status(uuid,uuid,text)
to authenticated;

revoke execute on function
  public.kolis_org_overview(uuid),
  public.kolis_org_shipments(uuid,text,text),
  public.kolis_org_create_shipment(uuid,text,text,text,text,text,text,text,text,text,text,int,boolean,text),
  public.kolis_org_bulk_create(uuid,jsonb),
  public.kolis_org_addresses(uuid), public.kolis_org_save_address(uuid,text,text,text,text,text,text,text),
  public.kolis_org_team(uuid), public.kolis_org_invite_member(uuid,text,text),
  public.kolis_org_set_role(uuid,uuid,text), public.kolis_org_remove_member(uuid,uuid),
  public.kolis_carrier_dispatch_board(uuid), public.kolis_carrier_drivers(uuid),
  public.kolis_carrier_assign(uuid,uuid,uuid), public.kolis_carrier_advance_status(uuid,uuid,text)
from public, anon;
