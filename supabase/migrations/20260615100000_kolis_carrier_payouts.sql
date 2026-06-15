-- ═══════════════════════════════════════════════════════════════════════════
-- Kolis for Business — Phase 3c: carrier payout statements.
-- Kolis PAYS THE FLEET: delivered parcels carried by a fleet (carrier_org_id)
-- roll into one monthly statement; gross = sum(driver_payout_cents), net = gross
-- − platform fee. One consolidated Interac payout to the fleet's payout_email.
--
-- Anti-double-pay: fleet parcels are claimed onto a statement (paid_statement_id)
-- and EXCLUDED from the per-driver payout (kolis_pending_payouts / kolis-payout).
-- driver_paid_at is set only when the statement is actually paid.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.kolis_orgs    add column if not exists payout_email text;
alter table public.kolis_parcels add column if not exists paid_statement_id uuid;
create index if not exists kolis_parcels_paid_statement on public.kolis_parcels(paid_statement_id);
-- carrier payout claim hot path
create index if not exists kolis_parcels_fleet_unpaid on public.kolis_parcels(carrier_org_id)
  where status='delivered' and driver_paid_at is null and paid_statement_id is null;

-- Guard now also protects the payout/paid columns from client mutation.
create or replace function public.kolis_parcels_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if current_user in ('postgres','supabase_admin','supabase_auth_admin','service_role') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.org_id is not null or new.carrier_org_id is not null
       or coalesce(new.billing_mode,'card') <> 'card' or new.billed_invoice_id is not null
       or new.paid_statement_id is not null or new.driver_paid_at is not null then
      raise exception 'kolis_parcels: org/billing fields are managed server-side';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.org_id            is distinct from old.org_id
       or new.carrier_org_id is distinct from old.carrier_org_id
       or new.billing_mode   is distinct from old.billing_mode
       or new.billed_invoice_id is distinct from old.billed_invoice_id
       or new.paid_statement_id is distinct from old.paid_statement_id
       or new.driver_paid_at  is distinct from old.driver_paid_at
       or new.accrued_at     is distinct from old.accrued_at
       or new.price_cents    is distinct from old.price_cents
       or new.driver_payout_cents is distinct from old.driver_payout_cents then
      raise exception 'kolis_parcels: org/billing fields are managed server-side';
    end if;
  end if;
  return new;
end; $$;

-- ── Statement tables ────────────────────────────────────────────────────────
create table if not exists public.kolis_payout_statements (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.kolis_orgs(id) on delete cascade,
  period_start       date not null,
  period_end         date not null,
  gross_cents        bigint not null default 0,
  platform_fee_cents bigint not null default 0,
  net_cents          bigint not null default 0,
  status             text not null default 'pending' check (status in ('pending','paid','void')),
  interac_ref        text,
  created_at         timestamptz not null default now(),
  paid_at            timestamptz,
  unique (org_id, period_start, period_end));
alter table public.kolis_payout_statements enable row level security;
revoke all on public.kolis_payout_statements from anon, authenticated;

create table if not exists public.kolis_payout_statement_lines (
  id           uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.kolis_payout_statements(id) on delete cascade,
  driver_id    uuid,
  parcels      int not null,
  gross_cents  bigint not null);
alter table public.kolis_payout_statement_lines enable row level security;
revoke all on public.kolis_payout_statement_lines from anon, authenticated;
create index if not exists kolis_payout_lines_stmt on public.kolis_payout_statement_lines(statement_id);

-- ── Monthly close: build one statement per fleet ────────────────────────────
create or replace function public.kolis_close_carrier_payouts(p_start date, p_end date)
returns int language plpgsql security definer set search_path to 'public' as $$
declare o record; stmt uuid; n int := 0; v_gross bigint; v_fee bigint;
begin
  perform pg_advisory_xact_lock(hashtext('kolis_carrier_payout_close'));
  for o in select * from public.kolis_orgs where type in ('carrier','both') loop
    if not exists (select 1 from public.kolis_parcels p
                   where p.carrier_org_id=o.id and p.status='delivered'
                     and p.driver_paid_at is null and p.paid_statement_id is null
                     and p.delivered_at >= p_start and p.delivered_at < (p_end+1)) then
      continue;
    end if;
    insert into public.kolis_payout_statements(org_id, period_start, period_end, status)
    values (o.id, p_start, p_end, 'pending')
    on conflict (org_id, period_start, period_end) do nothing returning id into stmt;
    if stmt is null then
      select id into stmt from public.kolis_payout_statements where org_id=o.id and period_start=p_start and period_end=p_end;
      if (select status from public.kolis_payout_statements where id=stmt) <> 'pending' then continue; end if;
    else n := n + 1; end if;

    update public.kolis_parcels p set paid_statement_id = stmt
     where p.carrier_org_id=o.id and p.status='delivered'
       and p.driver_paid_at is null and p.paid_statement_id is null
       and p.delivered_at >= p_start and p.delivered_at < (p_end+1);

    delete from public.kolis_payout_statement_lines where statement_id=stmt;
    insert into public.kolis_payout_statement_lines(statement_id, driver_id, parcels, gross_cents)
    select stmt, p.driver_id, count(*)::int, sum(p.driver_payout_cents)::bigint
    from public.kolis_parcels p where p.paid_statement_id=stmt group by p.driver_id;

    select coalesce(sum(driver_payout_cents),0) into v_gross from public.kolis_parcels where paid_statement_id=stmt;
    v_fee := round(v_gross * o.platform_fee_rate);
    update public.kolis_payout_statements set gross_cents=v_gross, platform_fee_cents=v_fee, net_cents=(v_gross - v_fee) where id=stmt;
  end loop;
  return n;
