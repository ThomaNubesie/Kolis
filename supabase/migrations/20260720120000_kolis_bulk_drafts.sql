-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Saved bulk batches (drafts)                                              ║
-- ║  Let a shipper name a bulk selection and reuse it later. Each draft holds ║
-- ║  the batch pickup config + the selected client rows (client_id + size +   ║
-- ║  destination). Listed newest-first with created/updated timestamps.       ║
-- ║  All RPCs SECURITY DEFINER, gated by kolis_org_role(p_org).               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create table if not exists public.kolis_bulk_drafts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.kolis_orgs(id) on delete cascade,
  name       text not null,
  pickup     jsonb not null default '{}'::jsonb,   -- {dropoff_type, hub_id, pickup_addr, from_city}
  rows       jsonb not null default '[]'::jsonb,    -- [{client_id, size, to_city, to_address}]
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kolis_bulk_drafts_org on public.kolis_bulk_drafts(org_id, updated_at desc);
alter table public.kolis_bulk_drafts enable row level security;
revoke all on public.kolis_bulk_drafts from anon, authenticated;

-- List (metadata + item count only — the rows payload is fetched on load).
create or replace function public.kolis_org_bulk_drafts_list(p_org uuid)
returns table(id uuid, name text, item_count int, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path to 'public' stable as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  return query
    select d.id, d.name, coalesce(jsonb_array_length(d.rows),0)::int, d.created_at, d.updated_at
    from public.kolis_bulk_drafts d
    where d.org_id = p_org
    order by d.updated_at desc;
end; $$;

-- Full draft (pickup + rows) for loading back into the batch builder.
create or replace function public.kolis_org_bulk_draft_get(p_org uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' stable as $$
declare v jsonb;
begin
  if coalesce(public.kolis_org_role(p_org),'') = '' then raise exception 'forbidden'; end if;
  select jsonb_build_object('id',d.id,'name',d.name,'pickup',d.pickup,'rows',d.rows,
                            'created_at',d.created_at,'updated_at',d.updated_at)
    into v from public.kolis_bulk_drafts d where d.id = p_id and d.org_id = p_org;
  if v is null then raise exception 'not_found'; end if;
  return v;
end; $$;

-- Upsert. New when p_id is null. On update, null pickup/rows keep the stored value
-- (so a rename can pass name only).
create or replace function public.kolis_org_bulk_draft_save(
  p_org uuid, p_id uuid, p_name text, p_pickup jsonb default null, p_rows jsonb default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin','shipper') then raise exception 'forbidden'; end if;
  if p_id is null then
    insert into public.kolis_bulk_drafts(org_id, name, pickup, rows, created_by)
    values (p_org, coalesce(nullif(trim(p_name),''),'Untitled batch'),
            coalesce(p_pickup,'{}'::jsonb), coalesce(p_rows,'[]'::jsonb), auth.uid())
    returning id into v_id;
  else
    update public.kolis_bulk_drafts
      set name = coalesce(nullif(trim(p_name),''), name),
          pickup = coalesce(p_pickup, pickup),
          rows = coalesce(p_rows, rows),
          updated_at = now()
      where id = p_id and org_id = p_org
      returning id into v_id;
    if v_id is null then raise exception 'not_found'; end if;
  end if;
  return v_id;
end; $$;

create or replace function public.kolis_org_bulk_draft_delete(p_org uuid, p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(public.kolis_org_role(p_org),'') not in ('owner','admin','shipper') then raise exception 'forbidden'; end if;
  delete from public.kolis_bulk_drafts where id = p_id and org_id = p_org;
end; $$;

grant execute on function public.kolis_org_bulk_drafts_list(uuid) to authenticated;
grant execute on function public.kolis_org_bulk_draft_get(uuid, uuid) to authenticated;
grant execute on function public.kolis_org_bulk_draft_save(uuid, uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.kolis_org_bulk_draft_delete(uuid, uuid) to authenticated;
