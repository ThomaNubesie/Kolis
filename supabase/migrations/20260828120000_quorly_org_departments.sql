-- ============================================================================
-- Quorly: Organizations & Departments — 2026-08-28
--
-- An ORGANIZATION is the container a group's whole life on Quorly lives in.
-- A DEPARTMENT (fr: "département") is a board inside it: the minutes, the
-- motions, an election, the treasury, the documents.
--
--   was            is now
--   -----------    ---------------------------
--   space          organization  (kind='org')
--   sub-form       department    (kind='department')
--
-- "Office" is deliberately NOT a container here — it is the SEAT a person holds
-- (President, Trésorier), stored as cf_members.title and chosen from the
-- organization's officer_titles. A department is a place; an office is a post.
--
-- Deliberately still ONE table (cf_forms) + parent_id, because membership,
-- invites, files, folders, entries, votes, storage paths and every RLS policy
-- are keyed on form_id. Promoting the existing container costs no re-plumbing:
--
--     organization  (kind='org')
--       └── department  (kind='department' | 'election', parent_id = the org)
--             displayed grouped by group_name
--
-- Membership cascades by ANCESTRY, lazily: a member of the organization counts
-- as a member of every department in it (cf_is_member_deep), and the row is
-- materialised the moment they open one (cf_ensure_member). One invite per
-- person, not one per board — and no department you joined can silently drop you.
-- ============================================================================
set check_function_bodies = off;

-- ============================ 1. COLUMNS ====================================
-- kind / parent_id / group_name already exist in the live project (added out of
-- band by the sub-form + election work); declared here so the repo is truthful.
alter table public.cf_forms   add column if not exists kind            text;
alter table public.cf_forms   add column if not exists parent_id       uuid;
alter table public.cf_forms   add column if not exists group_name      text;
-- new: organization identity
alter table public.cf_forms   add column if not exists slug            text;
alter table public.cf_forms   add column if not exists org_type        text;
alter table public.cf_forms   add column if not exists color           text;
alter table public.cf_forms   add column if not exists legal_name      text;
alter table public.cf_forms   add column if not exists officer_titles  text[] default '{}';
-- new: the office (post) a member holds — President, Trésorier, …
alter table public.cf_members  add column if not exists title          text;

create unique index if not exists cf_forms_slug_uq on public.cf_forms (lower(slug)) where slug is not null;
create index if not exists cf_forms_parent on public.cf_forms (parent_id) where parent_id is not null;
create index if not exists cf_forms_kind   on public.cf_forms (kind)      where kind is not null;

