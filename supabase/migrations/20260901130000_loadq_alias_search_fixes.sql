-- ============================================================================
-- LoadQ alias search — two fixes found on first run — 2026-09-01
--
-- 1. The seed joined `drivers.full_name = 'Fabio Tiem'` case-sensitively, but the
--    record is stored 'FABIO TIEM', so his three aliases silently did not seed.
--    Re-seed those case-insensitively.
-- 2. loadq_search_drivers had an ORDER BY scoping error: inside
--    jsonb_agg(x ORDER BY x.rank ...) `x` is the jsonb column, not the row, so
--    `x.rank` failed with "missing FROM-clause entry for table x". Order by the
--    subquery's own columns instead. The function was completely non-functional.
-- ============================================================================
set check_function_bodies = off;

insert into public.loadq_driver_alias (alias, driver_id, is_default, note)
select v.alias, d.id, true, v.note
from (values
  ('fabio',   'default car = Sienna DHWC905'),
  ('fabrice', 'Thomas writes Fabio as "Fabrice"'),
  ('fablo',   null)
) as v(alias, note)
join public.drivers d on public.loadq_fold(d.full_name) = public.loadq_fold('Fabio Tiem')
on conflict (lower(alias), driver_id) do update
  set is_default = excluded.is_default,
      note       = coalesce(excluded.note, public.loadq_driver_alias.note);

delete from public.loadq_alias_seed_misses
where exists (
  select 1 from public.loadq_driver_alias a
  join public.drivers d on d.id = a.driver_id
  where lower(a.alias) = lower(loadq_alias_seed_misses.alias)
    and public.loadq_fold(d.full_name) = public.loadq_fold(loadq_alias_seed_misses.full_name));

create or replace function public.loadq_search_drivers(p_q text, p_limit int default 8)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with q as (select public.loadq_fold(trim(coalesce(p_q,''))) as t),
  hits as (
    select d.id,
           min(case
             when a.alias is not null and public.loadq_fold(a.alias) = (select t from q)
               then (case when a.is_default then 0 else 1 end)
             when public.loadq_fold(d.full_name) = (select t from q) then 0
             when a.alias is not null and public.loadq_fold(a.alias) like (select t from q) || '%' then 2
             when public.loadq_fold(d.full_name) like (select t from q) || '%' then 3
             when exists (select 1 from unnest(string_to_array(public.loadq_fold(d.full_name),' ')) w
                          where w like (select t from q) || '%') then 4
             else 5 end) as rank,
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
  ),
  ranked as (
    select h.rank, d.full_name as nm,
      jsonb_build_object(
        'driver_id', d.id,
        'name', d.full_name,
        'matched_alias', h.via_alias,
        'is_default', h.is_default,
        'blocked', coalesce(d.blocked,false),
        'vehicle_id', v.id,
        'car', case when v.id is null then null else concat_ws(' ', v.make, v.model) end,
        'plate', v.plate,
        'color', v.color,
        'seats', v.seats,
        'has_car', v.id is not null,
        'cars', (select count(*) from public.vehicles vv where vv.driver_id = d.id and vv.is_active),
        'on_line', (select qe.zone_id from public.queue_entries qe
                     where qe.driver_id = d.id and qe.status <> 'ended' limit 1),
        'return_zone', (select z.zone_id from public.loadq_return_zone z where z.driver_id = d.id)
      ) as obj
    from hits h
    join public.drivers d on d.id = h.id
    left join public.vehicles v on v.driver_id = d.id and v.is_active
    order by h.rank, d.full_name
    limit greatest(1, coalesce(p_limit, 8))
  )
  select coalesce((select jsonb_agg(obj) from ranked), '[]'::jsonb);
$function$;

revoke all on function public.loadq_search_drivers(text,int) from public, anon;
grant execute on function public.loadq_search_drivers(text,int) to authenticated, service_role;
