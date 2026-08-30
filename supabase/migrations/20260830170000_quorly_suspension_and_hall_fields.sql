-- Quorly — suspension, who may post, and real fields for the Town Hall.
--
-- Three things, one theme: who is allowed to speak in the hall.
--
-- 1. SUSPENSION. An admin can suspend a member. Suspension is a flag, NOT a status
--    change: cf_members.status stays 'active' so every membership check, RLS policy
--    and roster count behaves exactly as before. A suspended member keeps their seat
--    and can still read; what they lose is the floor. Set on the organization it
--    reaches every department (checked up the tree, like admin).
--
-- 2. WHO MAY POST. A board can be opened to everyone, to everyone EXCEPT the
--    suspended, or to ONLY the suspended — the last is what a disciplinary thread
--    needs, where the people under sanction are the ones who must answer.
--
-- 3. The hall was created with features.fields = true but no fields, so "New entry"
--    fell back to a single untitled Note box. It gets a Subject and Details, and
--    member_entries, because the department of all members is where members speak.

alter table public.cf_members add column if not exists suspended boolean not null default false;

alter table public.cf_forms add column if not exists post_audience text;
alter table public.cf_forms drop constraint if exists cf_forms_post_audience_check;
alter table public.cf_forms add constraint cf_forms_post_audience_check
  check (post_audience is null or post_audience in ('all','active','suspended'));

