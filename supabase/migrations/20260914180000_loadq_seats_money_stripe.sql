-- LoadQ — seats, money, Stripe, and the departure record.
--
-- WHY THIS FILE EXISTS: all of this was applied to kzjptcpjpwlxfofzhyku through the Supabase
-- MCP tool over 2026-09-13/14 and never written down. The feature worked in production and
-- existed in no repo, so a fresh checkout could not have rebuilt it. This is the schema as it
-- actually stands, read back out of the live database — idempotent, so it is safe to run
-- against a database that already has it.
--
-- The rules this encodes, so they are not "simplified" away later:
--   · a car cannot depart owing — loadq_list_depart refuses with unpaid_seats
--   · the $5 comes OUT of the $30, never on top
--   · the money is LoadQ's, never the driver's; the driver is paid afterwards
--   · the departure record is FROZEN; a receipt that moves when a setting moves is not a receipt
--   · a paid seat is not released on a tap — that is a refund decision
--   · no payout is sent without evidence the money arrived

-- ── tables ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.loadq_seats (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  seat_no integer not null check (seat_no >= 1),
  passenger_name text,
  passenger_phone text,
  request_id uuid,
  channel text not null default 'point' check (channel in ('app','point')),
  method text check (method in ('card','interac')),        -- never 'cash'
  status text not null default 'awaiting' check (status in ('awaiting','paid','released')),
  fare_cents integer not null,
  fee_cents integer not null,
  reference text unique,
  paid_at timestamptz,
  released_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stripe_session_id text,
  stripe_payment_intent text
);

-- One live seat per position. An EXCLUDE constraint rather than application logic: two
-- writers on two tablets cannot both sell seat 3.
do $$ begin
  alter table public.loadq_seats add constraint loadq_seats_one_per_position
    exclude using btree (entry_id with =, seat_no with =) where (status <> 'released');
exception when duplicate_table or duplicate_object then null; end $$;

create index if not exists loadq_seats_entry_idx on public.loadq_seats (entry_id) where (status <> 'released');
create index if not exists loadq_seats_ref_idx   on public.loadq_seats (reference) where (status = 'awaiting');

