-- Member contact phone (separate from the auth login phone) + an approval queue
-- so members can add/update their email & phone, applied only after admin review.
alter table public.kolis_profiles add column if not exists phone text;

create table if not exists public.kolis_contact_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  current_email text, current_phone text,
  requested_email text, requested_phone text,
  status text not null default 'pending',          -- pending | approved | rejected
  created_at timestamptz not null default now(),
  reviewed_by uuid, reviewed_at timestamptz
);
create index if not exists kolis_contact_requests_pending on public.kolis_contact_requests(status) where status = 'pending';
alter table public.kolis_contact_requests enable row level security;
revoke all on public.kolis_contact_requests from anon, authenticated;

-- Member submits/refreshes a pending change (does NOT apply it).
create or replace function public.kolis_request_contact_update(p_email text, p_phone text) returns uuid
  language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_email text; v_phone text;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  p_email := nullif(trim(lower(coalesce(p_email, ''))), '');
  p_phone := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  if p_email is null and p_phone is null then raise exception 'nothing_to_update'; end if;
  select email, phone into v_email, v_phone from public.kolis_profiles where id = auth.uid();
  delete from public.kolis_contact_requests where user_id = auth.uid() and status = 'pending'; -- one open request per user
  insert into public.kolis_contact_requests(user_id, current_email, current_phone, requested_email, requested_phone)
  values (auth.uid(), v_email, v_phone, p_email, p_phone) returning id into v_id;
  return v_id;
end; $$;

-- Member: my latest request (to show "pending review").
create or replace function public.kolis_my_contact_request() returns jsonb
  language sql stable security definer set search_path to 'public' as $$
  select to_jsonb(r) from public.kolis_contact_requests r where r.user_id = auth.uid() order by r.created_at desc limit 1;
$$;

-- Admin: list pending requests (Members capability).
create or replace function public.kolis_admin_contact_requests()
  returns table(id uuid, user_id uuid, name text, current_email text, current_phone text, requested_email text, requested_phone text, created_at timestamptz)
  language sql stable security definer set search_path to 'public' as $$
  select r.id, r.user_id, coalesce(pr.verified_name, pr.full_name), r.current_email, r.current_phone, r.requested_email, r.requested_phone, r.created_at
  from public.kolis_contact_requests r left join public.kolis_profiles pr on pr.id = r.user_id
  where r.status = 'pending' and public.kolis_admin_has_cap('members')
  order by r.created_at;
$$;

-- Admin: approve/reject. Approve applies the change + enforces uniqueness.
create or replace function public.kolis_admin_review_contact_request(p_id uuid, p_approve boolean) returns void
  language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  if not public.kolis_admin_has_cap('members') then raise exception 'forbidden'; end if;
  select * into r from public.kolis_contact_requests where id = p_id and status = 'pending';
  if not found then raise exception 'not_found'; end if;
  if p_approve then
    if r.requested_email is not null and exists(select 1 from public.kolis_profiles where lower(email) = lower(r.requested_email) and id <> r.user_id) then raise exception 'email_in_use'; end if;
    if r.requested_phone is not null and exists(select 1 from public.kolis_profiles where phone = r.requested_phone and id <> r.user_id) then raise exception 'phone_in_use'; end if;
    update public.kolis_profiles set email = coalesce(r.requested_email, email), phone = coalesce(r.requested_phone, phone), updated_at = now() where id = r.user_id;
  end if;
  update public.kolis_contact_requests set status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
end; $$;

grant execute on function public.kolis_request_contact_update(text, text) to authenticated;
grant execute on function public.kolis_my_contact_request() to authenticated;
grant execute on function public.kolis_admin_contact_requests() to authenticated;
grant execute on function public.kolis_admin_review_contact_request(uuid, boolean) to authenticated;
revoke all on function public.kolis_request_contact_update(text, text) from anon, public;
revoke all on function public.kolis_admin_review_contact_request(uuid, boolean) from anon, public;
