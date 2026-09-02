-- ============================================================================
-- URGENT FIX: drop the added_by foreign key — 2026-09-01
--
-- `20260901150000` added `queue_entries.added_by` WITH a foreign key to
-- `drivers`. That gave queue_entries TWO foreign keys to the same table
-- (`driver_id` and `added_by`), and PostgREST then refuses to resolve an embed
-- like `queue_entries?select=*,drivers(*)` because the relationship is
-- ambiguous — it returns an error instead of rows.
--
-- Effect in production: the LoadQ board rendered EMPTY for every client, while
-- the 13 queued cars sat untouched in the table. Reported minutes after the
-- migration went in.
--
-- The column stays — attribution is still wanted — but the FK goes. Referential
-- integrity here is worth less than a working board, and `added_by` is written
-- only by our own SECURITY DEFINER functions from auth.uid(), so it cannot hold
-- a bogus id in practice.
--
-- LESSON: on a PostgREST-backed table, a second FK to an already-embedded table
-- is a BREAKING change to every client that embeds it. Check existing FKs before
-- adding one.
-- ============================================================================
alter table public.queue_entries drop constraint if exists queue_entries_added_by_fkey;

comment on column public.queue_entries.added_by is
  'Driver who added this row via the sheet (auth.uid()). Intentionally NO foreign
   key: a second FK to drivers makes PostgREST embeds ambiguous and breaks every
   client that does select=*,drivers(*). See migration 20260901170000.';
