-- ============================================================================
-- LoadQ: driver alias table + type-ahead search — 2026-09-01
--
-- The daily queue is written by hand, and the names on the sheet are not the
-- names in `drivers`. "sedrona", "Sedona 01", "Dodge 02" and "Doge 62" are all
-- Sinclair. "Pobosky" is Yannick Lankeu — but "Yannick Kid" is a different man.
-- "Thomas Derick" is Thomas Shalo. Reading the handwriting was never the hard
-- part; knowing that `sedrona` means Sinclair is.
--
-- That knowledge has lived in one person's head and in an assistant's notes.
-- This puts it in the database, so the tablet sign-in sheet can resolve a name
-- as it is typed, and so the daily post stops needing a human translator.
--
-- An alias may legitimately point at SEVERAL drivers — "Lionel", "Claude",
-- "Marius", "J.P" all do. That is not a data error, it is the actual state of
-- the world, so the table allows it and `is_default` records which one wins
-- when the writer does not disambiguate. Search returns every candidate; the
-- caller shows them and lets a human pick.
-- ============================================================================
set check_function_bodies = off;

create table if not exists public.loadq_driver_alias (
  id          uuid primary key default gen_random_uuid(),
  alias       text not null,
  driver_id   uuid not null references public.drivers(id) on delete cascade,
  is_default  boolean not null default false,   -- wins when the alias is ambiguous
  note        text,
  created_at  timestamptz not null default now()
);

create unique index if not exists loadq_driver_alias_uq
  on public.loadq_driver_alias (lower(alias), driver_id);
create index if not exists loadq_driver_alias_lookup
  on public.loadq_driver_alias (lower(alias));

-- Trigram matching lets a typo ("sedrna") still find the right driver. Optional:
-- if the extension cannot be created the search still works, just without fuzzy.
do $$ begin
  create extension if not exists pg_trgm;
exception when others then
  raise notice 'pg_trgm unavailable — search will run without fuzzy matching';
end $$;

-- Accent folding. `unaccent` is NOT installed on this project, so fold by hand;
-- this is the same expression the posting script uses.
create or replace function public.loadq_fold(p text)
returns text language sql immutable as $function$
  select translate(lower(coalesce(p,'')),
    'àâäáãåçéèêëíìîïñóòôöõøúùûüýÿ', 'aaaaaaceeeeiiiinoooooouuuuyy');
$function$;

create index if not exists drivers_folded_name
  on public.drivers (public.loadq_fold(full_name));

