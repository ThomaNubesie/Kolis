-- Quorly org plans & feature gates.
-- Gates are on MEMBERS + FEATURES (elections / receipts / 2FA / E2E), NOT on the
-- number of departments (presets create ~6 per org, so a department cap would
-- break the product). New orgs get a 1-month Board trial (so presets work) then
-- drop to Free; existing orgs are set to Business with no expiry so the operator
-- is never gated. Idempotent — safe to re-run.

alter table public.cf_forms add column if not exists plan text not null default 'board';
alter table public.cf_forms add column if not exists plan_until timestamptz default (now() + interval '1 month');

update public.cf_forms set plan='business', plan_until=null where kind='org' and plan <> 'business';

create or replace function public.cf_plan_limits(p_plan text)
returns jsonb language sql immutable as $$
  select case coalesce(p_plan,'free')
    when 'free'       then '{"members":10,"elections":false,"receipts":false,"twofa":false,"e2e":false,"storage_gb":2}'::jsonb
    when 'board'      then '{"members":100,"elections":true,"receipts":true,"twofa":true,"e2e":false,"storage_gb":50}'::jsonb
    when 'business'   then '{"members":null,"elections":true,"receipts":true,"twofa":true,"e2e":true,"storage_gb":500}'::jsonb
    when 'enterprise' then '{"members":null,"elections":true,"receipts":true,"twofa":true,"e2e":true,"storage_gb":null}'::jsonb
    else '{"members":10,"elections":false,"receipts":false,"twofa":false,"e2e":false,"storage_gb":2}'::jsonb
  end;
$$;

create or replace function public.cf_org_eff_plan(p_org uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select case when f.plan_until is not null and now() > f.plan_until then 'free'
              else coalesce(f.plan,'free') end
  from public.cf_forms f where f.id = p_org and f.kind='org';
$$;

create or replace function public.cf_org_allows(p_org uuid, p_feature text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((public.cf_plan_limits(public.cf_org_eff_plan(p_org)) ->> p_feature)::boolean, false);
$$;

-- member cap on org invite
create or replace function public.cf_org_invite(p_org uuid, p_contact text, p_title text default null::text, p_lang text default null::text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_res jsonb; v_title text := nullif(trim(coalesce(p_title,'')),''); v_max int; v_count int;
begin
  if not public.cf_is_admin(p_org) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  v_max := (public.cf_plan_limits(public.cf_org_eff_plan(p_org)) ->> 'members')::int;
  if v_max is not null then
    select count(*) into v_count from public.cf_members where form_id=p_org and status <> 'removed';
    if v_count >= v_max then
      return jsonb_build_object('ok',false,'error','plan_limit','feature','members','limit',v_max,'plan',public.cf_org_eff_plan(p_org));
    end if;
  end if;
  v_res := public.cf_invite(p_org, p_contact, p_lang);
  if coalesce((v_res->>'ok')::boolean, false) and v_title is not null then
    update public.cf_members set title = v_title where form_id = p_org and invite_token = v_res->>'token';
  end if;
  return v_res;
end $function$;

-- election feature gate
create or replace function public.cf_create_department(p_org uuid, p_name text, p_group text default null::text, p_description text default ''::text, p_features jsonb default '{}'::jsonb, p_approval integer default 1, p_fields jsonb default '[]'::jsonb, p_kind text default 'department'::text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_dept uuid; v_name text; f jsonb; v_kind text; v_titles text[];
begin
  if not public.cf_is_member(p_org) then return jsonb_build_object('ok',false,'error','not_member'); end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then return jsonb_build_object('ok',false,'error','name_required'); end if;
  v_kind := case when coalesce(p_kind,'department') = 'election' then 'election' else 'department' end;
  if v_kind='election' and not public.cf_org_allows(p_org,'elections') then
    return jsonb_build_object('ok',false,'error','plan_limit','feature','elections','plan',public.cf_org_eff_plan(p_org));
  end if;
  select name into v_name from public.cf_profiles where user_id = auth.uid();
  select officer_titles into v_titles from public.cf_forms where id = p_org;
  insert into public.cf_forms(name, description, admin_id, features, approval_count, kind, parent_id, group_name, election_status, election_positions)
    values (trim(p_name), coalesce(p_description,''), auth.uid(), coalesce(p_features,'{}'::jsonb), greatest(1, coalesce(p_approval,1)),
            v_kind, p_org, nullif(trim(coalesce(p_group,'')),''),
            case when v_kind='election' then 'open' end,
            case when v_kind='election' then coalesce(nullif(v_titles,'{}'), array['President','Vice-President','Secretary','Treasurer']) end)
    returning id into v_dept;
  insert into public.cf_members(form_id, user_id, name, email, color, role, status, joined_at)
    select v_dept, auth.uid(), coalesce(v_name, m.name), m.email, m.color, 'admin', 'active', now()
      from public.cf_members m where m.form_id=p_org and m.user_id=auth.uid() limit 1;
  for f in select * from jsonb_array_elements(coalesce(p_fields,'[]'::jsonb)) loop
    insert into public.cf_fields(form_id, label, type, options, required, sort, label_i18n, options_i18n)
      values (v_dept, f->>'label', coalesce(f->>'type','text'),
        coalesce((select array_agg(x) from jsonb_array_elements_text(f->'options') x),'{}'),
        coalesce((f->>'required')::boolean,false), coalesce((f->>'sort')::int,0),
        case when jsonb_typeof(f->'label_i18n') = 'object' then f->'label_i18n' end,
        case when jsonb_typeof(f->'options_i18n')= 'object' then f->'options_i18n' end);
  end loop;
  if v_kind = 'election' then
    insert into public.cf_folders(form_id, name, created_by) values (v_dept, 'Election', auth.uid());
  end if;
  return jsonb_build_object('ok',true,'form_id',v_dept,'department_id',v_dept);
end $function$;

-- receipts feature gate
create or replace function public.cf_receipt_add(p_form uuid, p_merchant text, p_date date, p_category text, p_subtotal numeric, p_tax numeric, p_total numeric, p_currency text, p_image_path text, p_aligns text, p_status text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_org uuid;
begin
  if not public.cf_is_member(p_form) then raise exception 'not a member'; end if;
  v_org := public.cf_org_of(p_form);
  if v_org is not null and not public.cf_org_allows(v_org,'receipts') then raise exception 'plan_limit:receipts'; end if;
  insert into public.cf_receipts(form_id, merchant, purchase_date, category, subtotal, tax, total, currency, image_path, aligns_with, status)
    values(p_form, nullif(trim(coalesce(p_merchant,'')),''), p_date, nullif(trim(coalesce(p_category,'')),''), p_subtotal, p_tax, p_total, coalesce(nullif(p_currency,''),'CAD'), p_image_path, nullif(trim(coalesce(p_aligns,'')),''), coalesce(nullif(p_status,''),'confirmed'))
    returning id into v_id;
  return v_id;
end $function$;

-- expose plan on org listings
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
    'departments', (select count(*) from public.cf_forms o where o.parent_id=f.id),
    'plan', public.cf_org_eff_plan(f.id), 'plan_until', f.plan_until,
    'member_limit', (public.cf_plan_limits(public.cf_org_eff_plan(f.id)) ->> 'members')::int
  ) order by f.created_at), '[]'::jsonb)
  from public.cf_forms f
  where f.kind='org' and exists(select 1 from public.cf_members m where m.form_id=f.id and m.user_id=auth.uid() and m.status='active');
$function$;

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

insert into public.cf_migrations(name) values ('20260828_quorly_org_plans_gates.sql') on conflict do nothing;
