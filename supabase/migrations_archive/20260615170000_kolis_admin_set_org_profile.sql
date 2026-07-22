-- Admin: edit an organization's display name + billing email.
create or replace function public.kolis_admin_set_org_profile(
  p_org uuid, p_name text default null, p_billing_email text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(public.kolis_admin_role(),'') not in ('owner','admin') then raise exception 'forbidden'; end if;
  update public.kolis_orgs set
    name = coalesce(nullif(trim(p_name), ''), name),                -- never blank the name
    billing_email = case when p_billing_email is null then billing_email else nullif(trim(p_billing_email), '') end
  where id = p_org;
end; $$;
grant execute on function public.kolis_admin_set_org_profile(uuid,text,text) to authenticated;
revoke execute on function public.kolis_admin_set_org_profile(uuid,text,text) from public, anon;
