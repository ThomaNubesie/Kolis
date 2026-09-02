-- ============================================================================
-- LoadQ: admin approval code for queue moves — 2026-09-01
--
-- Thomas: "people could be moved around with admin approval. admin should have
-- a code renewed twice a day."
--
-- Adding a driver and crossing one out are routine — the list writer does both
-- unaided. MOVING someone is different: the position IS the driver's ticket, and
-- reordering is where favouritism and disputes live. So a move needs a code the
-- admin gives verbally at the moment of approval.
--
-- Rotation is LAZY, not cron-driven: the code for a window is minted the first
-- time it is read. Two windows a day, 06:00–18:00 and 18:00–06:00 America/
-- Toronto, computed in local time so it does not drift with daylight saving.
-- A code overheard in the morning is dead by evening.
--
-- The code is 6 digits so it can be said down a phone. Six digits is only a
-- million combinations, so brute force is the obvious attack and it is
-- rate-limited below — without that the control would be theatre.
-- ============================================================================
set check_function_bodies = off;

create table if not exists public.loadq_admin_code (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  valid_from  timestamptz not null,
  valid_to    timestamptz not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists loadq_admin_code_window on public.loadq_admin_code (valid_from);

create table if not exists public.loadq_admin_code_attempt (
  id         uuid primary key default gen_random_uuid(),
  driver_id  uuid references public.drivers(id) on delete set null,
  ok         boolean not null,
  at         timestamptz not null default now()
);
create index if not exists loadq_admin_code_attempt_recent
  on public.loadq_admin_code_attempt (driver_id, at desc);

-- Start of the current 12-hour window, in local time so DST cannot shift it.
create or replace function public.loadq_code_window_start()
returns timestamptz language sql stable as $function$
  select (case
    when extract(hour from (now() at time zone 'America/Toronto')) >= 18
      then date_trunc('day', now() at time zone 'America/Toronto') + interval '18 hours'
    when extract(hour from (now() at time zone 'America/Toronto')) >= 6
      then date_trunc('day', now() at time zone 'America/Toronto') + interval '6 hours'
    else date_trunc('day', now() at time zone 'America/Toronto') - interval '6 hours'
  end) at time zone 'America/Toronto';
$function$;

-- The admin's screen. Mints this window's code on first read. ADMIN ONLY — a
-- list writer must never be able to read the code they are meant to be given.
create or replace function public.loadq_admin_code_current()
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_start timestamptz; v_code text; v_row public.loadq_admin_code;
begin
  if not coalesce((select d.is_admin from public.drivers d where d.id = auth.uid()), false) then
    return jsonb_build_object('ok',false,'error','not_admin');
  end if;
  v_start := public.loadq_code_window_start();
  select * into v_row from public.loadq_admin_code where valid_from = v_start;
  if not found then
    v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    insert into public.loadq_admin_code (code, valid_from, valid_to)
    values (v_code, v_start, v_start + interval '12 hours')
    on conflict (valid_from) do nothing;
    select * into v_row from public.loadq_admin_code where valid_from = v_start;
  end if;
  return jsonb_build_object('ok',true,'code',v_row.code,
    'valid_from',v_row.valid_from,'valid_to',v_row.valid_to,
    'expires_in_minutes', greatest(0, round(extract(epoch from (v_row.valid_to - now()))/60)));
end $function$;

-- Verify a code. Rate-limited to 5 failures per hour per person; without that a
-- 6-digit code is walkable. Never reveals the code, only whether it matched.
create or replace function public.loadq_verify_admin_code(p_code text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_fails int; v_ok boolean; v_start timestamptz;
begin
  select count(*) into v_fails from public.loadq_admin_code_attempt
   where driver_id = auth.uid() and not ok and at > now() - interval '1 hour';
  if v_fails >= 5 then
    return jsonb_build_object('ok',false,'error','too_many_attempts','retry_after_minutes',
      (select ceil(extract(epoch from (min(at) + interval '1 hour' - now()))/60)
         from public.loadq_admin_code_attempt
        where driver_id = auth.uid() and not ok and at > now() - interval '1 hour'));
  end if;
  v_start := public.loadq_code_window_start();
  select exists(select 1 from public.loadq_admin_code
                 where valid_from = v_start and code = trim(coalesce(p_code,''))) into v_ok;
  insert into public.loadq_admin_code_attempt (driver_id, ok) values (auth.uid(), v_ok);
  return jsonb_build_object('ok', v_ok, 'error', case when v_ok then null else 'bad_code' end);
end $function$;

-- Move a driver to another position. List-writer gated AND code gated; an admin
-- moving something themselves still needs no code, since they hold it anyway.
-- Delegates to loadq_admin_move, which renumbers and re-syncs the loader — that
-- is deliberate and is the one place renumbering is correct.
create or replace function public.loadq_list_move(p_entry uuid, p_new_pos int, p_code text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_zone text; v_is_admin boolean; v_chk jsonb; v_old int; v_driver text;
begin
  select qe.zone_id, qe.position, d.full_name into v_zone, v_old, v_driver
    from public.queue_entries qe join public.drivers d on d.id = qe.driver_id
   where qe.id = p_entry;
  if v_zone is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not public.loadq_can_write_list(v_zone) then
    return jsonb_build_object('ok',false,'error','not_a_list_writer'); end if;

  v_is_admin := coalesce((select d.is_admin from public.drivers d where d.id = auth.uid()), false);
  if not v_is_admin then
    v_chk := public.loadq_verify_admin_code(p_code);
    if not coalesce((v_chk->>'ok')::boolean,false) then
      return jsonb_build_object('ok',false,'error',coalesce(v_chk->>'error','bad_code'),
                                'retry_after_minutes', v_chk->'retry_after_minutes');
    end if;
  end if;

  perform public.loadq_admin_move(p_entry, p_new_pos);
  return jsonb_build_object('ok',true,'driver',v_driver,'from',v_old,'to',p_new_pos,
                            'approved_by_code', not v_is_admin);
end $function$;

alter table public.loadq_admin_code enable row level security;
alter table public.loadq_admin_code_attempt enable row level security;
-- No policies: the code is reachable only through the SECURITY DEFINER function
-- above, which checks is_admin. Direct table reads are denied to everyone.

revoke all on function public.loadq_admin_code_current() from public, anon;
revoke all on function public.loadq_verify_admin_code(text) from public, anon;
revoke all on function public.loadq_list_move(uuid,int,text) from public, anon;
grant execute on function public.loadq_admin_code_current()      to authenticated, service_role;
grant execute on function public.loadq_verify_admin_code(text)   to authenticated, service_role;
grant execute on function public.loadq_list_move(uuid,int,text)  to authenticated, service_role;
grant execute on function public.loadq_code_window_start()       to authenticated, service_role;
