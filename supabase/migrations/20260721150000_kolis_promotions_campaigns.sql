-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PRODUCTS Phase 3 — promotions + AI promo campaigns to clients.            ║
-- ║  AI drafts the copy; a human reviews and sends. CASL: promo email only    ║
-- ║  goes to clients with marketing_consent, and every send carries a working ║
-- ║  unsubscribe (per-client token).                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── CASL consent on clients ──
alter table public.kolis_org_clients
  add column if not exists marketing_consent bool not null default false,
  add column if not exists consent_at timestamptz,
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

-- ── Promotions ──
create table if not exists public.kolis_org_promotions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.kolis_orgs(id) on delete cascade,
  name         text not null,
  discount_pct int,                         -- optional headline discount
  product_ids  uuid[] not null default '{}',
  starts_at    date,
  ends_at      date,
  active       bool not null default true,
  created_at   timestamptz default now()
);
create index if not exists idx_kolis_org_promotions_org on public.kolis_org_promotions(org_id);
alter table public.kolis_org_promotions enable row level security;

-- ── Campaigns (a drafted/sent email to a client segment) ──
create table if not exists public.kolis_campaigns (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.kolis_orgs(id) on delete cascade,
  promotion_id     uuid references public.kolis_org_promotions(id) on delete set null,
  subject          text not null,
  body_html        text not null,
  status           text not null default 'draft',        -- draft | sending | sent
  audience         text not null default 'all_consented', -- all_consented | past_customers
  recipients_count int not null default 0,
  sent_count       int not null default 0,
  created_at       timestamptz default now(),
  sent_at          timestamptz
);
create index if not exists idx_kolis_campaigns_org on public.kolis_campaigns(org_id);
alter table public.kolis_campaigns enable row level security;

-- ── Per-recipient delivery + engagement rows ──
create table if not exists public.kolis_campaign_recipients (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.kolis_campaigns(id) on delete cascade,
  client_id       uuid references public.kolis_org_clients(id) on delete set null,
  email           text not null,
  status          text not null default 'pending',   -- pending|sent|delivered|opened|clicked|bounced|failed
  resend_email_id text,
  opened_at       timestamptz,
  clicked_at      timestamptz,
  error           text,
  created_at      timestamptz default now()
);
create index if not exists idx_kolis_campaign_recipients_campaign on public.kolis_campaign_recipients(campaign_id);
create index if not exists idx_kolis_campaign_recipients_resend on public.kolis_campaign_recipients(resend_email_id);
alter table public.kolis_campaign_recipients enable row level security;

-- ── Promotions RPCs (role gate owner/admin/shipper) ──
create or replace function public.kolis_org_promotion_save(
  p_org uuid, p_id uuid, p_name text, p_discount_pct int, p_product_ids uuid[],
  p_starts date, p_ends date, p_active bool default true)
returns public.kolis_org_promotions
language plpgsql security definer set search_path to 'public' as $$
declare v public.kolis_org_promotions;
begin
  if coalesce(kolis_org_role(p_org),'') not in ('owner','admin','shipper') then raise exception 'forbidden'; end if;
  if coalesce(nullif(btrim(p_name),''),'') = '' then raise exception 'name_required'; end if;
  if p_id is null then
    insert into public.kolis_org_promotions(org_id, name, discount_pct, product_ids, starts_at, ends_at, active)
    values (p_org, btrim(p_name), p_discount_pct, coalesce(p_product_ids,'{}'), p_starts, p_ends, coalesce(p_active,true))
    returning * into v;
  else
    update public.kolis_org_promotions set
      name=btrim(p_name), discount_pct=p_discount_pct, product_ids=coalesce(p_product_ids,'{}'),
      starts_at=p_starts, ends_at=p_ends, active=coalesce(p_active,true)
    where id=p_id and org_id=p_org returning * into v;
    if v.id is null then raise exception 'not_found'; end if;
  end if;
  return v;
end; $$;

