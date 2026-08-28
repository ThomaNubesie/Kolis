-- Quorly: bilingual field labels.
--
-- A field's `label` is not just a caption — it is the KEY under which every answer is
-- stored (`cf_entries.values ->> label`). So the label can never be translated in place;
-- instead each field carries a sidecar `label_i18n` = {"en":"Money in","fr":"Entrées"} and
-- `options_i18n` = {"Income":{"en":"Income","fr":"Revenu"}, ...}, and the client renders
-- the viewer's language while continuing to read/write values under the canonical label.
--
-- Only fields that came from a built-in template get the sidecar. A label the admin typed
-- themselves has no translation and renders as-is in both languages.

alter table public.cf_fields add column if not exists label_i18n jsonb;
alter table public.cf_fields add column if not exists options_i18n jsonb;

-- cf_form: hand the sidecars to the client alongside the canonical label.
create or replace function public.cf_form(p_form uuid)
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select (case
    when not public.cf_is_member(p_form) then '{"error":"not_member"}'::jsonb
    when coalesce(f.require_2fa,false) and f.admin_id <> auth.uid() and coalesce(auth.jwt()->>'aal','aal1') <> 'aal2'
      then jsonb_build_object('needs_2fa', true, 'id', f.id, 'name', f.name, 'is_admin', f.admin_id=auth.uid())
    else
    jsonb_build_object(
      'id',f.id,'name',f.name,'description',f.description,'features',f.features,
      'approval_count',f.approval_count,'is_admin',f.admin_id=auth.uid(),'nda',nullif(trim(coalesce(f.nda_text,'')),''),
      'require_2fa', coalesce(f.require_2fa,false), 'require_download_approval', coalesce(f.require_download_approval,false),
      'fields',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.label,'type',x.type,'options',x.options,'required',x.required,'label_i18n',x.label_i18n,'options_i18n',x.options_i18n) order by x.sort),'[]'::jsonb) from cf_fields x where x.form_id=f.id),
      'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce((select name from cf_profiles pr where pr.user_id=m.user_id),m.name,(select full_name from passengers p where p.id=m.user_id),(select full_name from drivers d where d.id=m.user_id),m.email,m.phone),'color',m.color,'role',m.role,'status',m.status,'contact',coalesce(m.email,m.phone),'joined_at',m.joined_at) order by m.invited_at),'[]'::jsonb) from cf_members m where m.form_id=f.id and m.status<>'removed'))
    end)
  from public.cf_forms f where f.id=p_form;
$function$;

-- cf_set_fields: persist the sidecars when the admin edits the field list.
create or replace function public.cf_set_fields(p_form uuid, p_fields jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare f jsonb; n int := 0;
begin
  if not public.cf_is_admin(p_form) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  delete from public.cf_fields where form_id=p_form;
  for f in select * from jsonb_array_elements(coalesce(p_fields,'[]'::jsonb)) loop
    insert into public.cf_fields(form_id,label,type,options,required,sort,label_i18n,options_i18n)
      values (p_form, f->>'label', coalesce(f->>'type','text'),
        coalesce((select array_agg(x) from jsonb_array_elements_text(f->'options') x),'{}'),
        coalesce((f->>'required')::boolean,false), n,
        case when jsonb_typeof(f->'label_i18n') = 'object' then f->'label_i18n' end,
        case when jsonb_typeof(f->'options_i18n') = 'object' then f->'options_i18n' end);
    n := n+1;
  end loop;
  return jsonb_build_object('ok',true);
end $function$;

-- cf_create_form: same, at creation time (the 10-arg overload the client calls).
create or replace function public.cf_create_form(p_name text, p_description text, p_features jsonb, p_approval integer, p_color text, p_fields jsonb default '[]'::jsonb, p_invites jsonb default '[]'::jsonb, p_admin_name text default ''::text, p_parent uuid default null::uuid, p_group text default null::text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_form uuid; f jsonb; i jsonb; v_name text;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','not_authed'); end if;
  if p_parent is not null and not public.cf_is_member(p_parent) then return jsonb_build_object('ok',false,'error','not_parent_member'); end if;
  if nullif(trim(coalesce(p_admin_name,'')),'') is not null then perform public.cf_set_profile(p_admin_name); end if;
  select name into v_name from public.cf_profiles where user_id = auth.uid();
  insert into public.cf_forms(name, description, admin_id, features, approval_count, parent_id, group_name)
    values (p_name, coalesce(p_description,''), auth.uid(), coalesce(p_features,'{}'::jsonb), greatest(1,coalesce(p_approval,1)), p_parent, nullif(trim(coalesce(p_group,'')),''))
    returning id into v_form;
  insert into public.cf_members(form_id, user_id, name, email, color, role, status, joined_at)
    values (v_form, auth.uid(), coalesce(nullif(trim(coalesce(p_admin_name,'')),''), v_name), (auth.jwt()->>'email'), p_color, 'admin', 'active', now());
  for f in select * from jsonb_array_elements(coalesce(p_fields,'[]'::jsonb)) loop
    insert into public.cf_fields(form_id, label, type, options, required, sort, label_i18n, options_i18n)
      values (v_form, f->>'label', coalesce(f->>'type','text'),
        coalesce((select array_agg(x) from jsonb_array_elements_text(f->'options') x),'{}'),
        coalesce((f->>'required')::boolean,false), coalesce((f->>'sort')::int,0),
        case when jsonb_typeof(f->'label_i18n') = 'object' then f->'label_i18n' end,
        case when jsonb_typeof(f->'options_i18n') = 'object' then f->'options_i18n' end);
  end loop;
  for i in select * from jsonb_array_elements(coalesce(p_invites,'[]'::jsonb)) loop perform public.cf_invite(v_form, i->>'contact'); end loop;
  return jsonb_build_object('ok',true,'form_id',v_form);
end $function$;
