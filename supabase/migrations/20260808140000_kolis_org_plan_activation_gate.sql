-- New/invited orgs must choose a subscription before the portal activates.
-- Existing orgs backfilled so they keep working. (Applied to prod via MCP.)
alter table public.kolis_orgs add column if not exists plan_selected_at timestamptz;
update public.kolis_orgs set plan_selected_at = coalesce(plan_selected_at, created_at) where plan_selected_at is null;

create or replace function public.kolis_org_needs_plan(p_org uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select coalesce((
    select o.plan_selected_at is null and coalesce(o.plan_status,'') not in ('active','trialing')
    from public.kolis_orgs o where o.id = p_org), false);
$function$;

create or replace function public.kolis_org_choose_free(p_org uuid)
returns text language plpgsql security definer set search_path to 'public' as $function$
begin
  if public.kolis_org_role(p_org) not in ('owner','admin') then raise exception 'not authorized'; end if;
  update public.kolis_orgs set plan='free', plan_selected_at=coalesce(plan_selected_at, now()) where id=p_org;
  return 'ok';
end $function$;

grant execute on function public.kolis_org_needs_plan(uuid) to authenticated;
grant execute on function public.kolis_org_choose_free(uuid) to authenticated;
