-- Ottawa PTC conformity — By-law 2016-272, per the City's PTC Licence Information Guide
-- (effective 2025-01-01), read in full on 2026-09-15.
--
-- LoadQ did not conform. This file is the gap closed in one sitting. Each section names the
-- requirement it comes from so the next person can check it against the guide rather than
-- trust this comment.

-- ══ 1 · ONBOARDING DOCUMENTS ═════════════════════════════════════════════════════════════
-- The guide requires each affiliated driver to provide, YEARLY: a vulnerable-sector Police
-- Record Check, a Statement of Driving Record, and a signed declaration of no outstanding
-- criminal charges or warrants; and each vehicle to carry a Safety Standards Certificate.
-- LoadQ collected only licence, insurance and registration.
create table if not exists public.loadq_doc_kinds (
  doc_type      text primary key,
  label_en      text not null,
  label_fr      text not null,
  help_en       text,
  help_fr       text,
  required      boolean not null default true,
  renew_months  int  not null default 12,
  about         text not null default 'driver' check (about in ('driver','vehicle')),
  sort          int  not null default 100,
  bylaw_ref     text
);

comment on table public.loadq_doc_kinds is
  'What a driver must file to be verified. Rows here ARE the onboarding checklist — adding a row adds a step, so the app never hard-codes the list again.';

insert into public.loadq_doc_kinds
  (doc_type, label_en, label_fr, help_en, help_fr, required, renew_months, about, sort, bylaw_ref) values
 ('drivers_license','Driver''s licence','Permis de conduire',
  'Valid unrestricted Class G (Ontario) or the appropriate class issued by Quebec.',
  'Permis de classe G sans restriction (Ontario) ou la classe équivalente du Québec.',
  true, 12, 'driver', 10, 'PTC Guide — Driver Information'),
 ('insurance','Insurance','Assurance',
  'Proof of valid automobile insurance for the vehicle used.',
  'Preuve d''assurance automobile valide pour le véhicule utilisé.',
  true, 12, 'driver', 20, 'PTC Guide — Driver Information'),
 ('registration','Vehicle registration','Immatriculation',
  'Valid motor vehicle permit under the Highway Traffic Act.',
  'Certificat d''immatriculation valide (Code de la route).',
  true, 12, 'driver', 30, 'PTC Guide — Vehicle Information'),
 ('police_record_check','Police Record Check (vulnerable sector)','Vérification des antécédents (secteur vulnérable)',
  'Yearly. Original document from the issuing agency showing acceptable results of a vulnerable-sector check.',
  'Annuelle. Document original de l''organisme émetteur attestant un résultat acceptable pour le secteur vulnérable.',
  true, 12, 'driver', 40, 'PTC Guide — Driver Information'),
 ('driving_record','Statement of Driving Record','Relevé de conduite',
  'Yearly. Issued by the Ministry of Transportation of Ontario, or the Contrôle routier for Quebec.',
  'Annuel. Délivré par le ministère des Transports de l''Ontario ou le Contrôle routier (Québec).',
  true, 12, 'driver', 50, 'PTC Guide — Driver Information'),
 ('charges_declaration','Declaration — no outstanding charges','Déclaration — aucune accusation en cours',
  'Yearly. Signed declaration that you have no outstanding criminal charges or warrants before any court.',
  'Annuelle. Déclaration signée attestant n''avoir aucune accusation criminelle ni mandat en cours devant un tribunal.',
  true, 12, 'driver', 60, 'PTC Guide — Driver Information'),
 ('safety_certificate','Safety Standards Certificate','Certificat de sécurité',
  'Vehicles 5 model years old or less: yearly. 6 years and older: every two years.',
  'Véhicules de 5 ans et moins : annuel. 6 ans et plus : tous les deux ans.',
  true, 12, 'vehicle', 70, 'PTC Guide — Vehicle Information')
on conflict (doc_type) do update set
  label_en = excluded.label_en, label_fr = excluded.label_fr,
  help_en = excluded.help_en, help_fr = excluded.help_fr,
  required = excluded.required, renew_months = excluded.renew_months,
  about = excluded.about, sort = excluded.sort, bylaw_ref = excluded.bylaw_ref;

alter table public.loadq_doc_kinds enable row level security;
drop policy if exists loadq_doc_kinds_read on public.loadq_doc_kinds;
-- The checklist is not secret: every driver needs to see what is being asked of them.
create policy loadq_doc_kinds_read on public.loadq_doc_kinds for select to authenticated using (true);

