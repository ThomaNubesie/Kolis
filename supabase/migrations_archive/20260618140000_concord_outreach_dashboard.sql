-- Staff-facing read + status-control RPCs for the Concord outreach campaign.
create or replace function public.concord_outreach_dashboard()
returns table(business_name text, email text, status text, touch_count int,
  initial_sent_at timestamptz, last_sent_at timestamptz, next_due_at timestamptz,
  opened_at timestamptz, clicked_at timestamptz, bounced_at timestamptz,
  opens bigint, clicks bigint)
language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(public.kolis_is_staff(), false) then raise exception 'forbidden'; end if;
  return query
    select o.business_name, o.email, o.status, o.touch_count, o.initial_sent_at, o.last_sent_at, o.next_due_at,
      o.opened_at, o.clicked_at, o.bounced_at,
      (select count(*) from public.concord_outreach_events e where e.email = o.email and e.type = 'opened'),
      (select count(*) from public.concord_outreach_events e where e.email = o.email and e.type = 'clicked')
    from public.concord_outreach o order by o.created_at desc;
end; $$;

create or replace function public.concord_outreach_set_status(p_email text, p_status text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(public.kolis_is_staff(), false) then raise exception 'forbidden'; end if;
  if p_status not in ('active','replied','stopped','done') then raise exception 'bad status'; end if;
  update public.concord_outreach
    set status = p_status, next_due_at = case when p_status = 'active' then next_due_at else null end
    where email = lower(p_email);
end; $$;

grant execute on function public.concord_outreach_dashboard() to authenticated;
grant execute on function public.concord_outreach_set_status(text, text) to authenticated;
