-- ============================================================================
-- LoadQ: the incident register, on the tablet — 2026-09-06
--
-- The paper form is "Registre d'incident / Incident Log — Sollicitation ou
-- prise en charge par un chauffeur sans permis", Concord Express letterhead,
-- Ottawa Vehicle-for-Hire By-law 2016-272 in the footer. It is filled in at the
-- kerb when an unlicensed car works the queue at 140 rue George.
--
-- What the paper cannot do, and this must:
--   * fill the number, date, time and place itself — and still let the writer
--     correct them, because the form is often written twenty minutes later
--   * hold the photo AND THE VIDEO, taken on the tablet, timestamped, filed
--     under the incident rather than in someone's camera roll
--   * go out by email the moment it is signed, to addresses saved once, with a
--     record of who it went to
--
-- A report nobody can send, and photos nobody can find, is the reason the paper
-- version stopped being written.
-- ============================================================================
set check_function_bodies = off;

create table if not exists public.loadq_incidents (
  id            uuid primary key default gen_random_uuid(),
  incident_no   text unique not null,
  zone_id       text not null default 'ottawa-universal-grocery',
  occurred_at   timestamptz not null default now(),
  location      text not null default '140, rue George, Ottawa (Ontario)',
  -- vehicle
  plate         text,
  make          text,
  model         text,
  color         text,
  passengers    int,
  driver_desc   text,
  -- observations, the four tick boxes on the form
  obs_solicitation boolean not null default false,
  obs_cash         boolean not null default false,
  obs_hailed       boolean not null default false,
  obs_no_licence   boolean not null default false,
  description   text,
  -- who wrote it
  recorded_by       uuid,
  recorded_by_name  text,
  signature_path    text,
  status        text not null default 'draft',   -- draft | filed
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.loadq_incidents is
  'One row per incident report. incident_no is INC-<year>-<4 digits>, assigned
   by loadq_incident_new() and editable afterwards like every other field.';

create table if not exists public.loadq_incident_media (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.loadq_incidents(id) on delete cascade,
  kind        text not null check (kind in ('photo','video')),
  path        text not null,                    -- storage path in the private bucket
  label       text,                             -- "plaque", "trottoir", …
  taken_at    timestamptz not null default now(),
  bytes       bigint,
  mime        text,
  added_by    uuid,
  created_at  timestamptz not null default now()
);
create index if not exists loadq_incident_media_inc on public.loadq_incident_media (incident_id, taken_at);

-- Addresses saved once so the writer never types them at the kerb.
create table if not exists public.loadq_incident_recipient (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  email       text not null,
  default_on  boolean not null default false,   -- pre-ticked
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists loadq_incident_recipient_email on public.loadq_incident_recipient (lower(email));

-- Every send, so "did anyone actually report it" has an answer.
create table if not exists public.loadq_incident_send (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.loadq_incidents(id) on delete cascade,
  to_emails   text[] not null,
  at          timestamptz not null default now(),
  sent_by     uuid,
  sent_by_name text,
  ok          boolean,
  detail      text
);
create index if not exists loadq_incident_send_inc on public.loadq_incident_send (incident_id, at desc);

alter table public.loadq_incidents          enable row level security;
alter table public.loadq_incident_media     enable row level security;
alter table public.loadq_incident_recipient enable row level security;
alter table public.loadq_incident_send      enable row level security;
revoke all on public.loadq_incidents, public.loadq_incident_media,
             public.loadq_incident_recipient, public.loadq_incident_send
  from public, anon, authenticated;

-- The BLRS intake address is a placeholder until Thomas confirms the real one;
-- the by-law footer only gives 613-580-2424 and 311.
insert into public.loadq_incident_recipient (label, email, default_on, sort_order) values
  ('Derick Shalo',           'shaloderick@concordexpress.ca', true,  1),
  ('Dieudonné Yoba',         'dieudonneyoba@concordexpress.ca', false, 2)
on conflict (lower(email)) do nothing;

-- ------------------------------------------------------------------ new -----
-- Everything the blank form needs, pre-filled. The page may overwrite any of it.
create or replace function public.loadq_incident_new(p_zone text default 'ottawa-universal-grocery')
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_year text; v_n int; v_no text;
begin
  if not public.loadq_can_write_list(p_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;
  v_year := to_char(now() at time zone 'America/Toronto', 'YYYY');
  select coalesce(max(substring(incident_no from '\d+$')::int), 0) + 1 into v_n
    from public.loadq_incidents where incident_no like 'INC-' || v_year || '-%';
  v_no := 'INC-' || v_year || '-' || lpad(v_n::text, 4, '0');
  return jsonb_build_object('ok',true,
    'incident_no', v_no,
    'date', to_char(now() at time zone 'America/Toronto', 'YYYY-MM-DD'),
    'time', to_char(now() at time zone 'America/Toronto', 'HH24:MI'),
    'location', (select coalesce(z.name || ' — 140, rue George, Ottawa (Ontario)',
                                 '140, rue George, Ottawa (Ontario)')
                   from public.zones z where z.id = p_zone and false),  -- keep the form's own default
    'default_location', '140, rue George, Ottawa (Ontario)',
    'recorded_by_name', (select d.full_name from public.drivers d where d.id = auth.uid()),
    'recipients', public.loadq_incident_recipients());
end $function$;

create or replace function public.loadq_incident_recipients()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'label', label, 'email', email, 'default_on', default_on)
    order by sort_order, label), '[]'::jsonb)
  from public.loadq_incident_recipient where active;
