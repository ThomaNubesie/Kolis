-- Quorly Town Hall: a common department per org where members voice concerns.
-- Admin opens a TOPIC; members post ENTRIES (text + photo/video) that carry a
-- For/Against vote, a two-level comment thread, and a running AI summary. On
-- close, a PDF (tally + per-entry summaries) is published and emailed to all
-- participants (edge fn cf-th-publish). Idempotent.

create table if not exists public.cf_th_topics (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.cf_forms(id) on delete cascade,
  title text not null, status text not null default 'open',
  created_by uuid, created_at timestamptz not null default now(),
  closed_by uuid, closed_at timestamptz, pdf_path text);
create index if not exists cf_th_topics_org on public.cf_th_topics(org_id, created_at desc);

create table if not exists public.cf_th_entries (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.cf_th_topics(id) on delete cascade,
  author_id uuid, body text not null, summary text, seq int,
  created_at timestamptz not null default now());
create index if not exists cf_th_entries_topic on public.cf_th_entries(topic_id, created_at);

create table if not exists public.cf_th_media (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.cf_th_entries(id) on delete cascade,
  path text not null, kind text not null default 'image');

create table if not exists public.cf_th_votes (
  entry_id uuid not null references public.cf_th_entries(id) on delete cascade,
  user_id uuid not null, value text not null, created_at timestamptz not null default now(),
  primary key (entry_id, user_id));

create table if not exists public.cf_th_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.cf_th_entries(id) on delete cascade,
  parent_id uuid references public.cf_th_comments(id) on delete cascade,
  author_id uuid, body text not null, created_at timestamptz not null default now());
create index if not exists cf_th_comments_entry on public.cf_th_comments(entry_id, created_at);

alter table public.cf_th_topics   enable row level security;
alter table public.cf_th_entries  enable row level security;
alter table public.cf_th_media    enable row level security;
alter table public.cf_th_votes    enable row level security;
alter table public.cf_th_comments enable row level security;
drop policy if exists th_topics_read on public.cf_th_topics;
create policy th_topics_read on public.cf_th_topics for select using (public.cf_is_member(org_id));
drop policy if exists th_entries_read on public.cf_th_entries;
create policy th_entries_read on public.cf_th_entries for select using (exists(select 1 from public.cf_th_topics t where t.id=topic_id and public.cf_is_member(t.org_id)));
drop policy if exists th_media_read on public.cf_th_media;
create policy th_media_read on public.cf_th_media for select using (exists(select 1 from public.cf_th_entries e join public.cf_th_topics t on t.id=e.topic_id where e.id=entry_id and public.cf_is_member(t.org_id)));
drop policy if exists th_votes_read on public.cf_th_votes;
create policy th_votes_read on public.cf_th_votes for select using (exists(select 1 from public.cf_th_entries e join public.cf_th_topics t on t.id=e.topic_id where e.id=entry_id and public.cf_is_member(t.org_id)));
drop policy if exists th_comments_read on public.cf_th_comments;
create policy th_comments_read on public.cf_th_comments for select using (exists(select 1 from public.cf_th_entries e join public.cf_th_topics t on t.id=e.topic_id where e.id=entry_id and public.cf_is_member(t.org_id)));

