-- Quorly Dropbox RPCs (SECURITY DEFINER, gated by cf_is_member / cf_is_admin).
create or replace function public.cf_files_list(p_form uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when not public.cf_is_member(p_form) then '[]'::jsonb
    else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'path', f.path, 'size', f.size, 'mime', f.mime,
        'is_final', f.is_final, 'request_id', f.request_id, 'created_at', f.created_at,
        'uploader_name', coalesce(nullif(m.name,''), pr.name, 'Member'),
        'uploader_color', m.color, 'request_label', rq.label, 'mine', f.uploader = auth.uid()
      ) order by f.is_final desc, f.created_at desc)
      from public.cf_files f
        left join public.cf_members m on m.form_id=f.form_id and m.user_id=f.uploader
        left join public.cf_profiles pr on pr.user_id=f.uploader
        left join public.cf_file_requests rq on rq.id=f.request_id
      where f.form_id=p_form
    ), '[]'::jsonb) end;
$$;

create or replace function public.cf_file_requests_list(p_form uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when not public.cf_is_member(p_form) then '[]'::jsonb
    else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'label', r.label, 'required', r.required, 'created_at', r.created_at,
        'fulfilled', (select count(distinct f.uploader) from public.cf_files f where f.request_id=r.id),
        'total_members', (select count(*) from public.cf_members mm where mm.form_id=p_form and mm.status='active'),
        'mine', exists(select 1 from public.cf_files f where f.request_id=r.id and f.uploader=auth.uid())
      ) order by r.created_at)
      from public.cf_file_requests r where r.form_id=p_form
    ), '[]'::jsonb) end;
$$;

create or replace function public.cf_file_add(p_form uuid, p_name text, p_path text, p_size bigint, p_mime text, p_request uuid, p_is_final boolean)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if not public.cf_is_member(p_form) then raise exception 'not a member'; end if;
  if coalesce(p_is_final,false) and not public.cf_is_admin(p_form) then raise exception 'only admin can save the final PDF'; end if;
  insert into public.cf_files(form_id, uploader, name, path, size, mime, request_id, is_final)
    values(p_form, auth.uid(), p_name, p_path, p_size, p_mime, p_request, coalesce(p_is_final,false))
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.cf_file_delete(p_file uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_path text; v_form uuid; v_owner uuid;
begin
  select path, form_id, uploader into v_path, v_form, v_owner from public.cf_files where id=p_file;
  if v_path is null then raise exception 'not found'; end if;
  if not (v_owner = auth.uid() or public.cf_is_admin(v_form)) then raise exception 'not allowed'; end if;
  delete from public.cf_files where id=p_file;
  return v_path;
end $$;

create or replace function public.cf_file_request_add(p_form uuid, p_label text, p_required boolean)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if not public.cf_is_admin(p_form) then raise exception 'only admin'; end if;
  insert into public.cf_file_requests(form_id, label, required, requested_by)
    values(p_form, p_label, coalesce(p_required,true), auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.cf_file_request_delete(p_request uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_form uuid;
begin
  select form_id into v_form from public.cf_file_requests where id=p_request;
  if v_form is null then raise exception 'not found'; end if;
  if not public.cf_is_admin(v_form) then raise exception 'only admin'; end if;
  delete from public.cf_file_requests where id=p_request;
end $$;

grant execute on function
  public.cf_files_list(uuid), public.cf_file_requests_list(uuid),
  public.cf_file_add(uuid,text,text,bigint,text,uuid,boolean), public.cf_file_delete(uuid),
  public.cf_file_request_add(uuid,text,boolean), public.cf_file_request_delete(uuid)
  to authenticated;
