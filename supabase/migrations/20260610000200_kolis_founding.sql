-- Founding-member counter: first 100 per role (sender/courier/both) get Kolis
-- verification + first year free. Atomic claim so the 100th spot is exact.
create table if not exists public.kolis_founding (
  role text primary key,
  count int not null default 0
);
insert into public.kolis_founding (role, count) values ('sender',0),('courier',0),('both',0)
  on conflict (role) do nothing;
alter table public.kolis_founding enable row level security;
-- service-role only (edge function); no public policies.

create or replace function public.kolis_claim_founding(p_role text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.kolis_founding set count = count + 1
    where role = p_role and count < 100
    returning count into n;
  return n; -- null when the 100 cap is reached
end; $$;
