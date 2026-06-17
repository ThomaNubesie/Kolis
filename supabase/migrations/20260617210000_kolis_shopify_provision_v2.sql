-- Provision the org even when the shop has no email (owner added only if we have one).
create or replace function public.kolis_shopify_provision(p_shop text, p_name text, p_owner_user uuid, p_email text) returns uuid
  language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid;
begin
  select org_id into v_org from public.kolis_shopify_shops where shop_domain = lower(p_shop);
  if v_org is not null then return v_org; end if;
  insert into public.kolis_orgs(name, type, status, kyb_status, brand_name)
    values (coalesce(nullif(trim(p_name), ''), p_shop), 'shipper', 'active', 'pending', nullif(trim(p_name), ''))
    returning id into v_org;
  if p_owner_user is not null then
    insert into public.kolis_profiles(id, email, full_name, role, country, identity_verified, verification_fee_paid)
      values (p_owner_user, lower(coalesce(p_email, '')), p_name, 'sender', 'CA', false, false)
      on conflict (id) do update set email = coalesce(public.kolis_profiles.email, excluded.email);
    insert into public.kolis_org_members(org_id, user_id, role) values (v_org, p_owner_user, 'owner') on conflict do nothing;
  end if;
  update public.kolis_shopify_shops set org_id = v_org where shop_domain = lower(p_shop);
  return v_org;
end; $$;