$function$;

create or replace function public.loadq_incident_recipient_add(p_label text, p_email text, p_save boolean default true)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid;
begin
  if not public.loadq_can_write_list('ottawa-universal-grocery') then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok',false,'error','invalid_email'); end if;
  if not coalesce(p_save,true) then
    return jsonb_build_object('ok',true,'saved',false,'email',lower(trim(p_email))); end if;
  insert into public.loadq_incident_recipient (label, email, sort_order)
  values (coalesce(nullif(trim(p_label),''), split_part(p_email,'@',1)), lower(trim(p_email)), 50)
  on conflict (lower(email)) do update set active = true
  returning id into v_id;
  return jsonb_build_object('ok',true,'saved',true,'id',v_id,'email',lower(trim(p_email)));
end $function$;

-- ----------------------------------------------------------------- save -----
-- One call for create and update: the page holds a draft and saves the whole
-- form, so a half-filled report survives the tablet being locked.
create or replace function public.loadq_incident_save(p_id uuid, p_body jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_zone text; v_id uuid; v_no text; v_when timestamptz;
begin
  v_zone := coalesce(p_body->>'zone_id','ottawa-universal-grocery');
  if not public.loadq_can_write_list(v_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;

  -- date + time come from the form as text so the writer can correct them
  v_when := coalesce(
    (nullif(p_body->>'date','') || ' ' || coalesce(nullif(p_body->>'time',''),'00:00'))::timestamp
      at time zone 'America/Toronto',
    now());
  v_no := nullif(trim(coalesce(p_body->>'incident_no','')),'');
  if v_no is null then return jsonb_build_object('ok',false,'error','incident_no_required'); end if;

  if p_id is null then
    insert into public.loadq_incidents (incident_no, zone_id, occurred_at, location,
      plate, make, model, color, passengers, driver_desc,
      obs_solicitation, obs_cash, obs_hailed, obs_no_licence, description,
      recorded_by, recorded_by_name, status)
    values (v_no, v_zone, v_when,
      coalesce(nullif(p_body->>'location',''), '140, rue George, Ottawa (Ontario)'),
      nullif(p_body->>'plate',''), nullif(p_body->>'make',''), nullif(p_body->>'model',''),
      nullif(p_body->>'color',''), nullif(p_body->>'passengers','')::int, nullif(p_body->>'driver_desc',''),
      coalesce((p_body->>'obs_solicitation')::boolean,false), coalesce((p_body->>'obs_cash')::boolean,false),
      coalesce((p_body->>'obs_hailed')::boolean,false), coalesce((p_body->>'obs_no_licence')::boolean,false),
      nullif(p_body->>'description',''),
      auth.uid(),
      coalesce(nullif(p_body->>'recorded_by_name',''),
               (select d.full_name from public.drivers d where d.id = auth.uid())),
      coalesce(nullif(p_body->>'status',''),'draft'))
    returning id into v_id;
  else
    update public.loadq_incidents set
      incident_no = v_no, zone_id = v_zone, occurred_at = v_when,
      location = coalesce(nullif(p_body->>'location',''), location),
      plate = nullif(p_body->>'plate',''), make = nullif(p_body->>'make',''),
      model = nullif(p_body->>'model',''), color = nullif(p_body->>'color',''),
      passengers = nullif(p_body->>'passengers','')::int, driver_desc = nullif(p_body->>'driver_desc',''),
      obs_solicitation = coalesce((p_body->>'obs_solicitation')::boolean,false),
      obs_cash = coalesce((p_body->>'obs_cash')::boolean,false),
      obs_hailed = coalesce((p_body->>'obs_hailed')::boolean,false),
      obs_no_licence = coalesce((p_body->>'obs_no_licence')::boolean,false),
      description = nullif(p_body->>'description',''),
      recorded_by_name = coalesce(nullif(p_body->>'recorded_by_name',''), recorded_by_name),
      status = coalesce(nullif(p_body->>'status',''), status),
      updated_at = now()
    where id = p_id returning id into v_id;
    if v_id is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  end if;

  return jsonb_build_object('ok',true,'id',v_id,'incident_no',v_no);
end $function$;

-- Register a file the page has already uploaded to the private bucket.
create or replace function public.loadq_incident_media_add(
  p_incident uuid, p_kind text, p_path text, p_label text default null,
  p_bytes bigint default null, p_mime text default null, p_taken_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_zone text; v_id uuid; v_n int;
begin
  select zone_id into v_zone from public.loadq_incidents where id = p_incident;
  if v_zone is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not public.loadq_can_write_list(v_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;
  if p_kind not in ('photo','video') then
    return jsonb_build_object('ok',false,'error','bad_kind'); end if;

  insert into public.loadq_incident_media (incident_id, kind, path, label, bytes, mime, taken_at, added_by)
  values (p_incident, p_kind, p_path, p_label, p_bytes, p_mime, coalesce(p_taken_at, now()), auth.uid())
  returning id into v_id;

  select count(*) into v_n from public.loadq_incident_media where incident_id = p_incident;
  return jsonb_build_object('ok',true,'id',v_id,'count',v_n);
end $function$;

create or replace function public.loadq_incident_get(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select case when not public.loadq_can_write_list(i.zone_id) then '{}'::jsonb else
    to_jsonb(i) || jsonb_build_object(
      'date', to_char(i.occurred_at at time zone 'America/Toronto','YYYY-MM-DD'),
      'time', to_char(i.occurred_at at time zone 'America/Toronto','HH24:MI'),
      'media', coalesce((select jsonb_agg(jsonb_build_object(
          'id', m.id, 'kind', m.kind, 'path', m.path, 'label', m.label,
          'taken_at', m.taken_at, 'bytes', m.bytes) order by m.taken_at)
        from public.loadq_incident_media m where m.incident_id = i.id), '[]'::jsonb),
      'sends', coalesce((select jsonb_agg(jsonb_build_object(
          'at', s.at, 'to', s.to_emails, 'by', s.sent_by_name, 'ok', s.ok) order by s.at desc)
        from public.loadq_incident_send s where s.incident_id = i.id), '[]'::jsonb))
  end
  from public.loadq_incidents i where i.id = p_id;
$function$;

-- The recent list under the form: a repeat plate at the same address is what
-- makes a by-law complaint stick, and an unsent report is worth seeing.
create or replace function public.loadq_incident_recent(p_zone text default 'ottawa-universal-grocery', p_limit int default 15)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select case when not public.loadq_can_write_list(p_zone) then '[]'::jsonb
    else coalesce(jsonb_agg(x order by occurred_at desc), '[]'::jsonb) end
  from (
    select i.occurred_at, jsonb_build_object(
      'id', i.id, 'incident_no', i.incident_no, 'occurred_at', i.occurred_at,
      'plate', i.plate, 'car', concat_ws(' ', i.make, i.model, i.color),
      'recorded_by_name', i.recorded_by_name, 'status', i.status,
      'photos', (select count(*) from public.loadq_incident_media m where m.incident_id = i.id and m.kind='photo'),
      'videos', (select count(*) from public.loadq_incident_media m where m.incident_id = i.id and m.kind='video'),
      'sends',  (select count(*) from public.loadq_incident_send s where s.incident_id = i.id and coalesce(s.ok,false))
    ) as x
    from public.loadq_incidents i
    where i.zone_id = p_zone
    order by i.occurred_at desc limit greatest(1, least(coalesce(p_limit,15), 100))
  ) s;
$function$;

-- Recorded by the edge function after it hands the mail to Resend.
create or replace function public.loadq_incident_send_log(
  p_incident uuid, p_to text[], p_ok boolean, p_detail text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid;
begin
  insert into public.loadq_incident_send (incident_id, to_emails, sent_by, sent_by_name, ok, detail)
  values (p_incident, p_to, auth.uid(),
          (select d.full_name from public.drivers d where d.id = auth.uid()), p_ok, p_detail)
  returning id into v_id;
  if coalesce(p_ok,false) then
    update public.loadq_incidents set status = 'filed', updated_at = now() where id = p_incident;
  end if;
  return jsonb_build_object('ok',true,'id',v_id);
end $function$;

revoke all on function public.loadq_incident_new(text)                       from public, anon;
revoke all on function public.loadq_incident_save(uuid,jsonb)                from public, anon;
grant execute on function public.loadq_incident_new(text)                    to authenticated, service_role;
grant execute on function public.loadq_incident_save(uuid,jsonb)             to authenticated, service_role;
grant execute on function public.loadq_incident_get(uuid)                    to authenticated, service_role;
grant execute on function public.loadq_incident_recent(text,int)             to authenticated, service_role;
grant execute on function public.loadq_incident_recipients()                 to authenticated, service_role;
grant execute on function public.loadq_incident_recipient_add(text,text,boolean) to authenticated, service_role;
grant execute on function public.loadq_incident_media_add(uuid,text,text,text,bigint,text,timestamptz) to authenticated, service_role;
grant execute on function public.loadq_incident_send_log(uuid,text[],boolean,text) to authenticated, service_role;
