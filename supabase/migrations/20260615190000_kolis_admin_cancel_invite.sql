-- Let an owner delete a pending staff invite (so it can be re-sent or cleaned up).
create or replace function public.kolis_admin_cancel_invite(p_email text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(public.kolis_admin_role(),'') <> 'owner' then raise exception 'forbidden'; end if;
  delete from public.kolis_admin_invites where lower(email) = lower(p_email);
end; $$;

revoke all on function public.kolis_admin_cancel_invite(text) from anon, public;
grant execute on function public.kolis_admin_cancel_invite(text) to authenticated;