create or replace function public.loadq_required_documents()
returns json language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select json_agg(json_build_object(
             'doc_type', k.doc_type, 'label_en', k.label_en, 'label_fr', k.label_fr,
             'help_en', k.help_en, 'help_fr', k.help_fr, 'about', k.about,
             'renew_months', k.renew_months, 'required', k.required, 'bylaw_ref', k.bylaw_ref,
             'status', coalesce(d.status, 'not_submitted'),
             'expires_on', d.expires_on, 'review_notes', d.review_notes)
           order by k.sort)
      from loadq_doc_kinds k
      left join loadq_driver_documents d
             on d.doc_type = k.doc_type and d.driver_id = auth.uid()
     where k.required), '[]'::json)
$$;

-- Verified means every REQUIRED document is approved and unexpired — not three of seven.
create or replace function public.loadq_driver_docs_complete(p_driver uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select not exists (
    select 1 from loadq_doc_kinds k
     where k.required
       and not exists (
         select 1 from loadq_driver_documents d
          where d.driver_id = p_driver and d.doc_type = k.doc_type
            and d.status = 'approved'
            and (d.expires_on is null or d.expires_on >= current_date)))
$$;

create or replace function public.loadq_docs_outstanding()
returns json language sql stable security definer set search_path to 'public' as $$
  select case when not exists (select 1 from drivers a where a.id = auth.uid() and a.is_admin)
    then json_build_object('ok', false, 'error', 'forbidden')
    else json_build_object('ok', true, 'rows', coalesce((
      select json_agg(x order by x->>'driver')
        from (
          select json_build_object(
                   'driver_id', dr.id, 'driver', dr.full_name, 'phone', dr.phone,
                   'verified_flag', dr.verified,
                   'missing', (select json_agg(k.doc_type order by k.sort)
                                 from loadq_doc_kinds k
                                where k.required
                                  and not exists (
                                    select 1 from loadq_driver_documents d
                                     where d.driver_id = dr.id and d.doc_type = k.doc_type
                                       and d.status = 'approved'
                                       and (d.expires_on is null or d.expires_on >= current_date)))) as x
            from drivers dr
           where exists (select 1 from queue_entries q
                          where q.driver_id = dr.id and q.joined_at > now() - interval '90 days')
             and not public.loadq_driver_docs_complete(dr.id)) y), '[]'::json)) end
$$;

-- ══ 2 · VEHICLE RULES, WITH SIX MONTHS' NOTICE ═══════════════════════════════════════════
-- "no more than 10 model years old (not including the year of the vehicle)" and "a maximum of
-- six (6) passengers, plus the driver".
--
-- Seven of twenty-three active cars fail the age rule. Enforcing it on a Tuesday would put
-- seven working drivers off the line overnight over a car they cannot replace in an
-- afternoon. The GRACE DATE is the mechanism, not an on/off switch: before it, an over-age
-- vehicle is a warning carrying its own deadline; after it, the vehicle is refused.
insert into public.loadq_settings(key, value) values
  ('vehicle_max_model_years', '10'),
  ('vehicle_max_passengers', '6'),
  ('enforce_vehicle_age', 'false'),
  ('vehicle_age_grace_until', '2027-03-15'),
  ('city_trip_fee_cents', '12'),
  ('city_accessibility_surcharge_cents', '12')
on conflict (key) do nothing;

insert into public.loadq_setting_defs(key, kind, group_name, label_en, label_fr, help_en, help_fr, min_val, max_val, sort) values
 ('vehicle_max_model_years','int','Conformity','Maximum vehicle age (model years)','Âge maximal du véhicule (années-modèles)',
  'Ottawa PTC guide: no more than 10 model years old, not counting the vehicle''s own year.',
  'Guide PTC d''Ottawa : pas plus de 10 années-modèles, sans compter l''année du véhicule.', 1, 40, 110),
 ('vehicle_max_passengers','int','Conformity','Maximum passengers per vehicle','Nombre maximal de passagers',
  'Ottawa PTC guide: six passengers plus the driver.',
  'Guide PTC d''Ottawa : six passagers plus le chauffeur.', 1, 12, 120),
 ('vehicle_age_grace_until','date','Conformity','Vehicle age rule takes full effect on','La règle d''âge s''applique pleinement le',
  'Until this date an over-age vehicle is warned, not refused, and the warning names the date. After it, the vehicle cannot be added to a line. Set six months ahead so drivers have time to change car.',
  'Jusqu''à cette date, un véhicule trop vieux est signalé mais non refusé, et l''avis indique la date. Après, le véhicule ne peut plus être ajouté à une ligne. Fixée à six mois pour laisser le temps de changer de voiture.',
  null, null, 125),
 ('enforce_vehicle_age','bool','Conformity','Refuse over-age vehicles on the sheet','Refuser les véhicules trop vieux sur la feuille',
  'When on, a vehicle past the age limit cannot be added to a line. Leave OFF until the affected drivers have been notified.',
  'Activé, un véhicule dépassant la limite ne peut être ajouté à une ligne. Laisser DÉSACTIVÉ tant que les chauffeurs concernés n''ont pas été prévenus.',
  null, null, 130),
 ('city_trip_fee_cents','int','Conformity','City per-trip fee (cents)','Redevance municipale par course (cents)',
  'City of Ottawa per-trip fee. $0.12 since 2025-01-01. Shown on the passenger receipt as the surcharge.',
  'Redevance par course de la Ville d''Ottawa. 0,12 $ depuis le 2025-01-01. Figure au reçu comme supplément.', 0, 500, 140),
 ('city_accessibility_surcharge_cents','int','Conformity','Accessibility surcharge (cents)','Supplément accessibilité (cents)',
  'Voluntary per-trip accessibility surcharge negotiated with the City. $0.12 since 2025-01-01.',
  'Supplément volontaire par course pour l''accessibilité, négocié avec la Ville. 0,12 $ depuis le 2025-01-01.', 0, 500, 150)
on conflict (key) do nothing;

create or replace function public.loadq_vehicle_conformity(p_vehicle uuid)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare v record; v_max int; v_pax int; v_age int;
        v_grace date; v_in_grace boolean;
        issues text[] := '{}'; warnings text[] := '{}';
begin
  select v2.id, v2.year, v2.make, v2.model, v2.seats, v2.plate into v
    from vehicles v2 where v2.id = p_vehicle;
  if v.id is null then return json_build_object('ok', false, 'error', 'not_found'); end if;

  v_max := public.loadq_setting_int('vehicle_max_model_years', 10);
  v_pax := public.loadq_setting_int('vehicle_max_passengers', 6);
  v_grace := coalesce(nullif(public.loadq_setting('vehicle_age_grace_until'),'')::date, current_date);
  v_in_grace := current_date < v_grace;
  -- "not including the year of the vehicle" — a 2016 car is 10 in 2026, so still allowed.
  v_age := extract(year from current_date)::int - coalesce(v.year, extract(year from current_date)::int);

  if v_age > v_max then
    if v_in_grace then
      warnings := array_append(warnings,
        format('over_age: %s model year, %s years old, limit %s — must be replaced by %s',
               v.year, v_age, v_max, to_char(v_grace, 'DD Mon YYYY')));
    else
      issues := array_append(issues,
        format('over_age: %s model year, %s years old, limit %s', v.year, v_age, v_max));
    end if;
  end if;

  -- Capacity and the safety certificate are not part of the grace: one is a physical fact
  -- about the car, the other is a document the driver can obtain this week.
  if coalesce(v.seats,0) - 1 > v_pax then
    issues := array_append(issues,
      format('over_capacity: %s passenger seats, limit %s', v.seats - 1, v_pax));
  end if;
  if not exists (select 1 from loadq_driver_documents d
                  join vehicles v3 on v3.id = p_vehicle
                 where d.driver_id = v3.driver_id and d.doc_type = 'safety_certificate'
                   and d.status = 'approved'
                   and (d.expires_on is null or d.expires_on >= current_date)) then
    warnings := array_append(warnings, 'no_safety_certificate');
  end if;

  return json_build_object(
    'ok', array_length(issues,1) is null,
    'vehicle', trim(concat_ws(' ', v.year::text, v.make, v.model)), 'plate', v.plate,
    'age_years', v_age, 'grace_until', v_grace, 'in_grace', v_in_grace,
    'issues', to_json(issues), 'warnings', to_json(warnings));
end $$;

create or replace function public.loadq_fleet_conformity()
returns json language sql stable security definer set search_path to 'public' as $$
  select case when not exists (select 1 from drivers a where a.id = auth.uid() and a.is_admin)
    then json_build_object('ok', false, 'error', 'forbidden')
    else json_build_object('ok', true,
      'limit_model_years', public.loadq_setting_int('vehicle_max_model_years', 10),
      'enforced', lower(coalesce(public.loadq_setting('enforce_vehicle_age'),'false')) = 'true',
      'rows', coalesce((
        select json_agg(json_build_object(
                 'driver', d.full_name, 'phone', d.phone,
                 'vehicle', trim(concat_ws(' ', v.year::text, v.make, v.model)),
                 'plate', v.plate, 'year', v.year,
                 'age_years', extract(year from current_date)::int - v.year,
                 'conformity', public.loadq_vehicle_conformity(v.id))
               order by v.year)
          from vehicles v join drivers d on d.id = v.driver_id
         where exists (select 1 from queue_entries q
                        where q.vehicle_id = v.id and q.joined_at > now() - interval '90 days')), '[]'::json)) end
$$;

-- The drivers who need telling, and the date they need to hear.
create or replace function public.loadq_vehicles_over_age()
returns json language sql stable security definer set search_path to 'public' as $$
  select case when not exists (select 1 from drivers a where a.id = auth.uid() and a.is_admin)
    then json_build_object('ok', false, 'error', 'forbidden')
    else json_build_object('ok', true,
      'limit_model_years', public.loadq_setting_int('vehicle_max_model_years', 10),
      'grace_until', public.loadq_setting('vehicle_age_grace_until'),
      'rows', coalesce((
        select json_agg(json_build_object(
                 'driver_id', d.id, 'driver', d.full_name, 'phone', d.phone,
                 'vehicle', trim(concat_ws(' ', v.year::text, v.make, v.model)),
                 'plate', v.plate, 'year', v.year,
                 'age_years', extract(year from current_date)::int - v.year)
               order by v.year)
          from vehicles v join drivers d on d.id = v.driver_id
         where extract(year from current_date)::int - v.year
               > public.loadq_setting_int('vehicle_max_model_years', 10)
           and exists (select 1 from queue_entries q
                        where q.vehicle_id = v.id and q.joined_at > now() - interval '90 days')), '[]'::json)) end
$$;

-- ══ 3 · TRIP TIME AND DISTANCE ═══════════════════════════════════════════════════════════
-- The receipt must state "the total time and total distance of the trip". LoadQ recorded
-- neither. These are fixed intercity pairs, so the route carries the distance and scheduled
-- running time — an honest answer for a scheduled service, but it is the ROUTE's distance and
-- not a GPS trace. Measuring the actual trip needs an arrival time from the driver, which
-- does not exist yet.
alter table public.loadq_route_fares
  add column if not exists distance_km      int,
  add column if not exists duration_minutes int;
alter table public.loadq_payouts
  add column if not exists distance_km      int,
  add column if not exists duration_minutes int;

update public.loadq_route_fares set distance_km = d.km, duration_minutes = d.mins
  from (values
    ('ottawa','montreal',200,125),      ('ottawa','kingston',195,120),
    ('ottawa','toronto',450,270),       ('ottawa','quebec',440,270),
    ('gatineau','montreal',200,125),    ('gatineau','kingston',200,125),
    ('gatineau','toronto',455,275),     ('gatineau','quebec',435,265),
    ('gatineau','sherbrooke',290,180),  ('gatineau','trois-rivieres',310,190),
    ('gatineau','chicoutimi',610,380),  ('gatineau','moncton',1100,660),
    ('montreal','ottawa',200,125),      ('montreal','kingston',290,180),
    ('montreal','toronto',540,320),     ('montreal','quebec',255,165),
    ('montreal','sherbrooke',155,105),  ('montreal','trois-rivieres',140,90),
    ('montreal','chicoutimi',460,285),  ('montreal','moncton',1080,630),
    ('quebec','montreal',255,165),      ('quebec','ottawa',440,270),
    ('toronto','montreal',540,320),     ('toronto','ottawa',450,270),
    ('laval','ottawa',200,125),         ('longueuil','ottawa',210,130)
  ) as d(city, dest, km, mins)
 where split_part(loadq_route_fares.zone_id, '-', 1) = d.city
   and loadq_route_fares.destination_region = d.dest;

update public.loadq_payouts p
   set distance_km = f.distance_km, duration_minutes = f.duration_minutes
  from public.loadq_route_fares f
 where f.zone_id = p.zone_id and f.destination_region = p.destination
   and p.distance_km is null;

-- ══ 4 · THE RECEIPT, IN THE CITY'S ORDER ═════════════════════════════════════════════════
-- "provide a print or electronic receipt to the passenger at the end of the trip or shortly
-- thereafter that includes information confirming:" rate and surcharge · total amount paid ·
-- date and time · origin and final destination · total time and total distance · the driver's
-- FIRST NAME · make, model and licence plate.
--
-- Note what is NOT asked for: any tax breakdown. HST is CRA's business, and while the question
-- of who supplies the ride is open the receipt states no tax at all.
create or replace function public.loadq_seat_receipt_for(p_seat uuid)
returns json language sql stable security definer set search_path to 'public' as $$
  select json_build_object(
           'seat_id', s.id, 'reference', s.reference,
           'name', s.passenger_name, 'phone', s.passenger_phone,
           'email', coalesce(s.passenger_email, c.raw #>> '{customer_details,email}'),
           'seat_no', s.seat_no, 'method', s.method,
           'rate_cents', s.fare_cents,
           'surcharge_cents', public.loadq_setting_int('city_trip_fee_cents', 12)
                            + public.loadq_setting_int('city_accessibility_surcharge_cents', 12),
           'fare_cents', s.fare_cents,
           'departed_at', p.departed_at, 'paid_at', s.paid_at,
           'zone', p.zone_id, 'destination', p.destination,
           'duration_minutes', p.duration_minutes, 'distance_km', p.distance_km,
           'driver', p.driver_name,
           'driver_first', split_part(btrim(coalesce(p.driver_name,'')), ' ', 1),
           'vehicle', p.vehicle_desc, 'plate', p.plate,
           'already_sent_at', s.receipt_sent_at)
    from loadq_seats s
    join loadq_payouts p on p.entry_id = s.entry_id
    left join loadq_card_inbound c on c.seat_id = s.id and c.status = 'succeeded'
   where s.id = p_seat and s.status = 'paid' and p.departed_at is not null
$$;

create or replace function public.loadq_seat_receipts_due(p_limit int default 50)
returns json language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select json_agg(x order by x->>'departed_at')
      from (
        select json_build_object(
                 'seat_id', s.id, 'reference', s.reference,
                 'name', s.passenger_name, 'phone', s.passenger_phone,
                 'email', coalesce(s.passenger_email, c.raw #>> '{customer_details,email}'),
                 'seat_no', s.seat_no, 'method', s.method,
                 'rate_cents', s.fare_cents,
                 'surcharge_cents', public.loadq_setting_int('city_trip_fee_cents', 12)
                                  + public.loadq_setting_int('city_accessibility_surcharge_cents', 12),
                 'fare_cents', s.fare_cents,
                 'departed_at', p.departed_at, 'paid_at', s.paid_at,
                 'zone', p.zone_id, 'destination', p.destination,
                 'duration_minutes', p.duration_minutes, 'distance_km', p.distance_km,
                 'driver', p.driver_name,
                 'driver_first', split_part(btrim(coalesce(p.driver_name,'')), ' ', 1),
                 'vehicle', p.vehicle_desc, 'plate', p.plate) as x
          from loadq_seats s
          join loadq_payouts p on p.entry_id = s.entry_id
          left join loadq_card_inbound c on c.seat_id = s.id and c.status = 'succeeded'
         where s.status = 'paid' and s.receipt_sent_at is null
           and p.departed_at is not null and p.departed_at > now() - interval '7 days'
         limit p_limit) y), '[]'::json)
$$;

-- ══ 5 · PRE-TRIP DISCLOSURE AND RECORDED ACCEPTANCE ══════════════════════════════════════
-- The platform must disclose, at the time of arranging, the driver's first name and
-- photograph, the make, model, colour and plate, the rate and the surcharge — and must
-- "include a process by which the passenger accepts or refuses the transportation service
-- prior to the trip commencing and keeping a record of such acceptance or refusal".
alter table public.loadq_seats
  add column if not exists accepted_at  timestamptz,
  add column if not exists refused_at   timestamptz,
  add column if not exists disclosed    jsonb;

comment on column public.loadq_seats.disclosed is
  'What the passenger was shown before accepting — driver, vehicle, rate, surcharge. Frozen: the record must show what was disclosed at the time, not what is true now.';

create or replace function public.loadq_seat_disclosure(p_entry uuid)
returns json language sql stable security definer set search_path to 'public' as $$
  select case when not public.loadq_seat_may_manage(p_entry)
    then json_build_object('ok', false, 'error', 'forbidden')
    else (select json_build_object(
      'ok', true,
      'driver_first', split_part(btrim(coalesce(d.full_name,'')), ' ', 1),
      'driver_photo', d.avatar_url, 'driver_rating', d.rating_avg,
      'make', v.make, 'model', v.model, 'colour', v.color, 'plate', v.plate, 'year', v.year,
      'rate_cents', coalesce(f.fare_cents, 0),
      'surcharge_cents', public.loadq_setting_int('city_trip_fee_cents', 12)
                       + public.loadq_setting_int('city_accessibility_surcharge_cents', 12),
      'estimate_cents', coalesce(f.fare_cents, 0),
      'distance_km', f.distance_km, 'duration_minutes', f.duration_minutes,
      'origin', coalesce(z.address, z.name, q.zone_id),
      'destination', q.destination_region)
      from queue_entries q
      join drivers d on d.id = q.driver_id
      left join vehicles v on v.id = q.vehicle_id
      left join zones z on z.id = q.zone_id
      left join loadq_route_fares f
             on f.zone_id = q.zone_id and f.destination_region = q.destination_region
     where q.id = p_entry) end
$$;

create or replace function public.loadq_seat_record_decision(
  p_seat uuid, p_accepted boolean, p_disclosed json default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare s public.loadq_seats;
begin
  select * into s from loadq_seats where id = p_seat;
  if s.id is null then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.loadq_seat_may_manage(s.entry_id) then
    return json_build_object('ok', false, 'error', 'forbidden'); end if;

  update loadq_seats
     set accepted_at = case when p_accepted then coalesce(accepted_at, now()) else accepted_at end,
         refused_at  = case when p_accepted then refused_at else coalesce(refused_at, now()) end,
         disclosed   = coalesce(disclosed, p_disclosed::jsonb),
         updated_at  = now()
   where id = p_seat;
  return json_build_object('ok', true, 'accepted', p_accepted);
end $$;

-- ══ 6 · DRIVER IDENTIFICATION CARDS ══════════════════════════════════════════════════════
-- "shall ensure to every PTC Driver … a current and up-to-date identification card in written
-- or accessible electronic form." Generated from live conformity, so a card cannot claim a
-- validity the driver no longer has.
create or replace function public.loadq_driver_id_card(p_driver uuid default null)
returns json language sql stable security definer set search_path to 'public' as $$
  with who as (select coalesce(p_driver, auth.uid()) as id)
  select case
    when (select id from who) <> auth.uid()
     and not exists (select 1 from drivers a where a.id = auth.uid() and a.is_admin)
    then json_build_object('ok', false, 'error', 'forbidden')
    else (select json_build_object(
      'ok', true,
      'card_number', 'LQ-D-' || upper(substr(replace(d.id::text,'-',''), 1, 6)),
      'name', d.full_name, 'photo', d.avatar_url,
      'affiliated_with', 'Concord Express Co Inc. o/a LoadQ',
      'affiliated_since', d.created_at,
      'vehicle', (select trim(concat_ws(' ', v.year::text, v.make, v.model, '· ' || v.plate))
                    from vehicles v where v.driver_id = d.id order by v.created_at limit 1),
      'documents_complete', public.loadq_driver_docs_complete(d.id),
      'valid_until', (select min(dd.expires_on) from loadq_driver_documents dd
                       where dd.driver_id = d.id and dd.status = 'approved'
                         and dd.expires_on is not null),
      'missing', (select json_agg(k.doc_type order by k.sort) from loadq_doc_kinds k
                   where k.required and not exists (
                     select 1 from loadq_driver_documents dd
                      where dd.driver_id = d.id and dd.doc_type = k.doc_type
                        and dd.status = 'approved'
                        and (dd.expires_on is null or dd.expires_on >= current_date))),
      'issued_at', now())
      from drivers d where d.id = (select id from who)) end
$$;

-- ══ 7 · PASSENGER TRACKING AND RATING ════════════════════════════════════════════════════
-- "allow the passenger to track the location and route of the PTC Vehicle" and "provide the
-- ability for the passenger to rate the PTC Driver and PTC Vehicle used".
--
-- A seat sold at a pickup point has no app and no account, so both work from the seat
-- REFERENCE alone — the code already on the receipt. That makes the reference a bearer token,
-- so this exposes only what the by-law wants a passenger to see: driver FIRST NAME, the car,
-- where it is, and the trip. No surname, no phone, no payment, no other seat.
create table if not exists public.loadq_seat_ratings (
  seat_id       uuid primary key references public.loadq_seats(id) on delete cascade,
  driver_stars  int  not null check (driver_stars between 1 and 5),
  vehicle_stars int  check (vehicle_stars between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now()
);
alter table public.loadq_seat_ratings enable row level security;
-- No policies: reached only through the SECURITY DEFINER functions below.

create or replace function public.loadq_track_seat(p_reference text)
returns json language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select json_build_object(
      'ok', true, 'reference', s.reference,
      'status', case when p.departed_at is not null then 'departed'
                     when s.status = 'paid' then 'boarding' else 'awaiting_payment' end,
      'seat_no', s.seat_no, 'fare_cents', s.fare_cents,
      'surcharge_cents', public.loadq_setting_int('city_trip_fee_cents', 12)
                       + public.loadq_setting_int('city_accessibility_surcharge_cents', 12),
      'driver_first', split_part(btrim(coalesce(d.full_name,'')), ' ', 1),
      'driver_photo', d.avatar_url, 'driver_rating', d.rating_avg,
      'make', v.make, 'model', v.model, 'colour', v.color, 'plate', v.plate, 'year', v.year,
      'origin', coalesce(z.address, z.name, q.zone_id),
      'destination', coalesce(p.destination, q.destination_region),
      'distance_km', coalesce(p.distance_km, f.distance_km),
      'duration_minutes', coalesce(p.duration_minutes, f.duration_minutes),
      'departed_at', p.departed_at,
      'vehicle_lat', d.current_lat, 'vehicle_lng', d.current_lng, 'located_at', d.location_at,
      'can_rate', p.departed_at is not null,
      'rated', exists (select 1 from loadq_seat_ratings r where r.seat_id = s.id))
      from loadq_seats s
      join queue_entries q on q.id = s.entry_id
      join drivers d on d.id = q.driver_id
      left join vehicles v on v.id = q.vehicle_id
      left join zones z on z.id = q.zone_id
      left join loadq_payouts p on p.entry_id = s.entry_id
      left join loadq_route_fares f
             on f.zone_id = q.zone_id and f.destination_region = q.destination_region
     where upper(s.reference) = upper(btrim(p_reference))
       and s.status <> 'released'
       and s.created_at > now() - interval '30 days'),
    json_build_object('ok', false, 'error', 'not_found'))
$$;

create or replace function public.loadq_rate_seat(
  p_reference text, p_driver_stars int, p_vehicle_stars int default null, p_comment text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare s record;
begin
  select st.id, st.entry_id, q.driver_id, p.departed_at into s
    from loadq_seats st
    join queue_entries q on q.id = st.entry_id
    left join loadq_payouts p on p.entry_id = st.entry_id
   where upper(st.reference) = upper(btrim(p_reference))
     and st.status = 'paid' and st.created_at > now() - interval '30 days';

  if s.id is null then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if s.departed_at is null then
    return json_build_object('ok', false, 'error', 'not_departed',
      'detail', 'You can rate the trip once the car has left. / Vous pourrez évaluer une fois la voiture partie.'); end if;
  if p_driver_stars is null or p_driver_stars < 1 or p_driver_stars > 5 then
    return json_build_object('ok', false, 'error', 'bad_stars'); end if;

  insert into loadq_seat_ratings(seat_id, driver_stars, vehicle_stars, comment)
  values (s.id, p_driver_stars, p_vehicle_stars, nullif(btrim(coalesce(p_comment,'')),''))
  on conflict (seat_id) do nothing;
  if not found then return json_build_object('ok', true, 'already', true); end if;

  update drivers d
     set rating_count = coalesce(d.rating_count,0) + 1,
         rating_avg = round(((coalesce(d.rating_avg,0) * coalesce(d.rating_count,0)) + p_driver_stars)
                            / (coalesce(d.rating_count,0) + 1.0), 2)
   where d.id = s.driver_id;
  return json_build_object('ok', true);
end $$;

-- Reachable without a session: a walk-up passenger has no account.
grant execute on function public.loadq_track_seat(text) to anon, authenticated;
grant execute on function public.loadq_rate_seat(text, int, int, text) to anon, authenticated;

-- ══ 8 · DATA SHARING ═════════════════════════════════════════════════════════════════════
-- Keep records "for a period of not less than 3 years" and produce them "within 48 hours
-- following a request … in an accessible format". 48 hours is not long enough to invent a
-- report under pressure, which is why this exists before the request does.
create or replace function public.loadq_fsa(p_text text)
returns text language sql immutable as $$
  select upper((regexp_match(upper(coalesce(p_text,'')), '([A-Z]\d[A-Z])\s*\d[A-Z]\d'))[1])
$$;

comment on function public.loadq_fsa(text) is
  'Forward sortation area (first 3 of a Canadian postal code) lifted from free-text address, for the City trip records.';

-- These are called two ways: by an admin in the browser (auth.uid() is a person) and by
-- loadq-city-records with the service key (auth.uid() is NULL). A person-only check refused
-- the export outright — the first run returned "forbidden" instead of a CSV.
create or replace function public.loadq_is_admin_or_service()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select a.is_admin from drivers a where a.id = auth.uid()),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' = 'service_role',
    false)
