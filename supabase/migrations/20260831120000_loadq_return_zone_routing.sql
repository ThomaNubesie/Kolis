-- ============================================================================
-- LoadQ: honour the per-driver return zone in BOTH return paths — 2026-08-31
--
-- Drivers who run Ottawa→Montréal come back from one of two Montréal points:
--   Berri UQAM      montreal-berri-uquam-metro-station-sainte-catheri  (default)
--   Burger King     montreal-burger-king                               (Namur regulars)
--
-- `loadq_return_zone` (driver_id → zone_id) is the map. The problem: only ONE of
-- the two cron paths ever read it.
--
--   job 11  loadq_post_due_returns    reads loadq_return_zone          ✓
--   job 13  loadq_promote_ug_returns  HARDCODED Berri, ignored the map ✗
--
-- Job 13 is the one that actually fires for UG departures (3h after they leave),
-- so every Namur regular was being reposted to Berri regardless of the map. This
-- rewrites it to resolve each driver's zone the same way job 11 does.
--
-- Note it only ever APPENDS to the target line (position = max+1) and skips a
-- driver already queued there — the Burger King line is a standing roster and
-- must never be replaced or reordered by automation.
-- ============================================================================
set check_function_bodies = off;

create or replace function public.loadq_promote_ug_returns()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
  v_daystart timestamptz;
  v_pos int;
  v_zone text;
  v_added int := 0;
  c_ug    constant text := 'ottawa-universal-grocery';
  c_berri constant text := 'montreal-berri-uquam-metro-station-sainte-catheri';
begin
  -- current operating day = since the last end-of-day close (fallback 20h)
  v_daystart := coalesce((select max(ended_at) from public.loading_history where end_reason='eod_close'),
                         now() - interval '20 hours');
  for r in
    select lh.driver_id, lh.vehicle_id, max(lh.ended_at) as dep
    from public.loading_history lh
    where lh.zone_id = c_ug
      and lh.destination_region = 'montreal'
      and lh.end_reason = 'departed'
      and lh.ended_at >  v_daystart
      and lh.ended_at <= now() - interval '3 hours'
    group by lh.driver_id, lh.vehicle_id
  loop
    -- Where does THIS driver return from? Berri unless the map says otherwise.
    v_zone := coalesce((select zone_id from public.loadq_return_zone z where z.driver_id = r.driver_id),
                       c_berri);

    -- already sitting in that queue? or already ran that return after departing?
    if exists (select 1 from public.queue_entries qe
                where qe.zone_id = v_zone and qe.driver_id = r.driver_id) then
      continue;
    end if;
    if exists (select 1 from public.loading_history l2
                where l2.zone_id = v_zone and l2.driver_id = r.driver_id and l2.load_start_at >= r.dep) then
      continue;
    end if;

    -- APPEND ONLY — never renumber or displace an existing car on that line.
    select coalesce(max(position),0)+1 into v_pos from public.queue_entries where zone_id = v_zone;
    insert into public.queue_entries (zone_id, driver_id, vehicle_id, position, status, destination_region)
    values (v_zone, r.driver_id, r.vehicle_id, v_pos, 'waiting', 'ottawa');
    v_added := v_added + 1;
  end loop;
  return v_added;
end $function$;

-- ---------------------------------------------------------------------------
-- The Namur (Burger King) regulars, per Thomas 2026-08-31. Dolly, Gaël and
-- Symplice were already mapped; the other six were not, which is why they kept
-- landing at Berri. Idempotent: re-running just re-asserts the zone.
-- ---------------------------------------------------------------------------
insert into public.loadq_return_zone (driver_id, zone_id, note)
select d.id, 'montreal-burger-king', 'Namur regular (Thomas 2026-08-31)'
from public.drivers d
where d.full_name in (
  'Jean De Dieu Gaël NIMBESHAHO',   -- "Jean de dieu"
  'Dolly Kilimba',
  'Symplice Mekam',                 -- "STM"
  'Mobutu Lowa',                    -- "lowa"
  'Bahati Mubalama',
  'Mohammed Haque',                 -- "mohamed haque"
  'Gabriel Mbayo',
  'Yannick Kid',                    -- NOT Yannick Lankeu — different driver
  'Zacharie Emaleu Siani'           -- "zack"
)
on conflict (driver_id) do update
  set zone_id = excluded.zone_id,
      note    = excluded.note;
