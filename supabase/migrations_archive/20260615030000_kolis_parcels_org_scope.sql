-- ═══════════════════════════════════════════════════════════════════════════
-- Kolis for Business — Phase 1: org-scope kolis_parcels.
-- Adds org/carrier/billing columns, a guard trigger so clients can never set
-- those server-managed fields (anti-fraud), a shipper-org SELECT policy, and
-- the kolis_my_shipments RPC that drives the mobile org switch. Personal +
-- driver flows are unchanged (existing policies are preserved).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.kolis_parcels
  add column if not exists org_id            uuid references public.kolis_orgs(id),
  add column if not exists carrier_org_id    uuid references public.kolis_orgs(id),
  add column if not exists billing_mode      text not null default 'card' check (billing_mode in ('card','invoice')),
  add column if not exists billed_invoice_id uuid,
  add column if not exists accrued_at        timestamptz,
  add column if not exists client_ref        text;

create index if not exists kolis_parcels_org_id         on public.kolis_parcels(org_id);
create index if not exists kolis_parcels_carrier_org_id on public.kolis_parcels(carrier_org_id);
-- idempotency for bulk/API creates
create unique index if not exists kolis_parcels_org_client_ref on public.kolis_parcels(org_id, client_ref) where client_ref is not null;
-- the billing cron's hot path
create index if not exists kolis_parcels_billable on public.kolis_parcels(org_id)
  where billing_mode = 'invoice' and status = 'delivered' and billed_invoice_id is null;

-- ── Guard: org_id / carrier_org_id / billing_mode / billed_invoice_id / accrued_at
-- and the money columns may only be set by privileged server paths (SECURITY
-- DEFINER RPCs run as the table owner; edge functions use service_role). A
-- direct client mutation (role authenticated) attempting to set/change them is
-- rejected. INVOKER (not DEFINER) so current_user reflects the real caller.
create or replace function public.kolis_parcels_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if current_user in ('postgres','supabase_admin','supabase_auth_admin','service_role') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.org_id is not null or new.carrier_org_id is not null
       or coalesce(new.billing_mode,'card') <> 'card' or new.billed_invoice_id is not null then
      raise exception 'kolis_parcels: org/billing fields are managed server-side';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.org_id            is distinct from old.org_id
       or new.carrier_org_id is distinct from old.carrier_org_id
       or new.billing_mode   is distinct from old.billing_mode
       or new.billed_invoice_id is distinct from old.billed_invoice_id
       or new.accrued_at     is distinct from old.accrued_at
       or new.price_cents    is distinct from old.price_cents
       or new.driver_payout_cents is distinct from old.driver_payout_cents then
      raise exception 'kolis_parcels: org/billing fields are managed server-side';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists kolis_parcels_guard_trg on public.kolis_parcels;
create trigger kolis_parcels_guard_trg before insert or update on public.kolis_parcels
  for each row execute function public.kolis_parcels_guard();

-- ── RLS: shipper-org members can read their org's shipments (additive; personal
-- and driver policies untouched). Carrier members do NOT get base-table access —
-- they read via the PII-scrubbed kolis_carrier_* RPCs (Phase 2).
drop policy if exists kolis_parcels_org_select on public.kolis_parcels;
create policy kolis_parcels_org_select on public.kolis_parcels for select
  using (org_id is not null and coalesce(public.kolis_org_role(org_id),'') <> '');

-- ── The org-aware shipment list (replaces the mobile listMine raw select).
-- p_org NULL  → caller's personal parcels (sender, not attached to an org)
-- p_org set   → that org's shipments, only if the caller is a member.
create or replace function public.kolis_my_shipments(p_org uuid default null)
returns setof public.kolis_parcels
language plpgsql security definer set search_path to 'public' stable as $$
begin
  if p_org is null then
    return query
      select * from public.kolis_parcels
      where sender_id = auth.uid() and org_id is null
      order by created_at desc;
  else
    if coalesce(public.kolis_org_role(p_org),'') = '' then
      raise exception 'forbidden';
    end if;
    return query
      select * from public.kolis_parcels
      where org_id = p_org
      order by created_at desc;
  end if;
end; $$;

grant execute on function public.kolis_my_shipments(uuid) to authenticated;
revoke execute on function public.kolis_my_shipments(uuid) from public, anon;
