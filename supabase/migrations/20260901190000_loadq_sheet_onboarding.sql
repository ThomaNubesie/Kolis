-- ============================================================================
-- LoadQ: full driver onboarding from the sheet — 2026-09-01
--
-- Thomas: "the individual should be asked what type of car name so we could
-- create a profile. phone number email address license plate. photo of drivers
-- license and insurance."
--
-- So a new person at the pickup point is properly onboarded, not given a
-- throwaway temp row. This REUSES the existing verification system rather than
-- building a parallel one: bucket `driver-docs`, table `loadq_driver_documents`,
-- the admin review queue, and `drivers.verified` flipping true by itself once
-- all three documents are approved.
--
-- Two things blocked a list writer from doing this on someone else's behalf:
--
-- 1. `loadq_driver_doc_submit` hard-refuses any path outside the CALLER's own
--    folder ("path must be under your own folder"). Correct for a driver
--    uploading their own licence; fatal for a writer onboarding someone at the
--    kerb. Hence `loadq_list_doc_submit`, which is writer-gated and takes the
--    driver as an argument.
-- 2. Storage policy `ddoc_ins_own` only lets you write into your own uid folder,
--    so the upload itself would fail before any RPC ran. A writer policy is
--    added alongside it — writers only, still confined to the driver-docs bucket.
--
-- Note the new driver has NO auth account, so they cannot upload these
-- themselves and get no push notification. That is the point: the writer
-- captures the documents at the kerb, and the driver completes a real signup
-- later. `verified` stays false until an admin reviews, so nothing here quietly
-- promotes an unchecked driver.
-- ============================================================================
set check_function_bodies = off;

-- --------------------------------------------------------------- storage ---
drop policy if exists ddoc_ins_writer on storage.objects;
create policy ddoc_ins_writer on storage.objects for insert to authenticated
  with check (
    bucket_id = 'driver-docs'
    and exists (select 1 from public.loadq_list_writer w where w.driver_id = auth.uid())
  );

drop policy if exists ddoc_sel_writer on storage.objects;
create policy ddoc_sel_writer on storage.objects for select to authenticated
  using (
    bucket_id = 'driver-docs'
    and exists (select 1 from public.loadq_list_writer w where w.driver_id = auth.uid())
  );

drop policy if exists ddoc_upd_writer on storage.objects;
create policy ddoc_upd_writer on storage.objects for update to authenticated
  using (
    bucket_id = 'driver-docs'
    and exists (select 1 from public.loadq_list_writer w where w.driver_id = auth.uid())
  );