-- Deleting an organization takes its departments with it. NOT VALID so the
-- ALTER cannot fail on a pre-existing orphan; new rows are enforced.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cf_forms_parent_fkey') then
    alter table public.cf_forms
      add constraint cf_forms_parent_fkey foreign key (parent_id)
      references public.cf_forms(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cf_forms_kind_check') then
    alter table public.cf_forms
      add constraint cf_forms_kind_check
      check (kind is null or kind in ('org','department','election','personal','space')) not valid;
  end if;
end $$;

-- ========================= 2. HELPERS ======================================
create or replace function public.cf_slugify(p_text text)
returns text language sql immutable as $function$
  select nullif(trim(both '-' from regexp_replace(
    lower(translate(coalesce(p_text,''),
      'àâäáãåçéèêëíìîïñóòôöõøúùûüýÿ', 'aaaaaaceeeeiiiinoooooouuuuyy')),
    '[^a-z0-9]+', '-', 'g')), '');
$function$;

-- Self (depth 0) then each ancestor, walking up parent_id.
create or replace function public.cf_ancestors(p_form uuid)
returns table(id uuid, depth integer)
language sql stable security definer set search_path to 'public' as $function$
  with recursive up as (
    select f.id, f.parent_id, 0 as depth from public.cf_forms f where f.id = p_form
    union all
    select f.id, f.parent_id, up.depth + 1
      from public.cf_forms f join up on f.id = up.parent_id
     where up.depth < 8            -- cycle guard
  )
  select up.id, up.depth from up;
$function$;

-- Active member of this form OR of anything it sits inside.
create or replace function public.cf_is_member_deep(p_form uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists(
    select 1 from public.cf_ancestors(p_form) a
    join public.cf_members m on m.form_id = a.id
    where m.user_id = auth.uid() and m.status = 'active');
$function$;

-- Admin of this form OR of the organization it belongs to.
create or replace function public.cf_is_admin_deep(p_form uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists(
    select 1 from public.cf_ancestors(p_form) a
    join public.cf_members m on m.form_id = a.id
    where m.user_id = auth.uid() and m.status = 'active' and m.role = 'admin');
$function$;

-- The organization a form belongs to (itself, if it is one).
create or replace function public.cf_org_of(p_form uuid)
returns uuid language sql stable security definer set search_path to 'public' as $function$
  select a.id from public.cf_ancestors(p_form) a
  join public.cf_forms f on f.id = a.id
  where f.kind = 'org' order by a.depth desc limit 1;
$function$;

-- Materialise membership of a department for someone already in its
-- organization. Colour is inherited from the org roster when still free here.
create or replace function public.cf_ensure_member(p_form uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_anc uuid; v_name text; v_email text; v_phone text; v_color text; v_lang text;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','not_authed'); end if;
  if exists(select 1 from public.cf_members where form_id=p_form and user_id=auth.uid() and status='active')
    then return jsonb_build_object('ok',true,'already',true); end if;

  select a.id into v_anc from public.cf_ancestors(p_form) a
    join public.cf_members m on m.form_id=a.id and m.user_id=auth.uid() and m.status='active'
   where a.depth > 0 order by a.depth asc limit 1;
  if v_anc is null then return jsonb_build_object('ok',false,'error','not_member'); end if;

  select name, email, phone, color, lang into v_name, v_email, v_phone, v_color, v_lang
    from public.cf_members where form_id=v_anc and user_id=auth.uid() limit 1;
  -- one colour per form is a unique index; drop the inherited one if taken here
  if v_color is not null and exists(
       select 1 from public.cf_members where form_id=p_form and color=v_color and status<>'removed')
    then v_color := null; end if;

  -- a row may already exist as 'invited' or 'removed' — revive it rather than clash
  if exists(select 1 from public.cf_members where form_id=p_form and user_id=auth.uid()) then
    update public.cf_members
       set status='active', joined_at=coalesce(joined_at, now()),
           name=coalesce(name, v_name), color=coalesce(color, v_color)
     where form_id=p_form and user_id=auth.uid();
  else
    insert into public.cf_members(form_id, user_id, name, email, phone, color, role, status, joined_at, lang)
      values (p_form, auth.uid(), v_name, v_email, v_phone, v_color, 'member', 'active', now(), v_lang);
  end if;
  return jsonb_build_object('ok',true,'joined',true);
end $function$;

-- ================== 3. MIGRATE EXISTING DATA ===============================
-- Shared folders ("spaces") become organizations; anything that already had a
-- parent becomes a department of it. Standalone forms (no parent) are untouched
-- — they stay personal boards and keep showing in the flat list.
update public.cf_forms set kind = 'org'        where kind = 'space';
update public.cf_forms set kind = 'department' where parent_id is not null and kind is null;
-- a parent that now has departments but was never a space is an organization too
update public.cf_forms p set kind = 'org'
 where coalesce(p.kind,'') not in ('org','personal')
   and exists(select 1 from public.cf_forms c where c.parent_id = p.id);
update public.cf_forms set color = '#2F3AA3' where kind = 'org' and color is null;
update public.cf_forms set slug  = null       where kind <> 'org' and slug is not null;

-- Give every organization a handle, de-duplicated.
do $$
declare r record; v_base text; v_try text; n int;
begin
  for r in select id, name from public.cf_forms where kind='org' and slug is null order by created_at loop
    v_base := coalesce(public.cf_slugify(r.name), 'org');
    v_try := v_base; n := 1;
    while exists(select 1 from public.cf_forms where lower(slug) = lower(v_try)) loop
      n := n + 1; v_try := v_base || '-' || n;
    end loop;
    update public.cf_forms set slug = v_try where id = r.id;
  end loop;
end $$;

-- ===================== 4. ORGANIZATION RPCs ================================

-- Create an organization and, in one call, the departments a preset asked for.
-- p_departments: [{ name, group, description, features, approval, fields[], kind }]
-- The preset catalogue lives in the client (lib/presets.ts) so the create screen
-- can edit every line of it before this runs — "everything below is editable".
create or replace function public.cf_create_org(
  p_name text,
  p_org_type text default null,
  p_color text default '#2F3AA3',
  p_slug text default null,
  p_legal_name text default null,
  p_titles text[] default '{}',
  p_departments jsonb default '[]'::jsonb,
  p_invites jsonb default '[]'::jsonb,
  p_admin_name text default ''::text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_org uuid; v_dept uuid; v_name text; v_slug text; v_base text; n int := 1;
  d jsonb; f jsonb; i jsonb; v_kind text; v_out jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','not_authed'); end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then return jsonb_build_object('ok',false,'error','name_required'); end if;
  if nullif(trim(coalesce(p_admin_name,'')),'') is not null then perform public.cf_set_profile(p_admin_name); end if;
  select name into v_name from public.cf_profiles where user_id = auth.uid();

  v_base := coalesce(public.cf_slugify(coalesce(nullif(trim(coalesce(p_slug,'')),''), p_name)), 'org');
  v_slug := v_base;
  while exists(select 1 from public.cf_forms where lower(slug) = lower(v_slug)) loop
    n := n + 1; v_slug := v_base || '-' || n;
  end loop;

  insert into public.cf_forms(name, description, admin_id, features, approval_count,
                              kind, slug, org_type, color, legal_name, officer_titles)
    values (trim(p_name), '', auth.uid(), '{"comments":true}'::jsonb, 1,
            'org', v_slug, nullif(trim(coalesce(p_org_type,'')),''),
            coalesce(nullif(trim(coalesce(p_color,'')),''), '#2F3AA3'),
            nullif(trim(coalesce(p_legal_name,'')),''),
            coalesce(p_titles,'{}'))
    returning id into v_org;

  insert into public.cf_members(form_id, user_id, name, email, color, role, status, joined_at, title)
    values (v_org, auth.uid(), coalesce(nullif(trim(coalesce(p_admin_name,'')),''), v_name),
            (auth.jwt()->>'email'), coalesce(nullif(trim(coalesce(p_color,'')),''),'#2F3AA3'),
            'admin', 'active', now(), (coalesce(p_titles,'{}'))[1]);

  for d in select * from jsonb_array_elements(coalesce(p_departments,'[]'::jsonb)) loop
    if nullif(trim(coalesce(d->>'name','')),'') is null then continue; end if;
    v_kind := case when coalesce(d->>'kind','department') = 'election' then 'election' else 'department' end;

    insert into public.cf_forms(name, description, admin_id, features, approval_count,
                                kind, parent_id, group_name, election_status, election_positions)
      values (trim(d->>'name'), coalesce(d->>'description',''), auth.uid(),
              coalesce(d->'features','{}'::jsonb), greatest(1, coalesce((d->>'approval')::int, 1)),
              v_kind, v_org, nullif(trim(coalesce(d->>'group','')),''),
              case when v_kind='election' then 'open' end,
              case when v_kind='election'
                   then coalesce(nullif(coalesce(p_titles,'{}'),'{}'),
                                 array['President','Vice-President','Secretary','Treasurer'])
                   end)
      returning id into v_dept;

    insert into public.cf_members(form_id, user_id, name, email, color, role, status, joined_at)
      values (v_dept, auth.uid(), coalesce(nullif(trim(coalesce(p_admin_name,'')),''), v_name),
              (auth.jwt()->>'email'), coalesce(nullif(trim(coalesce(p_color,'')),''),'#2F3AA3'),
              'admin', 'active', now());

    for f in select * from jsonb_array_elements(coalesce(d->'fields','[]'::jsonb)) loop
      insert into public.cf_fields(form_id, label, type, options, required, sort, label_i18n, options_i18n)
        values (v_dept, f->>'label', coalesce(f->>'type','text'),
          coalesce((select array_agg(x) from jsonb_array_elements_text(f->'options') x),'{}'),
          coalesce((f->>'required')::boolean,false), coalesce((f->>'sort')::int,0),
          case when jsonb_typeof(f->'label_i18n')  = 'object' then f->'label_i18n'  end,
          case when jsonb_typeof(f->'options_i18n')= 'object' then f->'options_i18n' end);
    end loop;

    if v_kind = 'election' then
      insert into public.cf_folders(form_id, name, created_by) values (v_dept, 'Election', auth.uid());
    end if;

    v_out := v_out || jsonb_build_object('id', v_dept, 'name', trim(d->>'name'),
                                         'group', nullif(trim(coalesce(d->>'group','')),''), 'kind', v_kind);
  end loop;

  -- Invites land on the ORGANIZATION only. Membership reaches every department
  -- by ancestry, so one invite is one email and the person sees the whole group.
  for i in select * from jsonb_array_elements(coalesce(p_invites,'[]'::jsonb)) loop
    perform public.cf_org_invite(v_org, i->>'contact', i->>'title', i->>'lang');
  end loop;

  return jsonb_build_object('ok',true,'org_id',v_org,'slug',v_slug,'departments',v_out);
end $function$;

-- Add one department to an existing organization.
create or replace function public.cf_create_department(
  p_org uuid, p_name text, p_group text default null, p_description text default '',
  p_features jsonb default '{}'::jsonb, p_approval integer default 1,
  p_fields jsonb default '[]'::jsonb, p_kind text default 'department')
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_dept uuid; v_name text; f jsonb; v_kind text; v_titles text[];
begin
  if not public.cf_is_member(p_org) then return jsonb_build_object('ok',false,'error','not_member'); end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then return jsonb_build_object('ok',false,'error','name_required'); end if;
  select name into v_name from public.cf_profiles where user_id = auth.uid();
  select officer_titles into v_titles from public.cf_forms where id = p_org;
  v_kind := case when coalesce(p_kind,'department') = 'election' then 'election' else 'department' end;

  insert into public.cf_forms(name, description, admin_id, features, approval_count,
                              kind, parent_id, group_name, election_status, election_positions)
    values (trim(p_name), coalesce(p_description,''), auth.uid(),
            coalesce(p_features,'{}'::jsonb), greatest(1, coalesce(p_approval,1)),
            v_kind, p_org, nullif(trim(coalesce(p_group,'')),''),
            case when v_kind='election' then 'open' end,
            case when v_kind='election' then coalesce(nullif(v_titles,'{}'),
                 array['President','Vice-President','Secretary','Treasurer']) end)
    returning id into v_dept;

  insert into public.cf_members(form_id, user_id, name, email, color, role, status, joined_at)
    select v_dept, auth.uid(), coalesce(v_name, m.name), m.email, m.color, 'admin', 'active', now()
      from public.cf_members m where m.form_id=p_org and m.user_id=auth.uid() limit 1;

  for f in select * from jsonb_array_elements(coalesce(p_fields,'[]'::jsonb)) loop
    insert into public.cf_fields(form_id, label, type, options, required, sort, label_i18n, options_i18n)
      values (v_dept, f->>'label', coalesce(f->>'type','text'),
        coalesce((select array_agg(x) from jsonb_array_elements_text(f->'options') x),'{}'),
        coalesce((f->>'required')::boolean,false), coalesce((f->>'sort')::int,0),
        case when jsonb_typeof(f->'label_i18n')  = 'object' then f->'label_i18n'  end,
        case when jsonb_typeof(f->'options_i18n')= 'object' then f->'options_i18n' end);
  end loop;

  if v_kind = 'election' then
    insert into public.cf_folders(form_id, name, created_by) values (v_dept, 'Election', auth.uid());
  end if;
  return jsonb_build_object('ok',true,'form_id',v_dept,'department_id',v_dept);
end $function$;

-- Every organization I belong to.
create or replace function public.cf_my_orgs()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id, 'name', f.name, 'slug', f.slug, 'org_type', f.org_type,
    'color', coalesce(f.color,'#2F3AA3'), 'legal_name', f.legal_name,
    'officer_titles', coalesce(to_jsonb(f.officer_titles), '[]'::jsonb),
    'is_admin', exists(select 1 from public.cf_members m where m.form_id=f.id and m.user_id=auth.uid() and m.role='admin' and m.status='active'),
    'my_title', (select m.title from public.cf_members m where m.form_id=f.id and m.user_id=auth.uid() limit 1),
    'members', (select count(*) from public.cf_members m where m.form_id=f.id and m.status='active'),
    'invited', (select count(*) from public.cf_members m where m.form_id=f.id and m.status='invited'),
    'departments', (select count(*) from public.cf_forms o where o.parent_id=f.id)
  ) order by f.created_at), '[]'::jsonb)
  from public.cf_forms f
  where f.kind='org'
    and exists(select 1 from public.cf_members m where m.form_id=f.id and m.user_id=auth.uid() and m.status='active');
$function$;

-- The whole left rail in one round trip: the organization + its departments.
create or replace function public.cf_org_tree(p_org uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select case when not public.cf_is_member_deep(p_org) then '{"error":"not_member"}'::jsonb else
    (select jsonb_build_object(
      'id', f.id, 'name', f.name, 'slug', f.slug, 'org_type', f.org_type,
      'color', coalesce(f.color,'#2F3AA3'), 'legal_name', f.legal_name,
      'description', f.description,
      'officer_titles', coalesce(to_jsonb(f.officer_titles), '[]'::jsonb),
      'is_admin', public.cf_is_admin(f.id),
      'members', (select count(*) from public.cf_members m where m.form_id=f.id and m.status='active'),
      'invited', (select count(*) from public.cf_members m where m.form_id=f.id and m.status='invited'),
      'departments', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', o.id, 'name', o.name, 'description', o.description,
          'group_name', coalesce(o.group_name,''), 'kind', coalesce(o.kind,'department'),
          'features', o.features,
          'election_status', o.election_status,
          'is_admin', o.admin_id = auth.uid(),
          'members', (select count(*) from public.cf_members m where m.form_id=o.id and m.status='active'),
          'entries', (select count(*) from public.cf_entries e where e.form_id=o.id),
          'im_member', exists(select 1 from public.cf_members m where m.form_id=o.id and m.user_id=auth.uid() and m.status='active')
        ) order by coalesce(o.group_name,''), o.created_at)
        from public.cf_forms o where o.parent_id = f.id), '[]'::jsonb)
    ) from public.cf_forms f where f.id = p_org) end;
