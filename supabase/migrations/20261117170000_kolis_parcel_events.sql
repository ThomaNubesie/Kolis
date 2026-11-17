-- Kolis tracking events: one row per moment a parcel moves (pickup, each
-- checkpoint along the way, delivery). Each row gets its own branded card, which
-- is sent to the recipient by the sweep at the bottom of this file.
--
-- Why a table and not just kolis_parcels.status: a parcel passes through several
-- places (e.g. Longueuil → Kingston → Ottawa) and every stop needs its own card
-- with its own photo. Status can only say "in_transit" once.
--
-- Who writes events:
--   * status trigger  — any flip to picked_up / in_transit / delivered (courier app,
--                       kolis-finalize-payment, carrier orgs) records the event, so
--                       nothing that moves a parcel can skip its card.
--   * admin RPCs      — mark picked up (code or override), add a checkpoint
--                       (city + landmark photo), attach a photo to any event.
--   * courier RPCs    — attach the pickup / drop-off photo, mark the card shared.

create table if not exists public.kolis_parcel_events (
  id            uuid primary key default gen_random_uuid(),
  parcel_id     uuid not null references public.kolis_parcels(id) on delete cascade,
  kind          text not null check (kind in ('picked_up', 'checkpoint', 'delivered')),
  city          text,
  note          text,
  photo_url     text,
  by_role       text not null default 'system' check (by_role in ('courier', 'admin', 'system')),
  by_user       uuid,
  code_override boolean not null default false,
  created_at    timestamptz not null default now(),
  card_sent_at  timestamptz,
  shared_at     timestamptz   -- the courier passed the card on themselves → don't send it again
);
create index if not exists kolis_parcel_events_parcel_idx on public.kolis_parcel_events (parcel_id, created_at);
-- A parcel is picked up once and delivered once; checkpoints are unlimited.
create unique index if not exists kolis_parcel_events_once on public.kolis_parcel_events (parcel_id, kind)
  where kind in ('picked_up', 'delivered');

alter table public.kolis_parcel_events enable row level security;
drop policy if exists kolis_parcel_events_admin_read on public.kolis_parcel_events;
create policy kolis_parcel_events_admin_read on public.kolis_parcel_events
  for select using (public.kolis_admin_role() is not null);