$$;

create or replace function public.loadq_city_trip_records(p_from date, p_to date)
returns json language sql stable security definer set search_path to 'public' as $$
  select case when not public.loadq_is_admin_or_service()
    then json_build_object('ok', false, 'error', 'forbidden')
    else json_build_object('ok', true, 'from', p_from, 'to', p_to,
      'rows', coalesce((select json_agg(x order by x->>'requested_at') from (

        -- SEATS sold at a pickup point: fulfilled the moment the car departs.
        select json_build_object(
                 'channel', 'seat', 'trip_id', s.reference, 'status', 'fulfilled',
                 'requested_at', s.created_at, 'fulfilled_at', p.departed_at,
                 'cancel_reason', null,
                 'origin', coalesce(z.address, z.name, p.zone_id),
                 'origin_fsa', public.loadq_fsa(z.address),
                 'destination', p.destination, 'destination_fsa', null,
                 'driver_name', p.driver_name, 'plate', p.plate,
                 'duration_minutes', p.duration_minutes, 'distance_km', p.distance_km,
                 'enroute_minutes', null, 'transporting_minutes', p.duration_minutes,
                 'passengers', 1) as x
          from loadq_seats s
          join loadq_payouts p on p.entry_id = s.entry_id
          left join zones z on z.id = p.zone_id
         where s.status = 'paid' and p.departed_at::date between p_from and p_to

        union all

        -- RIDES raised in the app, fulfilled or not. The times the app already records give
        -- the en-route and transporting split the guide asks for by name.
        select json_build_object(
                 'channel', 'ride', 'trip_id', r.id,
                 'status', case when r.completed_at is not null then 'fulfilled' else 'not_fulfilled' end,
                 'requested_at', r.created_at, 'fulfilled_at', r.completed_at,
                 'cancel_reason', case when r.completed_at is null
                                       then coalesce(r.cancel_reason, r.status) end,
                 'origin', coalesce(r.pickup_label, r.origin_address),
                 'origin_fsa', public.loadq_fsa(coalesce(r.origin_address, r.pickup_label)),
                 'destination', coalesce(r.dest_address, r.dest_region),
                 'destination_fsa', public.loadq_fsa(r.dest_address),
                 'driver_name', d.full_name, 'plate', v.plate,
                 'duration_minutes', case when r.completed_at is not null and r.picked_up_at is not null
                        then round(extract(epoch from (r.completed_at - r.picked_up_at))/60)::int end,
                 'distance_km', null,
                 'enroute_minutes', case when r.picked_up_at is not null and r.broadcast_at is not null
                        then round(extract(epoch from (r.picked_up_at - r.broadcast_at))/60)::int end,
                 'transporting_minutes', case when r.completed_at is not null and r.picked_up_at is not null
                        then round(extract(epoch from (r.completed_at - r.picked_up_at))/60)::int end,
                 'passengers', coalesce(r.seats, 1))
          from loadq_ride_requests r
          left join drivers d on d.id = r.driver_id
          left join vehicles v on v.driver_id = r.driver_id
         where r.created_at::date between p_from and p_to
      ) y), '[]'::json)) end
$$;

create or replace function public.loadq_city_annual_summary(p_year int)
returns json language sql stable security definer set search_path to 'public' as $$
  select case when not public.loadq_is_admin_or_service()
    then json_build_object('ok', false, 'error', 'forbidden')
    else json_build_object('ok', true, 'year', p_year,
      'trips_requested_and_fulfilled',
        (select count(*) from loadq_seats s join loadq_payouts p on p.entry_id = s.entry_id
          where s.status='paid' and extract(year from p.departed_at) = p_year)
      + (select count(*) from loadq_ride_requests r
          where r.completed_at is not null and extract(year from r.completed_at) = p_year),
      'trips_requested_not_fulfilled',
        (select count(*) from loadq_ride_requests r
          where r.completed_at is null and extract(year from r.created_at) = p_year),
      'by_reason', coalesce((
        select json_agg(json_build_object('reason', reason, 'count', n) order by n desc)
          from (select coalesce(nullif(btrim(coalesce(r.cancel_reason, r.status)),''), 'unstated') as reason,
                       count(*) as n
                  from loadq_ride_requests r
                 where r.completed_at is null and extract(year from r.created_at) = p_year
                 group by 1) z), '[]'::json)) end
$$;
