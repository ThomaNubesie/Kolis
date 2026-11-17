-- ============================================================================
-- LoadQ Morning Raffle — backend (tables + functions + cron)
-- Spec: docs/loadq-morning-raffle-spec.md
-- Model: tap-to-raffle. An eligible driver, present at the lot (geofence + code),
--   taps "Raffle" any time the window is open; a number is assigned (fixed by a
--   committed seed, so tap order gives no advantage). Hard cutoff 07:15 local —
--   present but not raffled by then = out. At cutoff the line is finalized into
--   queue_entries and the loader starts #1.
-- Ships DISABLED (config.enabled=false). Turn on per zone when ready.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Per-zone configuration
-- ---------------------------------------------------------------------------
create table if not exists public.loadq_raffle_config (
  zone_id              text primary key references public.zones(id),
  enabled              boolean not null default false,
  destination_region   text    not null default 'montreal',
  checkin_opens_local  time    not null default '06:00',
  draw_at_local        time    not null default '07:15',
  timezone             text    not null default 'America/Toronto',
  geofence_lat         double precision,
  geofence_lng         double precision,
  geofence_radius_m    integer not null default 120,
  max_gps_accuracy_m   integer not null default 75,
  require_geofence     boolean not null default true,
  require_code         boolean not null default true,
  code_len             integer not null default 4,
  late_policy          text    not null default 'excluded',   -- excluded | append
  one_checkin_per_device boolean not null default true,
  max_slots            integer,
  -- Live test: when test_mode, only allowed_driver_ids may raffle, and finalize is
  -- a DRY RUN (computes numbers + board but does NOT write queue_entries / run the
  -- loader) so testing can't disrupt the real morning line.
  test_mode            boolean not null default false,
  allowed_driver_ids   uuid[],
  -- Feature-scoped admins: may control THIS raffle (enable, code, monitor) without
  -- being global app admins. Global drivers.is_admin also qualifies.
  raffle_admin_ids     uuid[],
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Round (one per zone per service day)
-- ---------------------------------------------------------------------------
create table if not exists public.loadq_raffle_round (
  id                 uuid primary key default gen_random_uuid(),
  zone_id            text not null references public.zones(id),
  service_date       date not null,
  destination_region text not null,
  status             text not null default 'open',     -- open | locked | drawn | cancelled
  checkin_opens_at   timestamptz not null,
  draw_at            timestamptz not null,
  seed_commit        text not null,                    -- sha256(seed), public
  seed_reveal        text not null,                    -- the seed; exposed only after 'drawn'
  code               text,                             -- today's on-site code (admin-only)
  entrant_count      integer not null default 0,
  drawn_at           timestamptz,
  created_at         timestamptz not null default now(),
  unique (zone_id, service_date)
);

-- ---------------------------------------------------------------------------
-- 3. Entry (one per driver per round)
-- ---------------------------------------------------------------------------
create table if not exists public.loadq_raffle_entry (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references public.loadq_raffle_round(id) on delete cascade,
  driver_id       uuid not null references public.drivers(id),
  vehicle_id      uuid not null references public.vehicles(id),
  raffle_key      text not null,                       -- sha256(seed || driver_id) — the fair order key
  assigned_number integer,                             -- final position, set at finalize
  checked_in_at   timestamptz not null default now(),
  device_id       text,
  geo_lat         double precision,
  geo_lng         double precision,
  geo_accuracy_m  double precision,
  geo_ok          boolean,
  code_ok         boolean,
  status          text not null default 'checked_in',  -- checked_in | drawn | voided
  unique (round_id, driver_id)
);
create index if not exists loadq_raffle_entry_round on public.loadq_raffle_entry(round_id, raffle_key);

-- ---------------------------------------------------------------------------
-- 4. Immutable admin-action audit log
-- ---------------------------------------------------------------------------
create table if not exists public.loadq_raffle_audit (
  id         bigint generated always as identity primary key,
  round_id   uuid,
  actor_id   uuid,
  action     text not null,
  detail     jsonb,
  created_at timestamptz not null default now()
);

-- RLS: deny-all to clients; all access is via the security-definer functions below.
alter table public.loadq_raffle_config enable row level security;
alter table public.loadq_raffle_round  enable row level security;
alter table public.loadq_raffle_entry  enable row level security;
alter table public.loadq_raffle_audit  enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.loadq_haversine_m(lat1 double precision, lng1 double precision,
                                                    lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2*6371000*asin(least(1, sqrt(
    power(sin(radians(lat2-lat1)/2),2) +
    cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2))));
$$;

create or replace function public.loadq_is_admin()
returns boolean language sql stable security definer set search_path to public as $$
  select coalesce((select is_admin from public.drivers where id = auth.uid()), false);
$$;

-- Feature-scoped admin: global app admin OR listed in this zone's raffle_admin_ids.
create or replace function public.loadq_raffle_is_admin(p_zone text)
returns boolean language sql stable security definer set search_path to public as $$
  select public.loadq_is_admin()
      or coalesce((select auth.uid() = any(raffle_admin_ids)
                     from public.loadq_raffle_config where zone_id = p_zone), false);
$$;

-- ---------------------------------------------------------------------------
-- Round lifecycle: create+open today's round once check-in time arrives
-- ---------------------------------------------------------------------------
create or replace function public.loadq_raffle_ensure_round(p_zone text)
returns uuid language plpgsql security definer set search_path to public as $$
declare c public.loadq_raffle_config; svc date; opens timestamptz; draws timestamptz;
        rid uuid; s text; code text;
begin
  select * into c from public.loadq_raffle_config where zone_id = p_zone and enabled;
  if not found then return null; end if;
  svc   := (now() at time zone c.timezone)::date;
  opens := (svc + c.checkin_opens_local) at time zone c.timezone;
  draws := (svc + c.draw_at_local)       at time zone c.timezone;
  if now() < opens or now() >= draws then return null; end if;   -- outside today's window
  select id into rid from public.loadq_raffle_round where zone_id = p_zone and service_date = svc;
  if rid is not null then return rid; end if;
  s    := encode(gen_random_bytes(32),'hex');
  code := case when c.require_code
               then lpad((floor(random()*power(10, c.code_len)))::bigint::text, c.code_len, '0')
               else null end;
  insert into public.loadq_raffle_round(zone_id, service_date, destination_region, status,
        checkin_opens_at, draw_at, seed_commit, seed_reveal, code)
  values (p_zone, svc, c.destination_region, 'open', opens, draws,
          encode(digest(s,'sha256'),'hex'), s, code)
  on conflict (zone_id, service_date) do nothing
  returning id into rid;
  if rid is null then
    select id into rid from public.loadq_raffle_round where zone_id = p_zone and service_date = svc;
  end if;
  return rid;
end; $$;

-- ---------------------------------------------------------------------------
-- Eligibility (same spirit as queue_entries_require_eligible)
-- ---------------------------------------------------------------------------
create or replace function public.loadq_raffle_eligible(p_uid uuid)
returns boolean language sql stable security definer set search_path to public as $$
  select exists(select 1 from public.drivers d where d.id = p_uid and coalesce(d.blocked,false)=false
                  and coalesce(d.verified,false)=true)
     and exists(select 1 from public.vehicles v where v.driver_id = p_uid and v.is_active);
$$;

-- ---------------------------------------------------------------------------
-- Driver: status (drives the "Raffle" button visibility) — never leaks seed/code
-- ---------------------------------------------------------------------------
create or replace function public.loadq_raffle_status(p_zone text)
returns jsonb language plpgsql security definer set search_path to public as $$
declare uid uuid := auth.uid(); c public.loadq_raffle_config; rid uuid;
        r public.loadq_raffle_round; mine public.loadq_raffle_entry;
        elig boolean; open_now boolean; mynum int;
begin
  if uid is null then return jsonb_build_object('error','auth_required'); end if;
  select * into c from public.loadq_raffle_config where zone_id = p_zone;
  rid := public.loadq_raffle_ensure_round(p_zone);
  if rid is not null then select * into r from public.loadq_raffle_round where id = rid; end if;
  -- eligible = verified + active vehicle, and (not test_mode OR on the allow-list)
  elig := public.loadq_raffle_eligible(uid)
          and (coalesce(c.test_mode,false) = false or uid = any(c.allowed_driver_ids));
  if rid is not null then select * into mine from public.loadq_raffle_entry where round_id = rid and driver_id = uid; end if;
  open_now := r.id is not null and r.status = 'open' and now() >= r.checkin_opens_at and now() < r.draw_at;
  -- my number: final once drawn, else my provisional rank among current entries
  if mine.id is not null then
    mynum := coalesce(mine.assigned_number,
      (select count(*)+1 from public.loadq_raffle_entry e where e.round_id = r.id and e.raffle_key < mine.raffle_key));
  end if;
  return jsonb_build_object(
    'zone', p_zone,
    'round_id', r.id,
    'status', coalesce(r.status,'none'),
    'test_mode', coalesce(c.test_mode,false),
    'window_open', coalesce(open_now,false),
    'draw_at', r.draw_at,
    'seed_commit', r.seed_commit,
    'entrant_count', coalesce((select count(*) from public.loadq_raffle_entry where round_id = r.id),0),
    'eligible', coalesce(elig,false),
    'already_raffled', mine.id is not null,
    'my_number', mynum,
    'can_raffle', coalesce(open_now and elig and mine.id is null, false)
  );
end; $$;

-- ---------------------------------------------------------------------------
-- Driver: raffle (the tap). Validates window + geofence + code + eligibility.
-- ---------------------------------------------------------------------------
create or replace function public.loadq_raffle_enter(p_zone text, p_lat double precision,
        p_lng double precision, p_accuracy double precision, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path to public as $$
declare uid uuid := auth.uid(); c public.loadq_raffle_config; r public.loadq_raffle_round;
        veh record; dist double precision; k text; geo_ok boolean := true; code_ok boolean := true;
        rid uuid; new_id uuid; prov int;
begin
  if uid is null then return jsonb_build_object('error','auth_required'); end if;
  select * into c from public.loadq_raffle_config where zone_id = p_zone and enabled;
  if not found then return jsonb_build_object('error','not_open'); end if;
  if not public.loadq_raffle_eligible(uid) then return jsonb_build_object('error','not_eligible'); end if;
  if c.test_mode and not (uid = any(c.allowed_driver_ids)) then return jsonb_build_object('error','not_eligible'); end if;
  select v.id, v.seats into veh from public.vehicles v where v.driver_id = uid and v.is_active
    order by v.id limit 1;
  if veh.id is null then return jsonb_build_object('error','no_vehicle'); end if;

  rid := public.loadq_raffle_ensure_round(p_zone);
  if rid is null then return jsonb_build_object('error','not_open'); end if;
  select * into r from public.loadq_raffle_round where id = rid for update;
  if r.status <> 'open' or now() < r.checkin_opens_at then return jsonb_build_object('error','not_open'); end if;
  if now() >= r.draw_at then return jsonb_build_object('error','window_closed'); end if;

  -- presence: geofence
  if c.require_geofence then
    if p_lat is null or p_lng is null then return jsonb_build_object('error','location_required'); end if;
    if p_accuracy is not null and p_accuracy > c.max_gps_accuracy_m then
      return jsonb_build_object('error','low_gps_accuracy'); end if;
    dist := public.loadq_haversine_m(p_lat, p_lng, c.geofence_lat, c.geofence_lng);
    if dist > c.geofence_radius_m then return jsonb_build_object('error','not_at_lot','distance_m',round(dist)); end if;
  end if;
  -- presence: code
  if c.require_code then
    code_ok := (p_code is not null and p_code = r.code);
    if not code_ok then return jsonb_build_object('error','bad_code'); end if;
  end if;
  -- device dedupe
  if c.one_checkin_per_device and p_device is not null
     and exists(select 1 from public.loadq_raffle_entry e where e.round_id = r.id
                  and e.device_id = p_device and e.driver_id <> uid) then
    return jsonb_build_object('error','duplicate_device');
  end if;

  k := encode(digest(r.seed_reveal || uid::text, 'sha256'),'hex');   -- fair order key (fixed by seed+id)
  insert into public.loadq_raffle_entry(round_id, driver_id, vehicle_id, raffle_key,
        device_id, geo_lat, geo_lng, geo_accuracy_m, geo_ok, code_ok)
  values (r.id, uid, veh.id, k, p_device, p_lat, p_lng, p_accuracy, geo_ok, code_ok)
  on conflict (round_id, driver_id) do nothing
  returning id into new_id;
  if new_id is null then return jsonb_build_object('error','already_raffled'); end if;

  prov := (select count(*)+1 from public.loadq_raffle_entry where round_id = r.id and raffle_key < k);
  return jsonb_build_object('ok',true,'entry_id',new_id,'provisional_position',prov,
           'entrant_count',(select count(*) from public.loadq_raffle_entry where round_id = r.id),
           'note','final at '||to_char(r.draw_at at time zone c.timezone,'HH24:MI'));
end; $$;

-- ---------------------------------------------------------------------------
-- Finalize at cutoff: rank by key → queue_entries → start loader. Idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.loadq_raffle_finalize(p_round uuid)
returns jsonb language plpgsql security definer set search_path to public as $$
declare r public.loadq_raffle_round; n int := 0; e record; test boolean;
begin
  select * into r from public.loadq_raffle_round where id = p_round for update;
  if not found then return jsonb_build_object('error','no_round'); end if;
  if r.status = 'drawn' then return jsonb_build_object('ok',true,'already',true); end if;
  test := coalesce((select test_mode from public.loadq_raffle_config where zone_id = r.zone_id), false);
  update public.loadq_raffle_round set status = 'locked' where id = r.id;

  -- Real mode only: replace the zone line + clear entrants' cross-zone active entries.
  if not test then
    delete from public.queue_entries where zone_id = r.zone_id and status <> 'ended';
    delete from public.queue_entries where status <> 'ended'
      and driver_id in (select driver_id from public.loadq_raffle_entry where round_id = r.id);
  end if;

  for e in select * from public.loadq_raffle_entry where round_id = r.id
             order by raffle_key asc, driver_id asc loop
    n := n + 1;
    if not test then
      insert into public.queue_entries(zone_id, driver_id, vehicle_id, position, status,
            destination_region, seats_boarded, seats_locked, seat_states, joined_at)
      values (r.zone_id, e.driver_id, e.vehicle_id, n, 'waiting', r.destination_region,
              0, 0, '[]'::jsonb, now());
    end if;
    update public.loadq_raffle_entry set assigned_number = n, status = 'drawn' where id = e.id;
  end loop;

  update public.loadq_raffle_round set status = 'drawn', drawn_at = now(), entrant_count = n where id = r.id;
  if n > 0 and not test then perform public.loadq_sync_loader(r.zone_id, r.destination_region); end if;
  return jsonb_build_object('ok',true,'entrants',n,'dry_run',test);
end; $$;

-- ---------------------------------------------------------------------------
-- Driver: result + verification data (only after drawn)
-- ---------------------------------------------------------------------------
create or replace function public.loadq_raffle_result(p_round uuid)
returns jsonb language plpgsql security definer set search_path to public as $$
declare r public.loadq_raffle_round;
begin
  select * into r from public.loadq_raffle_round where id = p_round;
  if not found then return jsonb_build_object('error','no_round'); end if;
  -- Ordered board (first names + seats, PII-safe), ranked by the fair key. Positions
  -- are final once drawn, else provisional (row_number over the current entrants).
  return jsonb_build_object(
    'round_id', r.id, 'status', r.status, 'drawn_at', r.drawn_at,
    'final', r.status = 'drawn',
    'seed_commit', r.seed_commit,
    'seed_reveal', case when r.status='drawn' then r.seed_reveal else null end,
    'order', (
      select coalesce(jsonb_agg(row_to_json(x) order by x.pos), '[]'::jsonb) from (
        select coalesce(e.assigned_number,
                 row_number() over (order by e.raffle_key asc, e.driver_id asc))::int as pos,
               e.driver_id,
               split_part(coalesce(d.full_name,''),' ',1) as name,
               v.seats
        from public.loadq_raffle_entry e
        join public.drivers d on d.id = e.driver_id
        join public.vehicles v on v.id = e.vehicle_id
        where e.round_id = r.id
      ) x));
end; $$;

-- ---------------------------------------------------------------------------
-- Admin: today's code (to post at the lot), live monitor, config upsert
-- ---------------------------------------------------------------------------
create or replace function public.loadq_raffle_code(p_zone text)
returns jsonb language plpgsql security definer set search_path to public as $$
declare rid uuid; r public.loadq_raffle_round;
begin
  if not public.loadq_raffle_is_admin(p_zone) then return jsonb_build_object('error','forbidden'); end if;
  rid := public.loadq_raffle_ensure_round(p_zone);
  if rid is null then return jsonb_build_object('error','no_round'); end if;
  select * into r from public.loadq_raffle_round where id = rid;
  return jsonb_build_object('zone',p_zone,'service_date',r.service_date,'code',r.code,
           'draw_at',r.draw_at,'entrant_count',(select count(*) from public.loadq_raffle_entry where round_id=rid));
end; $$;

create or replace function public.loadq_raffle_monitor(p_zone text)
returns jsonb language plpgsql security definer set search_path to public as $$
declare rid uuid;
begin
  if not public.loadq_raffle_is_admin(p_zone) then return jsonb_build_object('error','forbidden'); end if;
  select id into rid from public.loadq_raffle_round where zone_id=p_zone
    and service_date = (now() at time zone 'America/Toronto')::date;
  if rid is null then return jsonb_build_object('error','no_round'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('driver_id',e.driver_id,
            'checked_in_at',e.checked_in_at,'provisional',
            (select count(*)+1 from public.loadq_raffle_entry e2 where e2.round_id=e.round_id and e2.raffle_key<e.raffle_key),
            'geo_ok',e.geo_ok,'code_ok',e.code_ok) order by e.checked_in_at),'[]'::jsonb)
          from public.loadq_raffle_entry e where e.round_id=rid);