-- ------------------------------------------------------- doc submit (writer)
-- Same shape as loadq_driver_doc_submit, but the path must sit under the TARGET
-- driver's folder and the caller must be a list writer.
create or replace function public.loadq_list_doc_submit(
  p_driver uuid, p_doc_type text, p_storage_path text,
  p_expires_on date default null, p_doc_number text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_row public.loadq_driver_documents;
begin
  if not public.loadq_can_write_list(null) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;
  if p_doc_type not in ('drivers_license','insurance','registration') then
    return jsonb_build_object('ok',false,'error','invalid_doc_type'); end if;
  if not exists (select 1 from public.drivers where id = p_driver) then
    return jsonb_build_object('ok',false,'error','no_such_driver'); end if;
  if split_part(p_storage_path, '/', 1) <> p_driver::text then
    return jsonb_build_object('ok',false,'error','path_must_be_under_driver_folder'); end if;

  insert into public.loadq_driver_documents
    (driver_id, doc_type, storage_path, status, expires_on, doc_number, submitted_at)
  values (p_driver, p_doc_type, p_storage_path, 'pending', p_expires_on, p_doc_number, now())
  on conflict (driver_id, doc_type) do update
    set storage_path = excluded.storage_path, status = 'pending',
        expires_on = excluded.expires_on, doc_number = excluded.doc_number,
        review_notes = null, reviewed_by = null, reviewed_at = null, submitted_at = now()
  returning * into v_row;

  perform public.loadq_recompute_driver_verified(p_driver);
  return jsonb_build_object('ok',true,'document_id',v_row.id,'doc_type',v_row.doc_type,'status',v_row.status);
end $function$;

-- ------------------------------------------------ onboard + queue in one call
-- Everything Thomas listed: name, phone, email, car (make/model/colour/seats/
-- plate) and the two document paths. Documents are optional at this call so the
-- writer can add the driver while the person is still finding their papers, and
-- upload after — but the response says plainly what is still missing.
create or replace function public.loadq_list_new_driver(
  p_zone text, p_dest text,
  p_name text, p_phone text default null, p_email text default null,
  p_make text default null, p_model text default null,
  p_color text default null, p_seats int default null,
  p_plate text default null, p_type text default 'suv',
  p_pos int default null, p_alias text default null,
  p_license_path text default null, p_insurance_path text default null,
  p_license_expires date default null, p_license_number text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_driver uuid; v_veh uuid; v_name text := nullif(trim(coalesce(p_name,'')),'');
        v_plate text; v_add jsonb; v_existing uuid; v_docs jsonb := '[]'::jsonb; v_missing text[] := '{}';
begin
  if not public.loadq_can_write_list(p_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;
  if v_name is null then return jsonb_build_object('ok',false,'error','name_required'); end if;
  if coalesce(p_seats,0) < 1 then return jsonb_build_object('ok',false,'error','seats_required'); end if;
  if coalesce(p_type,'suv') not in ('suv','sedan','minibus','van','bush_taxi') then
    return jsonb_build_object('ok',false,'error','bad_vehicle_type'); end if;

  -- Never create a second record for someone already known under another name.
  select id into v_existing from public.drivers
   where public.loadq_fold(full_name) = public.loadq_fold(v_name) limit 1;
  if v_existing is not null then
    return jsonb_build_object('ok',false,'error','driver_exists','driver_id',v_existing,
      'name',(select full_name from public.drivers where id = v_existing));
  end if;

  insert into public.drivers (full_name, phone, email, verified, blocked)
  values (v_name,
          nullif(regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g'),''),
          nullif(lower(trim(coalesce(p_email,''))),''),
          false, false)
  returning id into v_driver;

  v_plate := coalesce(nullif(trim(coalesce(p_plate,'')),''),
                      upper(regexp_replace(split_part(v_name,' ',1),'[^A-Za-z]','','g')) || '-TEMP');
  insert into public.vehicles (driver_id, type, make, model, plate, color, seats, is_active)
  values (v_driver, coalesce(p_type,'suv'),
          upper(coalesce(nullif(trim(coalesce(p_make,'')),''),'Unknown')),
          coalesce(nullif(trim(coalesce(p_model,'')),''),'(temp)'),
          v_plate, nullif(trim(coalesce(p_color,'')),''), p_seats, true)
  returning id into v_veh;

  if nullif(trim(coalesce(p_alias,'')),'') is not null then
    perform public.loadq_alias_add(p_alias, v_driver, 'learned from the sheet');
  end if;

  if nullif(trim(coalesce(p_license_path,'')),'') is not null then
    v_docs := v_docs || public.loadq_list_doc_submit(v_driver,'drivers_license',p_license_path,
                                                     p_license_expires,p_license_number);
  else v_missing := v_missing || 'drivers_license'; end if;

  if nullif(trim(coalesce(p_insurance_path,'')),'') is not null then
    v_docs := v_docs || public.loadq_list_doc_submit(v_driver,'insurance',p_insurance_path);
  else v_missing := v_missing || 'insurance'; end if;

  -- registration is part of the same checklist; never captured at the kerb yet
  v_missing := v_missing || 'registration';

  v_add := public.loadq_list_add(p_zone, p_dest, v_driver, v_veh, p_pos);

  return jsonb_build_object(
    'ok', coalesce((v_add->>'ok')::boolean,false),
    'driver_id', v_driver, 'vehicle_id', v_veh, 'plate', v_plate,
    'placeholder_plate', nullif(trim(coalesce(p_plate,'')),'') is null,
    'position', v_add->'position', 'error', v_add->>'error',
    'documents', v_docs,
    'missing_documents', to_jsonb(v_missing),
    -- said plainly so the UI can show it: queued now, but not a verified driver
    'verified', false,
    'note', 'Queued. Documents are pending admin review; the driver still needs to sign up in the app.');
end $function$;

revoke all on function public.loadq_list_doc_submit(uuid,text,text,date,text) from public, anon;
grant execute on function public.loadq_list_doc_submit(uuid,text,text,date,text) to authenticated, service_role;
revoke all on function public.loadq_list_new_driver(text,text,text,text,text,text,text,text,int,text,text,int,text,text,text,date,text) from public, anon;
grant execute on function public.loadq_list_new_driver(text,text,text,text,text,text,text,text,int,text,text,int,text,text,text,date,text) to authenticated, service_role;

-- The 12-arg version from 20260901180000 is superseded; drop it so PostgREST
-- does not have to choose between two overloads.
drop function if exists public.loadq_list_new_driver(text,text,text,text,text,text,text,int,text,text,int,text);
