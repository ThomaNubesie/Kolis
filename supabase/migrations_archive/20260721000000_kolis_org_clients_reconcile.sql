-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Reconcile the CLIENTS (address-book) schema into migrations.              ║
-- ║  The kolis_org_clients table, the kolis_parcels.client_id column, and the  ║
-- ║  save/list/get/delete RPCs were created directly against production and    ║
-- ║  never captured in a migration (client_history lives in the tax-by-        ║
-- ║  destination migration). This file makes the repo reproduce prod. It is    ║
-- ║  fully idempotent — a no-op against the live DB, correct on a fresh one.   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Table: a business's saved clients (people it ships to) ──
create table if not exists public.kolis_org_clients (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.kolis_orgs(id) on delete cascade,
  full_name   text not null,
  email       text,
  mobile      text,
  home_phone  text,
  work_phone  text,
  address     text,
  city        text,
  province    text,
  postal      text,
  notes       text,
  country     text default 'CA',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists idx_kolis_org_clients_org
  on public.kolis_org_clients using btree (org_id);

-- RLS on, no policies: all access flows through the SECURITY DEFINER RPCs
-- below (which bypass RLS); direct anon/authenticated access is denied.
alter table public.kolis_org_clients enable row level security;

-- ── Link parcels → the client they were shipped to ──
alter table public.kolis_parcels
  add column if not exists client_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'kolis_parcels_client_id_fkey'
  ) then
    alter table public.kolis_parcels
      add constraint kolis_parcels_client_id_fkey
      foreign key (client_id) references public.kolis_org_clients(id) on delete set null;
  end if;
end $$;

-- ── RPCs (SECURITY DEFINER + role gate). Reproduced verbatim from prod. ──

create or replace function public.kolis_org_client_save(
  p_org uuid, p_id uuid, p_full_name text, p_email text, p_mobile text,
  p_home text, p_work text, p_address text, p_city text, p_province text,
  p_postal text, p_notes text, p_country text default 'CA')
returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin','shipper') then raise exception 'forbidden'; end if;
  if coalesce(nullif(btrim(p_full_name),''),'') = '' then raise exception 'name_required'; end if;
  if coalesce(nullif(btrim(p_email),''),'')   = '' then raise exception 'email_required'; end if;
  if coalesce(nullif(btrim(p_mobile),''),'')  = '' then raise exception 'phone_required'; end if;
  if coalesce(nullif(btrim(p_address),''),'') = '' then raise exception 'address_required'; end if;
  if p_id is null then
    insert into public.kolis_org_clients(org_id, full_name, email, mobile, home_phone, work_phone, address, city, province, postal, country, notes)
    values (p_org, btrim(p_full_name), nullif(btrim(p_email),''), nullif(btrim(p_mobile),''), nullif(btrim(p_home),''), nullif(btrim(p_work),''),
            nullif(btrim(p_address),''), nullif(btrim(p_city),''), nullif(btrim(p_province),''), nullif(btrim(p_postal),''), coalesce(nullif(btrim(p_country),''),'CA'), nullif(btrim(p_notes),''))
    returning id into v_id;
  else
    update public.kolis_org_clients set
      full_name=btrim(p_full_name), email=nullif(btrim(p_email),''), mobile=nullif(btrim(p_mobile),''),
      home_phone=nullif(btrim(p_home),''), work_phone=nullif(btrim(p_work),''), address=nullif(btrim(p_address),''),
      city=nullif(btrim(p_city),''), province=nullif(btrim(p_province),''), postal=nullif(btrim(p_postal),''),
      country=coalesce(nullif(btrim(p_country),''),'CA'), notes=nullif(btrim(p_notes),''), updated_at=now()
    where id=p_id and org_id=p_org returning id into v_id;
    if v_id is null then raise exception 'not_found'; end if;
  end if;
  return v_id;
end; $function$;

create or replace function public.kolis_org_clients_list(p_org uuid, p_search text default null)
returns setof public.kolis_org_clients
language sql stable security definer set search_path to 'public'
as $function$
  select * from public.kolis_org_clients c
  where c.org_id = p_org and coalesce(public.kolis_org_role(p_org),'') <> ''
    and (p_search is null or p_search = ''
      or c.full_name ilike '%'||p_search||'%' or c.email ilike '%'||p_search||'%'
      or c.mobile ilike '%'||p_search||'%' or c.city ilike '%'||p_search||'%')
  order by c.full_name;
$function$;

create or replace function public.kolis_org_client_get(p_org uuid, p_id uuid)
returns public.kolis_org_clients
language sql stable security definer set search_path to 'public'
as $function$
  select * from public.kolis_org_clients c
  where c.id = p_id and c.org_id = p_org and coalesce(public.kolis_org_role(p_org),'') <> '';
$function$;

create or replace function public.kolis_org_client_delete(p_org uuid, p_id uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin','shipper') then raise exception 'forbidden'; end if;
  delete from public.kolis_org_clients where id=p_id and org_id=p_org;
end; $function$;

-- Note: kolis_org_client_history(p_org, p_client_id) is already defined in
-- 20260720150000_kolis_tax_by_destination.sql — intentionally not duplicated here.
