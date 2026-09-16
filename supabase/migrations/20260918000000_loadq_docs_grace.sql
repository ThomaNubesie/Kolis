-- One month to collect the by-law's seven documents. Until then, nobody is demoted.
--
-- The arithmetic that forced this: 127 drivers carry verified = true, and 117 of them have no
-- documents in the system AT ALL. The flag was set by hand under an older process, not derived
-- from anything. Only 9 are complete even on the old three.
--
-- So a per-document grace date would have saved nobody — they fail on the licence alone. What
-- is needed is a window during which the verified flag can go UP but never DOWN:
--
--   during grace   verified := verified OR docs_complete
--   after grace    verified := docs_complete
--
-- A driver who finishes all seven early becomes verified immediately. A driver who has not
-- started keeps working until 16 October 2026, and then does not. That date is a real cliff
-- and it is meant to be — it is the date the fleet meets the by-law or stops driving.
--
-- loadq_driver_docs_complete() is deliberately left ALONE and honest. It answers "are all
-- seven approved and current", which is what the ID card and the certify queue need to show.
-- The grace belongs in the decision about gating, not in the measurement.

insert into public.loadq_settings(key, value, updated_at)
values ('docs_required_from', '2026-10-16', now())
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.loadq_docs_grace_active()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select current_date < coalesce(
    (select nullif(btrim(value), '')::date from loadq_settings where key = 'docs_required_from'),
    current_date)
$$;

comment on function public.loadq_docs_grace_active() is
  'True while the seven-document standard is being collected. Move loadq_settings.docs_required_from to extend or end it — no deploy needed.';

create or replace function public.loadq_doc_certify(
  p_doc uuid, p_approve boolean, p_notes text default null, p_expires_on date default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare d public.loadq_driver_documents; v_admin uuid := auth.uid();
        v_complete boolean; v_grace boolean; v_verified boolean;
begin
  if not exists (select 1 from drivers a where a.id = v_admin and a.is_admin) then
    return json_build_object('ok', false, 'error', 'forbidden'); end if;

  select * into d from loadq_driver_documents where id = p_doc;
  if d.id is null then return json_build_object('ok', false, 'error', 'not_found'); end if;

  update loadq_driver_documents
     set status       = case when p_approve then 'approved' else 'rejected' end,
         expires_on   = coalesce(p_expires_on, expires_on),
         review_notes = p_notes,
         reviewed_by  = v_admin, reviewed_at = now(),
         certified_by = case when p_approve then v_admin else null end,
         certified_at = case when p_approve then now() else null end,
         updated_at   = now()
   where id = p_doc;

  v_complete := public.loadq_driver_docs_complete(d.driver_id);
  v_grace    := public.loadq_docs_grace_active();

  -- Never demote inside the window. Certifying a licence must not be the act that takes a
  -- working driver off the line for want of a police check they have a month to obtain.
  update drivers
     set verified = case when v_grace then (verified or v_complete) else v_complete end
   where id = d.driver_id
  returning verified into v_verified;

  return json_build_object('ok', true, 'approved', p_approve,
    'docs_complete', v_complete, 'grace_active', v_grace,
    'driver_verified', v_verified);
end $$;

-- The older recompute hardcoded the three documents and is what the app's own flows call.
-- Left on the same footing so the two cannot disagree about demotion.
create or replace function public.loadq_recompute_driver_verified(p_driver uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare ok boolean; v_out boolean;
begin
  ok := public.loadq_driver_docs_complete(p_driver);
  update public.drivers
     set verified = case when public.loadq_docs_grace_active()
                         then (verified or coalesce(ok,false))
                         else coalesce(ok,false) end
   where id = p_driver
  returning verified into v_out;
  return coalesce(v_out,false);
end $$;
