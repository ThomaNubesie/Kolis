-- Quorly org Home PAGE: each org picks 1 of 10 templates (home_template) and fills
-- editable content blocks (home_content jsonb). Rendered by app/forms/OrgHomePage.tsx.
-- Idempotent.

alter table public.cf_forms add column if not exists home_template text;
alter table public.cf_forms add column if not exists home_content jsonb not null default '{}'::jsonb;

create or replace function public.cf_org_set_home(p_org uuid, p_template text, p_content jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.cf_is_admin(p_org) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  update public.cf_forms set home_template = nullif(trim(coalesce(p_template,'')),''),
                             home_content  = coalesce(p_content,'{}'::jsonb)
   where id=p_org and kind='org';
  return jsonb_build_object('ok',true);
end $$;

-- cf_org_tree now also returns home_template + home_content (full body in production;
-- see 20260830 execute log). Recreated for the record with the two fields added.
create or replace function public.cf_org_tree(p_org uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select case when not public.cf_is_member_deep(p_org) then '{"error":"not_member"}'::jsonb else
    (select jsonb_build_object(
      'id', f.id, 'name', f.name, 'slug', f.slug, 'org_type', f.org_type,
      'color', coalesce(f.color,'#2F3AA3'), 'legal_name', f.legal_name, 'description', f.description,
      'officer_titles', coalesce(to_jsonb(f.officer_titles), '[]'::jsonb),
      'is_admin', public.cf_is_admin(f.id),
      'plan', public.cf_org_eff_plan(f.id), 'plan_until', f.plan_until,
      'member_limit', (public.cf_plan_limits(public.cf_org_eff_plan(f.id)) ->> 'members')::int,
      'home_template', f.home_template, 'home_content', coalesce(f.home_content,'{}'::jsonb),
      'members', (select count(*) from public.cf_members m where m.form_id=f.id and m.status='active'),
      'invited', (select count(*) from public.cf_members m where m.form_id=f.id and m.status='invited'),
      'departments', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', o.id, 'name', o.name, 'description', o.description,
          'group_name', coalesce(o.group_name,''), 'kind', coalesce(o.kind,'department'),
          'features', o.features, 'election_status', o.election_status,
          'is_admin', o.admin_id = auth.uid(),
          'members', (select count(*) from public.cf_members m where m.form_id=o.id and m.status='active'),
          'entries', (select count(*) from public.cf_entries e where e.form_id=o.id),
          'im_member', exists(select 1 from public.cf_members m where m.form_id=o.id and m.user_id=auth.uid() and m.status='active')
        ) order by coalesce(o.group_name,''), o.created_at)
        from public.cf_forms o where o.parent_id = f.id), '[]'::jsonb)
    ) from public.cf_forms f where f.id = p_org) end;
$function$;

insert into public.cf_migrations(name) values ('20260830_quorly_org_home.sql') on conflict do nothing;
