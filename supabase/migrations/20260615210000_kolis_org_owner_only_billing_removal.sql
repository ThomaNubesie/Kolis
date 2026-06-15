-- The business owner alone controls member removal (admins can no longer remove members).
create or replace function public.kolis_org_remove_member(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if coalesce(public.kolis_org_role(p_org),'') <> 'owner' then raise exception 'forbidden'; end if;
  if (select role from public.kolis_org_members where org_id=p_org and user_id=p_user) = 'owner'
     and (select count(*) from public.kolis_org_members where org_id=p_org and role='owner') <= 1 then
    raise exception 'cannot_remove_last_owner';
  end if;
  delete from public.kolis_org_members where org_id = p_org and user_id = p_user;
end; $function$;
