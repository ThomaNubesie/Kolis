-- Courier journey view + sender-confirmed handover.
--
-- 1. kolis_courier_journey(parcel): what the courier app's on-the-road timeline
--    (design E-2) needs — every event with its photo and card id, plus the
--    pickup / drop-off coordinates so the app can switch to the delivery flow
--    within 25 km of the drop-off.
--
-- 2. Handover (e-label option 5): at pickup, a courier with no label and no code
--    asks the SENDER to confirm the handover on their own phone. The sender
--    confirms in the Kolis app or from an SMS link (business.kolis.ca/h/<token>),
--    and the parcel flips to picked_up exactly as if the code had been typed.
--    The courier's distance to the pickup address at request time is stored as
--    supporting evidence (same 1000 m reasoning as the scan fence).

-- ── 1. Journey ─────────────────────────────────────────────────────────────
create or replace function public.kolis_courier_journey(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', p.code, 'status', p.status, 'token', p.scan_token,
    'pickup',  jsonb_build_object('lat', p.pickup_lat,  'lng', p.pickup_lng,  'addr', p.pickup_addr,  'city', p.from_city),
    'dropoff', jsonb_build_object('lat', p.dropoff_lat, 'lng', p.dropoff_lng, 'addr', case when p.status <> 'matched' then p.dropoff_addr end, 'city', p.to_city),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', e.id, 'kind', e.kind, 'city', e.city, 'note', e.note, 'photo', e.photo_url,
                 'at', e.created_at, 'sent', e.card_sent_at is not null, 'shared', e.shared_at is not null)
               order by e.created_at)
               from public.kolis_parcel_events e where e.parcel_id = p.id), '[]'::jsonb))
  from public.kolis_parcels p
  where p.id = p_id and p.driver_id = public.kolis_courier_self();
$$;

-- ── 2. Handover ────────────────────────────────────────────────────────────
create table if not exists public.kolis_handovers (
  id          uuid primary key default gen_random_uuid(),
  parcel_id   uuid not null references public.kolis_parcels(id) on delete cascade,
  token       text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  status      text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'expired')),
  courier_id  uuid,
  distance_m  integer,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '15 minutes',
  decided_at  timestamptz,
  decided_via text check (decided_via in ('app', 'link'))
);
create index if not exists kolis_handovers_parcel_idx on public.kolis_handovers (parcel_id, created_at desc);
alter table public.kolis_handovers enable row level security;   -- reached only through the functions below