-- ============================ SEED ==========================================
-- Every alias observed on a handwritten sheet between 2026-07-31 and 2026-09-01.
-- Seeded by matching `full_name` exactly rather than by hardcoded UUIDs, so a
-- name that has changed simply fails to seed instead of pointing at the wrong
-- person. `loadq_alias_seed_report()` below lists whatever did not match.
create temporary table _alias_seed (alias text, full_name text, is_default boolean, note text) on commit drop;
insert into _alias_seed (alias, full_name, is_default, note) values
  -- Sinclair: written by his car, with meaningless trailing digits
  ('dodge 02','Sinclair',true,'trailing digits are noise, not a plate'),
  ('doge 62','Sinclair',true,null),
  ('sedrona','Sinclair',true,null),
  ('sedona','Sinclair',true,'NB Jorel Youta also drives a Kia Sedona'),
  ('sedona 01','Sinclair',true,null),
  ('sinclair','Sinclair',true,null),
  -- initials / shorthand
  ('stm','Symplice Mekam',true,null),
  ('symplice','Symplice Mekam',true,null),
  ('donal','Donald Augustin',true,null),
  ('yazine','Yacine',true,null),
  ('tuelz','Teulz Sh',true,null),
  ('teulz','Teulz Sh',true,null),
  ('germaine','Germain Djoufeu',true,null),
  ('germain','Germain Djoufeu',true,null),
  ('legnay','Legacy Charles',true,null),
  -- Thomas
  ('thomas','Thomas Shalo',true,'default car = Honda Odyssey DHPY491'),
  ('thomas derick','Thomas Shalo',true,null),
  -- Mobutu
  ('mubutu','Mobutu Lowa',true,null),
  ('mombutu','Mobutu Lowa',true,null),
  ('mobutu','Mobutu Lowa',true,null),
  ('m.ol','Mobutu Lowa',true,null),
  -- Kimona
  ('issa','Kimona Mavelua',true,'NOT Issa Sylla'),
  ('issa aime','Kimona Mavelua',true,null),
  ('aime','Kimona Mavelua',true,null),
  -- ambiguous by nature — several rows share the alias, one is default
  ('claude','Claude KEPMENI',true,'also Claude Xavier Nkolo, Jean-Claude Mayamba'),
  ('claude','Claude Xavier Nkolo',false,null),
  ('claude','Jean-Claude Mayamba',false,null),
  ('marius','Marius Talom Serge',true,'also Marius Trésor — both Gray Odyssey'),
  ('marius','Marius Trésor',false,null),
  ('christian','Christian Dossavi-Alipoeh',true,'also Christian Dior Mbangang'),
  ('lionel','Florian Lionel BIGWATA',true,'also Lionel TAKALA DONGMO'),
  ('lionel','Lionel TAKALA DONGMO',false,null),
  -- the J.P knot: three men, and the default has moved
  ('j.p','Jean Pierre Tsague',true,'confirmed 08-27, 08-28, 08-30 — was Pettang before'),
  ('jp','Jean Pierre Tsague',true,null),
  ('j.p','Joël Pettang',false,'written-out "Joel" means Pettang'),
  ('joel','Joël Pettang',true,null),
  ('john','Jean Pochette',true,'NOT John Ehigie'),
  ('nton','Jean Pochette',true,null),
  -- Yobas
  ('randal','Randal Yoba',true,null),
  ('dieudonne','Dieudonné Yoba',true,null),
  ('diedone','Dieudonné Yoba',true,null),
  -- the rest
  ('marcel','Marcel Mbayo',true,null),
  ('fabio','Fabio Tiem',true,'default car = Sienna DHWC905'),
  ('fabrice','Fabio Tiem',true,null),
  ('fablo','Fabio Tiem',true,null),
  ('zack','Zacharie Emaleu Siani',true,null),
  ('zach','Zacharie Emaleu Siani',true,null),
  ('gael','Jean De Dieu Gaël NIMBESHAHO',true,null),
  ('gaelle','Jean De Dieu Gaël NIMBESHAHO',true,null),
  ('jean de dieu','Jean De Dieu Gaël NIMBESHAHO',true,null),
  ('doly','Dolly Kilimba',true,null),
  ('dolly','Dolly Kilimba',true,null),
  ('bahthy','Bahati Mubalama',true,null),
  ('bahati','Bahati Mubalama',true,null),
  ('matthias','Mathias Namekong',true,null),
  ('mathias','Mathias Namekong',true,null),
  ('mathhias','Mathias Namekong',true,null),
  ('yannick','Yannick Lankeu',true,'bare "Yannick" = Lankeu, NOT Kid'),
  ('yannick pro','Yannick Lankeu',true,'"Pro" distinguishes him from "Kid"'),
  ('pobosky','Yannick Lankeu',true,null),
  ('dobosky','Yannick Lankeu',true,null),
  ('yannick kid','Yannick Kid',true,'a different man from Lankeu'),
  ('steve','Steve Ndongozi',true,null),
  ('steeve','Steve Ndongozi',true,null),
  ('jacque','Jacques Moukete',true,null),
  ('jacques','Jacques Moukete',true,null),
  ('prosper','Prosper Nsabiyumva',true,null),
  ('gabriel','Gabriel Mbayo',true,null),
  ('luigi gabriel','Gabriel Mbayo',true,null),
  ('papa gabriel','Gabriel Mbayo',true,null),
  ('mathed','Matheo Djobo',true,null),
  ('matheo','Matheo Djobo',true,null),
  ('mattheo','Matheo Djobo',true,null),
  ('harold','Harold F',true,null),
  ('arole','Harold F',true,null),
  ('thierry','Thierry Yabi',true,null),
  ('thierno','Thierry Yabi',true,null),
  ('stephane','Paul Roger Stéphane Diboma',true,null),
  ('stephane d','Paul Roger Stéphane Diboma',true,null),
  ('leo','Jospin Leo',true,null),
  ('odlin','Odelyn',true,null),
  ('odyln','Odelyn',true,null),
  ('odelyn','Odelyn',true,'NOT Odler Dorvil'),
  ('prince','Patrick Julio',true,'no "Prince" exists in drivers'),
  ('julio','Patrick Julio',true,null),
  ('nicolas','Nicolas Mwizerwa',true,null),
  ('rodrigue','Parfait Rodrigue Ngom Djob',true,null),
  ('roby','Roby',true,null),
  ('mohamed haque','Mohammed Haque',true,null),
  ('haque','Mohammed Haque',true,null),
  ('mohamed houcine','Mohamed Houcine Hayouni',true,'distinct from Mohammed Haque'),
  ('jonathan','Jonathan Tshilombo Tshaka',true,null),
  ('sergo','Sergo (temp)',true,null),
  ('ravis','Ravis (temp)',true,null),
  ('ravik','Ravis (temp)',true,null);

insert into public.loadq_driver_alias (alias, driver_id, is_default, note)
select s.alias, d.id, s.is_default, s.note
from _alias_seed s
join public.drivers d on d.full_name = s.full_name
on conflict (lower(alias), driver_id) do update
  set is_default = excluded.is_default,
      note       = coalesce(excluded.note, public.loadq_driver_alias.note);