create or replace function public.kolis_org_promotions_list(p_org uuid)
returns setof public.kolis_org_promotions
language sql stable security definer set search_path to 'public' as $$
  select * from public.kolis_org_promotions p
  where p.org_id = p_org and coalesce(kolis_org_role(p_org),'') <> ''
  order by p.active desc, p.created_at desc;
$$;

create or replace function public.kolis_org_promotion_delete(p_org uuid, p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(kolis_org_role(p_org),'') not in ('owner','admin','shipper') then raise exception 'forbidden'; end if;
  delete from public.kolis_org_promotions where id=p_id and org_id=p_org;
end; $$;

-- ── Consent management ──
create or replace function public.kolis_org_client_set_consent(p_org uuid, p_client_id uuid, p_consent bool)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(kolis_org_role(p_org),'') not in ('owner','admin','shipper') then raise exception 'forbidden'; end if;
  update public.kolis_org_clients set
    marketing_consent = coalesce(p_consent,false),
    consent_at = case when p_consent then now() else consent_at end,
    unsubscribed_at = case when p_consent then null else now() end
  where id=p_client_id and org_id=p_org;
end; $$;

-- ── Audience count for the compose UI ──
create or replace function public.kolis_org_campaign_audience(p_org uuid, p_audience text)
returns int language sql stable security definer set search_path to 'public' as $$
  select count(distinct c.id)::int
  from public.kolis_org_clients c
  where c.org_id = p_org and coalesce(kolis_org_role(p_org),'') <> ''
    and c.marketing_consent = true and c.email is not null and c.unsubscribed_at is null
    and (p_audience <> 'past_customers'
      or exists (select 1 from public.kolis_parcels p where p.org_id = p_org and p.client_id = c.id));
$$;

-- ── Campaign draft RPCs ──
create or replace function public.kolis_org_campaign_save(
  p_org uuid, p_id uuid, p_promotion_id uuid, p_subject text, p_body_html text, p_audience text default 'all_consented')
returns public.kolis_campaigns
language plpgsql security definer set search_path to 'public' as $$
declare v public.kolis_campaigns;
begin
  if coalesce(kolis_org_role(p_org),'') not in ('owner','admin','shipper') then raise exception 'forbidden'; end if;
  if coalesce(nullif(btrim(p_subject),''),'') = '' then raise exception 'subject_required'; end if;
  if p_id is null then
    insert into public.kolis_campaigns(org_id, promotion_id, subject, body_html, audience,
      recipients_count)
    values (p_org, p_promotion_id, btrim(p_subject), coalesce(p_body_html,''), coalesce(p_audience,'all_consented'),
      public.kolis_org_campaign_audience(p_org, coalesce(p_audience,'all_consented')))
    returning * into v;
  else
    update public.kolis_campaigns set
      promotion_id=p_promotion_id, subject=btrim(p_subject), body_html=coalesce(p_body_html,''),
      audience=coalesce(p_audience,'all_consented'),
      recipients_count=public.kolis_org_campaign_audience(p_org, coalesce(p_audience,'all_consented'))
    where id=p_id and org_id=p_org and status='draft' returning * into v;
    if v.id is null then raise exception 'not_found_or_sent'; end if;
  end if;
  return v;
end; $$;

create or replace function public.kolis_org_campaigns_list(p_org uuid)
returns setof public.kolis_campaigns
language sql stable security definer set search_path to 'public' as $$
  select * from public.kolis_campaigns c
  where c.org_id = p_org and coalesce(kolis_org_role(p_org),'') <> ''
  order by c.created_at desc;
$$;

create or replace function public.kolis_org_campaign_recipients_list(p_org uuid, p_campaign_id uuid)
returns setof public.kolis_campaign_recipients
language sql stable security definer set search_path to 'public' as $$
  select rcp.* from public.kolis_campaign_recipients rcp
  join public.kolis_campaigns c on c.id = rcp.campaign_id
  where rcp.campaign_id = p_campaign_id and c.org_id = p_org and coalesce(kolis_org_role(p_org),'') <> ''
  order by rcp.created_at;
$$;
