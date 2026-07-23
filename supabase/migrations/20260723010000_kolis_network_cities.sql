-- Expand the Kolis delivery network with additional Ontario + Québec cities.
-- Ontario cities already resolve to ON (city_province defaults to ON), so only
-- the new Québec cities need explicit province mapping (else they'd bill ON tax).
-- Distances are approximate road km, anchored to the nearest hub; unlisted pairs
-- fall back to the 250 km default.

create or replace function public.kolis_city_province(p_city text)
returns text language sql immutable set search_path to 'public' as $function$
  select case public.kolis_region_code(p_city)
    -- Ontario
    when 'ottawa' then 'ON' when 'kingston' then 'ON' when 'toronto' then 'ON'
    when 'mississauga' then 'ON' when 'hamilton' then 'ON' when 'london' then 'ON'
    when 'kitchener' then 'ON' when 'waterloo' then 'ON' when 'cambridge' then 'ON'
    when 'guelph' then 'ON' when 'windsor' then 'ON' when 'barrie' then 'ON'
    when 'oshawa' then 'ON' when 'brampton' then 'ON' when 'markham' then 'ON'
    when 'vaughan' then 'ON' when 'scarborough' then 'ON' when 'etobicoke' then 'ON'
    when 'kanata' then 'ON' when 'nepean' then 'ON' when 'orleans' then 'ON'
    when 'gloucester' then 'ON' when 'cornwall' then 'ON' when 'brockville' then 'ON'
    when 'belleville' then 'ON' when 'peterborough' then 'ON' when 'niagara' then 'ON'
    when 'sudbury' then 'ON' when 'richmond' then 'ON' when 'ajax' then 'ON' when 'whitby' then 'ON'
    -- Quebec
    when 'gatineau' then 'QC' when 'montreal' then 'QC' when 'quebec' then 'QC'
    when 'sherbrooke' then 'QC' when 'laval' then 'QC' when 'longueuil' then 'QC'
    when 'levis' then 'QC' when 'terrebonne' then 'QC' when 'drummondville' then 'QC'
    when 'granby' then 'QC' when 'trois-rivieres' then 'QC' when 'saguenay' then 'QC'
    when 'brossard' then 'QC' when 'repentigny' then 'QC' when 'saint-jerome' then 'QC'
    when 'alma' then 'QC' when 'baie-comeau' then 'QC' when 'baie-saint-paul' then 'QC'
    when 'forestville' then 'QC' when 'laurier-station' then 'QC' when 'riviere-du-loup' then 'QC'
    when 'saint-constant' then 'QC' when 'tadoussac' then 'QC'
    -- Other provinces (majors)
    when 'vancouver' then 'BC' when 'victoria' then 'BC' when 'burnaby' then 'BC' when 'surrey' then 'BC'
    when 'calgary' then 'AB' when 'edmonton' then 'AB'
    when 'winnipeg' then 'MB' when 'regina' then 'SK' when 'saskatoon' then 'SK'
    when 'halifax' then 'NS' when 'moncton' then 'NB' when 'fredericton' then 'NB'
    when 'charlottetown' then 'PE'
    else 'ON' end;  -- unknown destination -> default ON
$function$;

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
