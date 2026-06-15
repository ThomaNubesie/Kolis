-- Founding = first 100 per role: FREE but must be identity-verified first.
-- Atomic: claim the per-role slot and stamp the profile in one transaction so a
-- slot can never be consumed without being recorded on the member.
create or replace function public.kolis_activate_founding() returns jsonb
  language plpgsql security definer set search_path to 'public' as $$
declare v_role text; v_verified boolean; v_paid boolean; v_fn int; n int;
begin
  select role, identity_verified, verification_fee_paid, founding_number
    into v_role, v_verified, v_paid, v_fn
    from public.kolis_profiles where id = auth.uid();
  if v_role is null then raise exception 'no_profile'; end if;
  if coalesce(v_paid, false) then return jsonb_build_object('ok', true, 'founding_number', v_fn); end if;
  if not coalesce(v_verified, false) then raise exception 'verify_identity_first'; end if;
  update public.kolis_founding set count = count + 1
    where role = v_role and count < 100 returning count into n;
  if n is null then return jsonb_build_object('founding', false); end if; -- cap reached → must pay
  update public.kolis_profiles
    set is_founding = true, founding_number = n, verification_fee_paid = true
    where id = auth.uid();
  return jsonb_build_object('ok', true, 'founding_number', n);
end; $$;

-- Accounts that started a Kolis signup but never created a member profile
-- (and aren't LoadQ drivers in this shared project). Gated by the members cap.
create or replace function public.kolis_admin_pending_members()
  returns table(id uuid, email text, phone text, created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean)
  language sql stable security definer set search_path to 'public' as $$
  select u.id, u.email, u.phone, u.created_at, u.last_sign_in_at,
         (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  from auth.users u
  where public.kolis_admin_has_cap('members')
    and not exists (select 1 from public.kolis_profiles p where p.id = u.id)
    and not exists (select 1 from public.drivers d where d.id = u.id)
    and (coalesce(u.email,'') <> '' or coalesce(u.phone,'') <> '')
  order by u.created_at desc;
$$;

grant execute on function public.kolis_activate_founding() to authenticated;
grant execute on function public.kolis_admin_pending_members() to authenticated;
revoke all on function public.kolis_activate_founding() from anon, public;
revoke all on function public.kolis_admin_pending_members() from anon, public;