-- Suspended here, or anywhere above this form.
create or replace function public.cf_is_suspended(p_form uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists(
    select 1 from public.cf_ancestors(p_form) a
    join public.cf_members m on m.form_id = a.id
    where m.user_id = auth.uid() and m.status = 'active' and m.suspended);
$function$;

create or replace function public.cf_set_member_suspended(p_member uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_form uuid; v_user uuid;
begin
  select form_id, user_id into v_form, v_user from public.cf_members where id = p_member;
  if v_form is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not public.cf_is_admin_deep(v_form) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  if v_user = auth.uid() then return jsonb_build_object('ok',false,'error','cannot_change_self'); end if;
  update public.cf_members set suspended = coalesce(p_on,false) where id = p_member;
  return jsonb_build_object('ok',true,'suspended',coalesce(p_on,false));
end $function$;

create or replace function public.cf_set_post_audience(p_form uuid, p_audience text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_a text := lower(nullif(trim(coalesce(p_audience,'')),''));
begin
  if not public.cf_is_admin_deep(p_form) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  if v_a is not null and v_a not in ('all','active','suspended')
    then return jsonb_build_object('ok',false,'error','bad_audience'); end if;
  update public.cf_forms set post_audience = coalesce(v_a,'all') where id = p_form;
  return jsonb_build_object('ok',true,'post_audience',coalesce(v_a,'all'));
end $function$;

-- Entry posting now answers to the audience. Admins are never locked out of their
-- own board. Body otherwise as deployed.
create or replace function public.cf_add_entry(p_form uuid, p_values jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_feats jsonb; v_aud text; v_susp boolean; v_admin boolean;
begin
  if not public.cf_is_member(p_form) then return jsonb_build_object('ok',false,'error','not_member'); end if;
  select features, coalesce(post_audience,'all') into v_feats, v_aud from public.cf_forms where id=p_form;
  v_admin := public.cf_is_admin(p_form);
  if not (v_admin or coalesce((v_feats->>'member_entries')::boolean,false))
    then return jsonb_build_object('ok',false,'error','entries_not_allowed'); end if;
  if not v_admin then
    v_susp := public.cf_is_suspended(p_form);
    if v_aud = 'active' and v_susp then return jsonb_build_object('ok',false,'error','suspended'); end if;
    if v_aud = 'suspended' and not v_susp then return jsonb_build_object('ok',false,'error','suspended_only'); end if;
  end if;
  insert into public.cf_entries(form_id, author_id, values, status)
  values (p_form, auth.uid(), coalesce(p_values,'{}'::jsonb),
          case when coalesce((v_feats->>'voting')::boolean,false) then 'pending' else null end)
  returning id into v_id;
  return jsonb_build_object('ok',true,'entry_id',v_id);
end $function$;

-- Surface the flag and the audience where the screens read them.
create or replace function public.cf_form(p_form uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select (case when not public.cf_is_member_deep(p_form) then '{"error":"not_member"}'::jsonb else
    jsonb_build_object(
      'id',f.id,'name',f.name,'description',f.description,'features',f.features,
      'approval_count',f.approval_count,'is_admin',(f.admin_id=auth.uid() or public.cf_is_admin(f.id)),
      'kind',coalesce(f.kind,'form'),'parent_id',f.parent_id,'group_name',f.group_name,
      'org_id',public.cf_org_of(f.id),
      'nda',nullif(trim(coalesce(f.nda_text,'')),''),
      'im_member',public.cf_is_member(f.id),
      'post_audience',coalesce(f.post_audience,'all'),
      'im_suspended',public.cf_is_suspended(f.id),
      'fields',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.label,'type',x.type,'options',x.options,'required',x.required,'label_i18n',x.label_i18n,'options_i18n',x.options_i18n) order by x.sort),'[]'::jsonb) from public.cf_fields x where x.form_id=f.id),
      'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'member_id',m.id,'name',coalesce((select pr.name from public.cf_profiles pr where pr.user_id=m.user_id),m.name,m.email,m.phone),'color',m.color,'role',m.role,'title',m.title,'status',m.status,'suspended',m.suspended,'contact',coalesce(m.email,m.phone),'joined_at',m.joined_at) order by m.invited_at),'[]'::jsonb) from public.cf_members m where m.form_id=f.id and m.status<>'removed'))
    end)
  from public.cf_forms f where f.id=p_form;
$function$;

create or replace function public.cf_org_members(p_org uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select case when not public.cf_is_member(p_org) then '[]'::jsonb else
    coalesce((select jsonb_agg(jsonb_build_object(
      'member_id', m.id, 'id', m.user_id,
      'name', coalesce((select pr.name from public.cf_profiles pr where pr.user_id=m.user_id), m.name, m.email, m.phone),
      'contact', coalesce(m.email, m.phone), 'color', m.color, 'role', m.role,
      'title', m.title, 'status', m.status, 'suspended', m.suspended, 'joined_at', m.joined_at,
      'departments', (select count(*) from public.cf_forms o
                       join public.cf_members om on om.form_id=o.id and om.user_id=m.user_id and om.status='active'
                      where o.parent_id = p_org)
    ) order by (m.status='active') desc, m.title nulls last, m.invited_at)
    from public.cf_members m where m.form_id=p_org and m.status <> 'removed'), '[]'::jsonb) end;
$function$;

grant execute on function public.cf_is_suspended(uuid) to authenticated;
grant execute on function public.cf_set_member_suspended(uuid, boolean) to authenticated;
grant execute on function public.cf_set_post_audience(uuid, text) to authenticated;

-- The hall speaks: members may post, and there is something to fill in.
update public.cf_forms
   set features = coalesce(features,'{}'::jsonb) || '{"member_entries":true}'::jsonb,
       post_audience = coalesce(post_audience,'all')
 where kind = 'townhall';

insert into public.cf_fields(form_id, label, type, options, required, sort, label_i18n)
select f.id, 'Subject', 'text', null, true, 0,
       '{"en":"Subject","fr":"Sujet"}'::jsonb
  from public.cf_forms f
 where f.kind = 'townhall'
   and not exists (select 1 from public.cf_fields x where x.form_id = f.id);

insert into public.cf_fields(form_id, label, type, options, required, sort, label_i18n)
select f.id, 'Details', 'longtext', null, false, 1,
       '{"en":"Details","fr":"Détails"}'::jsonb
  from public.cf_forms f
 where f.kind = 'townhall'
   and not exists (select 1 from public.cf_fields x where x.form_id = f.id and x.label = 'Details');
