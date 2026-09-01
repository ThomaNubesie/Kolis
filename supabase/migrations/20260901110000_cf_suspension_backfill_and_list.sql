-- Two gaps found once a REAL suspension was looked at.
--
-- 1. Suspensions decided before the cascade existed never spread. Fabio was suspended
--    in Parliament only, and because cf_is_member_deep walks ANCESTORS, his still-clean
--    membership on the organisation row kept handing him full access — the suspension
--    was doing nothing at all. Apply the rule to history, once.
with th as (
  select m.user_id, public.cf_org_of(m.form_id) as org
    from public.cf_members m join public.cf_forms f on f.id = m.form_id
   where f.kind = 'townhall' and m.suspended and m.user_id is not null
), tree as (
  select t.user_id, f.id as form_id
    from th t join public.cf_forms f on public.cf_org_of(f.id) = t.org
)
update public.cf_members m
   set suspended = true
  from tree
 where m.user_id = tree.user_id
   and m.form_id = tree.form_id
   and coalesce(m.suspended, false) = false;

-- 2. The sidebar list is a read surface too. cf_is_member_deep closes cf_form,
--    cf_org_tree, cf_entries and cf_departments, but cf_my_forms selects straight from
--    cf_members, so it still returned the NAMES of the forms a suspended member was
--    shut out of — the shape of the association, if not its contents. A personal vault
--    is unaffected: its membership is never suspended.
create or replace function public.cf_my_forms()
returns jsonb language sql stable security definer set search_path = public as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',f.id,'name',f.name,'description',f.description,'features',f.features,
    'kind',coalesce(f.kind,'form'),'parent_id',f.parent_id,'group_name',f.group_name,
    'org_id',public.cf_org_of(f.id),
    'is_admin',f.admin_id=auth.uid(),
    'admin', coalesce(
      (select pr.name from public.cf_profiles pr where pr.user_id=f.admin_id),
      (select am.name from public.cf_members am where am.form_id=f.id and am.user_id=f.admin_id and am.name is not null limit 1),
      'Admin'),
    'joined_at', (select mm.joined_at from public.cf_members mm where mm.form_id=f.id and mm.user_id=auth.uid() limit 1),
    'members',(select count(*) from public.cf_members m where m.form_id=f.id and m.status='active')
  ) order by f.created_at desc),'[]'::jsonb)
  from public.cf_forms f
  where exists(select 1 from public.cf_members m
                where m.form_id=f.id and m.user_id=auth.uid() and m.status='active'
                  and coalesce(m.suspended,false) = false);
$function$;
