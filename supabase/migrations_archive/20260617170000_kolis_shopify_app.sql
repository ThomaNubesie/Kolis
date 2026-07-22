-- Public Shopify App: per-shop install records (OAuth token + Kolis org link).
create table if not exists public.kolis_shopify_shops (
  shop_domain text primary key,
  access_token text,
  scope text,
  org_id uuid references public.kolis_orgs(id),
  shop_name text,
  shop_email text,
  installed_at timestamptz not null default now(),
  uninstalled_at timestamptz
);
alter table public.kolis_shopify_shops enable row level security;
revoke all on public.kolis_shopify_shops from anon, authenticated;

-- Staff link a Shopify shop to a Kolis org (so its orders import to that org).
create or replace function public.kolis_admin_link_shopify(p_shop text, p_org uuid) returns void
  language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.kolis_is_staff() then raise exception 'forbidden'; end if;
  update public.kolis_shopify_shops set org_id = p_org where shop_domain = lower(p_shop);
end; $$;

-- Staff list installed shops (to link them).
create or replace function public.kolis_admin_shopify_shops()
  returns table(shop_domain text, shop_name text, shop_email text, org_id uuid, org_name text, installed_at timestamptz, uninstalled_at timestamptz)
  language sql stable security definer set search_path to 'public' as $$
  select s.shop_domain, s.shop_name, s.shop_email, s.org_id, o.name, s.installed_at, s.uninstalled_at
  from public.kolis_shopify_shops s left join public.kolis_orgs o on o.id = s.org_id
  where public.kolis_is_staff() order by s.installed_at desc;
$$;

grant execute on function public.kolis_admin_link_shopify(text, uuid) to authenticated;
grant execute on function public.kolis_admin_shopify_shops() to authenticated;
revoke all on function public.kolis_admin_link_shopify(text, uuid) from anon, public;
