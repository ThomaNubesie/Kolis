-- Phase 4: deliveries log read RPC + per-minute webhook dispatch cron.
create or replace function public.kolis_org_webhook_deliveries(p_org uuid)
returns table(id uuid, event text, status text, attempts int, response_code int, url text, created_at timestamptz)
language plpgsql security definer set search_path to 'public' stable as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  return query select d.id, d.event, d.status, d.attempts, d.response_code, w.url, d.created_at
    from public.kolis_webhook_deliveries d join public.kolis_webhook_endpoints w on w.id = d.endpoint_id
    where w.org_id = p_org order by d.created_at desc limit 50;
end; $$;
grant execute on function public.kolis_org_webhook_deliveries(uuid) to authenticated;
revoke execute on function public.kolis_org_webhook_deliveries(uuid) from public, anon;

do $$ begin perform cron.unschedule('kolis-webhook-dispatch'); exception when others then null; end $$;
select cron.schedule('kolis-webhook-dispatch', '* * * * *', $cron$
  select net.http_post(
    url := 'https://kzjptcpjpwlxfofzhyku.functions.supabase.co/kolis-webhook-dispatch',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb) $cron$);
