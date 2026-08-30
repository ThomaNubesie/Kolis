-- Quorly announcements: a "continuous welcome" feed of dated posts with optional
-- deadlines. Replaces the old static home-content "announcements" block. Shown on the
-- org Home (assembly feed) and on each department. A department admin can post to THIS
-- department, or a dept-admin can post UP to the assembly (the org). Idempotent.

create table if not exists public.cf_announcements (
  id         uuid primary key default gen_random_uuid(),
  form_id    uuid not null references public.cf_forms(id) on delete cascade,
  author_id  uuid,
  body       text not null,
  deadline   timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists cf_announcements_form_idx on public.cf_announcements(form_id, created_at desc);

alter table public.cf_announcements enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polrelid='public.cf_announcements'::regclass and polname='cf_ann_read') then
    create policy cf_ann_read on public.cf_announcements for select using (public.cf_is_member(form_id));
  end if;
end $$;

-- List announcements for a form (members only). Returns { can_post, items:[...] }.
create or replace function public.cf_ann_list(p_form uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select case when not public.cf_is_member(p_form) then '{"error":"not_member"}'::jsonb else
    jsonb_build_object('can_post', public.cf_is_admin(p_form), 'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'body', a.body, 'deadline', a.deadline, 'created_at', a.created_at,
        'author', coalesce((select name from public.cf_members m where m.form_id=p_form and m.user_id=a.author_id limit 1),
                           (select name from public.cf_profiles pr where pr.user_id=a.author_id), '—'),
        'author_color', (select color from public.cf_members m where m.form_id=p_form and m.user_id=a.author_id limit 1),
        'can_delete', (public.cf_is_admin(p_form) or a.author_id=auth.uid())
      ) order by a.created_at desc)
      from public.cf_announcements a where a.form_id=p_form), '[]'::jsonb))
  end;
$function$;

-- Post an announcement. Admin of the target form, OR (posting up to an org) a dept-admin.
create or replace function public.cf_ann_add(p_form uuid, p_body text, p_deadline timestamptz default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_kind text; v_id uuid;
begin
  if nullif(trim(coalesce(p_body,'')),'') is null then return jsonb_build_object('ok',false,'error','empty'); end if;
  select kind into v_kind from public.cf_forms where id=p_form;
  if v_kind is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not (public.cf_is_admin(p_form)
      or (v_kind='org' and exists(select 1 from public.cf_forms d join public.cf_members m on m.form_id=d.id
             where d.parent_id=p_form and m.user_id=auth.uid() and m.role='admin' and m.status='active'))) then
    return jsonb_build_object('ok',false,'error','not_admin');
  end if;
  insert into public.cf_announcements(form_id,author_id,body,deadline) values(p_form,auth.uid(),trim(p_body),p_deadline) returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
end $function$;

-- Delete an announcement. Admin of its form, or the author.
create or replace function public.cf_ann_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_form uuid; v_author uuid;
begin
  select form_id, author_id into v_form, v_author from public.cf_announcements where id=p_id;
  if v_form is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not (public.cf_is_admin(v_form) or v_author=auth.uid()) then return jsonb_build_object('ok',false,'error','not_allowed'); end if;
  delete from public.cf_announcements where id=p_id;
  return jsonb_build_object('ok',true);
end $function$;

insert into public.cf_migrations(name) values ('20260830_quorly_announcements.sql') on conflict do nothing;
