-- The sign-in screen's Canadian-landmark backdrop.
--
-- The photo is data, not markup: rows here decide what the login screen shows, so a
-- landmark can be reordered, retired or replaced without a deploy. `url` accepts either
-- a site-relative path (files shipped in admin-web/public/login) or a full https URL,
-- so a photo uploaded anywhere later can be dropped in by editing one column.
create table if not exists public.quorly_login_backdrops (
  id         uuid primary key default gen_random_uuid(),
  url        text not null,
  label_en   text not null,
  label_fr   text not null,
  sort       int  not null default 100,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.quorly_login_backdrops enable row level security;

-- Readable by anyone: this renders BEFORE anyone has signed in, so the anon role has
-- to see it. Only active rows are exposed. Writes are left to the service role only.
drop policy if exists quorly_login_backdrops_read on public.quorly_login_backdrops;
create policy quorly_login_backdrops_read
  on public.quorly_login_backdrops for select
  to anon, authenticated
  using (active);

-- One landmark per two-hour slot, chosen from the server's clock so every visitor in a
-- given window sees the same photo regardless of how wrong their own clock is. Ordering
-- by (sort, id) keeps the cycle stable as rows are added.
create or replace function public.quorly_login_backdrop()
returns table (url text, label_en text, label_fr text, slot bigint)
language sql
stable
security definer
set search_path = public
as $$
  with live as (
    select b.url, b.label_en, b.label_fr,
           row_number() over (order by b.sort, b.id) - 1 as pos,
           count(*) over () as n
      from public.quorly_login_backdrops b
     where b.active
  ), pick as (
    select floor(extract(epoch from now()) / 7200)::bigint as slot
  )
  select l.url, l.label_en, l.label_fr, p.slot
    from live l cross join pick p
   where l.n > 0 and l.pos = p.slot % l.n;
$$;

revoke all on function public.quorly_login_backdrop() from public;
grant execute on function public.quorly_login_backdrop() to anon, authenticated;

-- The five landmarks the screen opens with. All five photos are CC0 (public domain),
-- so no attribution line is required anywhere in the app.
insert into public.quorly_login_backdrops (url, label_en, label_fr, sort) values
  ('/login/parliament.jpg', 'Parliament Hill, Ottawa',    'Colline du Parlement, Ottawa',  10),
  ('/login/frontenac.jpg',  'Château Frontenac, Québec',  'Château Frontenac, Québec',     20),
  ('/login/moraine.jpg',    'Moraine Lake, Alberta',      'Lac Moraine, Alberta',          30),
  ('/login/peggys.jpg',     'Peggy''s Cove, Nova Scotia', 'Peggy''s Cove, Nouvelle-Écosse',40),
  ('/login/montreal.jpg',   'Montréal, Québec',           'Montréal, Québec',              50)
on conflict do nothing;
