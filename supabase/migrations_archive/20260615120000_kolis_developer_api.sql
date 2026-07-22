-- ═══════════════════════════════════════════════════════════════════════════
-- Kolis for Business — Phase 4: developer API + webhooks.
-- Org-scoped API keys (sha256-hashed, shown once) authorize POST /v1/shipments
-- via the kolis-api edge function. Parcel status changes enqueue idempotent
-- webhook deliveries (DB trigger, unique idempotency_key); a dispatcher edge
-- function claims rows (FOR UPDATE SKIP LOCKED), HMAC-signs, and retries.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.kolis_access_keys add column if not exists org_id uuid references public.kolis_orgs(id);

-- ── Org API keys ─────────────────────────────────────────────────────────────
create or replace function public.kolis_org_create_key(p_org uuid, p_name text, p_scopes text[])
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_plain text; v_prefix text;
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin') then raise exception 'forbidden'; end if;
  v_plain  := 'kolis_live_' || encode(extensions.gen_random_bytes(24), 'hex');
  v_prefix := substr(v_plain, 1, 16);
  insert into public.kolis_access_keys(name, prefix, key_hash, scopes, created_by, org_id)
  values (p_name, v_prefix, encode(extensions.digest(v_plain, 'sha256'), 'hex'), coalesce(p_scopes, '{}'), auth.uid(), p_org);
  return v_plain;   -- shown once; only the hash is stored
end; $$;

create or replace function public.kolis_org_keys(p_org uuid)
returns table(id uuid, name text, prefix text, scopes text[], created_at timestamptz, last_used_at timestamptz, revoked_at timestamptz)
language plpgsql security definer set search_path to 'public' stable as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  return query select k.id,k.name,k.prefix,k.scopes,k.created_at,k.last_used_at,k.revoked_at
    from public.kolis_access_keys k where k.org_id = p_org order by k.created_at desc;
end; $$;

create or replace function public.kolis_org_revoke_key(p_org uuid, p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin') then raise exception 'forbidden'; end if;
  update public.kolis_access_keys set revoked_at = now() where id = p_id and org_id = p_org and revoked_at is null;
end; $$;

-- ── Webhook endpoints + deliveries ──────────────────────────────────────────
create table if not exists public.kolis_webhook_endpoints (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.kolis_orgs(id) on delete cascade,
  url        text not null,
  secret     text not null,
  events     text[] not null default '{}',
  active     boolean not null default true,
  created_at timestamptz not null default now());
alter table public.kolis_webhook_endpoints enable row level security;
revoke all on public.kolis_webhook_endpoints from anon, authenticated;

create table if not exists public.kolis_webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  endpoint_id     uuid not null references public.kolis_webhook_endpoints(id) on delete cascade,
  parcel_id       uuid,
  event           text not null,
  payload         jsonb not null,
  status          text not null default 'pending' check (status in ('pending','sending','delivered','failed')),
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  response_code   int,
  idempotency_key text not null unique,
  created_at      timestamptz not null default now());
alter table public.kolis_webhook_deliveries enable row level security;
revoke all on public.kolis_webhook_deliveries from anon, authenticated;
create index if not exists kolis_webhook_deliveries_due on public.kolis_webhook_deliveries(next_attempt_at) where status='pending';

create or replace function public.kolis_org_create_webhook(p_org uuid, p_url text, p_events text[])
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin') then raise exception 'forbidden'; end if;
  insert into public.kolis_webhook_endpoints(org_id, url, secret, events)
  values (p_org, p_url, encode(extensions.gen_random_bytes(24),'hex'), coalesce(p_events,'{}')) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.kolis_org_webhooks(p_org uuid)
returns table(id uuid, url text, secret text, events text[], active boolean, created_at timestamptz)
language plpgsql security definer set search_path to 'public' stable as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  return query select w.id,w.url,w.secret,w.events,w.active,w.created_at
    from public.kolis_webhook_endpoints w where w.org_id = p_org order by w.created_at desc;
end; $$;

