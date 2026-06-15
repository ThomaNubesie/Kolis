-- ═══════════════════════════════════════════════════════════════════════════
-- Kolis for Business — Phase 3a: billing engine (accrual + monthly close).
-- Kolis BILLS THE SHIPPER ORG: delivered invoice-mode parcels accrue as lines,
-- a monthly close builds one invoice per org (sum of price_cents + tax −
-- volume discount, net terms). Carrier payouts (paying the fleet) are Phase 3c
-- and use driver_payout_cents — independent of these numbers.
--
-- Money-safety is structural: unique(org_id, period) on invoices, unique
-- parcel_id on lines, billed_invoice_id set in the same predicate, advisory
-- lock on the close. Re-running close/issue can never double-bill.
-- Stripe issuance is a separate edge function (kolis-issue-invoices) gated to
-- TEST keys until go-live; this SQL never calls Stripe.
-- ═══════════════════════════════════════════════════════════════════════════

-- Org billing locale (drives the tax line).
alter table public.kolis_orgs
  add column if not exists country  text not null default 'CA',
  add column if not exists province text not null default 'ON';

-- ── Tax config (seeded from constants/tax.ts — single source for SQL paths) ──
create table if not exists public.kolis_tax_config (
  country  text not null,
  province text,                       -- null = national VAT; set = CA province
  rate     numeric not null);
-- expression unique index (nullable province) — also the ON CONFLICT target below
create unique index if not exists kolis_tax_config_key on public.kolis_tax_config (country, coalesce(province, '*'));
revoke all on public.kolis_tax_config from anon, authenticated;

insert into public.kolis_tax_config(country, province, rate) values
  ('CA','ON',0.13),('CA','QC',0.14975),('CA','NB',0.15),('CA','NL',0.15),('CA','NS',0.15),
  ('CA','PE',0.15),('CA','BC',0.12),('CA','MB',0.12),('CA','SK',0.11),('CA','AB',0.05),
  ('CA','NT',0.05),('CA','NU',0.05),('CA','YT',0.05),
  ('CA',null,0.13),('US',null,0),('FR',null,0.20),('UK',null,0.20),('MA',null,0.20),
  ('SN',null,0.18),('CI',null,0.18),('RW',null,0.18),('KE',null,0.16),('GH',null,0.15),
  ('CM',null,0.1925),('NG',null,0.075)
on conflict (country, coalesce(province, '*')) do update set rate = excluded.rate;

create or replace function public.kolis_tax_rate(p_country text, p_province text)
returns numeric language sql stable set search_path to 'public' as $$
  select coalesce(
    (select rate from public.kolis_tax_config where country = p_country and province = upper(coalesce(p_province,'ON'))),
    (select rate from public.kolis_tax_config where country = p_country and province is null),
    0);
$$;

-- ── Invoices + lines + Stripe event dedupe ──────────────────────────────────
create table if not exists public.kolis_invoices (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.kolis_orgs(id) on delete cascade,
  period_start      date not null,
  period_end        date not null,
  subtotal_cents    bigint not null default 0,
  discount_cents    bigint not null default 0,
  tax_cents         bigint not null default 0,
  total_cents       bigint not null default 0,
  status            text not null default 'draft' check (status in ('draft','open','paid','void','uncollectible')),
  stripe_invoice_id text,
  hosted_url        text,
  due_at            timestamptz,
  created_at        timestamptz not null default now(),
  paid_at           timestamptz,
  unique (org_id, period_start, period_end));      -- one invoice per org per period
alter table public.kolis_invoices enable row level security;
revoke all on public.kolis_invoices from anon, authenticated;

create table if not exists public.kolis_invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.kolis_invoices(id) on delete cascade,
  parcel_id   uuid not null unique references public.kolis_parcels(id),  -- a parcel bills once, ever
  description text,
  amount_cents bigint not null);
alter table public.kolis_invoice_lines enable row level security;
revoke all on public.kolis_invoice_lines from anon, authenticated;
create index if not exists kolis_invoice_lines_inv on public.kolis_invoice_lines(invoice_id);

create table if not exists public.kolis_stripe_events (
  event_id     text primary key,
  processed_at timestamptz not null default now());
revoke all on public.kolis_stripe_events from anon, authenticated;