end; $$;

create or replace function public.loadq_raffle_set_enabled(p_zone text, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path to public as $$
begin
  if not public.loadq_raffle_is_admin(p_zone) then return jsonb_build_object('error','forbidden'); end if;
  update public.loadq_raffle_config set enabled = p_enabled, updated_at = now() where zone_id = p_zone;
  insert into public.loadq_raffle_audit(actor_id, action, detail)
    values (auth.uid(), 'set_enabled', jsonb_build_object('zone',p_zone,'enabled',p_enabled));
  return jsonb_build_object('ok',true,'zone',p_zone,'enabled',p_enabled);
end; $$;

-- grants
grant execute on function public.loadq_raffle_status(text)            to authenticated;
grant execute on function public.loadq_raffle_enter(text,double precision,double precision,double precision,text,text) to authenticated;
grant execute on function public.loadq_raffle_result(uuid)            to authenticated;
grant execute on function public.loadq_raffle_code(text)              to authenticated;
grant execute on function public.loadq_raffle_monitor(text)           to authenticated;
grant execute on function public.loadq_raffle_set_enabled(text,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Cron: open rounds when the window arrives; finalize at the cutoff
-- ---------------------------------------------------------------------------
select cron.schedule('loadq-raffle-open', '* * * * *', $$
  select public.loadq_raffle_ensure_round(zone_id) from public.loadq_raffle_config where enabled;
$$);
select cron.schedule('loadq-raffle-finalize', '* * * * *', $$
  select public.loadq_raffle_finalize(id) from public.loadq_raffle_round
   where status in ('open','locked') and now() >= draw_at;
$$);

-- ---------------------------------------------------------------------------
-- Seed Universal Grocery config — LIVE TEST (test_mode): only the 4 testers can
-- raffle, they are feature-admins, and finalize is a DRY RUN (never writes the
-- real queue). Window 06:00–07:15. Flip test_mode off + enabled on for go-live.
--   Testers / feature-admins: Mobutu Lowa, Dolly Kilimba, Dieudonné Yoba, Thomas Shalo
-- ---------------------------------------------------------------------------
insert into public.loadq_raffle_config
  (zone_id, enabled, destination_region, checkin_opens_local, draw_at_local, timezone,
   geofence_lat, geofence_lng, geofence_radius_m, max_gps_accuracy_m,
   test_mode, allowed_driver_ids, raffle_admin_ids)
values
  ('ottawa-universal-grocery', true, 'montreal', '06:00', '07:15', 'America/Toronto',
   45.42776, -75.68923, 120, 75,
   true,
   array['83816178-843f-4f67-975d-8ccea52de7f3',   -- Mobutu Lowa
         '5f2f8dd4-af05-42a4-bece-1e463c129f5a',   -- Dolly Kilimba
         '873c59b9-9de8-4a0c-827c-9e0113a7dff0',   -- Dieudonné Yoba (verified)
         '329b4603-355c-4058-895c-37826ef147ca']::uuid[],  -- Thomas Shalo
   array['83816178-843f-4f67-975d-8ccea52de7f3',
         '5f2f8dd4-af05-42a4-bece-1e463c129f5a',
         '873c59b9-9de8-4a0c-827c-9e0113a7dff0',
         '329b4603-355c-4058-895c-37826ef147ca']::uuid[])
on conflict (zone_id) do update set
   enabled = excluded.enabled, test_mode = excluded.test_mode,
   allowed_driver_ids = excluded.allowed_driver_ids, raffle_admin_ids = excluded.raffle_admin_ids,
   geofence_lat = excluded.geofence_lat, geofence_lng = excluded.geofence_lng,
   draw_at_local = excluded.draw_at_local, updated_at = now();

select 'loadq_morning_raffle installed (test_mode)' as status,
       (select count(*) from public.loadq_raffle_config where enabled) as enabled_zones;
