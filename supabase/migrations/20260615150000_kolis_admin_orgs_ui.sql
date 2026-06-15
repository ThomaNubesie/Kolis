-- ═══════════════════════════════════════════════════════════════════════════
-- Admin Organizations console support: single-org getter + add-member-by-phone.
-- Kolis is phone-first, so staff provision a business by creating the org and
-- adding the owner by phone number (they log in by phone → portal). Email
-- invites still work via kolis_admin_org_invite + kolis_accept_org_invite.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.kolis_admin_org(p_org uuid)
returns setof public.kolis_orgs language sql security definer set search_path to 'public' stable as $$
  select o.* from public.kolis_orgs o where public.kolis_is_staff() and o.id = p_org;
$$;

create or replace function public.kolis_admin_org_add_member_by_phone(p_org uuid, p_phone text, p_role text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_digits text; v_name text;
begin
  if coalesce(public.kolis_admin_role(),'') not in ('owner','admin') then raise exception 'forbidden'; end if;
  if p_role not in ('owner','admin','finance','shipper','dispatcher','driver') then raise exception 'bad_role'; end if;
  v_digits := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  if v_digits = '' then raise exception 'bad_phone'; end if;
  -- auth.users.phone is E.164 without '+', e.g. 16138622639. Accept 10- or 11-digit input.
  select id into v_uid from auth.users
   where phone = v_digits or phone = '1' || v_digits or '1' || phone = v_digits
   limit 1;
  if v_uid is null then raise exception 'no_account_for_phone'; end if;
  insert into public.kolis_org_members(org_id, user_id, role)
  values (p_org, v_uid, p_role)
  on conflict (org_id, user_id) do update set role = excluded.role;
  select full_name into v_name from public.kolis_profiles where id = v_uid;
  return jsonb_build_object('user_id', v_uid, 'full_name', coalesce(v_name, '(no profile yet)'));
end; $$;

-- Staff remove a member (mirrors kolis_org_remove_member but gated by staff role).
create or replace function public.kolis_admin_org_remove_member(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(public.kolis_admin_role(),'') not in ('owner','admin') then raise exception 'forbidden'; end if;
  delete from public.kolis_org_members where org_id = p_org and user_id = p_user;
end; $$;

grant execute on function
  public.kolis_admin_org(uuid),
  public.kolis_admin_org_add_member_by_phone(uuid,text,text),
  public.kolis_admin_org_remove_member(uuid,uuid)
to authenticated;
revoke execute on function
  public.kolis_admin_org(uuid),
  public.kolis_admin_org_add_member_by_phone(uuid,text,text),
  public.kolis_admin_org_remove_member(uuid,uuid)
from public, anon;
