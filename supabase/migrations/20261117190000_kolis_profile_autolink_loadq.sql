-- Link a courier's Kolis profile to their LoadQ driver record by phone number.
--
-- Why: a driver often has two accounts — LoadQ (signed in by email) and Kolis
-- (signed in by phone). Everything that asks "which parcels are mine?" from the
-- LoadQ app (kolis_carrying, kolis_courier_pickup, …) resolves the Kolis profile by
-- `kp.id = auth.uid() or kp.loadq_driver_id = auth.uid()`. With the link empty, a
-- parcel assigned to the Kolis profile is invisible in LoadQ. That's what stranded
-- Dolly on KL-7877 (Nov 2026); 13 other couriers were in the same state and were
-- linked by hand the same day.
--
-- Matching: last 10 digits of the Kolis account's auth phone = last 10 digits of
-- drivers.phone. Links only when exactly ONE candidate matches and nobody is already
-- linked to it, so a shared or recycled number never joins two different people.

create or replace function public.kolis_phone10(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '');
$$;

-- Kolis profile created/updated first → find its LoadQ driver.
create or replace function public.kolis_profile_autolink_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_phone text; v_ids uuid[];
begin
  if new.loadq_driver_id is not null then return new; end if;
  if exists (select 1 from public.drivers where id = new.id) then return new; end if;   -- one account for both
  select public.kolis_phone10(phone) into v_phone from auth.users where id = new.id;
  if v_phone is null or length(v_phone) < 10 then return new; end if;
  select array_agg(d.id) into v_ids
    from public.drivers d
   where public.kolis_phone10(d.phone) = v_phone
     and not exists (select 1 from public.kolis_profiles k where (k.loadq_driver_id = d.id or k.id = d.id) and k.id <> new.id);
  if cardinality(v_ids) = 1 then new.loadq_driver_id := v_ids[1]; end if;
  return new;
end $$;

drop trigger if exists kolis_profile_autolink on public.kolis_profiles;
create trigger kolis_profile_autolink
  before insert or update on public.kolis_profiles
  for each row execute function public.kolis_profile_autolink_trg();

-- LoadQ driver created / phone changed after the Kolis profile → link from this side.
create or replace function public.kolis_driver_autolink_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_phone text := public.kolis_phone10(new.phone); v_ids uuid[];
begin
  if v_phone is null or length(v_phone) < 10 then return new; end if;
  if exists (select 1 from public.kolis_profiles where loadq_driver_id = new.id or id = new.id) then return new; end if;
  select array_agg(kp.id) into v_ids
    from public.kolis_profiles kp join auth.users u on u.id = kp.id
   where kp.loadq_driver_id is null and public.kolis_phone10(u.phone) = v_phone
     and not exists (select 1 from public.drivers d2 where d2.id = kp.id);
  if cardinality(v_ids) = 1 then
    update public.kolis_profiles set loadq_driver_id = new.id where id = v_ids[1] and loadq_driver_id is null;
  end if;
  return new;
end $$;

drop trigger if exists kolis_driver_autolink on public.drivers;
create trigger kolis_driver_autolink
  after insert or update of phone on public.drivers
  for each row execute function public.kolis_driver_autolink_trg();
