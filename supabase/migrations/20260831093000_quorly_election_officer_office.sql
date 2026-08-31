-- Quorly — the returning officer's own office, and 🧮 for the offices that run a vote.
--
-- Applied to production 2026-08-31 (Les Chauffeurs de 140).
--
-- An OFFICE is an ordinary child form — organization ▸ department ▸ office — which is
-- exactly why it carries entries, folders, files and receipts with no new plumbing.
-- This one sits under the election department and belongs to the election officer:
-- admin_id is his, so it stays his even if membership rows change.

update public.cf_forms set emoji = '🧮' where kind = 'election' and emoji is null;

-- The office itself (ids are this deployment's; recorded for the history, not to re-run):
--   insert into cf_forms(name, admin_id, features, kind, parent_id, group_name, emoji, post_audience)
--   values ('Election Officer''s Office', <J.P.>,
--           '{"fields":true,"files":true,"receipts":true,"comments":true,"member_entries":true}',
--           'department', <election dept>, 'Scrutin', '🎖️', 'all');
--   + cf_members row (J.P., admin) and two cf_fields: Matter / Objet, Ruling / Décision.
--   + cf_members.title = 'Election Officer' on his election-department row.