$function$;

-- Invite to the ORGANIZATION, optionally with the office (post) they hold.
create or replace function public.cf_org_invite(p_org uuid, p_contact text, p_title text default null, p_lang text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_res jsonb; v_title text := nullif(trim(coalesce(p_title,'')),'');
begin
  if not public.cf_is_admin(p_org) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  v_res := public.cf_invite(p_org, p_contact, p_lang);
  if coalesce((v_res->>'ok')::boolean, false) and v_title is not null then
    update public.cf_members set title = v_title
     where form_id = p_org and invite_token = v_res->>'token';
  end if;
  return v_res;
end $function$;

-- The organization roster — who is in the group, and which office they hold.
create or replace function public.cf_org_members(p_org uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select case when not public.cf_is_member(p_org) then '[]'::jsonb else
    coalesce((select jsonb_agg(jsonb_build_object(
      'member_id', m.id, 'id', m.user_id,
      'name', coalesce((select pr.name from public.cf_profiles pr where pr.user_id=m.user_id), m.name, m.email, m.phone),
      'contact', coalesce(m.email, m.phone), 'color', m.color, 'role', m.role,
      'title', m.title, 'status', m.status, 'joined_at', m.joined_at,
      'departments', (select count(*) from public.cf_forms o
                       join public.cf_members om on om.form_id=o.id and om.user_id=m.user_id and om.status='active'
                      where o.parent_id = p_org)
    ) order by (m.status='active') desc, m.title nulls last, m.invited_at)
    from public.cf_members m where m.form_id=p_org and m.status <> 'removed'), '[]'::jsonb) end;
$function$;

-- Set the office a member holds.
create or replace function public.cf_set_member_title(p_member uuid, p_title text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_form uuid;
begin
  select form_id into v_form from public.cf_members where id = p_member;
  if v_form is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not public.cf_is_admin(v_form) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  update public.cf_members set title = nullif(trim(coalesce(p_title,'')),'') where id = p_member;
  return jsonb_build_object('ok',true);
end $function$;

create or replace function public.cf_org_update(
  p_org uuid, p_name text default null, p_description text default null,
  p_color text default null, p_org_type text default null,
  p_legal_name text default null, p_titles text[] default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.cf_is_admin(p_org) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  update public.cf_forms set
    name        = coalesce(nullif(trim(coalesce(p_name,'')),''), name),
    description = coalesce(p_description, description),
    color       = coalesce(nullif(trim(coalesce(p_color,'')),''), color),
    org_type    = coalesce(nullif(trim(coalesce(p_org_type,'')),''), org_type),
    legal_name  = coalesce(p_legal_name, legal_name),
    officer_titles = coalesce(p_titles, officer_titles)
  where id = p_org and kind = 'org';
  return jsonb_build_object('ok',true);
end $function$;

-- ============ 5. EXISTING RPCs THAT NOW UNDERSTAND ANCESTRY ================

-- Reading a form: a member of its organization may read it (and the client calls
-- cf_ensure_member on open to take their seat).
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
      'fields',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.label,'type',x.type,'options',x.options,'required',x.required,'label_i18n',x.label_i18n,'options_i18n',x.options_i18n) order by x.sort),'[]'::jsonb) from public.cf_fields x where x.form_id=f.id),
      'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce((select pr.name from public.cf_profiles pr where pr.user_id=m.user_id),m.name,m.email,m.phone),'color',m.color,'role',m.role,'title',m.title,'status',m.status,'contact',coalesce(m.email,m.phone),'joined_at',m.joined_at) order by m.invited_at),'[]'::jsonb) from public.cf_members m where m.form_id=f.id and m.status<>'removed'))
    end)
  from public.cf_forms f where f.id=p_form;
