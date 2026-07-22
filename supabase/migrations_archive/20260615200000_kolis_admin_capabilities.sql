-- Per-staff capability model for the Kolis admin console.
-- Non-owner staff are deny-by-default; the owner grants each section per person.
-- Capabilities: orgs, parcels, claims, members, revenue. Team & access stays owner-only.

alter table public.kolis_admin_roles   add column if not exists capabilities text[] not null default '{}';
alter table public.kolis_admin_invites add column if not exists capabilities text[] not null default '{}';

create or replace function public.kolis_admin_all_caps() returns text[]
  language sql immutable as $$ select array['orgs','parcels','claims','members','revenue']::text[] $$;

-- Effective capabilities of the current user (owner => all).
create or replace function public.kolis_admin_caps() returns text[]
  language plpgsql stable security definer set search_path to 'public' as $$
declare v_caps text[];
begin
  if public.kolis_admin_role() is null then return '{}'; end if;
  if public.kolis_admin_role() = 'owner' then return public.kolis_admin_all_caps(); end if;
  select capabilities into v_caps from public.kolis_admin_roles where user_id = auth.uid();
  return coalesce(v_caps, '{}');
end; $$;

create or replace function public.kolis_admin_has_cap(p_cap text) returns boolean
  language sql stable security definer set search_path to 'public'
  as $$ select p_cap = any(public.kolis_admin_caps()) $$;

-- Owner sets a staff member's capabilities (never an owner's).
create or replace function public.kolis_admin_set_caps(p_user uuid, p_caps text[]) returns void
  language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(public.kolis_admin_role(),'') <> 'owner' then raise exception 'forbidden'; end if;
  update public.kolis_admin_roles set capabilities = coalesce(p_caps,'{}')
    where user_id = p_user and role <> 'owner';
end; $$;


CREATE OR REPLACE FUNCTION public.kolis_admin_orgs()
 RETURNS SETOF kolis_orgs
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select o.* from public.kolis_orgs o where public.kolis_admin_has_cap('orgs') order by o.created_at desc;
$function$

;

