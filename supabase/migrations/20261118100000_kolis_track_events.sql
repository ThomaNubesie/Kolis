-- Public journey timeline for the tracking page / sender app (customer design:
-- timeline + "Suivi en direct" button).
--
-- KL codes are short and guessable, and kolis_track is public by code. So by code
-- alone this returns the steps (kind, city, time) — never photos. Photos and card
-- links come back only to someone holding the parcel's private token (it rides in
-- the SMS/email links: /track/KL-xxxx?t=<scan_token>) or to the signed-in sender.
create or replace function public.kolis_track_events(p_code text, p_token text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with p as (select * from public.kolis_parcels where upper(code) = upper(trim(p_code)) limit 1),
  ok as (select (p_token is not null and p_token = p.scan_token) or (auth.uid() is not null and auth.uid() = p.sender_id) as granted from p)
  select case when (select id from p) is null then null else jsonb_build_object(
    'full', (select granted from ok),
    'token', case when (select granted from ok) then (select scan_token from p) end,
    'events', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', case when (select granted from ok) then e.id end,
                 'kind', e.kind, 'city', e.city, 'at', e.created_at,
                 'photo', case when (select granted from ok) then e.photo_url end)
               order by e.created_at)
               from public.kolis_parcel_events e where e.parcel_id = (select id from p)), '[]'::jsonb)
  ) end;
$$;
grant execute on function public.kolis_track_events(text, text) to anon, authenticated;
