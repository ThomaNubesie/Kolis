-- Quorly — a motion is adopted by a majority of the members, not a fixed count.
--
-- Voting already existed, but the bar was cf_forms.approval_count: a number typed
-- once. A parliament of 11 that grows to 40 would still adopt on the same 3 votes.
-- adopt_rule='majority' computes the bar at vote time — more than half of the
-- department's active members — so it tracks the membership instead of a memory of it.
--
-- Applied to production 2026-08-31.
alter table public.cf_forms add column if not exists adopt_rule text;
alter table public.cf_forms drop constraint if exists cf_forms_adopt_rule_check;
alter table public.cf_forms add constraint cf_forms_adopt_rule_check
  check (adopt_rule is null or adopt_rule in ('count','majority'));

-- cf_vote() now resolves the bar per vote when adopt_rule='majority':
--   v_need := (count of active members with a user_id) / 2 + 1
-- and cf_form() returns adopt_rule + adopt_needed so the screen shows the live bar
-- rather than a stale number. Full bodies are in the applied migration.

update public.cf_forms
   set features = coalesce(features,'{}'::jsonb) || '{"voting":true}'::jsonb,
       adopt_rule = 'majority'
 where kind = 'townhall';