-- Courier asks. One live request per parcel; asking again replaces it.
create or replace function public.kolis_courier_request_handover(p_id uuid, p_lat double precision default null, p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path = public, extensions, net as $$
declare v_p record; v_h record; v_dist integer;
begin
  select id, status, pickup_lat, pickup_lng into v_p from public.kolis_parcels
   where id = p_id and driver_id = public.kolis_courier_self();
  if v_p.id is null then return jsonb_build_object('error', 'not_your_parcel'); end if;
  if v_p.status not in ('matched', 'dispatched', 'received_at_hub') then return jsonb_build_object('error', 'bad_status'); end if;
  v_dist := round(public.kolis_distance_m(p_lat, p_lng, v_p.pickup_lat, v_p.pickup_lng));

  update public.kolis_handovers set status = 'expired' where parcel_id = p_id and status = 'pending';
  insert into public.kolis_handovers (parcel_id, courier_id, distance_m)
  values (p_id, public.kolis_courier_self(), v_dist) returning * into v_h;

  -- Tell the sender (SMS + email with the confirm link) through the same notifier.
  perform net.http_post(
    url     := 'https://kzjptcpjpwlxfofzhyku.supabase.co/functions/v1/kolis-notify-recipient',
    headers := jsonb_build_object('Content-Type','application/json','x-kolis-secret','kolis_notify_9f3a2c7b1e6d4084'),
    body    := jsonb_build_object('parcel_id', p_id, 'status', 'handover', 'handover_token', v_h.token));
  return jsonb_build_object('id', v_h.id, 'status', v_h.status, 'expires_at', v_h.expires_at, 'distance_m', v_dist);
end $$;

-- Courier polls for the answer.
create or replace function public.kolis_courier_handover_status(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('status', case when h.status = 'pending' and h.expires_at < now() then 'expired' else h.status end,
                            'expires_at', h.expires_at)
    from public.kolis_handovers h
    join public.kolis_parcels p on p.id = h.parcel_id
   where h.parcel_id = p_id and p.driver_id = public.kolis_courier_self()
   order by h.created_at desc limit 1;
$$;

-- Shared decision logic. Confirm → picked_up, recorded as a courier pickup
-- confirmed by the sender (no code typed, so code_override stays false).
create or replace function public.kolis_handover_apply(p_h public.kolis_handovers, p_ok boolean, p_via text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if p_h.status <> 'pending' then return p_h.status; end if;
  if p_h.expires_at < now() then
    update public.kolis_handovers set status = 'expired' where id = p_h.id;
    return 'expired';
  end if;
  update public.kolis_handovers set status = case when p_ok then 'confirmed' else 'declined' end,
         decided_at = now(), decided_via = p_via where id = p_h.id;
  if p_ok then
    perform set_config('kolis.event_by', 'courier', true);
    update public.kolis_parcels set status = 'picked_up', picked_up_scan_at = coalesce(picked_up_scan_at, now())
     where id = p_h.parcel_id and status in ('matched', 'dispatched', 'received_at_hub');
    update public.kolis_parcel_events set note = coalesce(note, 'Remise confirmée par l''expéditeur')
     where parcel_id = p_h.parcel_id and kind = 'picked_up';
    return 'confirmed';
  end if;
  return 'declined';
end $$;
revoke all on function public.kolis_handover_apply(public.kolis_handovers, boolean, text) from public, anon, authenticated;

-- Sender, signed in to the Kolis app.
create or replace function public.kolis_sender_handover(p_id uuid, p_ok boolean)
returns text language plpgsql security definer set search_path = public as $$
declare v_h public.kolis_handovers;
begin
  select h.* into v_h from public.kolis_handovers h join public.kolis_parcels p on p.id = h.parcel_id
   where h.parcel_id = p_id and p.sender_id = auth.uid() order by h.created_at desc limit 1;
  if v_h.id is null then return 'not_found'; end if;
  return public.kolis_handover_apply(v_h, p_ok, 'app');
end $$;

-- Sender's pending requests, for the in-app banner.
create or replace function public.kolis_sender_pending_handovers()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('parcel_id', p.id, 'code', p.code, 'courier',
           nullif(split_part(coalesce(d.full_name, ld.full_name, dp.full_name, ''), ' ', 1), ''),
           'expires_at', h.expires_at)), '[]'::jsonb)
    from public.kolis_handovers h
    join public.kolis_parcels p on p.id = h.parcel_id
    left join public.drivers d on d.id = p.driver_id
    left join public.kolis_profiles dp on dp.id = p.driver_id
    left join public.drivers ld on ld.id = dp.loadq_driver_id
   where p.sender_id = auth.uid() and h.status = 'pending' and h.expires_at > now();
$$;

-- Sender from the SMS/email link (no sign-in; the 32-hex token is the key, valid 15 min).
create or replace function public.kolis_handover_by_token(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', p.code, 'from_city', p.from_city, 'to_city', p.to_city,
           'courier', nullif(split_part(coalesce(d.full_name, ld.full_name, dp.full_name, ''), ' ', 1), ''),
           'status', case when h.status = 'pending' and h.expires_at < now() then 'expired' else h.status end,
           'lang', coalesce(p.recipient_lang, 'fr'))
    from public.kolis_handovers h
    join public.kolis_parcels p on p.id = h.parcel_id
    left join public.drivers d on d.id = p.driver_id
    left join public.kolis_profiles dp on dp.id = p.driver_id
    left join public.drivers ld on ld.id = dp.loadq_driver_id
   where h.token = p_token;
$$;
create or replace function public.kolis_handover_decide(p_token text, p_ok boolean)
returns text language plpgsql security definer set search_path = public as $$
declare v_h public.kolis_handovers;
begin
  select * into v_h from public.kolis_handovers where token = p_token;
  if v_h.id is null then return 'not_found'; end if;
  return public.kolis_handover_apply(v_h, p_ok, 'link');
end $$;
grant execute on function public.kolis_handover_by_token(text), public.kolis_handover_decide(text, boolean) to anon, authenticated;