create table if not exists public.loadq_payouts (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null unique,          -- one payout per departing car, idempotent close
  driver_id uuid not null,
  seats integer not null,
  gross_cents integer not null,
  fee_cents integer not null,
  net_cents integer not null,
  method text check (method in ('interac','card','manual')),
  reference text,
  status text not null default 'due' check (status in ('due','sent','failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  -- everything below is FROZEN at departure, not recomputed on read
  departed_at timestamptz,
  zone_id text,
  destination text,
  driver_name text,
  driver_phone text,
  vehicle_desc text,
  plate text,
  tax_region text,
  tax_label text,
  fee_tax_cents integer,
  fee_net_cents integer,
  verified_at timestamptz,
  verified_by uuid,
  receipt_sent_at timestamptz,
  trip_cost_cents integer not null default 0,
  trip_cost_itc_cents integer not null default 0,
  card_cost_cents integer not null default 0,
  platform_net_cents integer not null default 0
);

-- Card charges Stripe has confirmed: the evidence a card seat was really paid, and the
-- counterpart of loadq_interac_inbound. Without it, method='card' was only a typed note.
create table if not exists public.loadq_card_inbound (
  id uuid primary key default gen_random_uuid(),
  payment_intent text not null unique,     -- Stripe redelivers; dedupe on this
  seat_id uuid references public.loadq_seats(id) on delete set null,
  entry_id uuid,
  reference text,
  amount_cents integer not null,
  currency text not null default 'cad',
  status text not null,                    -- succeeded | mismatch | orphan
  event_id text,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists loadq_card_inbound_seat on public.loadq_card_inbound (seat_id);

create table if not exists public.loadq_tax_rates (
  region text primary key,
  label text not null,
  rate_ppm integer not null
);

alter table public.loadq_seats         enable row level security;
alter table public.loadq_payouts       enable row level security;
alter table public.loadq_card_inbound  enable row level security;
-- No policies on purpose: these are reached only through SECURITY DEFINER functions and the
-- service role. A passenger must never be able to read the till.

-- ── rates and switches ────────────────────────────────────────────────────────────────────
-- Tax is contained WITHIN the $5 fee, not added to it. Ontario remits to CRA, Quebec to
-- Revenu Québec, which is why the rate is per region and the books split the same way.
insert into public.loadq_tax_rates(region,label,rate_ppm) values ('ottawa','HST 13% (ON)',130000) on conflict (region) do nothing;
insert into public.loadq_tax_rates(region,label,rate_ppm) values ('toronto','HST 13% (ON)',130000) on conflict (region) do nothing;
insert into public.loadq_tax_rates(region,label,rate_ppm) values ('gatineau','TPS 5% + TVQ 9,975% (QC)',149750) on conflict (region) do nothing;
insert into public.loadq_tax_rates(region,label,rate_ppm) values ('laval','TPS 5% + TVQ 9,975% (QC)',149750) on conflict (region) do nothing;
insert into public.loadq_tax_rates(region,label,rate_ppm) values ('longueuil','TPS 5% + TVQ 9,975% (QC)',149750) on conflict (region) do nothing;
insert into public.loadq_tax_rates(region,label,rate_ppm) values ('montreal','TPS 5% + TVQ 9,975% (QC)',149750) on conflict (region) do nothing;
insert into public.loadq_tax_rates(region,label,rate_ppm) values ('quebec','TPS 5% + TVQ 9,975% (QC)',149750) on conflict (region) do nothing;

insert into public.loadq_settings(key,value) values ('seat_fee_cents','500') on conflict (key) do nothing;
insert into public.loadq_settings(key,value) values ('trip_cost_cents','12') on conflict (key) do nothing;
insert into public.loadq_settings(key,value) values ('trip_cost_taxable','false') on conflict (key) do nothing;
insert into public.loadq_settings(key,value) values ('card_cost_ppm','0') on conflict (key) do nothing;
insert into public.loadq_settings(key,value) values ('card_cost_fixed_cents','0') on conflict (key) do nothing;

insert into public.loadq_setting_defs(key,kind,group_name,label_en,label_fr,help_en,help_fr,min_val,max_val,sort) values ('seat_fee_cents','int','Seats','LoadQ share per seat (cents)','Part LoadQ par place (cents)','500 = $5. Taken OUT of the fare, not added to it: a $30 seat pays the driver $25.','500 = 5 $. Prélevé SUR le tarif, non ajouté : une place à 30 $ verse 25 $ au chauffeur.',0,5000,35) on conflict (key) do nothing;
insert into public.loadq_setting_defs(key,kind,group_name,label_en,label_fr,help_en,help_fr,min_val,max_val,sort) values ('trip_cost_cents','int','Seats','Cost per departure (cents)','Coût par départ (cents)','Subtracted from what LoadQ keeps, once per departing car — not per seat. Frozen onto each departure record.','Soustrait de ce que LoadQ garde, une fois par voiture qui part — pas par place. Figé sur chaque dossier de départ.',0,10000,36) on conflict (key) do nothing;
insert into public.loadq_setting_defs(key,kind,group_name,label_en,label_fr,help_en,help_fr,min_val,max_val,sort) values ('trip_cost_taxable','bool','Seats','The departure cost carries HST','Le coût par départ porte la TVH','Off for bank and transfer fees, which are tax-exempt. On only if the supplier charges HST — then the tax inside it is claimed back as an input tax credit.','Désactivé pour les frais bancaires, exonérés. Activé seulement si le fournisseur facture la TVH — la taxe est alors récupérée comme crédit de taxe sur intrants.',null,null,37) on conflict (key) do nothing;
insert into public.loadq_setting_defs(key,kind,group_name,label_en,label_fr,help_en,help_fr,min_val,max_val,sort) values ('card_cost_ppm','int','Seats','Card cost, parts per million of fare','Coût carte, parties par million du tarif','Processor percentage on card seats. 29000 = 2.9%. Left at 0 until the real Stripe rate is confirmed.','Pourcentage du processeur sur les places payées par carte. 29000 = 2,9 %. À 0 tant que le taux Stripe réel n''est pas confirmé.',0,200000,38) on conflict (key) do nothing;
insert into public.loadq_setting_defs(key,kind,group_name,label_en,label_fr,help_en,help_fr,min_val,max_val,sort) values ('card_cost_fixed_cents','int','Seats','Card cost, fixed per seat (cents)','Coût carte, fixe par place (cents)','Flat processor charge on each card seat, on top of the percentage.','Frais fixe du processeur sur chaque place payée par carte, en plus du pourcentage.',0,1000,39) on conflict (key) do nothing;

-- ── helpers ───────────────────────────────────────────────────────────────────────────────
create or replace function public.loadq_setting(p_key text)
returns text language sql stable security definer set search_path to 'public' as $$
  select value from public.loadq_settings where key = p_key
$$;

create or replace function public.loadq_setting_int(p_key text, p_default int default 0)
returns int language sql stable security definer set search_path to 'public' as $$
  select coalesce((select nullif(btrim(value),'')::int from public.loadq_settings
                    where key = p_key and btrim(value) ~ '^-?[0-9]+$'), p_default)
$$;

create or replace function public.loadq_seat_fee_cents()
returns integer language sql stable security definer set search_path to 'public' as $$
  select coalesce((select value::int from loadq_settings where key='seat_fee_cents'), 500)
$$;

-- Tax contained within a tax-inclusive amount. $5 in Ontario is $4.42 + $0.58, not $5 + $0.65.
create or replace function public.loadq_tax_within(p_cents integer, p_region text)
returns integer language sql immutable as $$
  select greatest(0, p_cents - round(p_cents / (1 + coalesce(
           (select rate_ppm from public.loadq_tax_rates where region = p_region), 130000
         ) / 1000000.0))::int)
$$;

-- Ambiguous characters are left out: this is read aloud in a parking lot and typed into a
-- bank app. No 0/O, no 1/I.
create or replace function public.loadq_seat_reference()
returns text language plpgsql security definer set search_path to 'public' as $$
declare v text; alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
begin
  loop
    v := 'LQ-' || string_agg(substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1), '')
         from generate_series(1,4);
    exit when not exists (select 1 from loadq_seats s where s.reference = v);
  end loop;
  return v;
end $$;

create or replace function public.loadq_seat_may_manage(p_entry uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from drivers d where d.id = auth.uid() and d.is_admin)
      or exists (select 1 from loadq_list_writer w where w.driver_id = auth.uid())
      or exists (select 1 from queue_entries q where q.id = p_entry and q.driver_id = auth.uid())
$$;

-- ── selling a seat ────────────────────────────────────────────────────────────────────────
-- Capacity is vehicle.seats - 1: the driver occupies one. Reading v.seats directly offered
-- the driver's own seat for sale (fixed 2026-09-14, before any had been sold).
create or replace function public.loadq_seat_open(
  p_entry uuid, p_seat_no integer, p_name text default null, p_phone text default null,
  p_channel text default 'point', p_request uuid default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_cap int; v_fare int; v_id uuid; v_ref text; v_taken int;
begin
  if not public.loadq_seat_may_manage(p_entry) then
    return json_build_object('ok', false, 'error', 'forbidden');
  end if;
  select greatest(coalesce(v.seats,0) - 1, 0),
         coalesce((select f.fare_cents from loadq_route_fares f
                    where f.zone_id = q.zone_id and f.destination_region = q.destination_region), 0)
    into v_cap, v_fare
    from queue_entries q left join vehicles v on v.id = q.vehicle_id where q.id = p_entry;
  if v_cap = 0 then return json_build_object('ok', false, 'error', 'no_vehicle_on_entry'); end if;
  if p_seat_no < 1 or p_seat_no > v_cap then
    return json_build_object('ok', false, 'error', 'seat_out_of_range', 'capacity', v_cap); end if;
  if v_fare = 0 then
    return json_build_object('ok', false, 'error', 'no_fare_for_route'); end if;

  select count(*) into v_taken from loadq_seats
   where entry_id = p_entry and seat_no = p_seat_no and status <> 'released';
  if v_taken > 0 then return json_build_object('ok', false, 'error', 'seat_taken'); end if;

  v_ref := public.loadq_seat_reference();
  insert into loadq_seats(entry_id, seat_no, passenger_name, passenger_phone, request_id,
                          channel, status, fare_cents, fee_cents, reference, created_by)
  values (p_entry, p_seat_no, nullif(btrim(coalesce(p_name,'')),''),
          nullif(regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g'),''),
          p_request, case when p_channel = 'app' then 'app' else 'point' end,
          'awaiting', v_fare, public.loadq_seat_fee_cents(), v_ref, auth.uid())
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id, 'reference', v_ref,
                           'fare_cents', v_fare, 'fee_cents', public.loadq_seat_fee_cents());
end $$;

create or replace function public.loadq_seat_mark_paid(
  p_seat uuid, p_method text default 'interac', p_reference text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare s public.loadq_seats; v_m text := lower(btrim(coalesce(p_method,'')));
begin
  select * into s from loadq_seats where id = p_seat;
  if s.id is null then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.loadq_seat_may_manage(s.entry_id) then
    return json_build_object('ok', false, 'error', 'forbidden'); end if;
  if v_m not in ('card','interac') then
    return json_build_object('ok', false, 'error', 'bad_method',
      'detail', 'card or interac — the driver does not take cash'); end if;
  if s.status = 'paid' then
    return json_build_object('ok', true, 'already', true); end if;

  update loadq_seats
     set status = 'paid', method = v_m, paid_at = now(),
         reference = coalesce(nullif(btrim(coalesce(p_reference,'')),''), reference),
         updated_at = now()
   where id = p_seat;
  return json_build_object('ok', true, 'seat_no', s.seat_no);
end $$;

create or replace function public.loadq_seat_release(p_seat uuid, p_reason text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare s public.loadq_seats;
begin
  select * into s from loadq_seats where id = p_seat;
  if s.id is null then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.loadq_seat_may_manage(s.entry_id) then
    return json_build_object('ok', false, 'error', 'forbidden'); end if;
  -- A paid seat is money received; releasing it is a refund decision, not a tap on a tablet.
  if s.status = 'paid' then
    return json_build_object('ok', false, 'error', 'seat_is_paid',
      'detail', 'Refund it before releasing — the passenger has already paid LoadQ.'); end if;
  update loadq_seats set status='released', released_at=now(), updated_at=now() where id = p_seat;
  return json_build_object('ok', true);
end $$;

create or replace function public.loadq_entry_unpaid_seats(p_entry uuid)
returns json language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select json_agg(json_build_object('seat_no', s.seat_no, 'name', s.passenger_name,
                                      'reference', s.reference, 'fare_cents', s.fare_cents)
                    order by s.seat_no)
      from loadq_seats s where s.entry_id = p_entry and s.status = 'awaiting'), '[]'::json)
$$;

create or replace function public.loadq_seats_for_entry(p_entry uuid)
returns json language sql stable security definer set search_path to 'public' as $$
  select case when not public.loadq_seat_may_manage(p_entry)
    then json_build_object('ok', false, 'error', 'forbidden')
    else json_build_object(
      'ok', true,
      'entry_id', p_entry,
      'capacity', coalesce((select greatest(v.seats - 1, 0) from queue_entries q
                              join vehicles v on v.id = q.vehicle_id where q.id = p_entry), 0),
      'fare_cents', coalesce((select f.fare_cents from queue_entries q
                                join loadq_route_fares f
                                  on f.zone_id = q.zone_id and f.destination_region = q.destination_region
                               where q.id = p_entry), 0),
      'fee_cents', public.loadq_seat_fee_cents(),
      'seats', coalesce((
        select json_agg(json_build_object(
                 'id', s.id, 'seat_no', s.seat_no, 'name', s.passenger_name,
                 'phone', s.passenger_phone, 'channel', s.channel, 'method', s.method,
                 'status', s.status, 'fare_cents', s.fare_cents, 'fee_cents', s.fee_cents,
                 'reference', s.reference, 'paid_at', s.paid_at) order by s.seat_no)
          from loadq_seats s where s.entry_id = p_entry and s.status <> 'released'), '[]'::json))
  end
$$;

-- Every car's seats for one line in a single call: the tablet redraws on a timer, and one
-- request per row is a dozen round trips on a phone tethered in a parking lot.
create or replace function public.loadq_sheet_seats(p_zone text, p_dest text)
returns json language sql stable security definer set search_path to 'public' as $$
  select case when not public.loadq_can_write_list(p_zone)
    then json_build_object('ok', false, 'error', 'not_a_list_writer')
    else json_build_object('ok', true,
      'fee_cents', public.loadq_seat_fee_cents(),
      'cars', coalesce((
        select json_agg(json_build_object(
                 'entry_id', q.id,
                 'capacity', greatest(coalesce(v.seats, 0) - 1, 0),
                 'fare_cents', coalesce(f.fare_cents, 0),
                 'seats', coalesce((
                   select json_agg(json_build_object(
                            'id', s.id, 'seat_no', s.seat_no, 'name', s.passenger_name,
                            'phone', s.passenger_phone, 'channel', s.channel,
                            'method', s.method, 'status', s.status,
                            'fare_cents', s.fare_cents, 'reference', s.reference,
                            'paid_at', s.paid_at) order by s.seat_no)
                     from loadq_seats s
                    where s.entry_id = q.id and s.status <> 'released'), '[]'::json)))
          from queue_entries q
          left join vehicles v on v.id = q.vehicle_id
          left join loadq_route_fares f
                 on f.zone_id = q.zone_id and f.destination_region = q.destination_region
         where q.zone_id = p_zone
           and coalesce(q.destination_region,'') = coalesce(p_dest,'')
           and q.status in ('waiting','loading')), '[]'::json))
  end
$$;

-- ── the driver's app and the sheet, kept in step ──────────────────────────────────────────
-- The driver's phone draws seats from queue_entries.seat_states / seats_locked; the sheet
-- writes loadq_seats. Nothing joined them, so a seat sold at the pickup point stayed invisible
-- to the driver (Bahati Mubalama, entry a0c73f48, 2026-09-14: one paid passenger on the sheet,
-- an empty car on his phone). A sheet seat is a booking, which is what 'locked' already means.
create or replace function public.loadq_seat_sync_entry(p_entry uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_cap int; v_states text[]; v_cur jsonb; i int; v_locked int;
begin
  select greatest(coalesce(v.seats,0) - 1, 0),
         public.loadq_seat_map(q.seat_states, q.seats_boarded, q.seats_locked,
                               greatest(coalesce(v.seats,0)-1, 0))
    into v_cap, v_cur
    from queue_entries q left join vehicles v on v.id = q.vehicle_id
   where q.id = p_entry;
  if v_cap is null or v_cap = 0 then return; end if;

  select array_agg(value #>> '{}' order by ordinality) into v_states
    from jsonb_array_elements(v_cur) with ordinality;
  v_states := coalesce(v_states, '{}');

  for i in 1..v_cap loop
    if i > coalesce(array_length(v_states,1),0) then v_states := v_states || 'empty'; end if;
    if exists (select 1 from loadq_seats s
                where s.entry_id = p_entry and s.seat_no = i and s.status <> 'released') then
      v_states[i] := 'locked';
    elsif v_states[i] = 'locked' then
      -- the lock came from a sheet seat that has since been released
      v_states[i] := 'empty';
    end if;   -- 'boarded' and 'disputed' are the driver's own marks; leave them alone
  end loop;

  v_locked := (select count(*) from unnest(v_states) s where s = 'locked');
  update queue_entries
     set seat_states = to_jsonb(v_states), seats_locked = v_locked
   where id = p_entry;
end $$;

create or replace function public.loadq_seats_touch_entry()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.loadq_seat_sync_entry(coalesce(new.entry_id, old.entry_id));
  return null;
end $$;

drop trigger if exists trg_loadq_seats_sync on public.loadq_seats;
-- A trigger, not a line in each RPC: every future way of touching a seat is covered and
-- nothing can quietly skip it.
create trigger trg_loadq_seats_sync
after insert or update of status, seat_no or delete on public.loadq_seats
for each row execute function public.loadq_seats_touch_entry();

-- ── money in ──────────────────────────────────────────────────────────────────────────────
create or replace function public.loadq_seat_match_interac(
  p_reference text, p_amount_cents integer default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare s public.loadq_seats; v_ref text := upper(btrim(coalesce(p_reference,'')));
begin
  if v_ref = '' then return json_build_object('matched', false, 'reason', 'no_reference'); end if;

  select * into s from loadq_seats where upper(reference) = v_ref and status = 'awaiting';
  if s.id is null then
    -- an already-paid reference is not an error: Interac can deliver a duplicate webhook
    if exists (select 1 from loadq_seats where upper(reference) = v_ref and status = 'paid') then
      return json_build_object('matched', true, 'already', true, 'kind', 'seat');
    end if;
    return json_build_object('matched', false, 'reason', 'no_such_seat');
  end if;

  if p_amount_cents is not null and p_amount_cents <> s.fare_cents then
    return json_build_object('matched', false, 'reason', 'amount_mismatch',
      'expected_cents', s.fare_cents, 'received_cents', p_amount_cents, 'seat_id', s.id);
  end if;

  update loadq_seats
     set status = 'paid', method = 'interac', paid_at = now(), updated_at = now()
   where id = s.id;

  return json_build_object('matched', true, 'kind', 'seat', 'seat_id', s.id,
                           'seat_no', s.seat_no, 'entry_id', s.entry_id,
                           'amount_cents', s.fare_cents);
end $$;

-- The tablet asks for a Stripe link; this records which session belongs to which seat so the
-- webhook can find its way home even if metadata is lost.
create or replace function public.loadq_seat_set_session(p_seat uuid, p_session text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare s public.loadq_seats;
begin
  select * into s from loadq_seats where id = p_seat;
  if s.id is null then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.loadq_seat_may_manage(s.entry_id) then
    return json_build_object('ok', false, 'error', 'forbidden'); end if;
  if s.status = 'paid' then return json_build_object('ok', false, 'error', 'already_paid'); end if;
  update loadq_seats set stripe_session_id = p_session, updated_at = now() where id = p_seat;
  return json_build_object('ok', true, 'fare_cents', s.fare_cents, 'reference', s.reference);
end $$;

-- Called by loadq-seat-stripe-webhook with the service role. Idempotent on payment_intent:
-- Stripe retries and will happily deliver the same event twice.
create or replace function public.loadq_seat_card_record(
  p_seat uuid, p_intent text, p_amount int, p_currency text default 'cad',
  p_event text default null, p_raw jsonb default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare s public.loadq_seats; v_status text;
begin
  if nullif(btrim(coalesce(p_intent,'')),'') is null then
    return json_build_object('ok', false, 'error', 'no_intent'); end if;

  if exists (select 1 from loadq_card_inbound where payment_intent = btrim(p_intent)) then
    return json_build_object('ok', true, 'already', true); end if;

  select * into s from loadq_seats where id = p_seat;
  if s.id is null then
    insert into loadq_card_inbound(payment_intent, amount_cents, currency, status, event_id, raw)
    values (btrim(p_intent), p_amount, lower(coalesce(p_currency,'cad')), 'orphan', p_event, p_raw);
    return json_build_object('ok', false, 'error', 'no_such_seat');
  end if;

  -- The charge must be for what the seat costs. A short payment is not a paid seat, and
  -- silently accepting it would put the shortfall on the driver at departure.
  v_status := case when p_amount = s.fare_cents then 'succeeded' else 'mismatch' end;

  insert into loadq_card_inbound(payment_intent, seat_id, entry_id, reference, amount_cents,
                                 currency, status, event_id, raw)
  values (btrim(p_intent), s.id, s.entry_id, s.reference, p_amount,
          lower(coalesce(p_currency,'cad')), v_status, p_event, p_raw);

  if v_status <> 'succeeded' then
    return json_build_object('ok', false, 'error', 'amount_mismatch',
      'expected', s.fare_cents, 'received', p_amount);
  end if;

  update loadq_seats
     set status = 'paid', method = 'card', paid_at = coalesce(paid_at, now()),
         stripe_payment_intent = btrim(p_intent), updated_at = now()
   where id = s.id and status <> 'paid';

  return json_build_object('ok', true, 'seat_no', s.seat_no, 'entry_id', s.entry_id);
end $$;

-- ── departure ─────────────────────────────────────────────────────────────────────────────
create or replace function public.loadq_departure_receipt(p_entry uuid)
returns json language sql stable security definer set search_path to 'public' as $$
  select case when not public.loadq_seat_may_manage(p_entry)
    then json_build_object('ok', false, 'error', 'forbidden')
    else json_build_object(
      'ok', true,
      'driver', (select d.full_name from queue_entries q join drivers d on d.id = q.driver_id
                  where q.id = p_entry),
      'route',  (select q.zone_id || ' → ' || q.destination_region from queue_entries q
                  where q.id = p_entry),
      'lines', coalesce((
        select json_agg(json_build_object(
                 'seat_no', s.seat_no, 'name', s.passenger_name, 'channel', s.channel,
                 'method', s.method, 'status', s.status, 'reference', s.reference,
                 'fare_cents', s.fare_cents) order by s.seat_no)
          from loadq_seats s where s.entry_id = p_entry and s.status <> 'released'), '[]'::json),
      'paid_seats',   (select count(*) from loadq_seats s
                        where s.entry_id = p_entry and s.status = 'paid'),
      'unpaid_seats', (select count(*) from loadq_seats s
                        where s.entry_id = p_entry and s.status = 'awaiting'),
      'gross_cents',  coalesce((select sum(s.fare_cents) from loadq_seats s
                                 where s.entry_id = p_entry and s.status = 'paid'), 0),
      'fee_cents',    coalesce((select sum(s.fee_cents) from loadq_seats s
                                 where s.entry_id = p_entry and s.status = 'paid'), 0),
      'net_cents',    coalesce((select sum(s.fare_cents - s.fee_cents) from loadq_seats s
                                 where s.entry_id = p_entry and s.status = 'paid'), 0),
      'payout', (select json_build_object('status', p.status, 'net_cents', p.net_cents,
                          'sent_at', p.sent_at, 'reference', p.reference)
                   from loadq_payouts p where p.entry_id = p_entry))
  end
$$;

-- Freezes the record. The $5 is not revenue: the tax is already inside it and gets remitted,
-- and each departure costs trip_cost_cents to run (per car, NOT per seat).
create or replace function public.loadq_close_departure(p_entry uuid)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_unpaid json; q record;
        v_seats int; v_gross int; v_fee int; v_tax int; v_region text; v_label text;
        v_trip int; v_trip_itc int; v_card int; v_card_seats int; v_card_fare int;
begin
  if not public.loadq_seat_may_manage(p_entry) then
    return json_build_object('ok', false, 'error', 'forbidden'); end if;

  select id into v_id from loadq_payouts where entry_id = p_entry;
  if v_id is not null then
    return json_build_object('ok', true, 'already', true,
                             'receipt', public.loadq_departure_receipt(p_entry)); end if;

  v_unpaid := public.loadq_entry_unpaid_seats(p_entry);
  if json_array_length(v_unpaid) > 0 then
    return json_build_object('ok', false, 'error', 'unpaid_seats', 'seats', v_unpaid); end if;

  select qe.driver_id, qe.zone_id, qe.destination_region,
         d.full_name, d.phone,
         trim(concat_ws(' ', v.year::text, v.make, v.model)) as car, v.plate
    into q
    from queue_entries qe
    join drivers d on d.id = qe.driver_id
    left join vehicles v on v.id = qe.vehicle_id
   where qe.id = p_entry;
  if q.driver_id is null then return json_build_object('ok', false, 'error', 'no_driver'); end if;

  select count(*), coalesce(sum(fare_cents),0), coalesce(sum(fee_cents),0)
    into v_seats, v_gross, v_fee
    from loadq_seats where entry_id = p_entry and status = 'paid';

  -- the zone id carries its city as a prefix (ottawa-…, gatineau-…)
  v_region := split_part(q.zone_id, '-', 1);
  select label into v_label from loadq_tax_rates where region = v_region;
  v_tax := public.loadq_tax_within(v_fee, v_region);

  v_trip := coalesce(nullif(public.loadq_setting('trip_cost_cents'),'')::int, 0);
  v_trip_itc := case when lower(coalesce(public.loadq_setting('trip_cost_taxable'),'false')) = 'true'
                     then public.loadq_tax_within(v_trip, v_region) else 0 end;

  -- card seats cost more than Interac ones; charged per seat, so counted per seat
  select count(*), coalesce(sum(fare_cents),0) into v_card_seats, v_card_fare
    from loadq_seats where entry_id = p_entry and status = 'paid' and method = 'card';
  v_card := round(v_card_fare * coalesce(nullif(public.loadq_setting('card_cost_ppm'),'')::int, 0) / 1000000.0)::int
          + v_card_seats * coalesce(nullif(public.loadq_setting('card_cost_fixed_cents'),'')::int, 0);

  insert into loadq_payouts(entry_id, driver_id, seats, gross_cents, fee_cents, net_cents,
                            status, departed_at, zone_id, destination, driver_name,
                            driver_phone, vehicle_desc, plate, tax_region, tax_label,
                            fee_tax_cents, fee_net_cents,
                            trip_cost_cents, trip_cost_itc_cents, card_cost_cents, platform_net_cents)
  values (p_entry, q.driver_id, v_seats, v_gross, v_fee, v_gross - v_fee,
          'due', now(), q.zone_id, q.destination_region, q.full_name,
          q.phone, nullif(q.car,''), q.plate, v_region,
          coalesce(v_label,'HST 13% (ON)'), v_tax, v_fee - v_tax,
          v_trip, v_trip_itc, v_card, (v_fee - v_tax) - v_trip - v_card);

  return json_build_object('ok', true, 'receipt', public.loadq_departure_receipt(p_entry));
end $$;

create or replace function public.loadq_departure_record(p_entry uuid)
returns json language sql stable security definer set search_path to 'public' as $$
  select case when not public.loadq_seat_may_manage(p_entry)
    then json_build_object('ok', false, 'error', 'forbidden')
    else (select json_build_object(
      'ok', true,
      'departed_at', p.departed_at, 'zone', p.zone_id, 'destination', p.destination,
      'driver', p.driver_name, 'driver_phone', p.driver_phone,
      'vehicle', p.vehicle_desc, 'plate', p.plate,
      'seats', p.seats,
      'gross_cents', p.gross_cents,
      'fee_cents', p.fee_cents, 'fee_tax_cents', p.fee_tax_cents,
      'fee_net_cents', p.fee_net_cents, 'tax_label', p.tax_label,
      'net_cents', p.net_cents,
      'status', p.status, 'verified_at', p.verified_at, 'sent_at', p.sent_at,
      'receipt_sent_at', p.receipt_sent_at,
      'lines', (select json_agg(json_build_object('seat_no', s.seat_no, 'name', s.passenger_name,
                        'channel', s.channel, 'method', s.method, 'reference', s.reference,
                        'fare_cents', s.fare_cents, 'paid_at', s.paid_at) order by s.seat_no)
                  from loadq_seats s where s.entry_id = p.entry_id and s.status = 'paid'))
      from loadq_payouts p where p.entry_id = p_entry) end
$$;

-- ── so money is not lost ──────────────────────────────────────────────────────────────────
-- Two ways it goes missing: a seat marked paid that no payment ever backed, and a payout owed
-- that nobody sent. Both are silent, so they need a check that runs and a gate that blocks.
create or replace function public.loadq_payout_verify(p_entry uuid)
returns json language plpgsql security definer set search_path to 'public' as $$
declare p public.loadq_payouts; issues json; v_sum int; v_unbacked int; v_card_unbacked int;
begin
  if not exists (select 1 from drivers a where a.id = auth.uid() and a.is_admin) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into p from loadq_payouts where entry_id = p_entry;
  if p.id is null then return json_build_object('ok', false, 'error', 'no_payout'); end if;

  select coalesce(sum(fare_cents),0) into v_sum
    from loadq_seats where entry_id = p_entry and status = 'paid';

  -- an Interac seat with no matching inbound deposit is money nobody has actually seen
  select count(*) into v_unbacked
    from loadq_seats s
   where s.entry_id = p_entry and s.status = 'paid' and s.method = 'interac'
     and not exists (select 1 from loadq_interac_inbound i
                      where upper(coalesce(i.reference,'')) = upper(s.reference));

  -- and a card seat with no Stripe charge behind it is the same hole, typed instead of tapped
  select count(*) into v_card_unbacked
    from loadq_seats s
   where s.entry_id = p_entry and s.status = 'paid' and s.method = 'card'
     and not exists (select 1 from loadq_card_inbound c
                      where c.seat_id = s.id and c.status = 'succeeded');

  select json_agg(x) into issues from (
    select 'gross_mismatch' as issue,
           json_build_object('recorded', p.gross_cents, 'seats_now', v_sum) as detail
     where v_sum <> p.gross_cents
    union all
    select 'fee_split_wrong',
           json_build_object('fee', p.fee_cents, 'tax', p.fee_tax_cents, 'net', p.fee_net_cents)
     where coalesce(p.fee_tax_cents,0) + coalesce(p.fee_net_cents,0) <> p.fee_cents
    union all
    select 'net_wrong', json_build_object('gross', p.gross_cents, 'fee', p.fee_cents, 'net', p.net_cents)
     where p.gross_cents - p.fee_cents <> p.net_cents
    union all
    select 'platform_net_wrong',
           json_build_object('fee_net', p.fee_net_cents, 'trip', p.trip_cost_cents,
                             'card', p.card_cost_cents, 'kept', p.platform_net_cents)
     where coalesce(p.fee_net_cents,0) - coalesce(p.trip_cost_cents,0)
           - coalesce(p.card_cost_cents,0) <> coalesce(p.platform_net_cents,0)
    union all
    select 'interac_not_backed', json_build_object('seats', v_unbacked) where v_unbacked > 0
    union all
    select 'card_not_backed', json_build_object('seats', v_card_unbacked) where v_card_unbacked > 0
  ) x;

  if issues is not null then
    return json_build_object('ok', false, 'verified', false, 'issues', issues);
  end if;

  update loadq_payouts set verified_at = now(), verified_by = auth.uid()
   where entry_id = p_entry and verified_at is null;
  return json_build_object('ok', true, 'verified', true, 'net_cents', p.net_cents);
end $$;

-- The gate: the last moment anyone looks before the money leaves.
create or replace function public.loadq_payout_mark_sent(
  p_entry uuid, p_method text default 'interac', p_reference text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare p public.loadq_payouts;
begin
  if not exists (select 1 from drivers a where a.id = auth.uid() and a.is_admin) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into p from loadq_payouts where entry_id = p_entry;
  if p.id is null then return json_build_object('ok', false, 'error', 'nothing_due'); end if;
  if p.status = 'sent' then return json_build_object('ok', true, 'already', true); end if;
  if p.verified_at is null then
    return json_build_object('ok', false, 'error', 'not_verified',
      'detail', 'Vérifiez le décompte avant d''envoyer. / Verify the count before sending.'); end if;
  if nullif(btrim(coalesce(p_reference,'')),'') is null then
    return json_build_object('ok', false, 'error', 'reference_required',
      'detail', 'Le numéro du virement est la preuve du paiement. / The transfer reference is the proof of payment.'); end if;

  update loadq_payouts
     set status='sent', method=lower(coalesce(p_method,'interac')),
         reference=btrim(p_reference), sent_at=now()
   where entry_id = p_entry;
  return json_build_object('ok', true, 'net_cents', p.net_cents);
end $$;

create or replace function public.loadq_payouts_outstanding()
returns json language sql stable security definer set search_path to 'public' as $$
  select case when not exists (select 1 from drivers a where a.id = auth.uid() and a.is_admin)
    then json_build_object('ok', false, 'error', 'forbidden')
    else json_build_object('ok', true, 'rows', coalesce((
      select json_agg(json_build_object(
               'entry_id', p.entry_id, 'departed_at', p.departed_at,
               'driver', p.driver_name, 'phone', p.driver_phone,
               'zone', p.zone_id, 'destination', p.destination,
               'seats', p.seats, 'net_cents', p.net_cents,
               'verified', p.verified_at is not null,
               'hours_waiting', round(extract(epoch from (now() - p.departed_at))/3600)::int)
             order by p.departed_at)
        from loadq_payouts p where p.status = 'due'), '[]'::json)) end
$$;

-- The books for a period, read off frozen snapshots — re-running it next year gives the same
-- answer it gives today. Split by region because Ontario remits to CRA and Quebec to Revenu
-- Québec; a blended total would have to be unpicked by hand at remittance time.
create or replace function public.loadq_revenue_summary(p_from date, p_to date)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare r record;
begin
  if not exists (select 1 from drivers a where a.id = auth.uid() and a.is_admin) then
    return json_build_object('ok', false, 'error', 'forbidden'); end if;

  select count(*) as departures, coalesce(sum(seats),0) as seats,
         coalesce(sum(gross_cents),0)      as collected,
         coalesce(sum(net_cents),0)        as to_drivers,
         coalesce(sum(fee_cents),0)        as fee,
         coalesce(sum(fee_tax_cents),0)    as hst_collected,
         coalesce(sum(trip_cost_cents),0)  as trip_cost,
         coalesce(sum(trip_cost_itc_cents),0) as hst_recoverable,
         coalesce(sum(card_cost_cents),0)  as card_cost,
         coalesce(sum(platform_net_cents),0) as kept
    into r
    from loadq_payouts
   where departed_at >= p_from and departed_at < (p_to + 1);

  return json_build_object('ok', true, 'from', p_from, 'to', p_to,
    'departures', r.departures, 'seats', r.seats,
    'collected_cents', r.collected,
    'paid_to_drivers_cents', r.to_drivers,
    'fee_cents', r.fee,
    'hst_collected_cents', r.hst_collected,
    'hst_recoverable_cents', r.hst_recoverable,
    'hst_remittable_cents', r.hst_collected - r.hst_recoverable,
    'trip_cost_cents', r.trip_cost,
    'card_cost_cents', r.card_cost,
    'kept_cents', r.kept,
    'per_seat_kept_cents', case when r.seats > 0 then round(r.kept::numeric / r.seats)::int end,
    'by_region', coalesce((select json_agg(x order by x->>'region') from (
        select json_build_object('region', tax_region, 'label', max(tax_label),
                 'departures', count(*), 'seats', sum(seats),
                 'collected_cents', sum(gross_cents),
                 'hst_collected_cents', sum(fee_tax_cents),
                 'kept_cents', sum(platform_net_cents)) as x
          from loadq_payouts
         where departed_at >= p_from and departed_at < (p_to + 1)
         group by tax_region) y), '[]'::json));
end $$;

-- Catch up any car that already has sheet seats.
do $$
declare r record;
begin
  for r in select distinct entry_id from loadq_seats where status <> 'released' loop
    perform public.loadq_seat_sync_entry(r.entry_id);
  end loop;
end $$;
