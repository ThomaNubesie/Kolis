-- Quorly: remember which language each person reads in, so transactional mail (invites,
-- shared files, download requests, expiry reminders, exports) goes out in THEIR language
-- rather than in whatever language the sender happened to be using.
--
-- Two places hold it, because an invitee has no profile yet:
--   cf_profiles.lang — the member's own choice, set the moment they flip EN/FR in the app.
--   cf_members.lang  — the language the inviting admin was working in, recorded per invite;
--                      only a fallback until the person expresses a preference.

alter table public.cf_profiles add column if not exists lang text check (lang in ('en','fr'));
alter table public.cf_members  add column if not exists lang text check (lang in ('en','fr'));

-- Called whenever the member picks a language in the UI.
create or replace function public.cf_set_lang(p_lang text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_lang text := lower(nullif(trim(coalesce(p_lang,'')),''));
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','not_authed'); end if;
  if v_lang not in ('en','fr') then return jsonb_build_object('ok',false,'error','bad_value'); end if;
  insert into public.cf_profiles(user_id, lang) values (auth.uid(), v_lang)
    on conflict (user_id) do update set lang = excluded.lang, updated_at = now();
  -- Carry it onto the member's rows too, so mail about a form can resolve a language
  -- without a second lookup.
  update public.cf_members set lang = v_lang where user_id = auth.uid();
  return jsonb_build_object('ok',true,'lang',v_lang);
end $function$;
grant execute on function public.cf_set_lang(text) to authenticated;

-- cf_invite gains an optional language (what the admin's UI was in when they invited).
create or replace function public.cf_invite(p_form uuid, p_contact text, p_lang text default null)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_email text; v_phone text; v_token text; v_code text; v_lang text := lower(nullif(trim(coalesce(p_lang,'')),''));
begin
  if not public.cf_is_admin(p_form) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  if v_lang not in ('en','fr') then v_lang := null; end if;
  if position('@' in p_contact) > 0 then v_email := lower(trim(p_contact));
  else v_phone := regexp_replace(p_contact,'[^0-9+]','','g'); end if;
  if v_email is null and (v_phone is null or v_phone = '') then return jsonb_build_object('ok',false,'error','invalid_contact'); end if;
  if exists (select 1 from public.cf_members m where m.form_id = p_form and m.status <> 'removed'
             and ((v_email is not null and lower(m.email) = v_email) or (v_phone is not null and m.phone = v_phone)))
    then return jsonb_build_object('ok',false,'error','already_invited'); end if;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  loop v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    exit when not exists (select 1 from public.cf_members where invite_code = v_code); end loop;
  insert into public.cf_members(form_id, email, phone, invite_token, invite_code, status, lang)
    values (p_form, v_email, v_phone, v_token, v_code, 'invited', v_lang);
  return jsonb_build_object('ok',true,'token',v_token,'code',v_code);
end $function$;

-- Which language to write to a given contact in, resolved once, server-side:
--   1. the person's own choice   2. what their invite recorded
--   3. the admin of the form they're being written to about   4. English.
create or replace function public.cf_lang_for(p_contact text, p_form uuid default null)
 returns text language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(
    (select pr.lang from cf_members m join cf_profiles pr on pr.user_id = m.user_id
      where (lower(m.email) = lower(trim(p_contact)) or m.phone = regexp_replace(p_contact,'[^0-9+]','','g'))
        and pr.lang is not null order by m.joined_at desc nulls last limit 1),
    (select m.lang from cf_members m
      where (lower(m.email) = lower(trim(p_contact)) or m.phone = regexp_replace(p_contact,'[^0-9+]','','g'))
        and m.lang is not null order by m.invited_at desc limit 1),
    (select pr.lang from cf_forms f join cf_profiles pr on pr.user_id = f.admin_id
      where f.id = p_form and pr.lang is not null),
    'en');
$function$;

-- Replacing cf_invite with a defaulted 3rd argument leaves the old 2-arg function in place,
-- and every 2-argument call (PostgREST's included) then fails "is not unique". Drop it.
drop function if exists public.cf_invite(uuid, text);
grant execute on function public.cf_invite(uuid, text, text) to authenticated;

-- Invites entered on the create-form screen carry the admin's language too.
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
  for i in select * from jsonb_array_elements(coalesce(p_invites,'[]'::jsonb)) loop perform public.cf_invite(v_form, i->>'contact', i->>'lang'); end loop;
  return jsonb_build_object('ok',true,'form_id',v_form);
end $function$;
