-- Automated document verification, with a person on the last step.
--
-- The City asks for seven documents per driver. Reading all of them by hand does not scale
-- past the drivers we already have, and most of the work is not judgement at all — it is
-- transcription: is this the right kind of document, is it legible, whose name is on it, when
-- does it expire, does the plate match the car on file.
--
-- So the split is deliberate and asymmetric:
--   · the machine may REJECT outright — a blurred photo or an expired licence is not a
--     judgement call, and the driver simply retakes it;
--   · the machine may never APPROVE. It prepares the decision — extracts the expiry, matches
--     the name, flags the doubts — and a person certifies.
--
-- A false rejection costs a driver one retake. A false approval puts an uninspected driver in
-- a car with passengers and our licence behind it. The asymmetry follows from that, and it is
-- also what the by-law expects: the PTC attests, and an attestation needs someone attesting.

alter table public.loadq_driver_documents
  add column if not exists machine_status text
    check (machine_status in ('pass','reject','uncertain','error')),
  add column if not exists machine_at    timestamptz,
  add column if not exists machine_notes text,
  add column if not exists extracted     jsonb,
  add column if not exists certified_by  uuid references public.drivers(id),
  add column if not exists certified_at  timestamptz;

comment on column public.loadq_driver_documents.machine_status is
  'What the automated read concluded. Never ''approved'' — only a person approves.';
comment on column public.loadq_driver_documents.extracted is
  'Everything read off the document, kept verbatim so a certifier can see what the machine saw.';
comment on column public.loadq_driver_documents.certified_by is
  'The person who approved it. The by-law wants an attestation, and an attestation needs a name.';

-- What the reader picks up: pending, not yet machine-read, with the facts to check against.
create or replace function public.loadq_docs_for_machine(p_limit integer default 20)
returns json language sql stable security definer set search_path to 'public' as $$
  select case when not public.loadq_is_admin_or_service()
    then json_build_object('ok', false, 'error', 'forbidden')
    else json_build_object('ok', true, 'rows', coalesce((
      select json_agg(json_build_object(
               'doc_id', d.id, 'doc_type', d.doc_type,
               'storage_path', d.storage_path,
               'submitted_at', d.submitted_at,
               'declared_expiry', d.expires_on,
               -- what the document is checked AGAINST
               'driver_id', dr.id, 'driver_name', dr.full_name, 'driver_dob', dr.dob,
               'plate', v.plate,
               'vehicle', trim(concat_ws(' ', v.year::text, v.make, v.model)),
               'expect', k.label_en, 'expect_help', k.help_en)
             order by d.submitted_at)
        from loadq_driver_documents d
        join drivers dr on dr.id = d.driver_id
        left join loadq_doc_kinds k on k.doc_type = d.doc_type
        left join vehicles v on v.driver_id = dr.id
       where d.status = 'pending'
         and d.machine_status is null
       limit p_limit), '[]'::json)) end
$$;

create or replace function public.loadq_doc_machine_review(
  p_doc uuid, p_status text, p_extracted jsonb default null,
  p_notes text default null, p_expiry date default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare d public.loadq_driver_documents;
begin
  if not public.loadq_is_admin_or_service() then
    return json_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_status not in ('pass','reject','uncertain','error') then
    return json_build_object('ok', false, 'error', 'bad_status'); end if;

  select * into d from loadq_driver_documents where id = p_doc;
  if d.id is null then return json_build_object('ok', false, 'error', 'not_found'); end if;

  update loadq_driver_documents
     set machine_status = p_status,
         machine_at     = now(),
         machine_notes  = p_notes,
         extracted      = coalesce(p_extracted, extracted),
         -- the expiry the machine read wins over the one the driver typed: it comes off the
         -- document itself, which is the thing the City will look at
         expires_on     = coalesce(p_expiry, expires_on),
         status         = case when p_status = 'reject' then 'rejected' else status end,
         review_notes   = case when p_status = 'reject' then p_notes else review_notes end,
         updated_at     = now()
   where id = p_doc;

  return json_build_object('ok', true, 'status', p_status,
                           'auto_rejected', p_status = 'reject');
end $$;

-- The human queue, pre-filled.
--
-- 'error' belongs here as much as 'pass' does. A document the reader could not process is
-- still a document a driver is waiting on, and without this it would be invisible to both
-- queues at once — skipped by the machine because machine_status is set, skipped by the
-- person because it was not a clean read. Stranded, pending, forever.
create or replace function public.loadq_docs_to_certify()
returns json language sql stable security definer set search_path to 'public' as $$
  select case when not exists (select 1 from drivers a where a.id = auth.uid() and a.is_admin)
    then json_build_object('ok', false, 'error', 'forbidden')
    else json_build_object('ok', true, 'rows', coalesce((
      select json_agg(json_build_object(
               'doc_id', d.id, 'doc_type', d.doc_type,
               'label', k.label_en,
               'driver', dr.full_name, 'driver_id', dr.id, 'phone', dr.phone,
               'storage_path', d.storage_path,
               'machine_status', d.machine_status,
               'machine_notes', d.machine_notes,
               'extracted', d.extracted,
               'expires_on', d.expires_on,
               'submitted_at', d.submitted_at)
             -- 'uncertain' and 'error' before 'pass': the ones needing real attention first
             order by d.machine_status desc, d.submitted_at)
        from loadq_driver_documents d
        join drivers dr on dr.id = d.driver_id
        left join loadq_doc_kinds k on k.doc_type = d.doc_type
       where d.status = 'pending'
         and d.machine_status in ('pass','uncertain','error')), '[]'::json)) end
$$;

create or replace function public.loadq_doc_certify(
  p_doc uuid, p_approve boolean, p_notes text default null, p_expires_on date default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare d public.loadq_driver_documents; v_admin uuid := auth.uid();
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

  -- A driver is verified only when the City's whole list is approved and current.
  update drivers set verified = public.loadq_driver_docs_complete(d.driver_id)
   where id = d.driver_id;

  return json_build_object('ok', true, 'approved', p_approve,
    'driver_verified', public.loadq_driver_docs_complete(d.driver_id));
end $$;

-- The two machine functions are the reader's, not the app's.
revoke execute on function public.loadq_docs_for_machine(integer)                    from public, anon, authenticated;
revoke execute on function public.loadq_doc_machine_review(uuid, text, jsonb, text, date) from public, anon, authenticated;
grant  execute on function public.loadq_docs_for_machine(integer)                    to service_role;
grant  execute on function public.loadq_doc_machine_review(uuid, text, jsonb, text, date) to service_role;

-- Every ten minutes. A driver who uploads a licence should have an answer before they put
-- the phone down, not whenever someone next opens the tablet.
select cron.schedule('loadq-doc-verify', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://kzjptcpjpwlxfofzhyku.supabase.co/functions/v1/loadq-doc-verify',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb) $cron$);