-- One landmark photo per city, reused for every parcel that passes through it.
create table if not exists public.kolis_landmarks (
  city_key   text primary key,          -- lower(btrim(city))
  city       text not null,
  photo_url  text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.kolis_landmarks enable row level security;
drop policy if exists kolis_landmarks_admin_read on public.kolis_landmarks;
create policy kolis_landmarks_admin_read on public.kolis_landmarks
  for select using (public.kolis_admin_role() is not null);

-- The pickup photo, mirroring delivery_proof ({url, taken_at, source, shared_at}).
alter table public.kolis_parcels add column if not exists pickup_proof jsonb;

-- ── Events from status changes + photo sync ─────────────────────────────────
create or replace function public.kolis_parcel_events_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
  v_by   text := nullif(current_setting('kolis.event_by', true), '');
begin
  -- 1. Status flip → event (unless an admin RPC is writing its own event).
  if new.status is distinct from old.status
     and coalesce(current_setting('kolis.event_manual', true), '') <> '1' then
    v_kind := case new.status when 'picked_up' then 'picked_up'
                              when 'in_transit' then 'checkpoint'
                              when 'delivered' then 'delivered' end;
    if v_kind is not null and (v_kind = 'checkpoint' or not exists (
         select 1 from public.kolis_parcel_events where parcel_id = new.id and kind = v_kind)) then
      if v_by is null then
        v_by := case when auth.uid() is null then 'system'
                     when public.kolis_admin_role() is not null then 'admin'
                     else 'courier' end;
      end if;
      insert into public.kolis_parcel_events (parcel_id, kind, by_role, by_user, photo_url, shared_at, code_override)
      values (new.id, v_kind, v_by, auth.uid(),
              case v_kind when 'picked_up' then new.pickup_proof ->> 'url'
                          when 'delivered' then new.delivery_proof ->> 'url' end,
              -- a card already sent by hand (shared_at stamped on the proof) isn't sent again
              case v_kind when 'picked_up' then (new.pickup_proof ->> 'shared_at')::timestamptz
                          when 'delivered' then (new.delivery_proof ->> 'shared_at')::timestamptz end,
              coalesce(current_setting('kolis.code_override', true), '') = '1');
    end if;
  end if;

  -- 2. Photo / shared flags written onto the parcel → copy to the matching event.
  if new.pickup_proof is distinct from old.pickup_proof and new.pickup_proof is not null then
    update public.kolis_parcel_events
       set photo_url = coalesce(new.pickup_proof ->> 'url', photo_url),
           shared_at = coalesce((new.pickup_proof ->> 'shared_at')::timestamptz, shared_at)
     where parcel_id = new.id and kind = 'picked_up';
  end if;
  if new.delivery_proof is distinct from old.delivery_proof and new.delivery_proof is not null then
    update public.kolis_parcel_events
       set photo_url = coalesce(new.delivery_proof ->> 'url', photo_url),
           shared_at = coalesce((new.delivery_proof ->> 'shared_at')::timestamptz, shared_at)
     where parcel_id = new.id and kind = 'delivered';
  end if;
  return new;
end $$;

drop trigger if exists kolis_parcel_events_trg on public.kolis_parcels;
create trigger kolis_parcel_events_trg
  after update of status, pickup_proof, delivery_proof on public.kolis_parcels
  for each row execute function public.kolis_parcel_events_trg();

-- The status trigger used to text the recipient at picked_up / in_transit /
-- delivered. Those moments now go out as event cards (sweep below), so keep only
-- the "matched" messages here — otherwise every step would arrive twice.
create or replace function public.kolis_notify_recipient_trg()
returns trigger language plpgsql security definer set search_path = public, net as $$
declare v_url text := 'https://kzjptcpjpwlxfofzhyku.supabase.co/functions/v1/kolis-notify-recipient';
        v_hdr jsonb := jsonb_build_object('Content-Type','application/json','x-kolis-secret','kolis_notify_9f3a2c7b1e6d4084');
        kinds text[] := '{}'; k text; v_req bigint;
begin
  if TG_OP = 'UPDATE' and NEW.status is distinct from OLD.status and NEW.status = 'matched' then
    kinds := array['incoming','pickup'];
  end if;
  foreach k in array kinds loop
    select net.http_post(url:=v_url, headers:=v_hdr, body:=jsonb_build_object('parcel_id',NEW.id,'status',k)) into v_req;
    insert into public.kolis_notifications(parcel_id, kind, request_id, state, attempts, last_attempt_at)
      values (NEW.id, k, v_req, 'inflight', 1, now())
      on conflict (parcel_id, kind) do update set request_id=excluded.request_id, state='inflight',
        attempts = public.kolis_notifications.attempts + 1, last_attempt_at = now();
  end loop;
  return NEW;
end $$;

-- ── Admin ───────────────────────────────────────────────────────────────────
-- Mark picked up with the sender's pickup code, or without it (p_override) when
-- the code can't be had. Photo optional.
create or replace function public.kolis_admin_mark_picked_up(p_id uuid, p_code text, p_override boolean default false, p_photo text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_status text; v_code text;
begin
  if coalesce(public.kolis_admin_role(), '') not in ('owner', 'admin', 'dispatcher') then raise exception 'forbidden'; end if;
  select status, pickup_code into v_status, v_code from public.kolis_parcels where id = p_id for update;
  if v_status is null then return 'not_found'; end if;
  if v_status not in ('requested', 'received_at_hub', 'matched', 'dispatched') then return 'bad_status'; end if;
  if not coalesce(p_override, false) and btrim(coalesce(p_code, '')) <> btrim(coalesce(v_code, '')) then return 'bad_code'; end if;
  perform set_config('kolis.event_by', 'admin', true);
  perform set_config('kolis.code_override', case when p_override then '1' else '0' end, true);
  update public.kolis_parcels
     set status = 'picked_up',
         picked_up_scan_at = coalesce(picked_up_scan_at, now()),
         pickup_proof = case when nullif(p_photo, '') is not null
                             then jsonb_build_object('url', p_photo, 'taken_at', now(), 'source', 'admin')
                             else pickup_proof end
   where id = p_id;
  return 'ok';
end $$;

-- A stop along the way ("Kingston"). Uses the photo given, else the city's saved
-- landmark. A new photo becomes the city's landmark when none exists yet, or when
-- p_save_landmark asks to replace it.
create or replace function public.kolis_admin_checkpoint(p_id uuid, p_city text, p_note text default null, p_photo text default null, p_save_landmark boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_status text; v_key text := lower(btrim(coalesce(p_city, ''))); v_photo text; v_id uuid;
begin
  if coalesce(public.kolis_admin_role(), '') not in ('owner', 'admin', 'dispatcher') then raise exception 'forbidden'; end if;
  if v_key = '' then raise exception 'city_required'; end if;
  select status into v_status from public.kolis_parcels where id = p_id for update;
  if v_status is null then raise exception 'not_found'; end if;
  if v_status not in ('picked_up', 'in_transit') then raise exception 'bad_status'; end if;

  if nullif(p_photo, '') is not null then
    insert into public.kolis_landmarks (city_key, city, photo_url, updated_by)
    values (v_key, btrim(p_city), p_photo, auth.uid())
    on conflict (city_key) do update
      set photo_url = excluded.photo_url, city = excluded.city, updated_at = now(), updated_by = excluded.updated_by
      where coalesce(p_save_landmark, false);
  end if;
  v_photo := coalesce(nullif(p_photo, ''), (select photo_url from public.kolis_landmarks where city_key = v_key));

  insert into public.kolis_parcel_events (parcel_id, kind, city, note, photo_url, by_role, by_user)
  values (p_id, 'checkpoint', btrim(p_city), nullif(btrim(coalesce(p_note, '')), ''), v_photo, 'admin', auth.uid())
  returning id into v_id;

  perform set_config('kolis.event_manual', '1', true);
  update public.kolis_parcels set status = 'in_transit' where id = p_id and status = 'picked_up';
  return v_id;
end $$;

-- Fix up an event after the fact: attach / replace its photo, flag that the code
-- was overridden, or send its card again.
create or replace function public.kolis_admin_event_update(p_event uuid, p_photo text default null, p_override boolean default null, p_resend boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_parcel uuid; v_kind text;
begin
  if coalesce(public.kolis_admin_role(), '') not in ('owner', 'admin', 'dispatcher', 'finance') then raise exception 'forbidden'; end if;
  select parcel_id, kind into v_parcel, v_kind from public.kolis_parcel_events where id = p_event;
  if v_parcel is null then return false; end if;
  update public.kolis_parcel_events
     set photo_url     = coalesce(nullif(p_photo, ''), photo_url),
         code_override = coalesce(p_override, code_override),
         by_role       = case when p_override is not null then 'admin' else by_role end,
         by_user       = case when p_override is not null then auth.uid() else by_user end,
         card_sent_at  = case when p_resend then null else card_sent_at end,
         shared_at     = case when p_resend then null else shared_at end
   where id = p_event;
  if nullif(p_photo, '') is not null then
    -- keep the parcel's own proof field in step (the courier app and history read it)
    if v_kind = 'picked_up' then
      update public.kolis_parcels set pickup_proof = coalesce(pickup_proof, '{}'::jsonb) || jsonb_build_object('url', p_photo, 'taken_at', now(), 'source', 'admin') where id = v_parcel;
    elsif v_kind = 'delivered' then
      update public.kolis_parcels set delivery_proof = coalesce(delivery_proof, '{}'::jsonb) || jsonb_build_object('url', p_photo, 'taken_at', now(), 'source', 'admin') where id = v_parcel;
    end if;
  end if;
  if p_resend then
    delete from public.kolis_notifications where parcel_id = v_parcel and kind = 'ev:' || p_event::text;
  end if;
  return true;
end $$;

-- Everything the admin parcel page needs to drive tracking: both codes (pickup is
-- not in kolis_admin_parcel), the card token, the timeline, and saved landmarks.
create or replace function public.kolis_admin_parcel_track(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.kolis_admin_role() is null then raise exception 'forbidden'; end if;
  return (
    select jsonb_build_object(
      'pickup_code',   p.pickup_code,
      'delivery_code', p.delivery_code,
      'scan_token',    p.scan_token,
      'events', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', e.id, 'kind', e.kind, 'city', e.city, 'note', e.note, 'photo', e.photo_url,
                  'by', e.by_role, 'override', e.code_override, 'at', e.created_at,
                  'sent', e.card_sent_at, 'shared', e.shared_at) order by e.created_at)
                from public.kolis_parcel_events e where e.parcel_id = p.id), '[]'::jsonb),
      'landmarks', coalesce((select jsonb_agg(jsonb_build_object('city', l.city, 'photo', l.photo_url) order by l.city)
                   from public.kolis_landmarks l), '[]'::jsonb))
    from public.kolis_parcels p where p.id = p_id);
end $$;

-- ── Courier ─────────────────────────────────────────────────────────────────
-- Same identity resolution as kolis_courier_pickup: a courier may be signed in
-- with their Kolis profile or with their LoadQ driver identity.
create or replace function public.kolis_courier_self()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select kp.id from public.kolis_profiles kp
                    where kp.id = auth.uid() or kp.loadq_driver_id = auth.uid()
                    order by (kp.id = auth.uid()) desc limit 1), auth.uid());
