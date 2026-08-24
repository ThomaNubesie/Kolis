-- Quorly: admin deletes a whole form (cascade removes members/entries/comments/votes/fields/files).
create or replace function public.cf_delete_form(p_form uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.cf_is_admin(p_form) then raise exception 'only admin'; end if;
  delete from public.cf_forms where id = p_form;
end $$;
grant execute on function public.cf_delete_form(uuid) to authenticated;
