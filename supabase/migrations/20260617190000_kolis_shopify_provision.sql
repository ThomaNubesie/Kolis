-- Auto-provision a Kolis org for an installing Shopify shop, owned by the shop's email.
create or replace function public.kolis_auth_user_by_email(p_email text) returns uuid
  language sql security definer set search_path to 'public' as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

create or replace function public.kolis_shopify_provision(p_shop text, p_name text, p_owner_user uuid, p_email text) returns uuid
  language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid;
begin
  select org_id into v_org from public.kolis_shopify_shops where shop_domain = lower(p_shop);
  if v_org is not null then return v_org; end if;            -- already provisioned
  insert into public.kolis_orgs(name, type, status, kyb_status, brand_name)
    values (coalesce(nullif(trim(p_name), ''), p_shop), 'shipper', 'active', 'pending', nullif(trim(p_name), ''))
    returning id into v_org;
  insert into public.kolis_profiles(id, email, full_name, role, country, identity_verified, verification_fee_paid)
    values (p_owner_user, lower(p_email), p_name, 'sender', 'CA', false, false)
    on conflict (id) do update set email = coalesce(public.kolis_profiles.email, excluded.email);
  insert into public.kolis_org_members(org_id, user_id, role) values (v_org, p_owner_user, 'owner') on conflict do nothing;
  update public.kolis_shopify_shops set org_id = v_org where shop_domain = lower(p_shop);
  return v_org;
end; $$;

revoke all on function public.kolis_auth_user_by_email(text) from anon, authenticated, public;
revoke all on function public.kolis_shopify_provision(text, text, uuid, text) from anon, authenticated, public;