create or replace function public.th_open_topic(p_org uuid, p_title text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if not public.cf_is_admin(p_org) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  if nullif(trim(coalesce(p_title,'')),'') is null then return jsonb_build_object('ok',false,'error','title_required'); end if;
  update public.cf_th_topics set status='closed', closed_at=now(), closed_by=auth.uid() where org_id=p_org and status='open';
  insert into public.cf_th_topics(org_id,title,created_by) values(p_org, trim(p_title), auth.uid()) returning id into v_id;
  return jsonb_build_object('ok',true,'topic_id',v_id);
end $$;

create or replace function public.th_close_topic(p_topic uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid;
begin
  select org_id into v_org from public.cf_th_topics where id=p_topic;
  if v_org is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not public.cf_is_admin(v_org) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  update public.cf_th_topics set status='closed', closed_at=now(), closed_by=auth.uid() where id=p_topic;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.th_entry_add(p_topic uuid, p_body text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid; v_status text; v_id uuid; v_seq int;
begin
  select org_id, status into v_org, v_status from public.cf_th_topics where id=p_topic;
  if v_org is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not public.cf_is_member(v_org) then return jsonb_build_object('ok',false,'error','not_member'); end if;
  if v_status <> 'open' then return jsonb_build_object('ok',false,'error','topic_closed'); end if;
  if nullif(trim(coalesce(p_body,'')),'') is null then return jsonb_build_object('ok',false,'error','empty'); end if;
  select coalesce(max(seq),0)+1 into v_seq from public.cf_th_entries where topic_id=p_topic;
  insert into public.cf_th_entries(topic_id,author_id,body,seq) values(p_topic,auth.uid(),trim(p_body),v_seq) returning id into v_id;
  return jsonb_build_object('ok',true,'entry_id',v_id);
end $$;

create or replace function public.th_media_add(p_entry uuid, p_path text, p_kind text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid;
begin
  select t.org_id into v_org from public.cf_th_entries e join public.cf_th_topics t on t.id=e.topic_id where e.id=p_entry;
  if v_org is null or not public.cf_is_member(v_org) then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  insert into public.cf_th_media(entry_id,path,kind) values(p_entry,p_path,coalesce(nullif(p_kind,''),'image'));
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.th_vote(p_entry uuid, p_value text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid; v_status text;
begin
  select t.org_id, t.status into v_org, v_status from public.cf_th_entries e join public.cf_th_topics t on t.id=e.topic_id where e.id=p_entry;
  if v_org is null or not public.cf_is_member(v_org) then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  if v_status <> 'open' then return jsonb_build_object('ok',false,'error','topic_closed'); end if;
  if p_value not in ('for','against') then return jsonb_build_object('ok',false,'error','bad_value'); end if;
  insert into public.cf_th_votes(entry_id,user_id,value) values(p_entry,auth.uid(),p_value)
    on conflict (entry_id,user_id) do update set value=excluded.value, created_at=now();
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.th_comment_add(p_entry uuid, p_parent uuid, p_body text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid; v_status text; v_pparent uuid; v_id uuid;
begin
  select t.org_id, t.status into v_org, v_status from public.cf_th_entries e join public.cf_th_topics t on t.id=e.topic_id where e.id=p_entry;
  if v_org is null or not public.cf_is_member(v_org) then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  if v_status <> 'open' then return jsonb_build_object('ok',false,'error','topic_closed'); end if;
  if nullif(trim(coalesce(p_body,'')),'') is null then return jsonb_build_object('ok',false,'error','empty'); end if;
  if p_parent is not null then
    select parent_id into v_pparent from public.cf_th_comments where id=p_parent and entry_id=p_entry;
    if not found then return jsonb_build_object('ok',false,'error','bad_parent'); end if;
    if v_pparent is not null then return jsonb_build_object('ok',false,'error','max_depth'); end if;
  end if;
  insert into public.cf_th_comments(entry_id,parent_id,author_id,body) values(p_entry,p_parent,auth.uid(),trim(p_body)) returning id into v_id;
  return jsonb_build_object('ok',true,'comment_id',v_id);
end $$;

create or replace function public.th_set_summary(p_entry uuid, p_summary text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid;
begin
  select t.org_id into v_org from public.cf_th_entries e join public.cf_th_topics t on t.id=e.topic_id where e.id=p_entry;
  if v_org is null or not public.cf_is_member(v_org) then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  update public.cf_th_entries set summary = p_summary where id=p_entry;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.th_feed(p_org uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when not public.cf_is_member(p_org) then '{"error":"not_member"}'::jsonb
  else (
    with t as (select * from public.cf_th_topics where org_id=p_org order by created_at desc limit 1)
    select jsonb_build_object(
      'is_admin', public.cf_is_admin(p_org),
      'topic', (select jsonb_build_object('id',t.id,'title',t.title,'status',t.status,'created_at',t.created_at,'closed_at',t.closed_at,'pdf_path',t.pdf_path) from t),
      'entries', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', e.id, 'seq', e.seq, 'body', e.body, 'summary', e.summary, 'created_at', e.created_at,
          'author', coalesce(am.name,'—'), 'author_color', am.color, 'mine', e.author_id = auth.uid(),
          'media', coalesce((select jsonb_agg(jsonb_build_object('path',md.path,'kind',md.kind)) from public.cf_th_media md where md.entry_id=e.id),'[]'::jsonb),
          'for', (select count(*) from public.cf_th_votes v where v.entry_id=e.id and v.value='for'),
          'against', (select count(*) from public.cf_th_votes v where v.entry_id=e.id and v.value='against'),
          'my_vote', (select v.value from public.cf_th_votes v where v.entry_id=e.id and v.user_id=auth.uid()),
          'comments', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', c.id, 'body', c.body, 'created_at', c.created_at, 'author', coalesce(cm.name,'—'), 'author_color', cm.color,
              'replies', coalesce((
                select jsonb_agg(jsonb_build_object('id',rc.id,'body',rc.body,'created_at',rc.created_at,'author',coalesce(rm.name,'—'),'author_color',rm.color) order by rc.created_at)
                from public.cf_th_comments rc left join public.cf_members rm on rm.form_id=p_org and rm.user_id=rc.author_id
                where rc.parent_id=c.id),'[]'::jsonb)
            ) order by c.created_at)
            from public.cf_th_comments c left join public.cf_members cm on cm.form_id=p_org and cm.user_id=c.author_id
            where c.entry_id=e.id and c.parent_id is null),'[]'::jsonb)
        ) order by e.created_at desc)
        from public.cf_th_entries e
        left join public.cf_members am on am.form_id=p_org and am.user_id=e.author_id
        where e.topic_id=(select id from t)),'[]'::jsonb)
    )
  ) end;
$$;

insert into public.cf_migrations(name) values ('20260829_quorly_townhall.sql') on conflict do nothing;
