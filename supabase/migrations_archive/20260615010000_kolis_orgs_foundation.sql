-- ═══════════════════════════════════════════════════════════════════════════
-- Kolis for Business — Phase 0: organization foundations.
-- Orgs + members + invites, the kolis_org_role(p_org) membership gate (the org
-- analog of kolis_admin_role()), admin-provisioning RPCs, and member self RPCs.
-- All access goes through SECURITY DEFINER RPCs; tables are locked to
-- anon/authenticated (mirrors the kolis_admin_console pattern). No behaviour
-- change to existing personal/driver flows.
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto;

-- ── Tables ──────────────────────────────────────────────────────────────────
create table if not exists public.kolis_orgs (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  type               text not null check (type in ('shipper','carrier','both')),
  billing_email      text,
  stripe_customer_id text,
  net_terms_days     int  not null default 30,
  discount_rate      numeric not null default 0,      -- volume discount, e.g. 0.12
  platform_fee_rate  numeric not null default 0.15,   -- carrier payout fee
  credit_limit_cents bigint not null default 0,
  kyb_status         text not null default 'pending' check (kyb_status in ('pending','verified','rejected')),
  status             text not null default 'active'  check (status in ('active','suspended')),
  created_at         timestamptz not null default now());
alter table public.kolis_orgs enable row level security;

create table if not exists public.kolis_org_members (
  org_id     uuid not null references public.kolis_orgs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner','admin','finance','shipper','dispatcher','driver')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id));
alter table public.kolis_org_members enable row level security;

create table if not exists public.kolis_org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.kolis_orgs(id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('owner','admin','finance','shipper','dispatcher','driver')),
  invited_by  uuid,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz);
create unique index if not exists kolis_org_invites_org_email on public.kolis_org_invites (org_id, lower(email));
alter table public.kolis_org_invites enable row level security;

-- Tables are reachable only through the SECURITY DEFINER RPCs below.
revoke all on public.kolis_orgs, public.kolis_org_members, public.kolis_org_invites from anon, authenticated;

-- ── Membership gate (org analog of kolis_admin_role) ────────────────────────
create or replace function public.kolis_org_role(p_org uuid)
returns text language sql security definer set search_path to 'public' stable as $$
  select role from public.kolis_org_members where org_id = p_org and user_id = auth.uid();
$$;

