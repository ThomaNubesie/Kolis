-- cf_form: include each member's joined_at (shown in the members panel).
create or replace function public.cf_form(p_form uuid)
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select (case when not public.cf_is_member(p_form) then '{"error":"not_member"}'::jsonb else
    jsonb_build_object(
      'id',f.id,'name',f.name,'description',f.description,'features',f.features,
      'approval_count',f.approval_count,'is_admin',f.admin_id=auth.uid(),'nda',nullif(trim(coalesce(f.nda_text,'')),''),
      'fields',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.label,'type',x.type,'options',x.options,'required',x.required) order by x.sort),'[]'::jsonb) from cf_fields x where x.form_id=f.id),
      'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce((select name from cf_profiles pr where pr.user_id=m.user_id),m.name,(select full_name from passengers p where p.id=m.user_id),(select full_name from drivers d where d.id=m.user_id),m.email,m.phone),'color',m.color,'role',m.role,'status',m.status,'contact',coalesce(m.email,m.phone),'joined_at',m.joined_at) order by m.invited_at),'[]'::jsonb) from cf_members m where m.form_id=f.id and m.status<>'removed'))
    end)
  from public.cf_forms f where f.id=p_form;
$function$;
