-- ============================================================================
-- LoadQ: onboarding needs an auth user first — 2026-09-01
--
-- `20260901190000` had loadq_list_new_driver INSERT into `drivers` directly.
-- Testing it as Dieudonné failed:
--
--   23503: insert or update on table "drivers" violates foreign key constraint
--   "drivers_id_fkey" — Key (id)=(…) is not present in table "users".
--
-- `drivers.id` references `auth.users(id)`. A driver CANNOT exist without an
-- auth account — which is exactly why every temp account so far was created with
-- an address like ravis.temp@concordexpress.ca. Creating an auth user requires
-- the service_role key, which must never reach a tablet, so it has to happen in
-- an edge function.
--
-- This splits the responsibility honestly:
--   edge function (service key)  → create the auth user, insert the drivers row
--   this RPC (list-writer gated) → car, documents, alias, queue placement
--
-- The upside of being forced down this path: the driver gets a REAL account
-- tied to the email captured at the kerb, so they can sign in later and finish
-- their own verification. That is better than another ".temp@" placeholder.
-- ============================================================================
set check_function_bodies = off;

drop function if exists public.loadq_list_new_driver(text,text,text,text,text,text,text,text,int,text,text,int,text,text,text,date,text);

-- Finish onboarding a driver whose auth user + `drivers` row already exist.
-- p_driver is the uid the edge function just created.
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
        v_docs jsonb := '[]'::jsonb; v_missing text[] := '{}';
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
  else v_missing := v_missing || 'drivers_license'; end if;

  if nullif(trim(coalesce(p_insurance_path,'')),'') is not null then
    v_docs := v_docs || public.loadq_list_doc_submit(p_driver,'insurance',p_insurance_path);
  else v_missing := v_missing || 'insurance'; end if;
  v_missing := v_missing || 'registration';

  v_add := public.loadq_list_add(p_zone, p_dest, p_driver, v_veh, p_pos);

  return jsonb_build_object(
    'ok', coalesce((v_add->>'ok')::boolean,false),
    'driver_id', p_driver, 'name', v_name, 'vehicle_id', v_veh, 'plate', v_plate,
    'placeholder_plate', nullif(trim(coalesce(p_plate,'')),'') is null,
    'position', v_add->'position', 'error', v_add->>'error',
    'documents', v_docs, 'missing_documents', to_jsonb(v_missing), 'verified', false,
    'note','Queued. Documents pending admin review; the driver can now sign in with the email captured.');
end $function$;

revoke all on function public.loadq_list_onboard(text,text,uuid,text,text,text,int,text,text,int,text,text,text,date,text) from public, anon;
grant execute on function public.loadq_list_onboard(text,text,uuid,text,text,text,int,text,text,int,text,text,text,date,text) to authenticated, service_role;
