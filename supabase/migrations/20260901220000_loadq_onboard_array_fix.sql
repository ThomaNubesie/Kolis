-- ============================================================================
-- LoadQ: fix array append in loadq_list_onboard — 2026-09-01
--
-- `v_missing := v_missing || 'registration'` resolved to anyarray || anyarray,
-- so Postgres tried to parse the bare string as an array literal:
--
--   22P02: malformed array literal: "registration"
--
-- It only fired once execution reached an unconditional append — with both
-- document paths supplied, the two guarded appends were skipped and the
-- registration line was the first to run. Latent in all three. Caught by an
-- end-to-end run rather than by applying the migration, which succeeded.
--
-- array_append() is unambiguous; use it rather than the || operator.
-- ============================================================================
set check_function_bodies = off;

create or replace function public.loadq_list_onboard(
  p_zone text, p_dest text, p_driver uuid,
  p_make text default null, p_model text default null,
  p_color text default null, p_seats int default null,
  p_plate text default null, p_type text default 'suv',
  p_pos int default null, p_alias text default null,
  p_license_path text default null, p_insurance_path text default null,
  p_license_expires date default null, p_license_number text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_veh uuid; v_plate text; v_add jsonb; v_name text;
        v_docs jsonb := '[]'::jsonb; v_missing text[] := array[]::text[];
begin
  if not public.loadq_can_write_list(p_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;
  select full_name into v_name from public.drivers where id = p_driver;
  if v_name is null then return jsonb_build_object('ok',false,'error','no_such_driver'); end if;
  if coalesce(p_seats,0) < 1 then return jsonb_build_object('ok',false,'error','seats_required'); end if;
  if coalesce(p_type,'suv') not in ('suv','sedan','minibus','van','bush_taxi') then
    return jsonb_build_object('ok',false,'error','bad_vehicle_type'); end if;

  if not exists (select 1 from public.vehicles where driver_id = p_driver and is_active) then
    v_plate := coalesce(nullif(trim(coalesce(p_plate,'')),''),
                        upper(regexp_replace(split_part(v_name,' ',1),'[^A-Za-z]','','g')) || '-TEMP');
    insert into public.vehicles (driver_id, type, make, model, plate, color, seats, is_active)
    values (p_driver, coalesce(p_type,'suv'),
            upper(coalesce(nullif(trim(coalesce(p_make,'')),''),'Unknown')),
            coalesce(nullif(trim(coalesce(p_model,'')),''),'(temp)'),
            v_plate, nullif(trim(coalesce(p_color,'')),''), p_seats, true)
    returning id into v_veh;
  else
    select id, plate into v_veh, v_plate from public.vehicles
     where driver_id = p_driver and is_active order by created_at limit 1;
  end if;

  if nullif(trim(coalesce(p_alias,'')),'') is not null then
    perform public.loadq_alias_add(p_alias, p_driver, 'learned from the sheet');
  end if;

  if nullif(trim(coalesce(p_license_path,'')),'') is not null then
    v_docs := v_docs || public.loadq_list_doc_submit(p_driver,'drivers_license',p_license_path,
                                                     p_license_expires,p_license_number);
  else v_missing := array_append(v_missing, 'drivers_license'); end if;

  if nullif(trim(coalesce(p_insurance_path,'')),'') is not null then
    v_docs := v_docs || public.loadq_list_doc_submit(p_driver,'insurance',p_insurance_path);
  else v_missing := array_append(v_missing, 'insurance'); end if;

  -- registration is part of the same 3-doc checklist and is never captured kerbside
  v_missing := array_append(v_missing, 'registration');

  v_add := public.loadq_list_add(p_zone, p_dest, p_driver, v_veh, p_pos);

  return jsonb_build_object(
    'ok', coalesce((v_add->>'ok')::boolean,false),
    'driver_id', p_driver, 'name', v_name, 'vehicle_id', v_veh, 'plate', v_plate,
    'placeholder_plate', nullif(trim(coalesce(p_plate,'')),'') is null,
    'position', v_add->'position', 'error', v_add->>'error',
    'documents', v_docs, 'missing_documents', to_jsonb(v_missing), 'verified', false,
    'note','Queued. Documents pending admin review; the driver can now sign in with the email captured.');
end $function$;

grant execute on function public.loadq_list_onboard(text,text,uuid,text,text,text,int,text,text,int,text,text,text,date,text) to authenticated, service_role;
