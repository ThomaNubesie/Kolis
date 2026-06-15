-- ═══════════════════════════════════════════════════════════════════════════
-- Kolis for Business — Phase 3b: credit limit + auto-suspend + card-on-file.
-- Outstanding exposure = unpaid invoices (draft/open/uncollectible) + all
-- unbilled non-cancelled invoice-mode parcels. New shipments are blocked when
-- they'd breach credit_limit_cents; the check takes a per-org row lock so two
-- concurrent creates can't both slip past the limit. A daily job suspends
-- over-limit / overdue orgs; payment un-suspends (kolis_apply_stripe_invoice_event).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.kolis_orgs add column if not exists stripe_default_pm text;

-- Authoritative exposure (internal — UI reads it via kolis_org_overview).
create or replace function public.kolis_org_outstanding_cents(p_org uuid)
returns bigint language sql stable security definer set search_path to 'public' as $$
  select
    coalesce((select sum(total_cents) from public.kolis_invoices
              where org_id = p_org and status in ('draft','open','uncollectible')),0)
  + coalesce((select sum(price_cents + coalesce(insurance_premium_cents,0)) from public.kolis_parcels
              where org_id = p_org and billing_mode = 'invoice' and billed_invoice_id is null
                and status <> 'cancelled'),0);
$$;
revoke execute on function public.kolis_org_outstanding_cents(uuid) from public, anon;

-- Race-safe credit guard. Locks the org row so concurrent creates serialize.
create or replace function public.kolis_check_credit(p_org uuid, p_add_cents bigint)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_lim bigint; v_status text; v_out bigint;
begin
  select credit_limit_cents, status into v_lim, v_status from public.kolis_orgs where id = p_org for update;
  if v_status is null then raise exception 'org_not_found'; end if;
  if v_status <> 'active' then raise exception 'org_suspended'; end if;
  v_out := public.kolis_org_outstanding_cents(p_org);
  if v_out + greatest(p_add_cents,0) > v_lim then raise exception 'credit_limit_exceeded'; end if;
end; $$;
revoke execute on function public.kolis_check_credit(uuid,bigint) from public, anon;

-- Daily enforcement: suspend over-limit / overdue orgs (un-suspend on payment).
create or replace function public.kolis_enforce_suspensions()
returns int language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  update public.kolis_orgs o set status = 'suspended'
  where o.status = 'active'
    and (public.kolis_org_outstanding_cents(o.id) > o.credit_limit_cents
         or exists (select 1 from public.kolis_invoices i
                    where i.org_id = o.id and i.status = 'open' and i.due_at < now()));
  get diagnostics n = row_count;
  return n;
end; $$;
revoke execute on function public.kolis_enforce_suspensions() from public, anon;

-- ── Overview now includes credit posture (gated by membership) ───────────────
create or replace function public.kolis_org_overview(p_org uuid)
returns jsonb language plpgsql security definer set search_path to 'public' stable as $$
declare v_out bigint; v_lim bigint; v_status text;
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  select credit_limit_cents, status into v_lim, v_status from public.kolis_orgs where id = p_org;
  v_out := public.kolis_org_outstanding_cents(p_org);
  return (select jsonb_build_object(
    'in_transit',   count(*) filter (where status in ('matched','dispatched','picked_up','in_transit')),
    'awaiting',     count(*) filter (where status in ('requested','received_at_hub') and driver_id is null),
    'delivered_30d',count(*) filter (where status='delivered' and delivered_at > now() - interval '30 days'),
    'total',        count(*),
    'accrued_cents',coalesce(sum(price_cents + coalesce(insurance_premium_cents,0))
                      filter (where status='delivered' and billing_mode='invoice' and billed_invoice_id is null),0),
    'outstanding_cents', v_out,
    'credit_limit_cents', v_lim,
    'available_cents', greatest(v_lim - v_out, 0),
    'org_status', v_status
  ) from public.kolis_parcels where org_id = p_org);
end; $$;

