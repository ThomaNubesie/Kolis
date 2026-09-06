-- An admin names their own structure.
--
-- Departments and offices could only be named at the moment of creation; after that
-- the name was fixed and had to be changed in the database by hand. That is backwards:
-- an association's vocabulary is its own. A board that calls its assembly "Conseil
-- général" or its treasury "La caisse" should be able to say so.
--
-- Scoped to a department or office. The ORGANISATION's own name is not renamed here —
-- it carries the slug, the branding and the outward-facing identity, and belongs in
-- cf_org_update with the rest of that record.
create or replace function public.cf_form_rename(p_form uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_kind text; v_parent uuid; v_clean text;
begin
  v_clean := nullif(trim(coalesce(p_name, '')), '');
  if v_clean is null then return jsonb_build_object('ok', false, 'error', 'name_required'); end if;
  if length(v_clean) > 80 then return jsonb_build_object('ok', false, 'error', 'name_too_long'); end if;

  select kind, parent_id into v_kind, v_parent from public.cf_forms where id = p_form;
  if v_kind is null and v_parent is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_parent is null then
    return jsonb_build_object('ok', false, 'error', 'use_org_settings');
  end if;
  if not public.cf_is_admin_deep(p_form) then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  update public.cf_forms set name = v_clean where id = p_form;
  return jsonb_build_object('ok', true, 'name', v_clean);
end $$;

revoke all on function public.cf_form_rename(uuid, text) from public;
grant execute on function public.cf_form_rename(uuid, text) to authenticated;
