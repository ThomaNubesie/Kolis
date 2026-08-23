-- ============================================================================
-- Quorly backend snapshot (schema + RLS + RPCs) — 2026-08-23
-- Faithful dump of the cf_* objects from the shared Supabase project
-- (kzjptcpjpwlxfofzhyku). Idempotent-ish; run on the target project.
--
-- NOTE: cf_form / cf_invite_info fall back to Kolis `passengers`/`drivers`
-- tables for member name resolution (shared project). On a standalone Quorly
-- project those tables won't exist — strip those two coalesce fallbacks.
-- ============================================================================
set check_function_bodies = off;

-- ============================== TABLES ======================================
create table if not exists public.cf_forms (
  id uuid default gen_random_uuid() not null,
  name text not null,
  description text,
  admin_id uuid default auth.uid() not null,
  features jsonb default '{"ai": true, "fields": true, "photos": false, "voting": false, "comments": true, "translation": true}'::jsonb not null,
  approval_count integer default 1 not null,
  created_at timestamp with time zone default now(),
  nda_text text
);

create table if not exists public.cf_fields (
  id uuid default gen_random_uuid() not null,
  form_id uuid not null,
  label text not null,
  type text not null,
  options text[] default '{}'::text[],
  required boolean default false,
  sort integer default 0
);

create table if not exists public.cf_members (
  id uuid default gen_random_uuid() not null,
  form_id uuid not null,
  user_id uuid,
  email text,
  phone text,
  color text,
  role text default 'member'::text not null,
  status text default 'invited'::text not null,
  invite_token text,
  invited_at timestamp with time zone default now(),
  joined_at timestamp with time zone,
  name text,
  invite_code text,
  nda_accepted_at timestamp with time zone
);

create table if not exists public.cf_entries (
  id uuid default gen_random_uuid() not null,
  form_id uuid not null,
  seq integer default 0 not null,
  author_id uuid default auth.uid() not null,
  "values" jsonb default '{}'::jsonb not null,
  status text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.cf_comments (
  id uuid default gen_random_uuid() not null,
  entry_id uuid not null,
  author_id uuid default auth.uid() not null,
  body text not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.cf_votes (
  id uuid default gen_random_uuid() not null,
  entry_id uuid not null,
  voter_id uuid default auth.uid() not null,
  value text not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.cf_profiles (
  user_id uuid not null,
  name text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.cf_translations (
  id uuid default gen_random_uuid() not null,
  form_id uuid not null,
  source_type text not null,
  source_id uuid not null,
  lang text not null,
  text text not null,
  created_at timestamp with time zone default now()
);

-- ============================ CONSTRAINTS ===================================
alter table public.cf_forms add constraint cf_forms_pkey PRIMARY KEY (id);
alter table public.cf_fields add constraint cf_fields_pkey PRIMARY KEY (id);
alter table public.cf_fields add constraint cf_fields_form_id_fkey FOREIGN KEY (form_id) REFERENCES cf_forms(id) ON DELETE CASCADE;
alter table public.cf_fields add constraint cf_fields_type_check CHECK ((type = ANY (ARRAY['text'::text, 'longtext'::text, 'select'::text, 'number'::text, 'date'::text, 'photo'::text])));
alter table public.cf_members add constraint cf_members_pkey PRIMARY KEY (id);
alter table public.cf_members add constraint cf_members_form_id_fkey FOREIGN KEY (form_id) REFERENCES cf_forms(id) ON DELETE CASCADE;
alter table public.cf_members add constraint cf_members_form_id_user_id_key UNIQUE (form_id, user_id);
alter table public.cf_members add constraint cf_members_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text])));
alter table public.cf_members add constraint cf_members_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'removed'::text])));
alter table public.cf_entries add constraint cf_entries_pkey PRIMARY KEY (id);
alter table public.cf_entries add constraint cf_entries_form_id_fkey FOREIGN KEY (form_id) REFERENCES cf_forms(id) ON DELETE CASCADE;
alter table public.cf_entries add constraint cf_entries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.cf_comments add constraint cf_comments_pkey PRIMARY KEY (id);
alter table public.cf_comments add constraint cf_comments_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES cf_entries(id) ON DELETE CASCADE;
alter table public.cf_votes add constraint cf_votes_pkey PRIMARY KEY (id);
alter table public.cf_votes add constraint cf_votes_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES cf_entries(id) ON DELETE CASCADE;
alter table public.cf_votes add constraint cf_votes_entry_id_voter_id_key UNIQUE (entry_id, voter_id);
alter table public.cf_votes add constraint cf_votes_value_check CHECK ((value = ANY (ARRAY['approve'::text, 'reject'::text])));
alter table public.cf_profiles add constraint cf_profiles_pkey PRIMARY KEY (user_id);
alter table public.cf_translations add constraint cf_translations_pkey PRIMARY KEY (id);
alter table public.cf_translations add constraint cf_translations_form_id_fkey FOREIGN KEY (form_id) REFERENCES cf_forms(id) ON DELETE CASCADE;
alter table public.cf_translations add constraint cf_translations_source_type_source_id_lang_key UNIQUE (source_type, source_id, lang);

