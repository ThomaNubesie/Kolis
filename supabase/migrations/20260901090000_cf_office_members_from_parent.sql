-- An office is staffed FROM its parent, never by outside invitation.
--
-- A department's offices are subdivisions of that department: the Speaker's Office is
-- staffed by members of Parliament, not by strangers. Inviting an outsider straight
-- into an office would put someone inside the department's work without ever having
-- joined the department. These functions are the whole rule — every path that adds a
-- person to an office goes through them, so it holds for offices created today and
-- for every office that existed before this was written.
--
-- NOTE ON kind: an office is stored as kind='department'. What makes it an OFFICE is
-- its depth — its parent is a department rather than the organisation. cf_forms_kind_check
-- has never permitted 'form', which is why the older cf_create_subform could not run.

-- Who may still be added: active members of the PARENT not already in this office.
create or replace function public.cf_office_candidates(p_form uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id', pm.id, 'user_id', pm.user_id,
           'name', coalesce(pm.name, pm.email, pm.phone),
           'contact', coalesce(pm.email, pm.phone),
           'color', pm.color, 'title', pm.title
         ) order by lower(coalesce(pm.name, pm.email, pm.phone))), '[]'::jsonb)
    from public.cf_forms f
    join public.cf_members pm on pm.form_id = f.parent_id
   where f.id = p_form and f.parent_id is not null and pm.status = 'active'
     and public.cf_is_admin_deep(p_form)
     and not exists (
       select 1 from public.cf_members em
        where em.form_id = p_form
          and ((em.user_id is not null and em.user_id = pm.user_id)
            or (em.email is not null and pm.email is not null and lower(em.email) = lower(pm.email))));
$$;

-- The parent's active roster — the pool to staff from when the office does not exist yet.
create or replace function public.cf_office_roster(p_parent uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id', m.id, 'user_id', m.user_id,
           'name', coalesce(m.name, m.email, m.phone),
           'contact', coalesce(m.email, m.phone),
           'color', m.color, 'title', m.title
         ) order by lower(coalesce(m.name, m.email, m.phone))), '[]'::jsonb)
    from public.cf_members m
   where m.form_id = p_parent and m.status = 'active'
     and public.cf_is_admin_deep(p_parent);
$$;

-- Copy chosen parent members into an office. Identity (name, contact, colour) carries
-- over so a person keeps the same colour everywhere. They arrive ACTIVE: they already
-- joined the parent, so there is nothing to accept.
create or replace function public.cf_office_add(p_form uuid, p_members uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_parent uuid; v_added int := 0;
begin
  if not public.cf_is_admin_deep(p_form) then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;
  select parent_id into v_parent from public.cf_forms where id = p_form;
  if v_parent is null then
    return jsonb_build_object('ok', false, 'error', 'not_an_office');
  end if;

  -- The guard that matters: every id must be an ACTIVE member of THIS office's parent.
  -- Anything else is silently skipped rather than trusted.
  insert into public.cf_members(form_id, user_id, name, email, phone, color, role, status, joined_at, lang, title)
  select p_form, pm.user_id, pm.name, pm.email, pm.phone, pm.color, 'member', 'active', now(), pm.lang, pm.title
    from public.cf_members pm
   where pm.id = any(p_members) and pm.form_id = v_parent and pm.status = 'active'
     and not exists (
       select 1 from public.cf_members em
        where em.form_id = p_form
          and ((em.user_id is not null and em.user_id = pm.user_id)
            or (em.email is not null and pm.email is not null and lower(em.email) = lower(pm.email))));
  get diagnostics v_added = row_count;
  return jsonb_build_object('ok', true, 'added', v_added);
end $$;

-- Create an office and staff it in one step: a named admin drawn from the parent, plus
-- any number of parent members. The admin is a member too — an office run by someone
-- who cannot open it would be nonsense.
create or replace function public.cf_create_office(
  p_parent uuid, p_group text, p_name text, p_admin_member uuid, p_members uuid[] default '{}'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_form uuid; v_admin public.cf_members%rowtype;
begin
  if not public.cf_is_admin_deep(p_parent) then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;

  select * into v_admin from public.cf_members
   where id = p_admin_member and form_id = p_parent and status = 'active';
  if v_admin.id is null then
    return jsonb_build_object('ok', false, 'error', 'admin_must_be_a_member_of_the_parent');
  end if;

  insert into public.cf_forms(name, description, admin_id, features, approval_count, kind, parent_id, group_name)
    values (trim(p_name), '', v_admin.user_id,
            '{"comments":true,"fields":true,"member_entries":true}'::jsonb, 1, 'department',
            p_parent, nullif(trim(coalesce(p_group, '')), ''))
    returning id into v_form;

  insert into public.cf_members(form_id, user_id, name, email, phone, color, role, status, joined_at, lang, title)
    values (v_form, v_admin.user_id, v_admin.name, v_admin.email, v_admin.phone,
            v_admin.color, 'admin', 'active', now(), v_admin.lang, v_admin.title);

  if array_length(p_members, 1) is not null then
    perform public.cf_office_add(v_form, p_members);
  end if;

  return jsonb_build_object('ok', true, 'form_id', v_form);
end $$;

revoke all on function public.cf_office_candidates(uuid) from public;
revoke all on function public.cf_office_roster(uuid) from public;
revoke all on function public.cf_office_add(uuid, uuid[]) from public;
revoke all on function public.cf_create_office(uuid, text, text, uuid, uuid[]) from public;
grant execute on function public.cf_office_candidates(uuid) to authenticated;
grant execute on function public.cf_office_roster(uuid) to authenticated;
grant execute on function public.cf_office_add(uuid, uuid[]) to authenticated;
grant execute on function public.cf_create_office(uuid, text, text, uuid, uuid[]) to authenticated;
