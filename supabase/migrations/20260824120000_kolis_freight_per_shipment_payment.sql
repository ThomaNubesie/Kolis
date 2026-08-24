-- Pay-per-shipment fields for freight bookings (kolis-freight-book).
alter table public.kolis_freight_requests
  add column if not exists payment_method text,          -- 'card' | 'interac' | 'account'
  add column if not exists payment_status text default 'unpaid',
      -- unpaid | authorized | paid | invoiced | failed | refunded | cancelled
  add column if not exists amount_cents integer,          -- carrier all-in (Kolis price)
  add column if not exists surcharge_cents integer,       -- residential surcharge (info)
  add column if not exists tax_cents integer,
  add column if not exists total_cents integer,           -- amount charged/authorized
  add column if not exists currency text default 'CAD',
  add column if not exists service_id text,               -- selected Freightcom service
  add column if not exists transit_days integer,
  add column if not exists residential_end text,          -- pickup | delivery | both
  add column if not exists stripe_payment_intent text,
  add column if not exists stripe_customer text,
  add column if not exists card_last4 text,
  add column if not exists pay_ref text,                  -- Interac reference (KF-XXXXX)
  add column if not exists org_id uuid,                   -- for monthly-account billing
  add column if not exists authorized_at timestamptz,
  add column if not exists captured_at timestamptz,
  add column if not exists paid_at timestamptz;

-- Fast lookup for the Interac matcher.
create index if not exists kolis_freight_requests_pay_ref_idx
  on public.kolis_freight_requests (upper(pay_ref)) where pay_ref is not null;

-- Guardrails.
alter table public.kolis_freight_requests drop constraint if exists kolis_freight_pay_method_chk;
alter table public.kolis_freight_requests add constraint kolis_freight_pay_method_chk
  check (payment_method is null or payment_method in ('card','interac','account'));
alter table public.kolis_freight_requests drop constraint if exists kolis_freight_pay_status_chk;
alter table public.kolis_freight_requests add constraint kolis_freight_pay_status_chk
  check (payment_status in ('unpaid','authorized','paid','invoiced','failed','refunded','cancelled'));
