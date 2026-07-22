-- White-label branding for business orgs: dashboard + customer-facing surfaces.
alter table public.kolis_orgs
  add column if not exists brand_logo_url text,
  add column if not exists brand_color text,
  add column if not exists brand_name text,
  add column if not exists brand_tracking boolean not null default true,
  add column if not exists brand_emails boolean not null default true,
  add column if not exists brand_powered_by boolean not null default true;

-- Public bucket for org logos; org owners/admins may upload into their own folder.
insert into storage.buckets (id, name, public) values ('org-logos', 'org-logos', true) on conflict (id) do nothing;
drop policy if exists "org logos public read" on storage.objects;
create policy "org logos public read" on storage.objects for select using (bucket_id = 'org-logos');
drop policy if exists "org admins write logos" on storage.objects;
create policy "org admins write logos" on storage.objects for insert to authenticated
  with check (bucket_id = 'org-logos' and coalesce(public.kolis_org_role(((storage.foldername(name))[1])::uuid), '') in ('owner','admin'));
drop policy if exists "org admins update logos" on storage.objects;
create policy "org admins update logos" on storage.objects for update to authenticated
  using (bucket_id = 'org-logos' and coalesce(public.kolis_org_role(((storage.foldername(name))[1])::uuid), '') in ('owner','admin'));

-- Member reads its org branding (theming + settings prefill).
create or replace function public.kolis_org_branding(p_org uuid) returns jsonb
  language sql stable security definer set search_path to 'public' as $$
  select case when coalesce(public.kolis_org_role(p_org), '') = '' then null else (
    select jsonb_build_object('logo_url', brand_logo_url, 'color', brand_color, 'name', coalesce(brand_name, name),
                              'tracking', brand_tracking, 'emails', brand_emails, 'powered_by', brand_powered_by)
    from public.kolis_orgs where id = p_org) end;
$$;

-- Owner/admin saves branding.
create or replace function public.kolis_org_set_branding(p_org uuid, p_logo_url text, p_color text, p_name text, p_tracking boolean, p_emails boolean, p_powered_by boolean) returns void
  language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(public.kolis_org_role(p_org), '') not in ('owner','admin') then raise exception 'forbidden'; end if;
  if p_color is not null and p_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'bad_color'; end if;
  update public.kolis_orgs set
    brand_logo_url = p_logo_url, brand_color = p_color, brand_name = nullif(trim(coalesce(p_name, '')), ''),
    brand_tracking = coalesce(p_tracking, true), brand_emails = coalesce(p_emails, true), brand_powered_by = coalesce(p_powered_by, true)
  where id = p_org;
end; $$;

-- Public tracking now carries the parcel's business brand (when branding tracking is on).
create or replace function public.kolis_track(p_code text) returns jsonb
  language sql stable security definer set search_path to 'public' as $$
  select case when p.id is null then null else jsonb_build_object(
    'code', p.code, 'status', p.status, 'dropoff_type', p.dropoff_type,
    'from_city', p.from_city, 'to_city', p.to_city, 'created_at', p.created_at, 'delivered_at', p.delivered_at,
    'courier', case when p.status in ('picked_up','in_transit','dispatched','delivered')
                    then nullif(split_part(coalesce(d.full_name, p.external_driver_name, ''), ' ', 1), '') end,
    'brand', case when o.id is not null and coalesce(o.brand_tracking, true) then
               jsonb_build_object('name', coalesce(o.brand_name, o.name), 'logo', o.brand_logo_url,
                                  'color', o.brand_color, 'powered_by', coalesce(o.brand_powered_by, true)) end
  ) end
  from (select * from public.kolis_parcels where upper(code) = upper(trim(p_code)) limit 1) p
  left join public.drivers d on d.id = p.driver_id
  left join public.kolis_orgs o on o.id = p.org_id;
$$;

grant execute on function public.kolis_org_branding(uuid) to authenticated;
grant execute on function public.kolis_org_set_branding(uuid, text, text, text, boolean, boolean, boolean) to authenticated;
grant execute on function public.kolis_track(text) to anon, authenticated;
revoke all on function public.kolis_org_set_branding(uuid, text, text, text, boolean, boolean, boolean) from anon, public;
