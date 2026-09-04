-- Meetings and one-to-one bookings.
--
-- Two things that look different to a member but share one engine: an assembly the
-- whole department is called to, and fifteen minutes booked with an officer. Both are
-- a time, a room, and a set of people who must be told.
--
-- VIDEO: each row carries an unguessable room token; the app embeds
-- meet.jit.si/quorly-<token>. A Jitsi room is open to whoever knows its name, so the
-- token IS the access control — 32 hex chars, never derived from the title, and handed
-- out only through an authorised read (cf_meeting_room / cf_booking_room).

create table if not exists public.cf_meetings (
  id           uuid primary key default gen_random_uuid(),
  form_id      uuid not null references public.cf_forms(id) on delete cascade,
  title        text not null,
  description  text,
  starts_at    timestamptz not null,
  duration_min int  not null default 60 check (duration_min between 5 and 600),
  room         text not null default encode(gen_random_bytes(16), 'hex'),
  status       text not null default 'scheduled' check (status in ('scheduled','cancelled','held')),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  reminded_at  timestamptz
);
create index if not exists cf_meetings_form_time on public.cf_meetings(form_id, starts_at desc);

create table if not exists public.cf_meeting_rsvps (
  meeting_id uuid not null references public.cf_meetings(id) on delete cascade,
  user_id    uuid not null,
  response   text not null check (response in ('yes','no','maybe')),
  at         timestamptz not null default now(),
  primary key (meeting_id, user_id)
);

-- An officer's weekly availability. Stored as LOCAL wall-clock minutes plus the zone
-- they were written in, not as UTC: "Tuesdays 9-5" must survive a daylight-saving
-- change, which a fixed offset would silently shift by an hour.
create table if not exists public.cf_availability (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.cf_forms(id) on delete cascade,
  user_id    uuid not null,
  weekday    int  not null check (weekday between 0 and 6),   -- 0 = Sunday
  start_min  int  not null check (start_min between 0 and 1439),
  end_min    int  not null check (end_min between 1 and 1440),
  slot_min   int  not null default 30 check (slot_min between 5 and 240),
  tz         text not null default 'America/Toronto',
  active     boolean not null default true,
  check (end_min > start_min)
);
create index if not exists cf_availability_host on public.cf_availability(org_id, user_id) where active;

create table if not exists public.cf_bookings (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.cf_forms(id) on delete cascade,
  host_user_id  uuid not null,
  guest_user_id uuid not null,
  starts_at     timestamptz not null,
  duration_min  int  not null default 30 check (duration_min between 5 and 600),
  note          text,
  room          text not null default encode(gen_random_bytes(16), 'hex'),
  status        text not null default 'booked' check (status in ('booked','cancelled','held')),
  created_at    timestamptz not null default now(),
  reminded_at   timestamptz
);
-- Two people cannot hold the same officer at the same instant. A partial unique index
-- is the guard, so a double-book fails in the DATABASE rather than relying on the UI.
create unique index if not exists cf_bookings_no_double
  on public.cf_bookings(host_user_id, starts_at) where status = 'booked';
create index if not exists cf_bookings_guest on public.cf_bookings(guest_user_id, starts_at desc);

-- No direct table access: every read and write goes through the RPCs, which carry the
-- membership and suspension rules. RLS with no permissive policy denies everything.
alter table public.cf_meetings      enable row level security;
alter table public.cf_meeting_rsvps enable row level security;
alter table public.cf_availability  enable row level security;
alter table public.cf_bookings      enable row level security;
