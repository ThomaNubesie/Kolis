-- Quorly — co-admins on a department.
--
-- Departments are all children of the organization, and cf_is_admin only reads the
-- caller's membership row on the form itself. So being admin of one department
-- gives you nothing on a sibling department: the secretary who runs the election
-- cannot touch its position slate unless someone puts an admin row there for them.
-- Only the department's creator ever got one, and the org's admins reach every
-- department from above (cf_is_admin_deep) — which is why the org admin's rights
-- appear to supersede a department admin's.
--
-- This lets an ORGANIZATION admin appoint any org member as an admin of a given
-- department. Inside that department they get the normal admin powers (for an
-- election: manage positions, close it); they get nothing anywhere else, and they
-- cannot appoint further admins — that stays with the organization's admins.

-- Who currently administers this department, and who could be appointed.
create or replace function public.cf_dept_admins(p_form uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with org as (select parent_id from public.cf_forms where id = p_form)
  select case when not public.cf_is_admin_deep(p_form) then jsonb_build_object('ok',false,'error','not_admin') else
    jsonb_build_object(
      'ok', true,
      'can_appoint', public.cf_is_admin_deep((select parent_id from org)),
      'members', coalesce((
        select jsonb_agg(jsonb_build_object(
          'user_id', m.user_id,
          'name', coalesce(pr.name, m.name, m.email, m.phone),
          'title', m.title,
          'is_admin', exists(select 1 from public.cf_members d
                              where d.form_id = p_form and d.user_id = m.user_id
                                and d.status = 'active' and d.role = 'admin')
        ) order by m.title nulls last, coalesce(pr.name, m.name, m.email, m.phone))
        from public.cf_members m
        left join public.cf_profiles pr on pr.user_id = m.user_id
        where m.form_id = (select parent_id from org)
          and m.status = 'active' and m.user_id is not null), '[]'::jsonb))
  end;
$function$;

-- Appoint / remove a department admin. Organization admins only: a department
-- admin cannot widen their own circle, and this never touches the organization.
create or replace function public.cf_set_dept_admin(p_form uuid, p_user uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_org uuid;
begin
  select parent_id into v_org from public.cf_forms where id = p_form;
  if v_org is null then return jsonb_build_object('ok',false,'error','not_a_department'); end if;
  if not public.cf_is_admin_deep(v_org) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  if p_user = auth.uid() then return jsonb_build_object('ok',false,'error','cannot_change_self'); end if;
  if not exists (select 1 from public.cf_members
                  where form_id = v_org and user_id = p_user and status = 'active')
    then return jsonb_build_object('ok',false,'error','not_org_member'); end if;

  if coalesce(p_on,false) then
    if exists (select 1 from public.cf_members where form_id = p_form and user_id = p_user) then
      update public.cf_members set role = 'admin', status = 'active'
       where form_id = p_form and user_id = p_user;
    else
      -- No row on the department yet: give them one, carrying their org identity.
      insert into public.cf_members(form_id, user_id, name, email, phone, color, role, status, joined_at)
      select p_form, p_user, m.name, m.email, m.phone, m.color, 'admin', 'active', now()
        from public.cf_members m
       where m.form_id = v_org and m.user_id = p_user limit 1;
    end if;
  else
    -- Demote, never delete: they stay a member of the department.
    update public.cf_members set role = 'member'
     where form_id = p_form and user_id = p_user;
  end if;
  return jsonb_build_object('ok', true, 'is_admin', coalesce(p_on,false));
end $function$;

grant execute on function public.cf_dept_admins(uuid) to authenticated;
grant execute on function public.cf_set_dept_admin(uuid, uuid, boolean) to authenticated;
