-- Kolis prospecting CRM: extend concord_outreach into a full prospect pipeline + profiles.
-- Reuses the existing Resend webhook (events keyed by email) + mailer + cron.

alter table public.concord_outreach alter column email drop not null;
alter table public.concord_outreach
  add column if not exists category text,                 -- medical-lab | environmental-lab | hospital-lab | auto-parts | grocery | other
  add column if not exists tier int,
  add column if not exists contact_name text,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists summary text,                  -- brief description: what the business does
  add column if not exists turnover text,                 -- estimated revenue / size (free text, e.g. "$2M–5M", "~40 staff")
  add column if not exists stage text not null default 'to_prospect', -- to_prospect|pending|met|replied|won|lost
  add column if not exists letter_url text,
  add column if not exists letter_downloaded_at timestamptz,
  add column if not exists contacted_at timestamptz,
  add column if not exists followup_due_at timestamptz,
  add column if not exists followup_sent_at timestamptz;

-- Next weekday at 13:00 UTC (= 9am ET, when the follow-up cron runs).
create or replace function public.kolis_next_business_day(p_ts timestamptz) returns timestamptz
  language sql immutable as $$
  select ((p_ts::date + case extract(isodow from p_ts)::int
            when 6 then 2   -- Sat -> Mon
            when 7 then 1   -- Sun -> Mon
            else 0 end)::timestamptz + interval '13 hours');
$$;

-- Shared column projection for list/get (+ open/click counts).
create or replace function public.kolis_prospects_list(p_filter text default null)
returns table(id uuid, business_name text, category text, tier int, contact_name text, email text,
  phone text, address text, city text, summary text, turnover text, stage text, letter_url text,
  letter_downloaded_at timestamptz, contacted_at timestamptz, followup_due_at timestamptz,
  followup_sent_at timestamptz, opened_at timestamptz, clicked_at timestamptz, notes text,
  opens bigint, clicks bigint)
language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(public.kolis_is_staff(), false) then raise exception 'forbidden'; end if;
  return query
    select o.id, o.business_name, o.category, o.tier, o.contact_name, o.email, o.phone, o.address, o.city,
      o.summary, o.turnover, o.stage, o.letter_url, o.letter_downloaded_at, o.contacted_at, o.followup_due_at,
      o.followup_sent_at, o.opened_at, o.clicked_at, o.notes,
      (select count(*) from public.concord_outreach_events e where e.email = o.email and e.type = 'opened'),
      (select count(*) from public.concord_outreach_events e where e.email = o.email and e.type = 'clicked')
    from public.concord_outreach o
    where p_filter is null
       or (p_filter = 'needs_email' and o.email is null and o.stage <> 'to_prospect')
       or (p_filter like 'tier%' and o.tier = nullif(substring(p_filter from 5), '')::int)
       or (p_filter = o.stage)
    order by o.tier nulls last, o.created_at;
end; $$;

-- Single profile.
create or replace function public.kolis_prospect_get(p_id uuid)
returns table(id uuid, business_name text, category text, tier int, contact_name text, email text,
  phone text, address text, city text, summary text, turnover text, stage text, letter_url text,
  letter_downloaded_at timestamptz, contacted_at timestamptz, followup_due_at timestamptz,
  followup_sent_at timestamptz, opened_at timestamptz, clicked_at timestamptz, notes text,
  opens bigint, clicks bigint)
language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(public.kolis_is_staff(), false) then raise exception 'forbidden'; end if;
  return query
    select o.id, o.business_name, o.category, o.tier, o.contact_name, o.email, o.phone, o.address, o.city,
      o.summary, o.turnover, o.stage, o.letter_url, o.letter_downloaded_at, o.contacted_at, o.followup_due_at,
      o.followup_sent_at, o.opened_at, o.clicked_at, o.notes,
      (select count(*) from public.concord_outreach_events e where e.email = o.email and e.type = 'opened'),
      (select count(*) from public.concord_outreach_events e where e.email = o.email and e.type = 'clicked')
    from public.concord_outreach o where o.id = p_id;
end; $$;

