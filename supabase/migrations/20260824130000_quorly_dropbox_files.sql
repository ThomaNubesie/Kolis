-- Quorly Dropbox: per-form shared files + admin file requests (Supabase Storage cf-files).
create table if not exists public.cf_file_requests (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.cf_forms(id) on delete cascade,
  label text not null,
  required boolean not null default true,
  requested_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create table if not exists public.cf_files (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.cf_forms(id) on delete cascade,
  uploader uuid not null default auth.uid(),
  name text not null,
  path text not null,
  size bigint,
  mime text,
  request_id uuid references public.cf_file_requests(id) on delete set null,
  is_final boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists cf_files_form_idx on public.cf_files(form_id, created_at desc);
create index if not exists cf_file_requests_form_idx on public.cf_file_requests(form_id, created_at);

alter table public.cf_files enable row level security;
alter table public.cf_file_requests enable row level security;

drop policy if exists cf_files_sel on public.cf_files;
create policy cf_files_sel on public.cf_files for select using (public.cf_is_member(form_id));
drop policy if exists cf_files_ins on public.cf_files;
create policy cf_files_ins on public.cf_files for insert with check (public.cf_is_member(form_id) and uploader = auth.uid());
drop policy if exists cf_files_del on public.cf_files;
create policy cf_files_del on public.cf_files for delete using (uploader = auth.uid() or public.cf_is_admin(form_id));

drop policy if exists cf_freq_sel on public.cf_file_requests;
create policy cf_freq_sel on public.cf_file_requests for select using (public.cf_is_member(form_id));
drop policy if exists cf_freq_ins on public.cf_file_requests;
create policy cf_freq_ins on public.cf_file_requests for insert with check (public.cf_is_admin(form_id) and requested_by = auth.uid());
drop policy if exists cf_freq_del on public.cf_file_requests;
create policy cf_freq_del on public.cf_file_requests for delete using (public.cf_is_admin(form_id));

-- Private storage bucket, path = <form_id>/<uuid>-<filename>, 25 MB cap.
insert into storage.buckets (id, name, public, file_size_limit)
values ('cf-files','cf-files', false, 26214400)
on conflict (id) do nothing;

drop policy if exists cf_files_storage_read on storage.objects;
create policy cf_files_storage_read on storage.objects for select
  using (bucket_id='cf-files' and public.cf_is_member(nullif((storage.foldername(name))[1],'')::uuid));
drop policy if exists cf_files_storage_write on storage.objects;
create policy cf_files_storage_write on storage.objects for insert
  with check (bucket_id='cf-files' and public.cf_is_member(nullif((storage.foldername(name))[1],'')::uuid));
drop policy if exists cf_files_storage_del on storage.objects;
create policy cf_files_storage_del on storage.objects for delete
  using (bucket_id='cf-files' and (owner = auth.uid() or public.cf_is_admin(nullif((storage.foldername(name))[1],'')::uuid)));
