-- ============================================================================
-- Quorly: normalise the legacy `kind` values the org migration missed — 2026-08-28
--
-- 20260828120000 assumed containers were kind='space' and boards were kind=null.
-- The live project also held two older spellings, and both were left stranded:
--
--   kind='form'    a board parented under an organization  → never became a
--                  department (the update only matched kind IS NULL)
--   kind='shared'  a shared folder ("Shalo Family Documents") → never became an
--                  organization (the update only matched kind='space'), so it
--                  vanished from the shared-folder list the moment cf_my_spaces
--                  started filtering on kind='org'
--
-- Worse, cf_forms_kind_check does not list either value. NOT VALID skips the
-- initial scan but the check still fires on every UPDATE, so those two rows had
-- become read-only — renaming or editing them would have thrown.
--
-- This normalises by SHAPE rather than by remembering every historical spelling:
-- anything with a parent is a department (unless it is an election); anything
-- without one is an organization, a personal vault, or a standalone board.
-- ============================================================================
set check_function_bodies = off;

-- 1. Parented → department. Elections keep their own kind (the election module
--    branches on it), everything else under a parent is a department.
update public.cf_forms
   set kind = 'department'
 where parent_id is not null
   and coalesce(kind, '') not in ('election', 'department');

-- 2. Any un-parented container spelling → organization.
update public.cf_forms
   set kind  = 'org',
       color = coalesce(color, '#2F3AA3')
 where parent_id is null
   and kind in ('shared', 'space');

-- 3. Un-parented and not a container or a vault = a standalone personal board.
--    Those carry kind NULL, which is what cf_my_forms and the rail expect.
update public.cf_forms
   set kind = null
 where parent_id is null
   and coalesce(kind, '') not in ('org', 'personal', '');

-- 4. Give the newly-promoted organizations a handle (same de-dup as before).
do $$
declare r record; v_base text; v_try text; n int;
begin
  for r in select id, name from public.cf_forms where kind='org' and slug is null order by created_at loop
    v_base := coalesce(public.cf_slugify(r.name), 'org');
    v_try := v_base; n := 1;
    while exists(select 1 from public.cf_forms where lower(slug) = lower(v_try)) loop
      n := n + 1; v_try := v_base || '-' || n;
    end loop;
    update public.cf_forms set slug = v_try where id = r.id;
  end loop;
end $$;

-- 5. Now that every row conforms, prove it — VALIDATE turns the constraint from
--    "trusted going forward" into "checked against what is actually stored", so
--    a stray kind can never be introduced again without failing loudly.
alter table public.cf_forms validate constraint cf_forms_kind_check;
alter table public.cf_forms validate constraint cf_forms_parent_fkey;
