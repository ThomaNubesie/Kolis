-- Interac e-Transfer payout tracking (manual ops-send, batched end of day) + the
-- driver's Interac details. Kolis-namespaced; never touches LoadQ's drivers table.
create table if not exists public.kolis_driver_payout (
  driver_id     uuid primary key references auth.users(id) on delete cascade,
  interac_email text,
  updated_at    timestamptz not null default now()
);
alter table public.kolis_driver_payout enable row level security;
create policy "kdp_self_select" on public.kolis_driver_payout for select using (auth.uid() = driver_id);
create policy "kdp_self_insert" on public.kolis_driver_payout for insert with check (auth.uid() = driver_id);
create policy "kdp_self_update" on public.kolis_driver_payout for update using (auth.uid() = driver_id);
create policy "kdp_admin_select" on public.kolis_driver_payout for select using (exists (select 1 from public.drivers a where a.id = auth.uid() and a.is_admin));

alter table public.kolis_parcels add column if not exists driver_paid_at timestamptz;

create or replace function public.kolis_pending_payouts()
returns table(driver_id uuid, driver_name text, interac_email text, pending_cents bigint, parcels int)
language sql security definer set search_path = public as $$
  select p.driver_id, d.full_name, dp.interac_email, sum(p.driver_payout_cents)::bigint, count(*)::int
  from public.kolis_parcels p
  join public.drivers d on d.id = p.driver_id
  left join public.kolis_driver_payout dp on dp.driver_id = p.driver_id
  where p.status = 'delivered' and p.driver_paid_at is null and p.driver_payout_cents is not null
    and exists (select 1 from public.drivers a where a.id = auth.uid() and a.is_admin)
  group by p.driver_id, d.full_name, dp.interac_email
  order by sum(p.driver_payout_cents) desc;
$$;
grant execute on function public.kolis_pending_payouts() to authenticated;

create or replace function public.kolis_mark_paid(p_driver uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from public.drivers a where a.id = auth.uid() and a.is_admin) then return -1; end if;
  update public.kolis_parcels set driver_paid_at = now()
    where driver_id = p_driver and status = 'delivered' and driver_paid_at is null;
  get diagnostics n = row_count;
  return n;
end; $$;
grant execute on function public.kolis_mark_paid(uuid) to authenticated;
