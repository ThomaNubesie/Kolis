-- Kolis Facebook — an evergreen 90-day content library, posted five times a week.
--
-- Separate from LoadQ's posting in every way that matters. LoadQ publishes a LIVE daily queue
-- snapshot (loadq_fb_daily_text) to the shared Concord Express Page; this is a fixed library of
-- flyers and text that rotates on the Kolis Page. Same posting primitives (a new kolis-fb-post
-- edge function mirrors loadq-fb-post), different Page token, different table. Nothing here reads
-- or writes anything LoadQ owns.
--
-- Cadence: five posts a week. The library is 5 flyers + 14 text posts = 19 pieces, drawn
-- least-recently-posted first, so the rotation cycles the whole set (about four weeks) before any
-- piece repeats, and over ninety days each surfaces three or four times, spaced far enough apart
-- that Facebook's duplicate heuristics stay quiet.
--
-- Equally bilingual: every row carries body_en AND body_fr, neither subordinate. The caption is
-- composed as English, a blank line, French — assembled in the edge function, which also appends
-- kolis.ca when the text does not already name it.

create table if not exists public.kolis_fb_content (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('text', 'flyer')),
  pillar      text,
  body_en     text not null,
  body_fr     text not null,
  -- A flat filename in the public `marketing` bucket for a flyer; null for a text post. The edge
  -- function resolves it to a public URL at post time, so a re-hosted flyer needs no row change.
  image_name  text,
  active      boolean not null default true,
  last_posted_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint kolis_fb_flyer_has_image check (kind <> 'flyer' or image_name is not null)
);

-- Operational data: only the service role (the edge function) touches it. RLS on, no policy, so
-- a browser role sees nothing; the service role bypasses RLS.
alter table public.kolis_fb_content enable row level security;
revoke all on public.kolis_fb_content from anon, authenticated;

-- What actually went out. A returned Facebook post id is not proof a post is visible, so this is
-- the record the duplicate guard reads and the audit a human checks.
create table if not exists public.kolis_fb_posts (
  id         uuid primary key default gen_random_uuid(),
  content_id uuid references public.kolis_fb_content(id) on delete set null,
  kind       text,
  message    text,
  fb_post_id text,
  ok         boolean not null default false,
  error      text,
  posted_at  timestamptz not null default now()
);
alter table public.kolis_fb_posts enable row level security;
revoke all on public.kolis_fb_posts from anon, authenticated;

create index if not exists kolis_fb_posts_recent on public.kolis_fb_posts (posted_at desc);

-- The next piece to post. Never-posted first, then least-recently-posted, then oldest created —
-- so the library is exhausted before anything repeats, and new rows join at the front.
create or replace function public.kolis_fb_next()
returns public.kolis_fb_content
language sql
stable
security definer
set search_path = public
as $$
  select c.*
    from public.kolis_fb_content c
   where c.active
   order by (c.last_posted_at is not null),   -- false (never posted) sorts first
            c.last_posted_at nulls first,
            c.created_at
   limit 1;
$$;

revoke all on function public.kolis_fb_next() from public;

select 'kolis fb content ready' as status;