-- ── Admin provisioning RPCs (gated by existing staff role) ───────────────────
-- NOTE: kolis_admin_role() returns NULL for non-staff, and `NULL not in (...)`
-- is NULL (not TRUE), so a bare `if role not in (...)` guard would NOT fire for
-- non-staff. Always coalesce to '' so the guard rejects non-staff correctly.
create or replace function public.kolis_admin_create_org(
  p_name text, p_type text, p_billing_email text default null,
  p_net_terms int default 30, p_discount numeric default 0, p_credit_limit_cents bigint default 0)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if coalesce(public.kolis_admin_role(),'') not in ('owner','admin') then raise exception 'forbidden'; end if;
  if p_type not in ('shipper','carrier','both') then raise exception 'bad_type'; end if;
  insert into public.kolis_orgs(name, type, billing_email, net_terms_days, discount_rate, credit_limit_cents)
  values (p_name, p_type, p_billing_email, coalesce(p_net_terms,30), coalesce(p_discount,0), coalesce(p_credit_limit_cents,0))
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.kolis_admin_set_org_limits(
  p_org uuid, p_credit_limit_cents bigint default null, p_discount numeric default null,
  p_net_terms int default null, p_platform_fee numeric default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(public.kolis_admin_role(),'') not in ('owner','admin','finance') then raise exception 'forbidden'; end if;
  update public.kolis_orgs set
    credit_limit_cents = coalesce(p_credit_limit_cents, credit_limit_cents),
    discount_rate      = coalesce(p_discount, discount_rate),
    net_terms_days     = coalesce(p_net_terms, net_terms_days),
    platform_fee_rate  = coalesce(p_platform_fee, platform_fee_rate)
  where id = p_org;
end; $$;

create or replace function public.kolis_admin_set_kyb(p_org uuid, p_status text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(public.kolis_admin_role(),'') not in ('owner','admin') then raise exception 'forbidden'; end if;
  if p_status not in ('pending','verified','rejected') then raise exception 'bad_status'; end if;
  update public.kolis_orgs set kyb_status = p_status where id = p_org;
end; $$;

create or replace function public.kolis_admin_set_org_status(p_org uuid, p_status text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(public.kolis_admin_role(),'') not in ('owner','admin') then raise exception 'forbidden'; end if;
  if p_status not in ('active','suspended') then raise exception 'bad_status'; end if;
  update public.kolis_orgs set status = p_status where id = p_org;
end; $$;

create or replace function public.kolis_admin_org_invite(p_org uuid, p_email text, p_role text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if coalesce(public.kolis_admin_role(),'') not in ('owner','admin') then raise exception 'forbidden'; end if;
  if p_role not in ('owner','admin','finance','shipper','dispatcher','driver') then raise exception 'bad_role'; end if;
  insert into public.kolis_org_invites(org_id, email, role, invited_by)
  values (p_org, lower(trim(p_email)), p_role, auth.uid())
  on conflict (org_id, lower(email)) do update set role = excluded.role, accepted_at = null, invited_by = auth.uid()
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.kolis_admin_orgs()
returns setof public.kolis_orgs language sql security definer set search_path to 'public' stable as $$
  select o.* from public.kolis_orgs o where public.kolis_is_staff() order by o.created_at desc;
$$;

create or replace function public.kolis_admin_org_members(p_org uuid)
returns table(user_id uuid, role text, full_name text, email text, created_at timestamptz)
language sql security definer set search_path to 'public' stable as $$
  select m.user_id, m.role, p.full_name, p.email, m.created_at
  from public.kolis_org_members m
  left join public.kolis_profiles p on p.id = m.user_id
  where public.kolis_is_staff() and m.org_id = p_org
  order by m.created_at;
$$;

-- ── Member self RPCs ────────────────────────────────────────────────────────
create or replace function public.kolis_my_orgs()
returns table(org_id uuid, name text, type text, role text, status text, kyb_status text)
language sql security definer set search_path to 'public' stable as $$
  select o.id, o.name, o.type, m.role, o.status, o.kyb_status
  from public.kolis_org_members m
  join public.kolis_orgs o on o.id = m.org_id
  where m.user_id = auth.uid()
  order by o.name;
$$;

-- Accept all pending invites that match any email the caller owns. Kolis users
-- sign up by phone, so the address usually lives in kolis_profiles.email rather
-- than auth.users.email — match against both.
create or replace function public.kolis_accept_org_invite()
returns int language plpgsql security definer set search_path to 'public' as $$
declare v_count int := 0; r record;
begin
  for r in
    select i.* from public.kolis_org_invites i
    where i.accepted_at is null
      and lower(i.email) in (
        select lower(e) from (
          select (select email from auth.users          where id = auth.uid()) as e
          union all
          select (select email from public.kolis_profiles where id = auth.uid())
        ) s where s.e is not null
      )
  loop
    insert into public.kolis_org_members(org_id, user_id, role)
    values (r.org_id, auth.uid(), r.role)
    on conflict (org_id, user_id) do update set role = excluded.role;
    update public.kolis_org_invites set accepted_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;

-- ── Grants ──────────────────────────────────────────────────────────────────
grant execute on function
  public.kolis_org_role(uuid),
  public.kolis_admin_create_org(text,text,text,int,numeric,bigint),
  public.kolis_admin_set_org_limits(uuid,bigint,numeric,int,numeric),
  public.kolis_admin_set_kyb(uuid,text),
  public.kolis_admin_set_org_status(uuid,text),
  public.kolis_admin_org_invite(uuid,text,text),
  public.kolis_admin_orgs(),
  public.kolis_admin_org_members(uuid),
  public.kolis_my_orgs(),
  public.kolis_accept_org_invite()
to authenticated;

revoke execute on function
  public.kolis_org_role(uuid),
  public.kolis_admin_create_org(text,text,text,int,numeric,bigint),
  public.kolis_admin_set_org_limits(uuid,bigint,numeric,int,numeric),
  public.kolis_admin_set_kyb(uuid,text),
  public.kolis_admin_set_org_status(uuid,text),
  public.kolis_admin_org_invite(uuid,text,text),
  public.kolis_admin_orgs(),
  public.kolis_admin_org_members(uuid),
  public.kolis_my_orgs(),
  public.kolis_accept_org_invite()
from public, anon;