end; $$;

-- Mark a statement paid + release its parcels (called after the Interac send).
create or replace function public.kolis_mark_carrier_statement_paid(p_statement uuid, p_ref text default null)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  update public.kolis_payout_statements set status='paid', paid_at=now(), interac_ref=p_ref
   where id=p_statement and status='pending';
  if not found then return false; end if;
  update public.kolis_parcels set driver_paid_at=now() where paid_statement_id=p_statement and driver_paid_at is null;
  return true;
end; $$;
revoke execute on function public.kolis_close_carrier_payouts(date,date), public.kolis_mark_carrier_statement_paid(uuid,text) from public, anon;

-- ── Read RPCs (fleet portal) ────────────────────────────────────────────────
create or replace function public.kolis_carrier_pending_payouts(p_org uuid)
returns table(driver_id uuid, driver_name text, parcels int, gross_cents bigint)
language plpgsql security definer set search_path to 'public' stable as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  return query
    select p.driver_id, pr.full_name, count(*)::int, sum(p.driver_payout_cents)::bigint
    from public.kolis_parcels p left join public.kolis_profiles pr on pr.id=p.driver_id
    where p.carrier_org_id=p_org and p.status='delivered' and p.driver_paid_at is null
    group by p.driver_id, pr.full_name;
end; $$;

create or replace function public.kolis_org_payout_statements(p_org uuid)
returns setof public.kolis_payout_statements language plpgsql security definer set search_path to 'public' stable as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  return query select * from public.kolis_payout_statements where org_id=p_org order by period_start desc;
end; $$;

create or replace function public.kolis_carrier_statement(p_org uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' stable as $$
declare v jsonb;
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'statement', to_jsonb(s),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('driver_id',l.driver_id,'driver_name',pr.full_name,'parcels',l.parcels,'gross_cents',l.gross_cents) order by l.gross_cents desc)
                       from public.kolis_payout_statement_lines l left join public.kolis_profiles pr on pr.id=l.driver_id
                       where l.statement_id=s.id),'[]'::jsonb))
  into v from public.kolis_payout_statements s where s.id=p_id and s.org_id=p_org;
  if v is null then raise exception 'not_found'; end if;
  return v;
end; $$;

-- ── Exclude fleet parcels from the per-driver payout (anti-double-pay) ───────
create or replace function public.kolis_pending_payouts()
returns table(driver_id uuid, driver_name text, interac_email text, pending_cents bigint, parcels integer)
language sql security definer set search_path to 'public' as $$
  select p.driver_id, d.full_name, dp.interac_email, sum(p.driver_payout_cents)::bigint, count(*)::int
  from public.kolis_parcels p
  join public.drivers d on d.id = p.driver_id
  left join public.kolis_driver_payout dp on dp.driver_id = p.driver_id
  where p.status = 'delivered' and p.driver_paid_at is null and p.driver_payout_cents is not null
    and p.carrier_org_id is null                       -- fleet parcels pay via statements
    and exists (select 1 from public.drivers a where a.id = auth.uid() and a.is_admin)
  group by p.driver_id, d.full_name, dp.interac_email
  order by sum(p.driver_payout_cents) desc;
$$;

grant execute on function
  public.kolis_carrier_pending_payouts(uuid),
  public.kolis_org_payout_statements(uuid),
  public.kolis_carrier_statement(uuid,uuid)
to authenticated;
revoke execute on function
  public.kolis_carrier_pending_payouts(uuid),
  public.kolis_org_payout_statements(uuid),
  public.kolis_carrier_statement(uuid,uuid)
from public, anon;