-- ============================== INDEXES =====================================
create index if not exists cf_entries_form on public.cf_entries using btree (form_id, seq);
create index if not exists cf_comments_entry on public.cf_comments using btree (entry_id, created_at);
create index if not exists cf_members_user on public.cf_members using btree (user_id);
create unique index if not exists cf_members_form_color on public.cf_members using btree (form_id, color) where ((color is not null) and (status <> 'removed'::text));
create unique index if not exists cf_members_invite_code on public.cf_members using btree (invite_code) where (invite_code is not null);
create unique index if not exists cf_members_uq_email on public.cf_members using btree (form_id, lower(email)) where ((email is not null) and (status <> 'removed'::text));
create unique index if not exists cf_members_uq_phone on public.cf_members using btree (form_id, phone) where ((phone is not null) and (status <> 'removed'::text));

-- ============================== FUNCTIONS ===================================
CREATE OR REPLACE FUNCTION public.cf_is_member(p_form uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists(select 1 from public.cf_members m where m.form_id=p_form and m.user_id=auth.uid() and m.status='active');
$function$;

CREATE OR REPLACE FUNCTION public.cf_is_admin(p_form uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists(select 1 from public.cf_members m where m.form_id=p_form and m.user_id=auth.uid() and m.role='admin' and m.status='active');
$function$;

CREATE OR REPLACE FUNCTION public.cf_can_create()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ select auth.uid() is not null; $function$;

CREATE OR REPLACE FUNCTION public.cf_set_profile(p_name text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','not_authed'); end if;
  insert into public.cf_profiles(user_id, name) values (auth.uid(), nullif(trim(coalesce(p_name,'')),''))
    on conflict (user_id) do update set name = coalesce(nullif(trim(coalesce(p_name,'')),''), public.cf_profiles.name), updated_at = now();
  return jsonb_build_object('ok',true);
end $function$;

CREATE OR REPLACE FUNCTION public.cf_my_profile()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select coalesce((select jsonb_build_object('name', name) from public.cf_profiles where user_id = auth.uid()), '{}'::jsonb);
$function$;

CREATE OR REPLACE FUNCTION public.cf_entry_seq()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if new.seq is null or new.seq = 0 then
    select coalesce(max(seq),0)+1 into new.seq from public.cf_entries where form_id=new.form_id;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.cf_invite(p_form uuid, p_contact text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_email text; v_phone text; v_token text; v_code text;
begin
  if not public.cf_is_admin(p_form) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  if position('@' in p_contact) > 0 then v_email := lower(trim(p_contact)); else v_phone := regexp_replace(p_contact,'[^0-9+]','','g'); end if;
  if v_email is null and (v_phone is null or v_phone = '') then return jsonb_build_object('ok',false,'error','invalid_contact'); end if;
  if exists (
    select 1 from public.cf_members m
    where m.form_id = p_form and m.status <> 'removed'
      and ((v_email is not null and lower(m.email) = v_email) or (v_phone is not null and m.phone = v_phone))
  ) then return jsonb_build_object('ok',false,'error','already_invited'); end if;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    exit when not exists (select 1 from public.cf_members where invite_code = v_code);
  end loop;
  insert into public.cf_members(form_id, email, phone, invite_token, invite_code, status)
    values (p_form, v_email, v_phone, v_token, v_code, 'invited');
  return jsonb_build_object('ok',true,'token',v_token,'code',v_code);
end $function$;

CREATE OR REPLACE FUNCTION public.cf_create_form(p_name text, p_description text, p_features jsonb, p_approval integer, p_color text, p_fields jsonb DEFAULT '[]'::jsonb, p_invites jsonb DEFAULT '[]'::jsonb, p_admin_name text DEFAULT ''::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_form uuid; f jsonb; i jsonb; v_name text;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','not_authed'); end if;
  if nullif(trim(coalesce(p_admin_name,'')),'') is not null then perform public.cf_set_profile(p_admin_name); end if;
  select name into v_name from public.cf_profiles where user_id = auth.uid();
  insert into public.cf_forms(name, description, admin_id, features, approval_count)
    values (p_name, coalesce(p_description,''), auth.uid(), coalesce(p_features,'{}'::jsonb), greatest(1,coalesce(p_approval,1)))
    returning id into v_form;
  insert into public.cf_members(form_id, user_id, name, email, color, role, status, joined_at)
    values (v_form, auth.uid(), coalesce(nullif(trim(coalesce(p_admin_name,'')),''), v_name), (auth.jwt()->>'email'), p_color, 'admin', 'active', now());
  for f in select * from jsonb_array_elements(coalesce(p_fields,'[]'::jsonb)) loop
    insert into public.cf_fields(form_id, label, type, options, required, sort)
      values (v_form, f->>'label', coalesce(f->>'type','text'),
        coalesce((select array_agg(x) from jsonb_array_elements_text(f->'options') x),'{}'),
        coalesce((f->>'required')::boolean,false), coalesce((f->>'sort')::int,0));
  end loop;
  for i in select * from jsonb_array_elements(coalesce(p_invites,'[]'::jsonb)) loop
    perform public.cf_invite(v_form, i->>'contact');
  end loop;
  return jsonb_build_object('ok',true,'form_id',v_form);
end $function$;

CREATE OR REPLACE FUNCTION public.cf_update_form(p_form uuid, p_name text, p_description text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not public.cf_is_admin(p_form) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  update public.cf_forms
    set name = coalesce(nullif(trim(coalesce(p_name,'')),''), name),
        description = coalesce(p_description, description)
  where id = p_form;
  return jsonb_build_object('ok',true);
end $function$;

CREATE OR REPLACE FUNCTION public.cf_set_features(p_form uuid, p_features jsonb, p_approval integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not public.cf_is_admin(p_form) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  update public.cf_forms set features=coalesce(p_features,features), approval_count=greatest(1,coalesce(p_approval,approval_count)) where id=p_form;
  return jsonb_build_object('ok',true);
end $function$;

CREATE OR REPLACE FUNCTION public.cf_set_fields(p_form uuid, p_fields jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare f jsonb; n int := 0;
begin
  if not public.cf_is_admin(p_form) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  delete from public.cf_fields where form_id=p_form;
  for f in select * from jsonb_array_elements(coalesce(p_fields,'[]'::jsonb)) loop
    insert into public.cf_fields(form_id,label,type,options,required,sort)
      values (p_form, f->>'label', coalesce(f->>'type','text'),
        coalesce((select array_agg(x) from jsonb_array_elements_text(f->'options') x),'{}'),
        coalesce((f->>'required')::boolean,false), n);
    n := n+1;
  end loop;
  return jsonb_build_object('ok',true);
end $function$;

CREATE OR REPLACE FUNCTION public.cf_set_nda(p_form uuid, p_text text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not public.cf_is_admin(p_form) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  update public.cf_forms set nda_text = nullif(trim(coalesce(p_text,'')),'') where id=p_form;
  return jsonb_build_object('ok',true);
end $function$;

CREATE OR REPLACE FUNCTION public.cf_add_entry(p_form uuid, p_values jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_id uuid; v_feats jsonb;
begin
  if not public.cf_is_member(p_form) then return jsonb_build_object('ok',false,'error','not_member'); end if;
  select features into v_feats from public.cf_forms where id=p_form;
  if not (public.cf_is_admin(p_form) or coalesce((v_feats->>'member_entries')::boolean,false))
    then return jsonb_build_object('ok',false,'error','entries_not_allowed'); end if;
  insert into public.cf_entries(form_id, author_id, values, status)
    values (p_form, auth.uid(), coalesce(p_values,'{}'::jsonb), case when coalesce((v_feats->>'voting')::boolean,false) then 'pending' else null end)
    returning id into v_id;
  return jsonb_build_object('ok',true,'entry_id',v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.cf_edit_entry(p_entry uuid, p_values jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not exists(select 1 from public.cf_entries where id=p_entry and author_id=auth.uid()) then return jsonb_build_object('ok',false,'error','not_author'); end if;
  update public.cf_entries set values=coalesce(p_values,values), updated_at=now() where id=p_entry;
  return jsonb_build_object('ok',true);
end $function$;

CREATE OR REPLACE FUNCTION public.cf_delete_entry(p_entry uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_form uuid;
begin
  select form_id into v_form from public.cf_entries where id=p_entry;
  if v_form is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not (exists(select 1 from public.cf_entries where id=p_entry and author_id=auth.uid()) or public.cf_is_admin(v_form)) then
    return jsonb_build_object('ok',false,'error','forbidden'); end if;
  delete from public.cf_entries where id=p_entry;
  return jsonb_build_object('ok',true);
end $function$;

CREATE OR REPLACE FUNCTION public.cf_add_comment(p_entry uuid, p_body text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_form uuid; v_id uuid; v_comments boolean;
begin
  select form_id into v_form from public.cf_entries where id=p_entry;
  if v_form is null or not public.cf_is_member(v_form) then return jsonb_build_object('ok',false,'error','not_member'); end if;
  select coalesce((features->>'comments')::boolean,false) into v_comments from public.cf_forms where id=v_form;
  if not v_comments then return jsonb_build_object('ok',false,'error','comments_off'); end if;
  insert into public.cf_comments(entry_id, author_id, body) values (p_entry, auth.uid(), p_body) returning id into v_id;
  return jsonb_build_object('ok',true,'comment_id',v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.cf_vote(p_entry uuid, p_value text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_form uuid; v_need int; v_yes int; v_status text; v_voting boolean;
begin
  select form_id into v_form from public.cf_entries where id=p_entry;
  if v_form is null or not public.cf_is_member(v_form) then return jsonb_build_object('ok',false,'error','not_member'); end if;
  select coalesce((features->>'voting')::boolean,false) into v_voting from public.cf_forms where id=v_form;
  if not v_voting then return jsonb_build_object('ok',false,'error','voting_off'); end if;
  insert into public.cf_votes(entry_id, voter_id, value) values (p_entry, auth.uid(), p_value)
    on conflict (entry_id,voter_id) do update set value=excluded.value, created_at=now();
  select approval_count into v_need from public.cf_forms where id=v_form;
  select count(*) into v_yes from public.cf_votes where entry_id=p_entry and value='approve';
  v_status := case when v_yes >= v_need then 'approved' else 'pending' end;
  update public.cf_entries set status=v_status where id=p_entry;
  return jsonb_build_object('ok',true,'approvals',v_yes,'needed',v_need,'status',v_status);
end $function$;

CREATE OR REPLACE FUNCTION public.cf_set_color(p_form uuid, p_color text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not public.cf_is_member(p_form) then return jsonb_build_object('ok',false,'error','not_member'); end if;
  if exists(select 1 from public.cf_members where form_id=p_form and color=p_color and user_id<>auth.uid() and status<>'removed') then
    return jsonb_build_object('ok',false,'error','color_taken'); end if;
  update public.cf_members set color=p_color where form_id=p_form and user_id=auth.uid();
  return jsonb_build_object('ok',true);
end $function$;

CREATE OR REPLACE FUNCTION public.cf_join(p_form uuid, p_color text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_id uuid; v_email text := lower(coalesce(auth.jwt()->>'email','')); v_phone text := regexp_replace(coalesce(auth.jwt()->>'phone',''),'[^0-9+]','','g');
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','not_authed'); end if;
  select id into v_id from public.cf_members
    where form_id=p_form and status='invited'
      and ((v_email <> '' and lower(email)=v_email) or (v_phone <> '' and phone=v_phone)) limit 1;
  if v_id is null then return jsonb_build_object('ok',false,'error','no_invite'); end if;
  if exists(select 1 from public.cf_members where form_id=p_form and color=p_color and status<>'removed') then
    return jsonb_build_object('ok',false,'error','color_taken'); end if;
  update public.cf_members set user_id=auth.uid(), color=p_color, status='active', joined_at=now() where id=v_id;
  return jsonb_build_object('ok',true,'form_id',p_form);
end $function$;

CREATE OR REPLACE FUNCTION public.cf_join_token(p_token text, p_color text, p_name text DEFAULT ''::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_id uuid; v_form uuid; v_name text; v_nda text;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','not_authed'); end if;
  select id, form_id into v_id, v_form from public.cf_members where invite_token=p_token and status='invited' limit 1;
  if v_id is null then return jsonb_build_object('ok',false,'error','invalid_or_used'); end if;
  if exists(select 1 from public.cf_members where form_id=v_form and color=p_color and status<>'removed') then
    return jsonb_build_object('ok',false,'error','color_taken'); end if;
  if nullif(trim(coalesce(p_name,'')),'') is not null then perform public.cf_set_profile(p_name); end if;
  select name into v_name from public.cf_profiles where user_id = auth.uid();
  select nullif(trim(coalesce(nda_text,'')),'') into v_nda from public.cf_forms where id=v_form;
  update public.cf_members set user_id=auth.uid(), color=p_color, status='active', joined_at=now(),
    invite_token=null, invite_code=null,
    name=coalesce(nullif(trim(coalesce(p_name,'')),''), v_name, name),
    nda_accepted_at=case when v_nda is not null then now() else nda_accepted_at end,
    email=coalesce(email, auth.jwt()->>'email') where id=v_id;
  return jsonb_build_object('ok',true,'form_id',v_form);
end $function$;

CREATE OR REPLACE FUNCTION public.cf_invite_info(p_token text)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select coalesce((select jsonb_build_object(
    'form_id', f.id, 'form_name', f.name,
    'admin', (select coalesce((select name from cf_profiles pr where pr.user_id=f.admin_id), am.name,(select full_name from passengers p where p.id=f.admin_id),(select full_name from drivers d where d.id=f.admin_id),'Admin')
              from cf_members am where am.form_id=f.id and am.user_id=f.admin_id limit 1),
    'nda', nullif(trim(coalesce(f.nda_text,'')),''),
    'taken_colors', (select coalesce(array_agg(color),'{}') from cf_members m2 where m2.form_id=f.id and m2.color is not null and m2.status<>'removed')
  ) from cf_members m join cf_forms f on f.id=m.form_id where m.invite_token=p_token and m.status='invited' limit 1), '{"error":"invalid"}'::jsonb);
$function$;

CREATE OR REPLACE FUNCTION public.cf_resolve_code(p_code text)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select coalesce((select jsonb_build_object('ok',true,'token',invite_token)
                   from public.cf_members
                   where upper(invite_code)=upper(trim(p_code)) and status='invited' and invite_token is not null
                   limit 1), '{"ok":false,"error":"invalid_code"}'::jsonb);
$function$;

CREATE OR REPLACE FUNCTION public.cf_my_forms()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'description',f.description,
    'features',f.features,'is_admin',f.admin_id=auth.uid(),
    'members',(select count(*) from cf_members m where m.form_id=f.id and m.status='active')) order by f.created_at desc),'[]'::jsonb)
  from public.cf_forms f
  where exists(select 1 from cf_members m where m.form_id=f.id and m.user_id=auth.uid() and m.status='active');
$function$;

CREATE OR REPLACE FUNCTION public.cf_form(p_form uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select (case when not public.cf_is_member(p_form) then '{"error":"not_member"}'::jsonb else
    jsonb_build_object(
      'id',f.id,'name',f.name,'description',f.description,'features',f.features,
      'approval_count',f.approval_count,'is_admin',f.admin_id=auth.uid(),'nda',nullif(trim(coalesce(f.nda_text,'')),''),
      'fields',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.label,'type',x.type,'options',x.options,'required',x.required) order by x.sort),'[]'::jsonb) from cf_fields x where x.form_id=f.id),
      'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce((select name from cf_profiles pr where pr.user_id=m.user_id),m.name,(select full_name from passengers p where p.id=m.user_id),(select full_name from drivers d where d.id=m.user_id),m.email,m.phone),'color',m.color,'role',m.role,'status',m.status,'contact',coalesce(m.email,m.phone)) order by m.invited_at),'[]'::jsonb) from cf_members m where m.form_id=f.id and m.status<>'removed'))
    end)
  from public.cf_forms f where f.id=p_form;
$function$;

CREATE OR REPLACE FUNCTION public.cf_entries(p_form uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select case when not public.cf_is_member(p_form) then '[]'::jsonb else
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'seq',e.seq,'author',e.author_id,'values',e.values,'status',e.status,'created_at',e.created_at,
      'approvals',(select count(*) from cf_votes v where v.entry_id=e.id and v.value='approve'),
      'my_vote',(select value from cf_votes v where v.entry_id=e.id and v.voter_id=auth.uid()),
      'comments',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'author',c.author_id,'body',c.body,'created_at',c.created_at) order by c.created_at),'[]'::jsonb) from cf_comments c where c.entry_id=e.id)
    ) order by e.seq) from cf_entries e where e.form_id=p_form),'[]'::jsonb) end;
$function$;

-- ============================== TRIGGER =====================================
drop trigger if exists cf_entry_seq on public.cf_entries;
create trigger cf_entry_seq before insert on public.cf_entries for each row execute function public.cf_entry_seq();

-- ============================ RLS + POLICIES ================================
alter table public.cf_forms enable row level security;
alter table public.cf_fields enable row level security;
alter table public.cf_members enable row level security;
alter table public.cf_entries enable row level security;
alter table public.cf_comments enable row level security;
alter table public.cf_votes enable row level security;
alter table public.cf_profiles enable row level security;
alter table public.cf_translations enable row level security;

drop policy if exists cf_forms_sel on public.cf_forms;
create policy cf_forms_sel on public.cf_forms for select to public using (cf_is_member(id));
drop policy if exists cf_fields_sel on public.cf_fields;
create policy cf_fields_sel on public.cf_fields for select to public using (cf_is_member(form_id));
drop policy if exists cf_members_sel on public.cf_members;
create policy cf_members_sel on public.cf_members for select to public using (cf_is_member(form_id));
drop policy if exists cf_entries_sel on public.cf_entries;
create policy cf_entries_sel on public.cf_entries for select to public using (cf_is_member(form_id));
drop policy if exists cf_comments_sel on public.cf_comments;
create policy cf_comments_sel on public.cf_comments for select to public using (exists (select 1 from cf_entries e where e.id = cf_comments.entry_id and cf_is_member(e.form_id)));
drop policy if exists cf_votes_sel on public.cf_votes;
create policy cf_votes_sel on public.cf_votes for select to public using (exists (select 1 from cf_entries e where e.id = cf_votes.entry_id and cf_is_member(e.form_id)));
drop policy if exists cf_profiles_self_read on public.cf_profiles;
create policy cf_profiles_self_read on public.cf_profiles for select to public using (user_id = auth.uid());
drop policy if exists cf_tr_sel on public.cf_translations;
create policy cf_tr_sel on public.cf_translations for select to public using (cf_is_member(form_id));

-- ============================== GRANTS ======================================
-- Writes go only through the SECURITY DEFINER RPCs (authenticated-only), except
-- the two pre-login lookups (anon). Reads are membership-scoped via the policies.
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname like 'cf\_%' loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;
grant execute on function public.cf_invite_info(text) to anon;
grant execute on function public.cf_resolve_code(text) to anon;
grant select on public.cf_profiles to authenticated, anon;