create or replace function public.kolis_org_delete_webhook(p_org uuid, p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin') then raise exception 'forbidden'; end if;
  delete from public.kolis_webhook_endpoints where id = p_id and org_id = p_org;
end; $$;

-- ── Status-change trigger: enqueue deliveries (idempotent, HTTP-free) ────────
create or replace function public.kolis_enqueue_webhooks()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare ev text; e record; payload jsonb;
begin
  if tg_op = 'INSERT' then
    ev := case when new.org_id is not null then 'shipment.created' else null end;
  elsif new.status is distinct from old.status then
    ev := case new.status
      when 'matched' then 'shipment.matched' when 'picked_up' then 'shipment.picked_up'
      when 'in_transit' then 'shipment.in_transit' when 'delivered' then 'shipment.delivered'
      when 'cancelled' then 'shipment.cancelled' else null end;
  end if;
  if ev is null then return new; end if;
  payload := jsonb_build_object('event',ev,'parcel_id',new.id,'code',new.code,'status',new.status,
    'from_city',new.from_city,'to_city',new.to_city,'org_id',new.org_id,'carrier_org_id',new.carrier_org_id,
    'at', now());
  for e in select * from public.kolis_webhook_endpoints w
           where w.active and (w.org_id = new.org_id or w.org_id = new.carrier_org_id)
             and (cardinality(w.events) = 0 or ev = any(w.events)) loop
    insert into public.kolis_webhook_deliveries(endpoint_id, parcel_id, event, payload, idempotency_key)
    values (e.id, new.id, ev, payload, e.id || ':' || new.id || ':' || ev)
    on conflict (idempotency_key) do nothing;
  end loop;
  return new;
end; $$;
drop trigger if exists kolis_parcels_webhook_trg on public.kolis_parcels;
create trigger kolis_parcels_webhook_trg after insert or update on public.kolis_parcels
  for each row execute function public.kolis_enqueue_webhooks();

-- ── Dispatcher claim/complete (used by kolis-webhook-dispatch) ──────────────
create or replace function public.kolis_claim_webhook_deliveries(p_limit int default 20)
returns table(id uuid, url text, secret text, payload jsonb, attempts int)
language plpgsql security definer set search_path to 'public' as $$
begin
  return query
  update public.kolis_webhook_deliveries d
     set status = 'sending', attempts = d.attempts + 1
   where d.id in (select dd.id from public.kolis_webhook_deliveries dd
                  where dd.status = 'pending' and dd.next_attempt_at <= now()
                  order by dd.next_attempt_at for update skip locked limit p_limit)
  returning d.id,
            (select w.url from public.kolis_webhook_endpoints w where w.id = d.endpoint_id),
            (select w.secret from public.kolis_webhook_endpoints w where w.id = d.endpoint_id),
            d.payload, d.attempts;
end; $$;

create or replace function public.kolis_complete_webhook_delivery(p_id uuid, p_ok boolean, p_code int)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_ok then
    update public.kolis_webhook_deliveries set status='delivered', response_code=p_code where id=p_id;
  else
    update public.kolis_webhook_deliveries
       set status = case when attempts >= 6 then 'failed' else 'pending' end,
           response_code = p_code,
           next_attempt_at = now() + (power(2, least(attempts,6)) || ' minutes')::interval
     where id = p_id;
  end if;
end; $$;

-- ── API-context create (the key already authorizes the org; no user role) ───
create or replace function public.kolis_api_create_shipment(
  p_org uuid, p_sender uuid, p_dropoff_type text, p_size text, p_from_city text, p_to_city text,
  p_recipient_name text, p_recipient_phone text, p_dropoff_addr text, p_client_ref text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_code text; v_price int; v_status text; v_sender uuid;
begin
  if (select status from public.kolis_orgs where id = p_org) <> 'active' then raise exception 'org_inactive'; end if;
  if p_dropoff_type not in ('door','zone','hub') then raise exception 'bad_dropoff'; end if;
  if p_size not in ('envelope','small','large') then raise exception 'bad_size'; end if;
  v_sender := coalesce(p_sender, (select user_id from public.kolis_org_members where org_id=p_org and role in ('owner','admin') order by role limit 1));

  if p_client_ref is not null then
    select id, code into v_id, v_code from public.kolis_parcels where org_id = p_org and client_ref = p_client_ref;
    if v_id is not null then return jsonb_build_object('id',v_id,'code',v_code,'dedup',true); end if;
  end if;

  v_price := public.kolis_estimate_price_cents(p_size, p_dropoff_type, p_from_city, p_to_city);
  perform public.kolis_check_credit(p_org, v_price);
  v_status := case when p_dropoff_type = 'hub' then 'received_at_hub' else 'requested' end;

  insert into public.kolis_parcels(
    code, sender_id, status, dropoff_type, size, from_city, to_city, to_region,
    price_cents, driver_payout_cents, billing_mode, org_id, client_ref,
    recipient_name, recipient_phone, dropoff_addr)
  values (
    public.kolis_gen_parcel_code(), v_sender, v_status, p_dropoff_type, p_size, p_from_city, p_to_city,
    public.kolis_region_code(p_to_city),
    v_price, public.kolis_driver_payout_cents(v_price, p_dropoff_type), 'invoice', p_org, p_client_ref,
    p_recipient_name, p_recipient_phone, p_dropoff_addr)
  returning id, code into v_id, v_code;
  return jsonb_build_object('id', v_id, 'code', v_code, 'price_cents', v_price, 'status', v_status);
end; $$;

grant execute on function
  public.kolis_org_create_key(uuid,text,text[]), public.kolis_org_keys(uuid), public.kolis_org_revoke_key(uuid,uuid),
  public.kolis_org_create_webhook(uuid,text,text[]), public.kolis_org_webhooks(uuid), public.kolis_org_delete_webhook(uuid,uuid)
to authenticated;
revoke execute on function
  public.kolis_org_create_key(uuid,text,text[]), public.kolis_org_keys(uuid), public.kolis_org_revoke_key(uuid,uuid),
  public.kolis_org_create_webhook(uuid,text,text[]), public.kolis_org_webhooks(uuid), public.kolis_org_delete_webhook(uuid,uuid),
  public.kolis_claim_webhook_deliveries(int), public.kolis_complete_webhook_delivery(uuid,boolean,int),
  public.kolis_api_create_shipment(uuid,uuid,text,text,text,text,text,text,text,text)
from public, anon;
