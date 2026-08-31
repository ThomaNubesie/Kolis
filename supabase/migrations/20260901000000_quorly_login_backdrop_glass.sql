-- Whether the sign-in card goes glass on THIS photo.
--
-- Transparency is not a property of the card, it is a property of the picture behind
-- it: it works on a calm frame with open sky and water, and turns to mud on a busy
-- one like a city skyline or carved stone. So it belongs per-row, not in the code —
-- and it stays off by default, because opaque is the safe result on an unseen photo.
alter table public.quorly_login_backdrops
  add column if not exists glass boolean not null default false;

update public.quorly_login_backdrops
   set glass = (url like '%peggys%');

-- Adding a column to the OUT record changes the return type, which Postgres will not
-- do in place. Dropping and recreating inside this one migration keeps it atomic.
drop function if exists public.quorly_login_backdrop();

create function public.quorly_login_backdrop()
returns table (url text, label_en text, label_fr text, glass boolean, slot bigint)
language sql
stable
security definer
set search_path = public
as $$
  with live as (
    select b.url, b.label_en, b.label_fr, b.glass,
           row_number() over (order by b.sort, b.id) - 1 as pos,
           count(*) over () as n
      from public.quorly_login_backdrops b
     where b.active
  ), pick as (
    select floor(extract(epoch from now()) / 7200)::bigint as slot
  )
  select l.url, l.label_en, l.label_fr, l.glass, p.slot
    from live l cross join pick p
   where l.n > 0 and l.pos = p.slot % l.n;
$$;

revoke all on function public.quorly_login_backdrop() from public;
grant execute on function public.quorly_login_backdrop() to anon, authenticated;
