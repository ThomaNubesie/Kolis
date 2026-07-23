-- Add Sudbury (Northern Ontario) road distances to the pricing engine so
-- shipments to/from Sudbury price on real km instead of the 250 km default.
-- (kolis_city_province already maps sudbury -> ON; region code is algorithmic.)
create or replace function public.kolis_route_km(p_from text, p_to text)
returns integer language plpgsql immutable set search_path to 'public' as $function$
declare a text; b text; k text;
begin
  a := public.kolis_region_code(p_from); b := public.kolis_region_code(p_to);
  if a is null or b is null or a = '' or b = '' or a = b then return 30; end if;
  k := case when a < b then a || '-' || b else b || '-' || a end;
  return case k
    when 'montreal-ottawa' then 200 when 'kingston-ottawa' then 195 when 'ottawa-toronto' then 450
    when 'gatineau-ottawa' then 20  when 'ottawa-quebec' then 480 when 'ottawa-trois-rivieres' then 360
    when 'ottawa-sherbrooke' then 380 when 'chicoutimi-ottawa' then 660 when 'moncton-ottawa' then 1100
    when 'montreal-quebec' then 250 when 'montreal-trois-rivieres' then 140 when 'montreal-toronto' then 540
    when 'kingston-montreal' then 290 when 'gatineau-montreal' then 200 when 'montreal-sherbrooke' then 150
    when 'chicoutimi-montreal' then 460 when 'moncton-montreal' then 1100
    when 'quebec-trois-rivieres' then 130 when 'chicoutimi-quebec' then 210 when 'quebec-sherbrooke' then 240
    when 'kingston-toronto' then 260
    -- Sudbury (Northern Ontario)
    when 'ottawa-sudbury' then 480 when 'sudbury-toronto' then 390 when 'montreal-sudbury' then 680
    when 'kingston-sudbury' then 530 when 'gatineau-sudbury' then 470 when 'quebec-sudbury' then 930
    when 'sudbury-trois-rivieres' then 800 when 'sherbrooke-sudbury' then 830 when 'chicoutimi-sudbury' then 900
    when 'moncton-sudbury' then 1600
    else 250 end;
end; $function$;
