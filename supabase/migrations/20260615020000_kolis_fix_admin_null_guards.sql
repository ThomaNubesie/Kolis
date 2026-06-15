-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY FIX: NULL-guard bypass in admin RPCs.
-- kolis_admin_role() returns NULL for non-staff; `NULL not in (...)` and
-- `NULL <> 'owner'` both evaluate to NULL, so `if <guard> then raise 'forbidden'`
-- never fired for non-staff — any authenticated user could call these admin
-- RPCs (self-invite as staff, mint/revoke API keys, remove staff, hijack/reroute
-- parcels, suspend users). Fix wraps the role in coalesce(...,'') so the guard
-- rejects non-staff. Bodies are otherwise byte-identical to the live versions.
-- (Discovered + applied live 2026-06-15 while building Kolis for Business.)
-- ═══════════════════════════════════════════════════════════════════════════


CREATE OR REPLACE FUNCTION public.kolis_admin_assign(p_id uuid, p_driver uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(public.kolis_admin_role(),'') not in ('owner','admin','dispatcher') then
    raise exception 'forbidden';
  end if;
  update public.kolis_parcels
     set preferred_driver_id = p_driver,
         offer_expires_at    = now() + interval '60 minutes',
         driver_id           = null,
         status              = case when dropoff_type = 'hub' then 'received_at_hub' else 'requested' end
   where id = p_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.kolis_admin_change_driver(p_id uuid, p_driver uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(public.kolis_admin_role(),'') not in ('owner','admin','dispatcher') then raise exception 'forbidden'; end if;
  update public.kolis_parcels set driver_id = p_driver where id = p_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.kolis_admin_create_key(p_name text, p_scopes text[] DEFAULT '{read_parcels}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_key text; v_prefix text;
begin
  if coalesce(public.kolis_admin_role(),'') <> 'owner' then raise exception 'forbidden'; end if;
  v_key := 'kls_live_' || encode(gen_random_bytes(24), 'hex');
  v_prefix := left(v_key, 16);
  insert into public.kolis_access_keys(name, prefix, key_hash, scopes, created_by)
  values (p_name, v_prefix, encode(digest(v_key, 'sha256'), 'hex'), p_scopes, auth.uid());
  return jsonb_build_object('key', v_key, 'prefix', v_prefix);  -- shown once
end; $function$;

CREATE OR REPLACE FUNCTION public.kolis_admin_invite(p_email text, p_role text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid;
begin
  if coalesce(public.kolis_admin_role(),'') <> 'owner' then raise exception 'forbidden'; end if;
  if p_role not in ('admin','dispatcher','finance','support') then raise exception 'bad role'; end if;
  select id into v_uid from public.kolis_profiles where lower(email) = lower(p_email) limit 1;
  if v_uid is not null then
    insert into public.kolis_admin_roles(user_id, role, invited_email, invited_by)
    values (v_uid, p_role, p_email, auth.uid())
    on conflict (user_id) do update set role = excluded.role;
    return 'granted';
  else
    insert into public.kolis_admin_invites(email, role, invited_by) values (lower(p_email), p_role, auth.uid())
    on conflict (email) do update set role = excluded.role;
    return 'pending';
  end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.kolis_admin_remove_staff(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(public.kolis_admin_role(),'') <> 'owner' then raise exception 'forbidden'; end if;
  delete from public.kolis_admin_roles where user_id = p_user;
end; $function$;

CREATE OR REPLACE FUNCTION public.kolis_admin_reroute(p_id uuid, p_to_city text, p_to_region text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(public.kolis_admin_role(),'') not in ('owner','admin','dispatcher') then raise exception 'forbidden'; end if;
  update public.kolis_parcels set to_city = p_to_city, to_region = p_to_region where id = p_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.kolis_admin_revoke_key(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(public.kolis_admin_role(),'') <> 'owner' then raise exception 'forbidden'; end if;
  update public.kolis_access_keys set revoked_at = now() where id = p_id and revoked_at is null;
end; $function$;

CREATE OR REPLACE FUNCTION public.kolis_admin_suspend(p_id uuid, p_suspended boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(public.kolis_admin_role(),'') not in ('owner','admin') then raise exception 'forbidden'; end if;
  update public.kolis_profiles set suspended = p_suspended where id = p_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.kolis_admin_unassign(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(public.kolis_admin_role(),'') not in ('owner','admin','dispatcher') then raise exception 'forbidden'; end if;
  update public.kolis_parcels
     set driver_id = null,
         status = case when dropoff_type='hub' then 'received_at_hub' else 'requested' end
   where id = p_id;
end; $function$;
