-- Kolis couriers verify through Kolis and may have NO LoadQ `drivers` row.
-- The previous kolis_admin_candidates INNER JOINed `drivers`, so Kolis-only
-- couriers were dropped and the dispatcher saw "no driver to assign". Base the
-- candidate list on kolis_profiles (the courier identity); the drivers row and
-- queue entry are optional enrichments. (Applied live 2026-06-12.)
create or replace function public.kolis_admin_candidates(p_id uuid)
returns table(driver_id uuid, name text, queue_pos integer, carrying integer, source text)
language sql stable security definer
set search_path to 'public'
as $function$
  with target as (select to_region from public.kolis_parcels where id = p_id)
  select pr.id,
         coalesce(nullif(btrim(d.full_name), ''), pr.full_name) as name,
         q.position as queue_pos,
         (select count(*) from public.kolis_parcels c
            where c.driver_id = pr.id and c.status in ('matched','dispatched','picked_up','in_transit'))::int as carrying,
         case when q.driver_id is not null then 'queue' else 'member' end as source
  from public.kolis_profiles pr
  left join public.drivers d on d.id = pr.id
  left join public.queue_entries q
         on q.driver_id = pr.id and q.end_reason is null
        and q.destination_region = (select to_region from target)
  where public.kolis_is_staff()
    and pr.identity_verified
    and pr.role in ('courier','both')
    and (q.driver_id is not null
         or not exists (select 1 from public.queue_entries q2
                          where q2.driver_id = pr.id and q2.end_reason is null))
  order by (q.position is null), q.position nulls last
  limit 40;
$function$;
grant execute on function public.kolis_admin_candidates(uuid) to authenticated;