-- ── Monthly close: accrue delivered parcels into one draft invoice per org ───
create or replace function public.kolis_close_billing_period(p_start date, p_end date)
returns int language plpgsql security definer set search_path to 'public' as $$
declare o record; inv uuid; n_created int := 0; v_sub bigint; v_disc bigint; v_tax bigint; v_rate numeric;
begin
  perform pg_advisory_xact_lock(hashtext('kolis_billing_close'));
  for o in select * from public.kolis_orgs loop
    -- skip orgs with nothing new to bill in the window
    if not exists (
      select 1 from public.kolis_parcels p
      where p.org_id = o.id and p.billing_mode='invoice' and p.status='delivered'
        and p.billed_invoice_id is null
        and p.delivered_at >= p_start and p.delivered_at < (p_end + 1)) then
      continue;
    end if;

    -- get-or-create the draft invoice for this exact period (idempotent)
    insert into public.kolis_invoices(org_id, period_start, period_end, status)
    values (o.id, p_start, p_end, 'draft')
    on conflict (org_id, period_start, period_end) do nothing
    returning id into inv;
    if inv is null then
      select id into inv from public.kolis_invoices
        where org_id=o.id and period_start=p_start and period_end=p_end;
      -- only accrue onto an invoice still in draft (never re-bill an issued one)
      if (select status from public.kolis_invoices where id=inv) <> 'draft' then continue; end if;
    else
      n_created := n_created + 1;
    end if;

    -- one line per unbilled delivered parcel (unique parcel_id makes this safe)
    insert into public.kolis_invoice_lines(invoice_id, parcel_id, description, amount_cents)
    select inv, p.id, 'Parcel '||p.code||' · '||p.from_city||' → '||p.to_city,
           p.price_cents + coalesce(p.insurance_premium_cents,0)
    from public.kolis_parcels p
    where p.org_id=o.id and p.billing_mode='invoice' and p.status='delivered'
      and p.billed_invoice_id is null
      and p.delivered_at >= p_start and p.delivered_at < (p_end + 1)
    on conflict (parcel_id) do nothing;

    -- claim those parcels in the same predicate (the double-bill guard)
    update public.kolis_parcels p
      set billed_invoice_id = inv, accrued_at = now()
    where p.org_id=o.id and p.billing_mode='invoice' and p.status='delivered'
      and p.billed_invoice_id is null
      and p.delivered_at >= p_start and p.delivered_at < (p_end + 1);

    -- recompute totals from the authoritative lines
    select coalesce(sum(amount_cents),0) into v_sub from public.kolis_invoice_lines where invoice_id=inv;
    v_disc := round(v_sub * o.discount_rate);
    v_rate := public.kolis_tax_rate(o.country, o.province);
    v_tax  := round((v_sub - v_disc) * v_rate);
    update public.kolis_invoices
      set subtotal_cents=v_sub, discount_cents=v_disc, tax_cents=v_tax,
          total_cents=(v_sub - v_disc + v_tax),
          due_at = ((p_end + 1)::timestamptz + (o.net_terms_days || ' days')::interval)
      where id=inv;
  end loop;
  return n_created;
end; $$;

-- ── Read RPCs for the shipper portal ────────────────────────────────────────
create or replace function public.kolis_org_invoices(p_org uuid)
returns setof public.kolis_invoices language plpgsql security definer set search_path to 'public' stable as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  return query select * from public.kolis_invoices where org_id = p_org order by period_start desc;
end; $$;

create or replace function public.kolis_org_invoice(p_org uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' stable as $$
declare v jsonb;
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'invoice', to_jsonb(i),
    'lines', coalesce((select jsonb_agg(to_jsonb(l) order by l.description) from public.kolis_invoice_lines l where l.invoice_id=i.id),'[]'::jsonb),
    'org', jsonb_build_object('name',o.name,'discount_rate',o.discount_rate,'province',o.province,'country',o.country))
  into v from public.kolis_invoices i join public.kolis_orgs o on o.id=i.org_id
  where i.id=p_id and i.org_id=p_org;
  if v is null then raise exception 'not_found'; end if;
  return v;
end; $$;

grant execute on function
  public.kolis_tax_rate(text,text),
  public.kolis_org_invoices(uuid),
  public.kolis_org_invoice(uuid,uuid)
to authenticated;
revoke execute on function
  public.kolis_close_billing_period(date,date),
  public.kolis_org_invoices(uuid),
  public.kolis_org_invoice(uuid,uuid)
from public, anon;
