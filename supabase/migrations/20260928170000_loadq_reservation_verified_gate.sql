-- LoadQ reservation trips: verified-driver gate
--
-- Incident 2026-09-28: an UNVERIFIED driver (Anderson zatia) claimed and
-- bogus-completed a paid, future-scheduled reservation (Montréal→Ottawa, Oct 8)
-- within 4 minutes of creating his account. The queue already blocks unverified
-- drivers (queue_entries_require_eligible), but the on-demand + scheduled
-- RESERVATION claim paths did not. This adds the gate to both.
--
-- A driver may claim/accept a reservation only if verified = true AND not blocked.

-- Scheduled reservations: board claim
CREATE OR REPLACE FUNCTION public.loadq_scheduled_claim(p_request uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_driver uuid := auth.uid(); v_ok boolean;
begin
  if not exists (select 1 from public.drivers where id=v_driver) then
    return jsonb_build_object('ok', false, 'error', 'not_a_driver');
  end if;
  if not exists (select 1 from public.drivers where id=v_driver and verified is true and coalesce(blocked,false)=false) then
    return jsonb_build_object('ok', false, 'error', 'not_verified');
  end if;
  update public.loadq_ride_requests
     set driver_id=v_driver, status='assigned', updated_at=now()
   where id=p_request and kind='scheduled' and driver_id is null and payment_status='paid'
     and status not in ('cancelled','expired','completed')
   returning true into v_ok;
  if v_ok is null then return jsonb_build_object('ok', false, 'error', 'already_taken'); end if;
  perform public._loadq_notify_scheduled(p_request, 'assigned');
  return jsonb_build_object('ok', true, 'request_id', p_request);
end $function$;

-- On-demand reservations: driver accepts an offer
CREATE OR REPLACE FUNCTION public.loadq_ride_offer_respond(p_offer_id uuid, p_accept boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid(); o public.loadq_ride_offers;
begin
  select * into o from public.loadq_ride_offers where id=p_offer_id;
  if o.id is null then raise exception 'offer not found'; end if;
  if o.driver_id <> uid then raise exception 'not your offer'; end if;
  if o.status <> 'offered' or o.expires_at <= now() then raise exception 'offer no longer available'; end if;
  if p_accept then
    if not exists (select 1 from public.drivers where id=uid and verified is true and coalesce(blocked,false)=false) then
      raise exception 'driver not verified';
    end if;
    update public.loadq_ride_offers set status='accepted', responded_at=now() where id=p_offer_id;
    update public.loadq_ride_offers set status='superseded'
      where request_id=o.request_id and id<>p_offer_id and status='offered';
    update public.loadq_ride_requests set status='assigned', driver_id=uid where id=o.request_id;
    return jsonb_build_object('accepted',true,'request_id',o.request_id);
  else
    update public.loadq_ride_offers set status='declined', responded_at=now() where id=p_offer_id;
    return jsonb_build_object('accepted',false,'request_id',o.request_id);
  end if;
end $function$;
