-- ===== Quorly outreach engine (mirror of Kolis concord_outreach) =====

create table if not exists public.quorly_outreach (
  id uuid primary key default gen_random_uuid(),
  org_name text not null,
  email text unique,
  contact_name text,
  phone text,
  website text,
  category text,                 -- association | non-profit | condo-board | community-association | foundation | sports-club | faith | coop | other
  region text,
  status text not null default 'active',   -- new | active | clicked | engaged | replied | bounced | stopped | done
  stage text default 'new',                -- new | contacted | met | customer
  touch_count int not null default 0,
  initial_sent_at timestamptz, last_sent_at timestamptz, next_due_at timestamptz,
  opened_at timestamptz, clicked_at timestamptz, bounced_at timestamptz, replied_at timestamptz,
  contacted_at timestamptz, followup_due_at timestamptz, followup_sent_at timestamptz,
  suggested_at timestamptz, approved_at timestamptz,
  fit text, notes text,
  created_at timestamptz default now()
);
create table if not exists public.quorly_outreach_events (
  id uuid primary key default gen_random_uuid(),
  email text, type text, meta jsonb, created_at timestamptz default now()
);
create table if not exists public.quorly_outreach_admins ( user_id uuid primary key );
insert into public.quorly_outreach_admins(user_id) values ('708d5f0f-cae1-4888-892b-17d2f27a0e24') on conflict do nothing;

alter table public.quorly_outreach enable row level security;
alter table public.quorly_outreach_events enable row level security;
alter table public.quorly_outreach_admins enable row level security;

-- who may operate the console
create or replace function public.qo_is_admin()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from quorly_outreach_admins where user_id=auth.uid())
      or coalesce(auth.jwt()->>'email','') = 'shaloderick@gmail.com';
$$;

-- seed/advance a campaign on send (called by the edge fn via service role; not gated)
create or replace function public.quorly_outreach_add(p_name text, p_email text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_email text := lower(nullif(trim(p_email),''));
begin
  if v_email is null then return null; end if;
  insert into quorly_outreach(org_name,email,status,stage,touch_count,initial_sent_at,last_sent_at,next_due_at,contacted_at)
    values(coalesce(nullif(trim(p_name),''),v_email), v_email, 'active','contacted',1,now(),now(),now()+interval '7 days',now())
  on conflict (email) do update
    set last_sent_at=now(), touch_count=quorly_outreach.touch_count+1, status='active',
        next_due_at=now()+interval '7 days'
  returning id into v_id;
  insert into quorly_outreach_events(email,type) values (v_email,'sent');
  return v_id;
end $$;

-- ===== console RPCs (admin-gated) =====
create or replace function public.qo_stats()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when not public.qo_is_admin() then jsonb_build_object('error','forbidden') else jsonb_build_object(
    'total',(select count(*) from quorly_outreach),
    'new',(select count(*) from quorly_outreach where status='new'),
    'contacted',(select count(*) from quorly_outreach where touch_count>0),
    'opened',(select count(*) from quorly_outreach where opened_at is not null),
    'clicked',(select count(*) from quorly_outreach where clicked_at is not null),
    'replied',(select count(*) from quorly_outreach where status='replied'),
    'engaged',(select count(*) from quorly_outreach where status in ('engaged','clicked')),
    'bounced',(select count(*) from quorly_outreach where status='bounced')
  ) end;
$$;

create or replace function public.qo_list(p_filter text default null)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when not public.qo_is_admin() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',id,'org_name',org_name,'email',email,'contact_name',contact_name,'category',category,
      'region',region,'status',status,'stage',stage,'touch_count',touch_count,'fit',fit,
      'last_sent_at',last_sent_at,'next_due_at',next_due_at,'opened_at',opened_at,'clicked_at',clicked_at,
      'replied_at',replied_at,'bounced_at',bounced_at,'created_at',created_at,'suggested_at',suggested_at
    ) order by coalesce(clicked_at,replied_at,last_sent_at,suggested_at,created_at) desc)
    from quorly_outreach
    where p_filter is null
       or (p_filter='new' and status='new')
       or (p_filter='active' and status='active')
       or (p_filter='engaged' and status in ('engaged','clicked','replied'))
       or (p_filter='bounced' and status='bounced')
  ),'[]'::jsonb) end;
$$;

create or replace function public.qo_add(p_name text, p_email text, p_category text default null, p_contact text default null, p_region text default null, p_fit text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_email text := lower(nullif(trim(p_email),''));
begin
  if not public.qo_is_admin() then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then return jsonb_build_object('ok',false,'error','name_required'); end if;
  insert into quorly_outreach(org_name,email,contact_name,category,region,fit,status,stage,suggested_at)
    values(trim(p_name),v_email,nullif(trim(coalesce(p_contact,'')),''),nullif(trim(coalesce(p_category,'')),''),
           nullif(trim(coalesce(p_region,'')),''),nullif(trim(coalesce(p_fit,'')),''),'new','new',now())
  on conflict (email) do update set org_name=excluded.org_name, category=coalesce(excluded.category,quorly_outreach.category),
           fit=coalesce(excluded.fit,quorly_outreach.fit)
  returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
end $$;

create or replace function public.qo_approve(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.qo_is_admin() then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  update quorly_outreach set status='active', stage='contacted', approved_at=now(), touch_count=0,
    next_due_at=now() where id=p_id and email is not null;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.qo_set_stage(p_id uuid, p_stage text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.qo_is_admin() then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  update quorly_outreach set stage=p_stage,
    followup_due_at = case when p_stage='met' then now()+interval '2 days' else followup_due_at end
    where id=p_id;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.qo_stop(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.qo_is_admin() then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  update quorly_outreach set status='stopped', next_due_at=null where id=p_id;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.qo_resume(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.qo_is_admin() then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  update quorly_outreach set status='active', next_due_at=now()+interval '7 days' where id=p_id;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.qo_events(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when not public.qo_is_admin() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('type',e.type,'created_at',e.created_at,'meta',e.meta) order by e.created_at desc)
    from quorly_outreach_events e join quorly_outreach o on o.email=e.email where o.id=p_id
  ),'[]'::jsonb) end;
$$;

grant execute on function public.qo_is_admin() to authenticated, anon;
grant execute on function public.qo_stats() to authenticated, anon;
grant execute on function public.qo_list(text) to authenticated, anon;
grant execute on function public.qo_add(text,text,text,text,text,text) to authenticated, anon;
grant execute on function public.qo_approve(uuid) to authenticated, anon;
grant execute on function public.qo_set_stage(uuid,text) to authenticated, anon;
grant execute on function public.qo_stop(uuid) to authenticated, anon;
grant execute on function public.qo_resume(uuid) to authenticated, anon;
grant execute on function public.qo_events(uuid) to authenticated, anon;
