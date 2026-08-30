-- Quorly — Town Hall becomes the first department, and departments get an emoji.
--
-- Town Hall was an organization TAB backed by cf_th_* rows keyed on the org. That
-- made it a thing apart: it could not hold entries, folders, files or receipts,
-- because those all hang off a form. It is really the department every member
-- belongs to, so it becomes a real department row (kind='townhall') sorted first,
-- with the standard feature set.
--
-- The cf_th_* board stays keyed on the ORG id — the department page passes its
-- parent — so every existing topic, entry, vote and comment survives untouched.

alter table public.cf_forms add column if not exists emoji text;

-- cf_forms.kind is a closed set; the hall is a new member of it.
alter table public.cf_forms drop constraint if exists cf_forms_kind_check;
alter table public.cf_forms add constraint cf_forms_kind_check
  check (kind is null or kind = any (array['org','department','election','personal','space','townhall']));

-- The department's face in the list. Any admin of it (or of the org above) may set it.
create or replace function public.cf_set_dept_emoji(p_form uuid, p_emoji text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_e text := nullif(trim(coalesce(p_emoji,'')),'');
begin
  if not public.cf_is_admin_deep(p_form) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  -- An emoji, not a label: keep it short enough that no one stores a sentence here.
  if v_e is not null and length(v_e) > 16 then return jsonb_build_object('ok',false,'error','too_long'); end if;
  update public.cf_forms set emoji = v_e where id = p_form;
  return jsonb_build_object('ok',true,'emoji',v_e);
end $function$;

-- The department of all members. Idempotent: creates it once per organization, then
-- keeps its roster in step with the org's — an org admin is an admin here too, so
-- the people who run the group can moderate the hall.
create or replace function public.cf_ensure_townhall(p_org uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_org_admin uuid;
begin
  if not (public.cf_is_member_deep(p_org) or auth.uid() is null) then return null; end if;
  if coalesce((select kind from public.cf_forms where id = p_org),'') <> 'org' then return null; end if;

  select id into v_id from public.cf_forms
   where parent_id = p_org and kind = 'townhall' order by created_at limit 1;

  if v_id is null then
    select admin_id into v_org_admin from public.cf_forms where id = p_org;
    insert into public.cf_forms(name, description, admin_id, features, approval_count,
                                kind, parent_id, group_name, emoji)
    values ('Town Hall', '', v_org_admin,
            '{"fields":true,"files":true,"receipts":true}'::jsonb, 1,
            'townhall', p_org, 'Assembly', '🏟️')
    returning id into v_id;
  end if;

  -- Every active member of the organization belongs here, and keeps their org rank.
  insert into public.cf_members(form_id, user_id, name, email, phone, color, role, status, joined_at)
  select v_id, m.user_id, m.name, m.email, m.phone, m.color, m.role, 'active', now()
    from public.cf_members m
   where m.form_id = p_org and m.status = 'active' and m.user_id is not null
     and not exists (select 1 from public.cf_members t
                      where t.form_id = v_id and t.user_id = m.user_id);

  -- Someone promoted at the org after joining should be an admin here too.
  update public.cf_members t set role = 'admin'
    from public.cf_members m
   where t.form_id = v_id and m.form_id = p_org and m.user_id = t.user_id
     and m.status = 'active' and m.role = 'admin' and t.role <> 'admin';

  return v_id;
end $function$;

-- Both listings now carry the emoji, and sort the hall to the top.
create or replace function public.cf_departments(p_org uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select case when not public.cf_is_member_deep(p_org) then '[]'::jsonb else
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', f.id, 'name', f.name, 'group_name', coalesce(f.group_name, ''), 'kind', coalesce(f.kind,'department'),
      'emoji', f.emoji,
      'is_admin', f.admin_id=auth.uid(),
      'members', (select count(*) from public.cf_members m where m.form_id=f.id and m.status='active'),
      'im_member', exists(select 1 from public.cf_members m where m.form_id=f.id and m.user_id=auth.uid() and m.status='active')
    ) order by (coalesce(f.kind,'department') <> 'townhall'), coalesce(f.group_name,''), f.created_at)
    from public.cf_forms f where f.parent_id=p_org), '[]'::jsonb) end;
$function$;

-- Body copied from the LIVE function (pg_get_functiondef), not from the migration
-- files — the deployed version carries custom_cover / home_cover / the home_content
-- coalesce, which a rebuild from an older file would silently drop.
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
      'custom_cover', public.cf_org_allows(f.id,'custom_cover'),
      'home_template', f.home_template, 'home_content', coalesce(f.home_content,'{}'::jsonb),
      'home_cover', f.home_cover,
      'members', (select count(*) from public.cf_members m where m.form_id=f.id and m.status='active'),
      'invited', (select count(*) from public.cf_members m where m.form_id=f.id and m.status='invited'),
      'departments', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', o.id, 'name', o.name, 'description', o.description,
          'group_name', coalesce(o.group_name,''), 'kind', coalesce(o.kind,'department'),
          'emoji', o.emoji,
          'features', o.features, 'election_status', o.election_status,
          'is_admin', o.admin_id = auth.uid(),
          'members', (select count(*) from public.cf_members m where m.form_id=o.id and m.status='active'),
          'entries', (select count(*) from public.cf_entries e where e.form_id=o.id),
          'im_member', exists(select 1 from public.cf_members m where m.form_id=o.id and m.user_id=auth.uid() and m.status='active')
        ) order by (coalesce(o.kind,'department') <> 'townhall'), coalesce(o.group_name,''), o.created_at)
        from public.cf_forms o where o.parent_id = f.id), '[]'::jsonb)
    ) from public.cf_forms f where f.id = p_org) end;
$function$;

grant execute on function public.cf_set_dept_emoji(uuid, text) to authenticated;
grant execute on function public.cf_ensure_townhall(uuid) to authenticated;

-- Backfill: give every existing organization its hall.
select public.cf_ensure_townhall(f.id) from public.cf_forms f where f.kind = 'org';
