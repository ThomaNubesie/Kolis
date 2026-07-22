-- Admins (LoadQ drivers.is_admin) can read + manage all parcels — needed for the
-- hub dispatch queue.
create policy "kolis_parcels_admin_all" on public.kolis_parcels for all
  using (exists (select 1 from public.drivers d where d.id = auth.uid() and d.is_admin))
  with check (exists (select 1 from public.drivers d where d.id = auth.uid() and d.is_admin));
