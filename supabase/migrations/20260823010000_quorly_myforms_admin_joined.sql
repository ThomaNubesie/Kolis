-- cf_my_forms also returns the admin's name + the current user's join date.
create or replace function public.cf_my_forms()
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',f.id,'name',f.name,'description',f.description,'features',f.features,
    'is_admin',f.admin_id=auth.uid(),
    'admin', coalesce(
      (select name from cf_profiles pr where pr.user_id=f.admin_id),
      (select am.name from cf_members am where am.form_id=f.id and am.user_id=f.admin_id and am.name is not null limit 1),
      (select full_name from passengers p where p.id=f.admin_id),
      (select full_name from drivers d where d.id=f.admin_id),
      'Admin'),
    'joined_at', (select mm.joined_at from cf_members mm where mm.form_id=f.id and mm.user_id=auth.uid() limit 1),
    'members',(select count(*) from cf_members m where m.form_id=f.id and m.status='active')
  ) order by f.created_at desc),'[]'::jsonb)
  from public.cf_forms f
  where exists(select 1 from cf_members m where m.form_id=f.id and m.user_id=auth.uid() and m.status='active');
$function$;