$$;

-- Attach the pickup ('picked_up') or drop-off ('delivered') photo.
create or replace function public.kolis_courier_set_proof(p_id uuid, p_kind text, p_url text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_proof jsonb := jsonb_build_object('url', p_url, 'taken_at', now(), 'source', 'courier app');
begin
  if p_kind = 'picked_up' then
    update public.kolis_parcels set pickup_proof = v_proof where id = p_id and driver_id = public.kolis_courier_self();
  elsif p_kind = 'delivered' then
    update public.kolis_parcels set delivery_proof = v_proof where id = p_id and driver_id = public.kolis_courier_self();
  else
    return false;
  end if;
  return found;
end $$;

-- The courier passed the card on (WhatsApp / SMS / share) → the sweep won't send it again.
create or replace function public.kolis_courier_card_shared(p_id uuid, p_kind text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.kolis_parcels where id = p_id and driver_id = public.kolis_courier_self()) then return false; end if;
  update public.kolis_parcel_events set shared_at = coalesce(shared_at, now())
   where parcel_id = p_id and kind = p_kind;
  return found;
end $$;

-- What the courier app needs to show the card for one of their parcels.
create or replace function public.kolis_courier_card(p_id uuid, p_kind text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', p.code, 'token', p.scan_token, 'event_id', e.id,
                            'photo', e.photo_url, 'shared', e.shared_at is not null or e.card_sent_at is not null)
    from public.kolis_parcels p
    left join lateral (select * from public.kolis_parcel_events
                        where parcel_id = p.id and kind = p_kind order by created_at desc limit 1) e on true
   where p.id = p_id and p.driver_id = public.kolis_courier_self();
$$;

-- ── Card data (public by scan_token, read by the card image route) ──────────
create or replace function public.kolis_card_event(p_token text, p_event uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p.id is null then null else jsonb_build_object(
    'code',       p.code,
    'status',     p.status,
    'from_city',  p.from_city,
    'to_city',    p.to_city,
    'recipient',  nullif(split_part(coalesce(p.recipient_name, ''), ' ', 1), ''),
    'courier',    nullif(split_part(coalesce(d.full_name, ld.full_name, dp.full_name, p.external_driver_name, ''), ' ', 1), ''),
    'lang',       coalesce(p.recipient_lang, 'fr'),
    'brand',      case when o.id is not null and coalesce(o.brand_tracking, true) then
                    jsonb_build_object('name', coalesce(o.brand_name, o.name), 'color', o.brand_color) end,
    'kind',       coalesce(e.kind, case when p.status = 'delivered' then 'delivered' else 'picked_up' end),
    'city',       e.city,
    'note',       e.note,
    'photo',      coalesce(e.photo_url, case when e.id is null then p.delivery_proof ->> 'url' end),
    'at',         coalesce(e.created_at, p.delivered_at, p.delivered_scan_at, p.picked_up_scan_at)
  ) end
  from (select * from public.kolis_parcels where scan_token = p_token limit 1) p
  left join lateral (select * from public.kolis_parcel_events ev
                      where ev.parcel_id = p.id
                        and (ev.id = p_event or (p_event is null and ev.kind = 'delivered'))
                      order by ev.created_at desc limit 1) e on true
  left join public.drivers d on d.id = p.driver_id
  left join public.kolis_profiles dp on dp.id = p.driver_id
  left join public.drivers ld on ld.id = dp.loadq_driver_id
  left join public.kolis_orgs o on o.id = p.org_id;
$$;
grant execute on function public.kolis_card_event(text, uuid) to anon, authenticated;

-- ── Sweep: send each event's card once ──────────────────────────────────────
-- Checkpoints go at once (their photo is set when they're created). Pickup and
-- delivery wait for the courier's photo — up to 5 / 10 minutes — then go anyway.
-- Skipped when the courier already shared the card themselves.
create or replace function public.kolis_event_card_sweep()
returns int language plpgsql security definer set search_path = public, net as $$
declare r record; v_req bigint; n int := 0;
begin
  for r in
    select e.id, e.parcel_id, e.kind
      from public.kolis_parcel_events e
     where e.card_sent_at is null and e.shared_at is null
       and e.created_at > now() - interval '24 hours'
       and (e.kind = 'checkpoint'
            or e.photo_url is not null
            or (e.kind = 'picked_up' and e.created_at < now() - interval '5 minutes')
            or (e.kind = 'delivered' and e.created_at < now() - interval '10 minutes'))
       and not exists (select 1 from public.kolis_notifications n
                        where n.parcel_id = e.parcel_id and n.kind = 'ev:' || e.id::text)
     order by e.created_at
     limit 20
  loop
    select net.http_post(
      url     := 'https://kzjptcpjpwlxfofzhyku.supabase.co/functions/v1/kolis-notify-recipient',
      headers := jsonb_build_object('Content-Type','application/json','x-kolis-secret','kolis_notify_9f3a2c7b1e6d4084'),
      body    := jsonb_build_object('parcel_id', r.parcel_id, 'event_id', r.id,
                                    'status', case r.kind when 'checkpoint' then 'in_transit' else r.kind end)) into v_req;
    insert into public.kolis_notifications(parcel_id, kind, request_id, state, attempts, last_attempt_at)
      values (r.parcel_id, 'ev:' || r.id::text, v_req, 'inflight', 1, now())
      on conflict (parcel_id, kind) do nothing;
    update public.kolis_parcel_events set card_sent_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.kolis_event_card_sweep() from public, anon, authenticated;

-- Every minute. Replaces job 47 (kolis-card-fallback), which only knew about the
-- delivered card; the sweep covers it along with pickup and checkpoints.
do $$ begin
  perform cron.unschedule('kolis-card-fallback') where exists (select 1 from cron.job where jobname = 'kolis-card-fallback');
  perform cron.unschedule('kolis-event-cards') where exists (select 1 from cron.job where jobname = 'kolis-event-cards');
end $$;
select cron.schedule('kolis-event-cards', '* * * * *', 'select public.kolis_event_card_sweep()');
