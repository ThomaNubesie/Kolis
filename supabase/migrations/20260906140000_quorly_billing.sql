-- Quorly billing: subscriptions, per-member overage, and metered texts.
-- Mirrors the Kolis pattern so billing works one way across the company.

create table if not exists public.quorly_plan_prices (
  plan            text not null,
  kind            text not null default 'base' check (kind in ('base','texts')),
  stripe_price_id text not null,
  updated_at      timestamptz not null default now(),
  primary key (plan, kind)
);
alter table public.quorly_plan_prices enable row level security;   -- service role only

alter table public.cf_forms add column if not exists stripe_customer_id     text;
alter table public.cf_forms add column if not exists stripe_subscription_id text;
alter table public.cf_forms add column if not exists plan_status            text;
alter table public.cf_forms add column if not exists plan_renews_at         timestamptz;
create unique index if not exists cf_forms_stripe_customer
  on public.cf_forms(stripe_customer_id) where stripe_customer_id is not null;

-- Texts sent per organisation per month. Counted AT THE MOMENT OF SENDING, because a
-- message the provider refused must never be billed and only the sender knows.
create table if not exists public.cf_message_usage (
  org_id   uuid not null references public.cf_forms(id) on delete cascade,
  ym       text not null,                       -- 'YYYY-MM', America/Toronto
  sent     int  not null default 0,
  reported int  not null default 0,             -- already pushed to Stripe
  primary key (org_id, ym)
);
alter table public.cf_message_usage enable row level security;

-- Takes the FORM a message concerns and walks up to the organisation, so a caller
-- never needs to know the hierarchy. A personal vault has no org and bills nobody.
create or replace function public.cf_usage_add(p_form uuid, p_n int)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if coalesce(p_n, 0) <= 0 then return; end if;
  v_org := public.cf_org_of(p_form);
  if v_org is null then return; end if;
  insert into public.cf_message_usage(org_id, ym, sent)
    values (v_org, to_char(now() at time zone 'America/Toronto', 'YYYY-MM'), p_n)
    on conflict (org_id, ym) do update set sent = public.cf_message_usage.sent + excluded.sent;
end $$;

-- What billing needs: members charged for, and texts sent this month. Members are
-- counted exactly as the product counts them — active and not suspended.
create or replace function public.cf_billing_snapshot(p_org uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'org_id', f.id, 'name', f.name, 'plan', f.plan,
    'stripe_customer_id', f.stripe_customer_id,
    'stripe_subscription_id', f.stripe_subscription_id,
    'plan_status', f.plan_status,
    'members', (select count(*) from public.cf_members m
                 where m.form_id = f.id and m.status = 'active'
                   and coalesce(m.suspended, false) = false),
    'texts_this_month', coalesce((select u.sent from public.cf_message_usage u
                                   where u.org_id = f.id
                                     and u.ym = to_char(now() at time zone 'America/Toronto','YYYY-MM')), 0),
    'texts_reported', coalesce((select u.reported from public.cf_message_usage u
                                 where u.org_id = f.id
                                   and u.ym = to_char(now() at time zone 'America/Toronto','YYYY-MM')), 0)
  )), '[]'::jsonb)
  from public.cf_forms f
  where f.parent_id is null and f.kind = 'org'
    and (p_org is null or f.id = p_org);
$$;

revoke all on function public.cf_usage_add(uuid, int) from public;
revoke all on function public.cf_billing_snapshot(uuid) from public;

-- Nightly at 03:20 Toronto. Harmless before a Stripe key exists: the function
-- answers 503 and changes nothing.
-- select cron.schedule('quorly-billing-sync-nightly', '20 7 * * *', $$ ... $$);
