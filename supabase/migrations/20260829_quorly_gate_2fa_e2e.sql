-- Quorly plan gates, part 2: 2FA / download-approval (Board+) and E2E (Business+).
-- Only gates when the form belongs to an org (standalone/personal forms stay free);
-- turning a toggle OFF is never blocked. Idempotent. Depends on cf_org_allows /
-- cf_org_eff_plan from 20260828_quorly_org_plans_gates.sql.

create or replace function public.cf_form_set_2fa(p_form uuid, p_on boolean)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_org uuid;
begin
  if not public.cf_is_admin(p_form) then raise exception 'not allowed'; end if;
  if coalesce(p_on,false) then
    v_org := public.cf_org_of(p_form);
    if v_org is not null and not public.cf_org_allows(v_org,'twofa') then raise exception 'plan_limit:twofa'; end if;
  end if;
  update public.cf_forms set require_2fa = coalesce(p_on,false) where id=p_form;
end $function$;

create or replace function public.cf_form_set_download_approval(p_form uuid, p_on boolean)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_org uuid;
begin
  if not public.cf_is_admin(p_form) then raise exception 'not allowed'; end if;
  if coalesce(p_on,false) then
    v_org := public.cf_org_of(p_form);
    if v_org is not null and not public.cf_org_allows(v_org,'twofa') then raise exception 'plan_limit:twofa'; end if;
  end if;
  update public.cf_forms set require_download_approval = coalesce(p_on,false) where id=p_form;
end $function$;

create or replace function public.cf_file_add(p_form uuid, p_name text, p_path text, p_size bigint, p_mime text, p_request uuid, p_is_final boolean, p_encrypted boolean default false, p_enc_iv text default null::text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_org uuid;
begin
  if not public.cf_is_member(p_form) then raise exception 'not a member'; end if;
  if coalesce(p_is_final,false) and not public.cf_is_admin(p_form) then raise exception 'only admin can save the final PDF'; end if;
  if coalesce(p_encrypted,false) then
    v_org := public.cf_org_of(p_form);
    if v_org is not null and not public.cf_org_allows(v_org,'e2e') then raise exception 'plan_limit:e2e'; end if;
  end if;
  insert into public.cf_files(form_id, uploader, name, path, size, mime, request_id, is_final, encrypted, enc_iv)
    values(p_form, auth.uid(), p_name, p_path, p_size, p_mime, p_request, coalesce(p_is_final,false), coalesce(p_encrypted,false), p_enc_iv) returning id into v_id;
  perform public.cf__log(p_form, v_id, 'uploaded', jsonb_build_object('name', p_name, 'encrypted', coalesce(p_encrypted,false)));
  return v_id;
end $function$;

insert into public.cf_migrations(name) values ('20260829_quorly_gate_2fa_e2e.sql') on conflict do nothing;