-- ── Wire the credit guard into the create paths ─────────────────────────────
create or replace function public.kolis_org_create_shipment(
  p_org uuid, p_dropoff_type text, p_size text, p_from_city text, p_to_city text,
  p_recipient_name text default null, p_recipient_phone text default null, p_recipient_email text default null,
  p_dropoff_addr text default null, p_pickup_addr text default null, p_contents text default null,
  p_declared_value_cents int default null, p_insured boolean default false, p_client_ref text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_code text; v_price int; v_status text; v_ins int;
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin','shipper') then raise exception 'forbidden'; end if;
  if (select status from public.kolis_orgs where id = p_org) <> 'active' then raise exception 'org_inactive'; end if;
  if p_dropoff_type not in ('door','zone','hub') then raise exception 'bad_dropoff'; end if;
  if p_size not in ('envelope','small','large') then raise exception 'bad_size'; end if;

  if p_client_ref is not null then
    select id, code into v_id, v_code from public.kolis_parcels where org_id = p_org and client_ref = p_client_ref;
    if v_id is not null then return jsonb_build_object('id',v_id,'code',v_code,'dedup',true); end if;
  end if;

  v_price := public.kolis_estimate_price_cents(p_size, p_dropoff_type, p_from_city, p_to_city);
  v_ins   := case when p_insured and p_declared_value_cents is not null then round(p_declared_value_cents * 0.05)::int else 0 end;
  perform public.kolis_check_credit(p_org, v_price + v_ins);   -- race-safe credit guard
  v_status := case when p_dropoff_type = 'hub' then 'received_at_hub' else 'requested' end;

  insert into public.kolis_parcels(
    code, sender_id, status, dropoff_type, size, from_city, to_city, to_region,
    price_cents, driver_payout_cents, billing_mode, org_id, client_ref,
    recipient_name, recipient_phone, recipient_email, dropoff_addr, pickup_addr,
    contents_description, declared_value_cents, insured, insurance_premium_cents)
  values (
    public.kolis_gen_parcel_code(), auth.uid(), v_status, p_dropoff_type, p_size, p_from_city, p_to_city,
    public.kolis_region_code(p_to_city),
    v_price, public.kolis_driver_payout_cents(v_price, p_dropoff_type), 'invoice', p_org, p_client_ref,
    p_recipient_name, p_recipient_phone, p_recipient_email, p_dropoff_addr, p_pickup_addr,
    p_contents, p_declared_value_cents, coalesce(p_insured,false), v_ins)
  returning id, code into v_id, v_code;
  return jsonb_build_object('id', v_id, 'code', v_code);
end; $$;

create or replace function public.kolis_org_bulk_create(p_org uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; res jsonb := '[]'::jsonb; i int := 0; v_id uuid; v_code text; v_price int; v_drop text; v_size text; v_ins int;
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
      v_ins := case when coalesce((r->>'insured')::boolean,false) and nullif(r->>'declared_value_cents','') is not null
                    then round((r->>'declared_value_cents')::int * 0.05)::int else 0 end;
      perform public.kolis_check_credit(p_org, v_price + v_ins);   -- race-safe credit guard
      insert into public.kolis_parcels(
        code, sender_id, status, dropoff_type, size, from_city, to_city, to_region,
        price_cents, driver_payout_cents, billing_mode, org_id, client_ref,
        recipient_name, recipient_phone, recipient_email, dropoff_addr, contents_description,
        declared_value_cents, insured, insurance_premium_cents)
      values (
        public.kolis_gen_parcel_code(), auth.uid(),
        case when v_drop='hub' then 'received_at_hub' else 'requested' end,
        v_drop, v_size, r->>'from_city', r->>'to_city', public.kolis_region_code(r->>'to_city'),
        v_price, public.kolis_driver_payout_cents(v_price, v_drop), 'invoice', p_org, nullif(r->>'client_ref',''),
        r->>'to_name', r->>'to_phone', r->>'to_email', r->>'to_address', r->>'contents',
        nullif(r->>'declared_value_cents','')::int, coalesce((r->>'insured')::boolean,false), v_ins)
      returning id, code into v_id, v_code;
      res := res || jsonb_build_object('index',i,'ok',true,'id',v_id,'code',v_code);
    exception when others then
      res := res || jsonb_build_object('index',i,'ok',false,'error',sqlerrm);
    end;
  end loop;
  return res;
end; $$;
