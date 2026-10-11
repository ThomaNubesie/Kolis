-- LoadQ — every Interac deposit the matcher sees leaves a record.
--
-- loadq_interac_inbound has existed since the seats work and has one row in it, from 5
-- September. The edge function has never written to it. That is not only a missing audit
-- trail: loadq_payout_verify already counts
--
--     paid interac seats WHERE NOT EXISTS (a row in loadq_interac_inbound)
--
-- as `interac_not_backed`, and that is a BLOCKING issue — the payout never reaches
-- verified_at. With nothing writing the table, every Interac seat is unbacked by definition,
-- so the first entry sold for an e-transfer would refuse to verify and nobody would know why.
-- There are no Interac seats and no payouts yet, so this costs nothing today and would have
-- cost an evening the first time a driver waited on their money.
--
-- Answering "did a payment go missing on 9 October" should be one query. Today it means
-- reading a Gmail account.

-- ── one row per deposit, not one per attempt ────────────────────────────────
-- The Apps Script re-posts an unmatched deposit every five minutes until it ages out of its
-- three-day window. Without a key to upsert on, a single unmatched transfer writes ~860 rows
-- and the queue becomes unreadable.
--
-- Deliberately NOT a partial index. ON CONFLICT cannot infer a partial unique index unless the
-- statement repeats its predicate, and PostgREST does not. A reference of NULL is distinct
-- from any other NULL in a unique index, so deposits that carried no reference each keep their
-- own row — which is what you want, since they are different payments from different people.
create unique index if not exists loadq_interac_inbound_ref_amount_key
  on public.loadq_interac_inbound (reference, amount_cents);

comment on index public.loadq_interac_inbound_ref_amount_key is
  'Upsert key for the matcher. One row per (reference, amount), updated on each retry, so the '
  'unresolved queue shows deposits rather than attempts.';

-- ── the unresolved queue ────────────────────────────────────────────────────
-- Two changes.
--
-- 1. near_matches counted unpaid RIDE requests only. The function tries ride, then seat, then
--    pickup, and seats are the live product — so a deposit for a seat showed "0 near matches"
--    and read as a mystery when the answer was one row away.
--
-- 2. security_invoker. The view was owned by postgres and not an invoker view, so selecting it
--    ran as the owner and read straight past the RLS on loadq_interac_inbound — which is
--    enabled with no policies precisely so that nobody but the service role sees payment
--    records. anon holds SELECT on the view, so the queue was readable with the publishable
--    key. It is empty today, which is the only reason that has not mattered.
create or replace view public.loadq_interac_unresolved
with (security_invoker = true) as
  select i.id,
         i.received_at,
         i.amount_cents::numeric / 100.0 as amount,
         i.sender_name,
         i.sender_email,
         i.reference,
         i.raw_text,
         (
           -- Anything unpaid priced within a dollar of what arrived. A hint for whoever works
           -- the queue, not a decision: the matcher never pays on an amount alone.
           (select count(*) from public.loadq_ride_requests r
             where coalesce(r.payment_status, '') <> 'paid'
               and r.fare_cents between i.amount_cents - 100 and i.amount_cents + 100)
         + (select count(*) from public.loadq_seats s
             where s.paid_at is null and coalesce(s.status, '') <> 'released'
               and (coalesce(s.fare_cents, 0) + coalesce(s.fee_cents, 0))
                   between i.amount_cents - 100 and i.amount_cents + 100)
         + (select count(*) from public.loadq_pickup_requests p
             where p.paid_at is null
               and p.total_cents between i.amount_cents - 100 and i.amount_cents + 100)
         ) as near_matches
    from public.loadq_interac_inbound i
   where not i.matched
     and i.resolved_at is null
   order by i.received_at desc;

comment on view public.loadq_interac_unresolved is
  'Deposits the matcher could not place, newest first, with a count of unpaid rides, seats and '
  'pickups priced within a dollar of the amount. security_invoker, so the RLS on the base '
  'table applies — only the service role reads it.';

-- ── who may read a payment record ───────────────────────────────────────────
-- Supabase grants ALL on every new public object to anon and authenticated. RLS on the base
-- table already stops them, but the grant should not be there to begin with, and on a view it
-- was doing real work until the line above.
revoke all on public.loadq_interac_inbound   from anon, authenticated;
revoke all on public.loadq_interac_unresolved from anon, authenticated;
grant select, insert, update on public.loadq_interac_inbound   to service_role;
grant select                 on public.loadq_interac_unresolved to service_role;