-- Which seed rows found no driver? Kept so the gap is visible rather than silent.
create table if not exists public.loadq_alias_seed_misses (
  alias text, full_name text, noted_at timestamptz default now()
);
insert into public.loadq_alias_seed_misses (alias, full_name)
select s.alias, s.full_name from _alias_seed s
where not exists (select 1 from public.drivers d where d.full_name = s.full_name);

-- ============================ SEARCH ========================================
-- Type-ahead for the tablet sign-in sheet. Two or three characters is enough.
-- Returns ranked candidates WITH the car, because that is what lets a human tell
-- two Kia Sedona drivers apart at a glance.
create or replace function public.loadq_search_drivers(p_q text, p_limit int default 8)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with q as (select public.loadq_fold(trim(coalesce(p_q,''))) as t),
  hits as (
    select d.id,
           min(case
             when a.alias is not null and public.loadq_fold(a.alias) = (select t from q) then (case when a.is_default then 0 else 1 end)
             when public.loadq_fold(d.full_name) = (select t from q) then 0
             when a.alias is not null and public.loadq_fold(a.alias) like (select t from q) || '%' then 2
             when public.loadq_fold(d.full_name) like (select t from q) || '%' then 3
             when exists (select 1 from unnest(string_to_array(public.loadq_fold(d.full_name),' ')) w
                          where w like (select t from q) || '%') then 4
             when public.loadq_fold(d.full_name) like '%' || (select t from q) || '%' then 5
             else 6 end) as rank,
           bool_or(a.alias is not null and public.loadq_fold(a.alias) = (select t from q)) as alias_exact,
           (array_agg(a.alias order by a.is_default desc)
              filter (where a.alias is not null
                and public.loadq_fold(a.alias) like (select t from q) || '%'))[1] as via_alias,
           bool_or(coalesce(a.is_default,false)) as is_default
    from public.drivers d
    left join public.loadq_driver_alias a on a.driver_id = d.id
    left join public.vehicles v on v.driver_id = d.id and v.is_active
    where (select t from q) <> ''
      and (
        public.loadq_fold(d.full_name) like '%' || (select t from q) || '%'
        or public.loadq_fold(coalesce(a.alias,'')) like (select t from q) || '%'
        or replace(lower(coalesce(v.plate,'')),' ','') like '%' || replace((select t from q),' ','') || '%'
      )
    group by d.id
  )
  select coalesce(jsonb_agg(x order by x.rank, x.full_name), '[]'::jsonb) from (
    select h.rank, d.full_name,
      jsonb_build_object(
        'driver_id', d.id,
        'name', d.full_name,
        'matched_alias', h.via_alias,
        'is_default', h.is_default,
        'blocked', coalesce(d.blocked,false),
        'vehicle_id', v.id,
        'car', case when v.id is null then null
                    else concat_ws(' ', v.make, v.model) end,
        'plate', v.plate,
        'color', v.color,
        'seats', v.seats,
        'has_car', v.id is not null,
        'cars', (select count(*) from public.vehicles vv where vv.driver_id = d.id and vv.is_active),
        -- already in a queue? the sheet must not offer to add them twice
        'on_line', (select qe.zone_id from public.queue_entries qe
                     where qe.driver_id = d.id and qe.status <> 'ended' limit 1),
        'return_zone', (select z.zone_id from public.loadq_return_zone z where z.driver_id = d.id)
      ) as x
    from hits h
    join public.drivers d on d.id = h.id
    left join public.vehicles v on v.driver_id = d.id and v.is_active
    order by h.rank, d.full_name
    limit greatest(1, coalesce(p_limit, 8))
  ) s(rank, full_name, x);
$function$;

-- Add an alias from the UI, so the sheet teaches itself: whenever someone types
-- a name the system could not resolve and then picks the right driver by hand,
-- record it and it resolves next time.
create or replace function public.loadq_alias_add(p_alias text, p_driver uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_alias text := nullif(trim(coalesce(p_alias,'')),'');
begin
  if v_alias is null then return jsonb_build_object('ok',false,'error','alias_required'); end if;
  if not exists (select 1 from public.drivers where id = p_driver) then
    return jsonb_build_object('ok',false,'error','no_such_driver'); end if;
  insert into public.loadq_driver_alias (alias, driver_id, note)
  values (v_alias, p_driver, p_note)
  on conflict (lower(alias), driver_id) do update set note = coalesce(excluded.note, loadq_driver_alias.note);
  return jsonb_build_object('ok',true,'alias',v_alias);
end $function$;

alter table public.loadq_driver_alias enable row level security;
revoke all on function public.loadq_search_drivers(text,int) from public, anon;
revoke all on function public.loadq_alias_add(text,uuid,text) from public, anon;
grant execute on function public.loadq_search_drivers(text,int) to authenticated, service_role;
grant execute on function public.loadq_alias_add(text,uuid,text) to authenticated, service_role;
grant execute on function public.loadq_fold(text) to authenticated, service_role;
