-- Quorly — the assembly is called the Parliament.
--
-- The department of all members was created as "Town Hall", in the group "Assembly".
-- The name changes; kind='townhall' does NOT — it is an internal token wired through
-- RLS, the sync trigger and the client, and renaming it would buy nothing but risk.
--
-- Applied to production 2026-08-31. Both creators are patched, so a NEW organization
-- is born with the new name: the membership trigger (first member) and the idempotent
-- cf_ensure_townhall (org load). See 20260830180000 for the trigger's own rationale.

update public.cf_forms
   set name = 'Parliament', group_name = 'Parliament'
 where kind = 'townhall' and name = 'Town Hall';

update public.cf_forms set emoji = '🏛' where kind = 'townhall' and emoji = '🏟️';

-- cf_townhall_sync() and cf_ensure_townhall() are re-created here with 'Parliament'
-- as the created name/group and 🏛 as the emoji; bodies are otherwise identical to
-- 20260830180000 and 20260830160000 respectively.
