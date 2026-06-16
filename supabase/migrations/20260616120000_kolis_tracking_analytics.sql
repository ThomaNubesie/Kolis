-- ── Public branded tracking: safe, anon-readable parcel status by code ──
create or replace function public.kolis_track(p_code text) returns jsonb
  language sql stable security definer set search_path to 'public' as $$
  select case when p.id is null then null else jsonb_build_object(
    'code', p.code,
    'status', p.status,
    'dropoff_type', p.dropoff_type,
    'from_city', p.from_city,
    'to_city', p.to_city,
    'created_at', p.created_at,
    'delivered_at', p.delivered_at,
    -- courier first name only once they're carrying it (no other PII, no addresses)
    'courier', case when p.status in ('picked_up','in_transit','dispatched','delivered')
                    then nullif(split_part(coalesce(d.full_name, p.external_driver_name, ''), ' ', 1), '') end
  ) end
  from (select * from public.kolis_parcels where upper(code) = upper(trim(p_code)) limit 1) p
  left join public.drivers d on d.id = p.driver_id;
$$;
revoke all on function public.kolis_track(text) from public;
grant execute on function public.kolis_track(text) to anon, authenticated;

-- ── Shipper analytics: aggregates for an org over a date range (member-gated) ──
create or replace function public.kolis_org_analytics(p_org uuid, p_from date default (now() - interval '30 days')::date, p_to date default now()::date)
  returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when coalesce(public.kolis_org_role(p_org), '') = '' then null else (
    with base as (
      select * from public.kolis_parcels
      where org_id = p_org and created_at::date between p_from and p_to
    )
    select jsonb_build_object(
      'from', p_from, 'to', p_to,
      'total',      (select count(*) from base),
      'delivered',  (select count(*) from base where status = 'delivered'),
      'in_transit', (select count(*) from base where status in ('matched','picked_up','in_transit','dispatched','received_at_hub')),
      'cancelled',  (select count(*) from base where status = 'cancelled'),
      'spend_cents',(select coalesce(sum(price_cents + coalesce(insurance_premium_cents,0)), 0) from base where status <> 'cancelled'),
      'avg_delivery_hours', (select round(avg(extract(epoch from (delivered_at - created_at)) / 3600.0)::numeric, 1)
                             from base where status = 'delivered' and delivered_at is not null),
      'same_day_pct', (select case when count(*) filter (where status='delivered') > 0
                          then round(100.0 * count(*) filter (where status='delivered' and delivered_at::date = created_at::date)
                                     / count(*) filter (where status='delivered'))
                          else null end from base),
      'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d)
                          from (select created_at::date d, count(*) c from base group by 1) t), '[]'::jsonb)
    )
  ) end;
$$;
revoke all on function public.kolis_org_analytics(uuid, date, date) from anon, public;
grant execute on function public.kolis_org_analytics(uuid, date, date) to authenticated;

-- ── Recipient notifications: ping an edge fn on meaningful status changes ──
create or replace function public.kolis_notify_recipient_trg() returns trigger
  language plpgsql security definer set search_path to 'public', 'net' as $$
begin
  if NEW.status is distinct from OLD.status and NEW.status in ('picked_up','in_transit','delivered') then
    perform net.http_post(
      url := 'https://kzjptcpjpwlxfofzhyku.supabase.co/functions/v1/kolis-notify-recipient',
      headers := jsonb_build_object('Content-Type','application/json','x-kolis-secret','kolis_notify_9f3a2c7b1e6d4084'),
      body := jsonb_build_object('parcel_id', NEW.id, 'status', NEW.status)
    );
  end if;
  return NEW;
end; $$;

drop trigger if exists kolis_parcels_notify_recipient on public.kolis_parcels;
create trigger kolis_parcels_notify_recipient after update of status on public.kolis_parcels
  for each row execute function public.kolis_notify_recipient_trg();
