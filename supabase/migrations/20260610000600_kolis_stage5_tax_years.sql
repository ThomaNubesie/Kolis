-- Stage 5: courier tax documents. Years in which the courier has delivered +
-- been credited payouts, with annual gross totals. (Own earnings → not walled.)
create or replace function public.kolis_tax_years()
returns table(year integer, total_payout_cents bigint, parcels integer)
language sql security definer set search_path to 'public'
as $$
  select extract(year from coalesce(p.delivered_at, p.created_at))::int as year,
         sum(coalesce(p.driver_payout_cents, 0))::bigint as total_payout_cents,
         count(*)::int as parcels
  from public.kolis_parcels p
  where p.driver_id = auth.uid() and p.status = 'delivered'
  group by 1
  order by 1 desc;
$$;
grant execute on function public.kolis_tax_years() to authenticated;
revoke execute on function public.kolis_tax_years() from public, anon;