$function$;

create or replace function public.cf_entries(p_form uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select case when not public.cf_is_member_deep(p_form) then '[]'::jsonb else
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'seq',e.seq,'author',e.author_id,'values',e.values,'status',e.status,'created_at',e.created_at,
      'approvals',(select count(*) from public.cf_votes v where v.entry_id=e.id and v.value='approve'),
      'my_vote',(select value from public.cf_votes v where v.entry_id=e.id and v.voter_id=auth.uid()),
      'comments',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'author',c.author_id,'body',c.body,'created_at',c.created_at) order by c.created_at),'[]'::jsonb) from public.cf_comments c where c.entry_id=e.id)
    ) order by e.seq) from public.cf_entries e where e.form_id=p_form),'[]'::jsonb) end;
$function$;

-- The flat list keeps working, and now says where each board lives so the rail
-- can file it under its organization instead of one undifferentiated pile.
create or replace function public.cf_my_forms()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
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
  where exists(select 1 from public.cf_members m where m.form_id=f.id and m.user_id=auth.uid() and m.status='active');
$function$;

-- Breadcrumb: which organization, which group, how many departments beside it.
-- Old keys (parent_id / parent_name / group_name / subform_count) are kept so
-- nothing that still calls this breaks mid-deploy.
create or replace function public.cf_form_meta(p_form uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select jsonb_build_object(
    'kind', coalesce(f.kind,'form'),
    'parent_id', f.parent_id,
    'parent_name', (select p.name from public.cf_forms p where p.id=f.parent_id),
    'org_id', public.cf_org_of(f.id),
    'org_name', (select o.name from public.cf_forms o where o.id = public.cf_org_of(f.id)),
    'org_color', (select coalesce(o.color,'#2F3AA3') from public.cf_forms o where o.id = public.cf_org_of(f.id)),
    'group_name', f.group_name,
    'department_count', (select count(*) from public.cf_forms c where c.parent_id=f.id),
    'subform_count', (select count(*) from public.cf_forms c where c.parent_id=f.id)
  ) from public.cf_forms f where f.id=p_form;
$function$;

-- Departments of an organization (the old cf_subforms, renamed; both are kept).
create or replace function public.cf_departments(p_org uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select case when not public.cf_is_member_deep(p_org) then '[]'::jsonb else
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', f.id, 'name', f.name, 'group_name', coalesce(f.group_name, ''), 'kind', coalesce(f.kind,'department'),
      'is_admin', f.admin_id=auth.uid(),
      'members', (select count(*) from public.cf_members m where m.form_id=f.id and m.status='active'),
      'im_member', exists(select 1 from public.cf_members m where m.form_id=f.id and m.user_id=auth.uid() and m.status='active')
    ) order by coalesce(f.group_name,''), f.created_at)
    from public.cf_forms f where f.parent_id=p_org), '[]'::jsonb) end;
