-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PRODUCTS Phase 4 — post-delivery satisfaction + email open/click tracking ║
-- ║  On delivery, a branded satisfaction survey goes out (star links → public  ║
-- ║  rating capture). Resend webhook events (open/click/bounce) update campaign ║
-- ║  recipients and a generalized kolis_email_events log.                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Parcel: track the satisfaction survey + a per-parcel rating token ──
alter table public.kolis_parcels
  add column if not exists satisfaction_email_sent_at timestamptz,
  add column if not exists satisfaction_token uuid not null default gen_random_uuid();

-- ── Ratings ──
create table if not exists public.kolis_satisfaction (
  id         uuid primary key default gen_random_uuid(),
  parcel_id  uuid not null references public.kolis_parcels(id) on delete cascade,
  org_id     uuid references public.kolis_orgs(id) on delete cascade,
  client_id  uuid references public.kolis_org_clients(id) on delete set null,
  rating     int  not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz default now(),
  unique (parcel_id)
);
create index if not exists idx_kolis_satisfaction_org on public.kolis_satisfaction(org_id);
alter table public.kolis_satisfaction enable row level security;

-- ── Generalized email event log (campaign + satisfaction + transactional) ──
create table if not exists public.kolis_email_events (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid,
  kind            text,               -- campaign | satisfaction | transactional
  ref_id          uuid,               -- campaign_id / parcel_id
  email           text,
  resend_email_id text,
  event           text,               -- delivered|opened|clicked|bounced|complained
  link            text,
  created_at      timestamptz default now()
);
create index if not exists idx_kolis_email_events_resend on public.kolis_email_events(resend_email_id);
create index if not exists idx_kolis_email_events_org on public.kolis_email_events(org_id);
alter table public.kolis_email_events enable row level security;

-- ── On delivery → fire the satisfaction survey (async, via pg_net) ──
-- Auth: bearer from the vault 'kolis_cron_key' secret (matches the function's
-- KOLIS_CRON_SECRET env). Only for org shipments with a recipient email, once,
-- on the transition into 'delivered'.
create or replace function public.kolis_satisfaction_trg()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered'
     and new.org_id is not null and coalesce(new.recipient_email,'') <> '' then
    perform net.http_post(
      url := 'https://kzjptcpjpwlxfofzhyku.functions.supabase.co/kolis-satisfaction',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='kolis_cron_key')),
      body := jsonb_build_object('parcel_id', new.id));
  end if;
  return new;
end; $$;

drop trigger if exists kolis_satisfaction_after_delivered on public.kolis_parcels;
create trigger kolis_satisfaction_after_delivered
  after update of status on public.kolis_parcels
  for each row execute function public.kolis_satisfaction_trg();

-- ── Analytics RPCs ──
create or replace function public.kolis_org_campaign_stats(p_org uuid, p_campaign_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'sent',    count(*) filter (where rcp.status in ('sent','delivered','opened','clicked')),
    'opened',  count(*) filter (where rcp.opened_at is not null),
    'clicked', count(*) filter (where rcp.clicked_at is not null),
    'bounced', count(*) filter (where rcp.status = 'bounced'),
    'failed',  count(*) filter (where rcp.status = 'failed'))
  from public.kolis_campaign_recipients rcp
  join public.kolis_campaigns c on c.id = rcp.campaign_id
  where rcp.campaign_id = p_campaign_id and c.org_id = p_org and coalesce(kolis_org_role(p_org),'') <> '';
$$;

create or replace function public.kolis_org_satisfaction_summary(p_org uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'count', count(*),
    'avg', coalesce(round(avg(rating)::numeric, 2), 0),
    'sent', (select count(*) from public.kolis_parcels p where p.org_id = p_org and p.satisfaction_email_sent_at is not null))
  from public.kolis_satisfaction s
  where s.org_id = p_org and coalesce(kolis_org_role(p_org),'') <> '';
$$;

create or replace function public.kolis_org_satisfaction_list(p_org uuid)
returns table(rating int, comment text, created_at timestamptz, parcel_code text, client_name text)
language sql stable security definer set search_path to 'public' as $$
  select s.rating, s.comment, s.created_at, p.code, c.full_name
  from public.kolis_satisfaction s
  join public.kolis_parcels p on p.id = s.parcel_id
  left join public.kolis_org_clients c on c.id = s.client_id
  where s.org_id = p_org and coalesce(kolis_org_role(p_org),'') <> ''
  order by s.created_at desc
  limit 100;
$$;
