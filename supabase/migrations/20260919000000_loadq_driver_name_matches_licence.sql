-- The name on the account must be the name on the licence.
--
-- Found when the reader opened the first real document: the card says AHMED, LAITH RAFID and
-- the account said "Laith R". The driver identification card renders drivers.full_name, so the
-- card a City officer inspects did not match the licence it is supposed to correspond to. That
-- is a by-law problem, not untidy data.
--
-- Renaming a person is consequential -- it changes their ID card, their receipts and what the
-- City sees -- so nothing here applies a change on its own. The machine proposes, a person
-- decides, and the name they replace is kept.
--
-- Reading all eleven licences on file showed the problem was one account, not eleven, and two
-- reasons NOT to match the card blindly:
--   * Ontario cards are ASCII. "Paul Roger Stephane Diboma" is printed without the accent that
--     the account correctly carries; matching the card would make the record worse.
--   * Cards carry middle names that accounts do not. Every account uses given + surname, which
--     is what an ID card normally shows, so the convention was kept.

alter table public.drivers
  add column if not exists previous_name     text,
  add column if not exists name_corrected_at timestamptz;

comment on column public.drivers.previous_name is
  'What the account was called before it was matched to the licence. Kept because a rename is not reversible from the new value alone, and old trip records were written under it.';

-- Ontario cards print SURNAME, GIVEN MIDDLE. An account reading "Laith R" and a card reading
-- "AHMED, LAITH,RAFID AHMED" are the same person written two ways, so this presents both and
-- asks a human rather than rewriting on a string comparison.
create or replace function public.loadq_name_mismatches()
returns json language sql stable security definer set search_path to 'public' as $$
  select case when not exists (select 1 from drivers a where a.id = auth.uid() and a.is_admin)
    then json_build_object('ok', false, 'error', 'forbidden')
    else json_build_object('ok', true, 'rows', coalesce((
      select json_agg(json_build_object(
               'driver_id', dr.id,
               'account_name', dr.full_name,
               'licence_name', d.extracted->>'full_name',
               'doc_id', d.id,
               'doc_status', d.status,
               'read_at', d.machine_at,
               'agrees', (d.extracted->>'name_agrees')::boolean)
             order by dr.full_name)
        from loadq_driver_documents d
        join drivers dr on dr.id = d.driver_id
       where d.doc_type = 'drivers_license'
         and d.extracted ? 'full_name'
         and nullif(btrim(d.extracted->>'full_name'), '') is not null
         and coalesce((d.extracted->>'name_agrees')::boolean, false) = false
         and dr.name_corrected_at is null), '[]'::json)) end
$$;

create or replace function public.loadq_driver_set_name(p_driver uuid, p_name text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_admin uuid := auth.uid(); v_old text; v_new text := nullif(btrim(p_name), '');
begin
  if not exists (select 1 from drivers a where a.id = v_admin and a.is_admin) then
    return json_build_object('ok', false, 'error', 'forbidden'); end if;
  if v_new is null then return json_build_object('ok', false, 'error', 'empty_name'); end if;

  select full_name into v_old from drivers where id = p_driver;
  if v_old is null then return json_build_object('ok', false, 'error', 'not_found'); end if;

  update drivers
     set previous_name     = coalesce(previous_name, v_old),
         full_name         = v_new,
         name_corrected_at = now()
   where id = p_driver;

  return json_build_object('ok', true, 'was', v_old, 'now', v_new);
end $$;

revoke execute on function public.loadq_name_mismatches()             from public, anon;
revoke execute on function public.loadq_driver_set_name(uuid, text)   from public, anon;
grant  execute on function public.loadq_name_mismatches()             to authenticated;
grant  execute on function public.loadq_driver_set_name(uuid, text)   to authenticated;

-- Applied once against the data as it stood on 2026-09-16:
--   * Laith R -> Laith Ahmed (previous_name kept).
--   * Six approved licences had no expiry on file; the date was filled from the card, gated on
--     a confident reading, a date not already past, and the field being blank. The guard is
--     what makes it safe to repeat as more documents arrive.
