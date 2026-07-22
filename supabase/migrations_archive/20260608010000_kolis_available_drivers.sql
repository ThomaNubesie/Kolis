-- Sender-facing list of available LoadQ drivers for a route, exposed through a
-- Kolis-namespaced security-definer function so senders never read LoadQ's
-- drivers table directly. Returns only minimal, PII-safe fields (first name +
-- last initial). Additive — does not touch LoadQ objects.
create or replace function public.kolis_available_drivers(p_zone_id text, p_dest_region text)
returns table (
  driver_id uuid,
  display_name text,
  avatar_url text,
  trust_score int,
  verified boolean,
  queue_position int,
  seats_available int,
  queued_minutes int
)
language sql
security definer
set search_path = public
as $$
  select
    qe.driver_id,
    coalesce(nullif(split_part(d.full_name, ' ', 1), ''), 'Driver')
      || case when length(split_part(d.full_name, ' ', 2)) > 0
              then ' ' || left(split_part(d.full_name, ' ', 2), 1) || '.'
              else '' end as display_name,
    d.avatar_url,
    d.trust_score,
    coalesce(d.verified, false) as verified,
    qe.position,
    greatest(0, coalesce(qe.seats_locked, 0) - coalesce(qe.seats_boarded, 0)) as seats_available,
    floor(extract(epoch from (now() - qe.joined_at)) / 60)::int as queued_minutes
  from public.queue_entries qe
  join public.drivers d on d.id = qe.driver_id
  where qe.destination_region = p_dest_region
    and (p_zone_id is null or qe.zone_id = p_zone_id)
    and qe.end_reason is null
    and coalesce(d.blocked, false) = false
  order by qe.position nulls last, qe.joined_at;
$$;

grant execute on function public.kolis_available_drivers(text, text) to authenticated;