-- Engagement timeline for a profile (delivered/opened/clicked + which link).
create or replace function public.kolis_prospect_events(p_id uuid)
returns table(type text, link text, created_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(public.kolis_is_staff(), false) then raise exception 'forbidden'; end if;
  return query
    select e.type, e.link, e.created_at from public.concord_outreach_events e
    where e.email = (select email from public.concord_outreach where id = p_id)
    order by e.created_at desc;
end; $$;

create or replace function public.kolis_prospect_add(p_name text, p_category text, p_tier int,
  p_contact text, p_email text, p_phone text, p_address text, p_city text,
  p_summary text default null, p_turnover text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not coalesce(public.kolis_is_staff(), false) then raise exception 'forbidden'; end if;
  insert into public.concord_outreach(business_name, category, tier, contact_name, email, phone, address, city, summary, turnover, stage)
    values (p_name, nullif(trim(p_category),''), p_tier, nullif(trim(p_contact),''),
            nullif(lower(trim(p_email)),''), nullif(trim(p_phone),''), nullif(trim(p_address),''),
            nullif(trim(p_city),''), nullif(trim(p_summary),''), nullif(trim(p_turnover),''), 'to_prospect')
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.kolis_prospect_update(p_id uuid, p_contact text, p_email text,
  p_phone text, p_address text, p_city text, p_notes text, p_summary text default null,
  p_turnover text default null, p_letter_url text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_old_email text; v_stage text; v_due timestamptz; v_new_email text;
begin
  if not coalesce(public.kolis_is_staff(), false) then raise exception 'forbidden'; end if;
  select email, stage, followup_due_at into v_old_email, v_stage, v_due from public.concord_outreach where id = p_id;
  v_new_email := nullif(lower(trim(p_email)), '');
  update public.concord_outreach set
    contact_name = coalesce(nullif(trim(p_contact),''), contact_name),
    email        = coalesce(v_new_email, email),
    phone        = coalesce(nullif(trim(p_phone),''), phone),
    address      = coalesce(nullif(trim(p_address),''), address),
    city         = coalesce(nullif(trim(p_city),''), city),
    summary      = coalesce(nullif(trim(p_summary),''), summary),
    turnover     = coalesce(nullif(trim(p_turnover),''), turnover),
    notes        = coalesce(nullif(trim(p_notes),''), notes),
    letter_url   = coalesce(nullif(trim(p_letter_url),''), letter_url)
   where id = p_id;
  if v_old_email is null and v_new_email is not null and v_stage = 'met' and v_due is null then
    update public.concord_outreach set followup_due_at = public.kolis_next_business_day(now() + interval '2 days')
      where id = p_id;
  end if;
end; $$;

create or replace function public.kolis_prospect_mark_downloaded(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(public.kolis_is_staff(), false) then raise exception 'forbidden'; end if;
  update public.concord_outreach
    set letter_downloaded_at = coalesce(letter_downloaded_at, now()),
        stage = case when stage = 'to_prospect' then 'pending' else stage end
   where id = p_id;
end; $$;

create or replace function public.kolis_prospect_mark_contacted(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_email text;
begin
  if not coalesce(public.kolis_is_staff(), false) then raise exception 'forbidden'; end if;
  select email into v_email from public.concord_outreach where id = p_id;
  update public.concord_outreach set
    contacted_at = coalesce(contacted_at, now()),
    stage = 'met',
    followup_due_at = case when v_email is not null then public.kolis_next_business_day(now() + interval '2 days') else null end
   where id = p_id;
end; $$;

create or replace function public.kolis_prospect_set_stage(p_id uuid, p_stage text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(public.kolis_is_staff(), false) then raise exception 'forbidden'; end if;
  if p_stage not in ('to_prospect','pending','met','replied','won','lost') then raise exception 'bad stage'; end if;
  update public.concord_outreach set stage = p_stage,
    followup_due_at = case when p_stage in ('replied','won','lost') then null else followup_due_at end
   where id = p_id;
end; $$;

grant execute on function public.kolis_prospects_list(text) to authenticated;
grant execute on function public.kolis_prospect_get(uuid) to authenticated;
grant execute on function public.kolis_prospect_events(uuid) to authenticated;
grant execute on function public.kolis_prospect_add(text,text,int,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.kolis_prospect_update(uuid,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.kolis_prospect_mark_downloaded(uuid) to authenticated;
grant execute on function public.kolis_prospect_mark_contacted(uuid) to authenticated;
grant execute on function public.kolis_prospect_set_stage(uuid,text) to authenticated;