$function$;

create or replace function public.cf_subforms(p_parent uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select public.cf_departments(p_parent);
$function$;

-- Joining by invite also recognises a row already bound to this account — the
-- case that bit us when a member's email changed after they were invited.
create or replace function public.cf_join(p_form uuid, p_color text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid;
        v_email text := lower(coalesce(auth.jwt()->>'email',''));
        v_phone text := regexp_replace(coalesce(auth.jwt()->>'phone',''),'[^0-9+]','','g');
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','not_authed'); end if;
  select id into v_id from public.cf_members
    where form_id=p_form and status='invited'
      and ((v_email <> '' and lower(email)=v_email)
        or (v_phone <> '' and phone=v_phone)
        or user_id = auth.uid())
    limit 1;
  if v_id is null then
    -- no invite of their own, but the organization already vouches for them
    if public.cf_is_member_deep(p_form) then return public.cf_ensure_member(p_form); end if;
    return jsonb_build_object('ok',false,'error','no_invite');
  end if;
  if exists(select 1 from public.cf_members where form_id=p_form and color=p_color and status<>'removed') then
    return jsonb_build_object('ok',false,'error','color_taken'); end if;
  update public.cf_members set user_id=auth.uid(), color=p_color, status='active', joined_at=now() where id=v_id;
  return jsonb_build_object('ok',true,'form_id',p_form);
end $function$;

-- ================= 6. BACK-COMPAT ALIASES (spaces) =========================
-- cf_create_space / cf_my_spaces went straight to the live project and were
-- never in a migration. Redefined here onto the organization functions, so the
-- old call sites keep working and the repo finally has a truthful definition.
create or replace function public.cf_my_spaces()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select public.cf_my_orgs();
$function$;

create or replace function public.cf_create_space(p_name text, p_invites jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_res jsonb;
begin
  v_res := public.cf_create_org(p_name, null, '#2F3AA3', null, null, '{}', '[]'::jsonb, coalesce(p_invites,'[]'::jsonb), '');
  return case when coalesce((v_res->>'ok')::boolean,false)
    then v_res || jsonb_build_object('form_id', v_res->>'org_id') else v_res end;
end $function$;

-- ================= 7. PUBLIC HANDLE (quorly.ca/o/<slug>) ===================
-- Resolves a shared organization link for someone who is not signed in yet, so
-- the sign-in page can carry the group's own name and colour instead of a bare
-- "Quorly" prompt. Anon-callable and DELIBERATELY THIN: identity only — no
-- member counts, no roster, no departments, no legal name. Same trade as a
-- Slack or Notion workspace URL: guessing a slug reveals that the group exists
-- and what it is called, and nothing else.
create or replace function public.cf_org_by_slug(p_slug text)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select coalesce((select jsonb_build_object(
    'id', f.id, 'name', f.name, 'slug', f.slug,
    'color', coalesce(f.color,'#2F3AA3'), 'org_type', f.org_type
  ) from public.cf_forms f
   where f.kind='org' and lower(f.slug) = lower(trim(p_slug)) limit 1),
  '{"error":"not_found"}'::jsonb);
$function$;

-- ============================== GRANTS =====================================
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname like 'cf\_%' loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;
-- Pre-login lookups: the two invite paths, plus the public organization handle
-- behind quorly.ca/o/<slug> (identity only — see cf_org_by_slug above).
grant execute on function public.cf_invite_info(text)  to anon;
grant execute on function public.cf_resolve_code(text) to anon;
grant execute on function public.cf_org_by_slug(text)  to anon;
