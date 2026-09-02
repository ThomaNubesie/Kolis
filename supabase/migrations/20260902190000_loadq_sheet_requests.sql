-- ============================================================================
-- LoadQ: put waiting ride requests on the sheet — 2026-09-02
--
-- On 1 September a customer booked a pickup to Montréal from Universal Grocery
-- and nobody saw it. Not the drivers, not the writer, not Thomas. It sat at
-- status 'requested' with no fare and no offer, and the only reason we know
-- about it now is that he asked.
--
-- `loadq_ride_requests` has never been surfaced anywhere in the tablet or the
-- board. This is the read side of fixing that: one call the sheet makes
-- alongside `loadq_sheet`, returning the people waiting for a car on this line
-- and — the part that matters — WHY each one is stuck.
--
-- The stall codes are deliberately blunt, because the honest answer is often
-- that the request cannot move at all:
--
--   unmatched         no departure zone: the quote never matched a route, so
--                     no driver will ever be offered it
--   no_quote          matched but never priced — the rider was sent to pick a
--                     meeting point and did not, and nothing was persisted
--   awaiting_interac  priced, but loadq-ride-cascade skips interac requests
--                     until payment_status = 'paid'. Nothing dispatches. This
--                     is the state that has held every route pickup to date.
--   awaiting_card     priced, card not authorised yet
--   offered           a driver has it in front of them right now
--   no_driver         paid and ready, waiting for a driver to be offered it
--
-- `blocks_dispatch` is true when the cascade will not pick the request up as
-- things stand — it is not a delay, it is a stop. The sheet should say so
-- rather than showing a hopeful spinner.
--
-- Unmatched requests carry no zone, so they would belong to no sheet at all.
-- They are returned on every sheet whose destination matches, flagged
-- `unmatched`, because a request nobody owns is exactly the one that gets lost.
-- ============================================================================
set check_function_bodies = off;

create or replace function public.loadq_sheet_requests(p_zone text, p_dest text)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select case
    when not public.loadq_can_write_list(p_zone) then '[]'::jsonb
    else coalesce(jsonb_agg(x order by created_at), '[]'::jsonb)
  end
  from (
    select r.created_at,
      jsonb_build_object(
        'request_id', r.id, 'kind', r.kind, 'status', r.status,
        'passenger_id', r.passenger_id,
        'name', coalesce(p.full_name, 'Passager'),
        'phone', p.phone, 'email', p.email,
        'pickup', coalesce(nullif(r.pickup_label,''), nullif(r.origin_address,''), 'Adresse non précisée'),
        'dest_address', r.dest_address,
        'seats', coalesce(r.seats, 1),
        'off_route_km', r.off_route_km,
        'fare_cents', r.fare_cents, 'pay_ref', r.pay_ref,
        'payment_method', r.payment_method, 'payment_status', r.payment_status,
        'scheduled_date', r.scheduled_date,
        'created_at', r.created_at,
        'waiting_minutes', round(extract(epoch from (now() - r.created_at)) / 60)::int,
        'unmatched', r.departure_zone_id is null,
        'driver_id', r.driver_id,
        'driver_name', (select d.full_name from public.drivers d where d.id = r.driver_id),
        'stall', case
          when r.departure_zone_id is null                    then 'unmatched'
          when r.fare_cents is null                           then 'no_quote'
          when exists (select 1 from public.loadq_ride_offers o
                        where o.request_id = r.id and o.status = 'offered'
                          and o.expires_at > now())           then 'offered'
          when r.payment_method = 'interac'
           and coalesce(r.payment_status,'') <> 'paid'        then 'awaiting_interac'
          when r.payment_method = 'card'
           and coalesce(r.payment_status,'') <> 'paid'        then 'awaiting_card'
          else 'no_driver'
        end,
        -- true when nothing will move this on its own
        'blocks_dispatch', (
          r.departure_zone_id is null
          or r.fare_cents is null
          or (coalesce(r.payment_status,'') <> 'paid'
              and coalesce(r.payment_method,'') in ('interac','card'))
        ),
        'offers_made', (select count(*) from public.loadq_ride_offers o where o.request_id = r.id)
      ) as x
    from public.loadq_ride_requests r
    left join public.passengers p on p.id = r.passenger_id
    where r.status not in ('cancelled','expired','completed','picked_up')
      and coalesce(r.dest_region,'') = coalesce(p_dest,'')
      and (r.departure_zone_id = p_zone or r.departure_zone_id is null)
      -- a scheduled trip is not late until its own day
      and (r.scheduled_date is null or r.scheduled_date <= current_date)
  ) s;
$function$;

revoke all on function public.loadq_sheet_requests(text,text) from public, anon;
grant execute on function public.loadq_sheet_requests(text,text) to authenticated, service_role;