CREATE OR REPLACE FUNCTION public.kolis_admin_members(p_filter text DEFAULT 'all'::text, p_search text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, full_name text, email text, role text, country text, identity_verified boolean, is_founding boolean, founding_number integer, suspended boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select pr.id, coalesce(pr.verified_name, pr.full_name), pr.email, pr.role, pr.country,
         pr.identity_verified, pr.is_founding, pr.founding_number, pr.suspended
  from public.kolis_profiles pr, (select public.kolis_admin_has_cap('members') s) g
  where g.s and (
        p_filter='all'
     or (p_filter='couriers'   and pr.role in ('courier','both'))
     or (p_filter='senders'    and pr.role in ('sender','both'))
     or (p_filter='unverified' and not pr.identity_verified)
     or (p_filter='founding'   and pr.is_founding))
    and (p_search is null or p_search='' or coalesce(pr.full_name,'') ilike '%'||p_search||'%'
         or coalesce(pr.email,'') ilike '%'||p_search||'%')
  order by pr.founding_number nulls last limit 200;
$function$

;

CREATE OR REPLACE FUNCTION public.kolis_admin_parcels(p_filter text DEFAULT 'all'::text, p_search text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, code text, from_city text, to_city text, size text, dropoff_type text, status text, price_cents integer, driver_payout_cents integer, declared_value_cents integer, insured boolean, recipient_name text, driver_name text, created_at timestamp with time zone, has_open_claim boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.code, p.from_city, p.to_city, p.size, p.dropoff_type, p.status,
         p.price_cents, p.driver_payout_cents, p.declared_value_cents, p.insured,
         p.recipient_name, d.full_name, p.created_at,
         exists(select 1 from public.kolis_claims c where c.parcel_id=p.id and c.status='open')
  from public.kolis_parcels p
  left join public.drivers d on d.id = p.driver_id, (select public.kolis_admin_has_cap('parcels') s) g
  where g.s and (
        p_filter='all'
     or (p_filter='awaiting'  and p.status in ('requested','received_at_hub') and p.driver_id is null)
     or (p_filter='hub'       and p.status='received_at_hub')
     or (p_filter='transit'   and p.status in ('matched','picked_up','in_transit','dispatched'))
     or (p_filter='delivered' and p.status='delivered')
     or (p_filter='issues'    and (p.status='cancelled' or exists(select 1 from public.kolis_claims c where c.parcel_id=p.id and c.status='open'))))
    and (p_search is null or p_search='' or p.code ilike '%'||p_search||'%' or p.to_city ilike '%'||p_search||'%'
         or p.from_city ilike '%'||p_search||'%' or coalesce(p.recipient_name,'') ilike '%'||p_search||'%')
  order by p.created_at desc limit 200;
$function$

;

CREATE OR REPLACE FUNCTION public.kolis_admin_parcel(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when not public.kolis_admin_has_cap('parcels') then null else (
    select jsonb_build_object(
      'id', p.id, 'code', p.code, 'status', p.status, 'dropoff_type', p.dropoff_type, 'size', p.size,
      'from_city', p.from_city, 'to_city', p.to_city, 'to_region', p.to_region,
      'recipient_name', p.recipient_name, 'recipient_phone', p.recipient_phone, 'recipient_email', p.recipient_email,
      'dropoff_addr', p.dropoff_addr, 'pickup_addr', p.pickup_addr,
      'contents_description', p.contents_description, 'declared_value_cents', p.declared_value_cents,
      'insured', p.insured, 'insurance_premium_cents', p.insurance_premium_cents,
      'price_cents', p.price_cents, 'driver_payout_cents', p.driver_payout_cents, 'delivery_code', p.delivery_code,
      'driver_id', p.driver_id, 'driver_name', coalesce(d.full_name, dp.full_name),
      'preferred_driver_id', p.preferred_driver_id,
      'preferred_driver_name', coalesce(pd.full_name, pdp.full_name),
      'offer_expires_at', p.offer_expires_at,
      'sender_name', coalesce(sp.verified_name, sp.full_name), 'sender_email', sp.email,
      'pickup_hub_name', h.name, 'created_at', p.created_at, 'delivered_at', p.delivered_at,
      'has_pi', (p.stripe_payment_intent_id is not null)
    )
    from public.kolis_parcels p
    left join public.drivers d on d.id = p.driver_id
    left join public.kolis_profiles dp on dp.id = p.driver_id
    left join public.drivers pd on pd.id = p.preferred_driver_id
    left join public.kolis_profiles pdp on pdp.id = p.preferred_driver_id
    left join public.kolis_profiles sp on sp.id = p.sender_id
    left join public.kolis_hubs h on h.id = p.pickup_hub
    where p.id = p_id) end;
$function$

;

CREATE OR REPLACE FUNCTION public.kolis_admin_candidates(p_id uuid)
 RETURNS TABLE(driver_id uuid, name text, queue_pos integer, carrying integer, source text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with target as (select to_region from public.kolis_parcels where id = p_id)
  select pr.id,
         coalesce(nullif(btrim(d.full_name), ''), pr.full_name) as name,
         q.position as queue_pos,
         (select count(*) from public.kolis_parcels c
            where c.driver_id = pr.id and c.status in ('matched','dispatched','picked_up','in_transit'))::int as carrying,
         case when q.driver_id is not null then 'queue' else 'member' end as source
  from public.kolis_profiles pr
  left join public.drivers d on d.id = pr.id
  left join public.queue_entries q
         on q.driver_id = pr.id and q.end_reason is null
        and q.destination_region = (select to_region from target)
  where public.kolis_admin_has_cap('parcels')
    and pr.identity_verified
    and pr.role in ('courier','both')
    and (q.driver_id is not null
         or not exists (select 1 from public.queue_entries q2
                          where q2.driver_id = pr.id and q2.end_reason is null))
  order by (q.position is null), q.position nulls last
  limit 40;
$function$

;

CREATE OR REPLACE FUNCTION public.kolis_admin_claims(p_status text DEFAULT 'open'::text)
 RETURNS TABLE(id uuid, parcel_id uuid, code text, from_city text, to_city text, type text, status text, insured boolean, declared_value_cents integer, price_cents integer, refund_cents integer, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.id, c.parcel_id, p.code, p.from_city, p.to_city, c.type, c.status,
         p.insured, p.declared_value_cents, p.price_cents, c.refund_cents, c.created_at
  from public.kolis_claims c join public.kolis_parcels p on p.id = c.parcel_id,
       (select public.kolis_admin_has_cap('claims') s) g
  where g.s and (p_status='all' or c.status = p_status)
  order by c.created_at desc limit 200;
$function$

;

CREATE OR REPLACE FUNCTION public.kolis_admin_assign(p_id uuid, p_driver uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.kolis_admin_has_cap('parcels') then
    raise exception 'forbidden';
  end if;
  update public.kolis_parcels
     set preferred_driver_id = p_driver,
         offer_expires_at    = now() + interval '60 minutes',
         driver_id           = null,
         status              = case when dropoff_type = 'hub' then 'received_at_hub' else 'requested' end
   where id = p_id;
end; $function$

;

CREATE OR REPLACE FUNCTION public.kolis_admin_change_driver(p_id uuid, p_driver uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.kolis_admin_has_cap('parcels') then raise exception 'forbidden'; end if;
  update public.kolis_parcels set driver_id = p_driver where id = p_id;
end; $function$

;

CREATE OR REPLACE FUNCTION public.kolis_admin_unassign(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.kolis_admin_has_cap('parcels') then raise exception 'forbidden'; end if;
  update public.kolis_parcels
     set driver_id = null, preferred_driver_id = null, offer_expires_at = null,
         status = case when dropoff_type='hub' then 'received_at_hub' else 'requested' end
   where id = p_id;
end; $function$

;

CREATE OR REPLACE FUNCTION public.kolis_admin_reroute(p_id uuid, p_to_city text, p_to_region text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.kolis_admin_has_cap('parcels') then raise exception 'forbidden'; end if;
  update public.kolis_parcels set to_city = p_to_city, to_region = p_to_region where id = p_id;
end; $function$

;

CREATE OR REPLACE FUNCTION public.kolis_admin_suspend(p_id uuid, p_suspended boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.kolis_admin_has_cap('members') then raise exception 'forbidden'; end if;
  update public.kolis_profiles set suspended = p_suspended where id = p_id;
end; $function$

;

CREATE OR REPLACE FUNCTION public.kolis_deny_claim(p_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.kolis_admin_has_cap('claims') then raise exception 'forbidden'; end if;
  update public.kolis_claims set status='denied', note=coalesce(p_note,note), resolved_by=auth.uid(), resolved_at=now()
   where id=p_id and status='open';
end; $function$

;

CREATE OR REPLACE FUNCTION public.kolis_admin_set_kyb(p_org uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.kolis_admin_has_cap('orgs') then raise exception 'forbidden'; end if;
  if p_status not in ('pending','verified','rejected') then raise exception 'bad_status'; end if;
  update public.kolis_orgs set kyb_status = p_status where id = p_org;
end; $function$

;

CREATE OR REPLACE FUNCTION public.kolis_admin_set_org_status(p_org uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.kolis_admin_has_cap('orgs') then raise exception 'forbidden'; end if;
  if p_status not in ('active','suspended') then raise exception 'bad_status'; end if;
  update public.kolis_orgs set status = p_status where id = p_org;
end; $function$

;

CREATE OR REPLACE FUNCTION public.kolis_admin_set_org_profile(p_org uuid, p_name text DEFAULT NULL::text, p_billing_email text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.kolis_admin_has_cap('orgs') then raise exception 'forbidden'; end if;
  update public.kolis_orgs set
    name = coalesce(nullif(trim(p_name), ''), name),                -- never blank the name
    billing_email = case when p_billing_email is null then billing_email else nullif(trim(p_billing_email), '') end
  where id = p_org;
end; $function$

;

create or replace function public.kolis_admin_overview() returns jsonb
  language sql stable security definer set search_path to 'public' as $$
  select case when not public.kolis_is_staff() then null else jsonb_build_object(
    'in_transit', (select count(*) from public.kolis_parcels where status in ('matched','picked_up','in_transit','dispatched')),
    'awaiting',   (select count(*) from public.kolis_parcels where status in ('requested','received_at_hub') and driver_id is null),
    'delivered_today', (select count(*) from public.kolis_parcels where status='delivered' and delivered_at::date = now()::date),
    'revenue_today_cents', case when public.kolis_admin_has_cap('revenue') then (select coalesce(sum(price_cents + coalesce(insurance_premium_cents,0)),0) from public.kolis_parcels where status='delivered' and delivered_at::date = now()::date) else null end,
    'pending_payout_cents', case when public.kolis_admin_has_cap('revenue') then (select coalesce(sum(driver_payout_cents),0) from public.kolis_parcels where status='delivered' and driver_paid_at is null) else null end,
    'open_claims', (select count(*) from public.kolis_claims where status='open'),
    'members', (select count(*) from public.kolis_profiles),
    'role', public.kolis_admin_role(),
    'caps', to_jsonb(public.kolis_admin_caps())
  ) end;
$$;

drop function if exists public.kolis_admin_team();
create or replace function public.kolis_admin_team()
  returns table(user_id uuid, name text, email text, role text, pending boolean, caps text[])
  language sql stable security definer set search_path to 'public' as $$
  select r.user_id, coalesce(pr.verified_name, pr.full_name, d.full_name, r.invited_email), coalesce(pr.email, r.invited_email), r.role, false,
         case when r.role='owner' then public.kolis_admin_all_caps() else coalesce(r.capabilities,'{}') end
  from public.kolis_admin_roles r
  left join public.kolis_profiles pr on pr.id = r.user_id
  left join public.drivers d on d.id = r.user_id
  where public.kolis_admin_role() = 'owner'
  union all
  select d.id, d.full_name, null, 'owner', false, public.kolis_admin_all_caps()
  from public.drivers d
  where d.is_admin and public.kolis_admin_role() = 'owner'
    and not exists(select 1 from public.kolis_admin_roles r2 where r2.user_id = d.id)
  union all
  select null::uuid, i.email, i.email, i.role, true, coalesce(i.capabilities,'{}')
  from public.kolis_admin_invites i where public.kolis_admin_role() = 'owner';
$$;

drop function if exists public.kolis_admin_invite(text, text);
create or replace function public.kolis_admin_invite(p_email text, p_role text, p_caps text[] default '{}')
  returns text language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid;
begin
  if coalesce(public.kolis_admin_role(),'') <> 'owner' then raise exception 'forbidden'; end if;
  if p_role not in ('admin','dispatcher','finance','support') then raise exception 'bad role'; end if;
  select id into v_uid from public.kolis_profiles where lower(email) = lower(p_email) limit 1;
  if v_uid is not null then
    insert into public.kolis_admin_roles(user_id, role, capabilities, invited_email, invited_by)
    values (v_uid, p_role, coalesce(p_caps,'{}'), p_email, auth.uid())
    on conflict (user_id) do update set role = excluded.role, capabilities = excluded.capabilities;
    return 'granted';
  else
    insert into public.kolis_admin_invites(email, role, capabilities, invited_by)
    values (lower(p_email), p_role, coalesce(p_caps,'{}'), auth.uid())
    on conflict (email) do update set role = excluded.role, capabilities = excluded.capabilities;
    return 'pending';
  end if;
end; $$;

create or replace function public.kolis_claim_admin_invite() returns text
  language plpgsql security definer set search_path to 'public' as $$
declare v_email text; v_role text; v_caps text[];
begin
  select email into v_email from public.kolis_profiles where id = auth.uid();
  if v_email is null then return null; end if;
  select role, capabilities into v_role, v_caps from public.kolis_admin_invites where lower(email) = lower(v_email);
  if v_role is null then return null; end if;
  insert into public.kolis_admin_roles(user_id, role, capabilities, invited_email)
  values (auth.uid(), v_role, coalesce(v_caps,'{}'), v_email)
  on conflict (user_id) do update set role = excluded.role, capabilities = excluded.capabilities;
  delete from public.kolis_admin_invites where lower(email) = lower(v_email);
  return v_role;
end; $$;

create or replace function public.kolis_admin_revenue(p_from date default (date_trunc('month', now()))::date, p_to date default (now())::date)
  returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when not public.kolis_admin_has_cap('revenue') then null else jsonb_build_object(
    'from', p_from, 'to', p_to,
    'platform_fees_cents', (select coalesce(sum(platform_fee_cents),0) from public.kolis_payout_statements where created_at::date between p_from and p_to),
    'invoiced_cents',  (select coalesce(sum(total_cents),0) from public.kolis_invoices where status in ('open','paid') and created_at::date between p_from and p_to),
    'collected_cents', (select coalesce(sum(total_cents),0) from public.kolis_invoices where status='paid' and coalesce(paid_at, created_at)::date between p_from and p_to),
    'outstanding_cents', (select coalesce(sum(total_cents),0) from public.kolis_invoices where status='open'),
    'payouts_owed_cents', (select coalesce(sum(net_cents),0) from public.kolis_payout_statements where status <> 'paid'),
    'by_org', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('org_id', o.id, 'name', o.name,
          'invoiced_cents',   coalesce((select sum(total_cents) from public.kolis_invoices i where i.org_id=o.id and i.status in ('open','paid') and i.created_at::date between p_from and p_to),0),
          'outstanding_cents',coalesce((select sum(total_cents) from public.kolis_invoices i where i.org_id=o.id and i.status='open'),0),
          'fees_cents',       coalesce((select sum(platform_fee_cents) from public.kolis_payout_statements s where s.org_id=o.id and s.created_at::date between p_from and p_to),0)
        ) as x
        from public.kolis_orgs o order by o.name
      ) t), '[]'::jsonb)
  ) end;
$$;

grant execute on function public.kolis_admin_all_caps() to authenticated;
grant execute on function public.kolis_admin_caps() to authenticated;
grant execute on function public.kolis_admin_has_cap(text) to authenticated;
grant execute on function public.kolis_admin_set_caps(uuid, text[]) to authenticated;
grant execute on function public.kolis_admin_invite(text, text, text[]) to authenticated;
grant execute on function public.kolis_admin_team() to authenticated;
grant execute on function public.kolis_admin_revenue(date, date) to authenticated;
revoke all on function public.kolis_admin_set_caps(uuid, text[]) from anon, public;
revoke all on function public.kolis_admin_invite(text, text, text[]) from anon, public;
revoke all on function public.kolis_admin_revenue(date, date) from anon, public;
