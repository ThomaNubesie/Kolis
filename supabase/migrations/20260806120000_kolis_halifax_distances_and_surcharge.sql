-- Halifax (Nova Scotia): real road distances in kolis_route_km + a 30% price
-- premium on any route touching Halifax, applied in kolis_estimate_price_cents
-- (kolis_org_price_cents inherits it via fallback). Kept in sync with the app
-- (constants/pricing.ts). Applied to prod via MCP.
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
    when 'ottawa-sudbury' then 480 when 'sudbury-toronto' then 390 when 'montreal-sudbury' then 680
    when 'kingston-sudbury' then 530 when 'gatineau-sudbury' then 470 when 'quebec-sudbury' then 930
    when 'sudbury-trois-rivieres' then 800 when 'sherbrooke-sudbury' then 830 when 'chicoutimi-sudbury' then 900
    when 'moncton-sudbury' then 1600
    -- Halifax (Nova Scotia / Maritimes)
    when 'chicoutimi-halifax' then 1250 when 'gatineau-halifax' then 1450 when 'halifax-kingston' then 1650
    when 'halifax-moncton' then 260 when 'halifax-montreal' then 1250 when 'halifax-ottawa' then 1450
    when 'halifax-quebec' then 1050 when 'halifax-sherbrooke' then 1050 when 'halifax-sudbury' then 1900
    when 'halifax-toronto' then 1800 when 'halifax-trois-rivieres' then 1150
    -- Eastern Ontario (Ottawa-anchored)
    when 'arnprior-ottawa' then 55 when 'carleton-ottawa' then 50 when 'ottawa-renfrew' then 100
    when 'ottawa-pembroke' then 150 when 'deep-ottawa' then 200 when 'bancroft-ottawa' then 230
    when 'belleville-ottawa' then 270 when 'north-ottawa' then 360
    -- GTA / Central Ontario (Toronto-anchored)
    when 'barrie-toronto' then 90 when 'oshawa-toronto' then 60 when 'toronto-whitby' then 55
    when 'pickering-toronto' then 45 when 'ajax-toronto' then 50 when 'markham-toronto' then 35
    when 'toronto-vaughan' then 30 when 'brampton-toronto' then 40 when 'mississauga-toronto' then 30
    when 'aurora-toronto' then 50 when 'newmarket-toronto' then 55 when 'richmond-toronto' then 35
    when 'bradford-toronto' then 65 when 'angus-toronto' then 110 when 'orillia-toronto' then 135
    when 'bracebridge-toronto' then 180 when 'gravenhurst-toronto' then 170 when 'elmvale-toronto' then 140
    when 'stouffville-toronto' then 55 when 'peterborough-toronto' then 130 when 'quinte-toronto' then 185
    -- Southwestern Ontario (Toronto-anchored)
    when 'acton-toronto' then 75 when 'kitchener-toronto' then 110 when 'toronto-waterloo' then 115
    when 'cambridge-toronto' then 100 when 'guelph-toronto' then 100 when 'brantford-toronto' then 110
    when 'burlington-toronto' then 60 when 'toronto-woodstock' then 145 when 'london-toronto' then 190
    when 'sarnia-toronto' then 290 when 'niagara-toronto' then 130
    -- Québec
    when 'alma-quebec' then 210 when 'baie-comeau-quebec' then 420 when 'baie-saint-paul-quebec' then 100
    when 'forestville-quebec' then 430 when 'laurier-station-quebec' then 50 when 'quebec-riviere-du-loup' then 200
    when 'quebec-tadoussac' then 210 when 'levis-quebec' then 10 when 'montreal-saint-constant' then 30
    when 'longueuil-montreal' then 15 when 'drummondville-montreal' then 100
    else 250 end;
end; $function$;

create or replace function public.kolis_estimate_price_cents(p_size text, p_drop text, p_from text, p_to text)
returns integer language plpgsql immutable set search_path to 'public' as $function$
declare km int; base numeric; mult numeric; surcharge numeric;
begin
  km := public.kolis_route_km(p_from, p_to);
  base := case when p_drop = 'door' then 5 + 0.20*km else 10 + 0.10*km end;
  mult := case p_size when 'envelope' then 0.75 when 'large' then 1.6 else 1.0 end;
  surcharge := case when public.kolis_region_code(p_from) = 'halifax' or public.kolis_region_code(p_to) = 'halifax' then 1.3 else 1.0 end;
  return (round(base * mult * surcharge))::int * 100;
end; $function$;
