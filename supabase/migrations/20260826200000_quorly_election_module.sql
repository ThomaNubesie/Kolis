-- Quorly Election module (multi-position, For/Against + reason voting, close→tally→winner→email→folder).
-- Applied to the Quorly Supabase project (slhdhapvawjsinzplysd) on 2026-08-26.

-- allow election entry status + for/against votes
alter table public.cf_entries drop constraint if exists cf_entries_status_check;
alter table public.cf_entries add  constraint cf_entries_status_check check (status = any (array['pending','approved','rejected','candidate']));
alter table public.cf_votes   drop constraint if exists cf_votes_value_check;
alter table public.cf_votes   add  constraint cf_votes_value_check  check (value  = any (array['approve','reject','for','against']));

alter table public.cf_votes  add column if not exists reason text;
alter table public.cf_forms  add column if not exists election_status     text;
alter table public.cf_forms  add column if not exists election_closed_at   timestamptz;
alter table public.cf_forms  add column if not exists election_closed_by   uuid;
alter table public.cf_forms  add column if not exists election_positions   text[] default '{}';

create or replace function public.cf_create_vote_subform(p_parent uuid, p_group text, p_name text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_form uuid; v_name text;
begin
  if not public.cf_is_member(p_parent) then return jsonb_build_object('ok',false,'error','not_member'); end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then return jsonb_build_object('ok',false,'error','name_required'); end if;
  select name into v_name from public.cf_profiles where user_id=auth.uid();
  insert into public.cf_forms(name, description, admin_id, features, approval_count, kind, parent_id, group_name, election_status, election_positions)
    values(trim(p_name), '', auth.uid(),
      '{"voting":true,"comments":true,"fields":true,"member_entries":true,"election":true}'::jsonb, 1, 'election', p_parent,
      coalesce(nullif(trim(coalesce(p_group,'')),''),'Votes'), 'open',
      array['President','Vice-President','Secretary','Treasurer'])
    returning id into v_form;
  insert into public.cf_members(form_id, user_id, name, email, color, role, status, joined_at)
    values(v_form, auth.uid(), coalesce(v_name,'You'), (auth.jwt()->>'email'), '#2F3AA3', 'admin', 'active', now());
  insert into public.cf_fields(form_id, label, type, required, sort) values
    (v_form, 'Position', 'text', true, 0),
    (v_form, 'Why are you running?', 'longtext', true, 1),
    (v_form, 'Your plan for the betterment of all', 'longtext', true, 2);
  insert into public.cf_folders(form_id, name, created_by) values (v_form, 'Election', auth.uid());
  insert into public.cf_members(form_id, user_id, name, email, phone, color, role, status, joined_at)
    select v_form, m.user_id, m.name, m.email, m.phone, coalesce(m.color,'#6E6B78'), 'member', 'active', now()
    from public.cf_members m
    where m.form_id=p_parent and m.status='active' and m.user_id is not null and m.user_id <> auth.uid()
      and not exists(select 1 from public.cf_members x where x.form_id=v_form and x.user_id=m.user_id);
  return jsonb_build_object('ok',true,'form_id',v_form);
end $function$;

-- 3. Expose kind so parent members can open an election sub-form they haven't joined yet.
create or replace function public.cf_subforms(p_parent uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select case when not public.cf_is_member(p_parent) then '[]'::jsonb else
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', f.id, 'name', f.name, 'group_name', coalesce(f.group_name, ''), 'kind', f.kind,
      'is_admin', f.admin_id=auth.uid(),
      'members', (select count(*) from cf_members m where m.form_id=f.id and m.status='active'),
      'im_member', exists(select 1 from cf_members m where m.form_id=f.id and m.user_id=auth.uid() and m.status='active')
    ) order by coalesce(f.group_name,''), f.created_at)
    from public.cf_forms f where f.parent_id=p_parent), '[]'::jsonb) end;
$function$;

-- 4. Auto-join: a parent member opening the election is enrolled on the spot.
create or replace function public.cf_election_ensure_member(p_form uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_parent uuid; v_kind text; v_name text; v_email text; v_phone text; v_color text;
begin
  if exists(select 1 from cf_members where form_id=p_form and user_id=auth.uid() and status='active')
    then return jsonb_build_object('ok',true,'already',true); end if;
  select parent_id, kind into v_parent, v_kind from cf_forms where id=p_form;
  if v_kind <> 'election' or v_parent is null then return jsonb_build_object('ok',false,'error','not_election'); end if;
  select name, email, phone, color into v_name, v_email, v_phone, v_color
    from cf_members where form_id=v_parent and user_id=auth.uid() and status='active' limit 1;
  if not found then return jsonb_build_object('ok',false,'error','not_parent_member'); end if;
  insert into cf_members(form_id, user_id, name, email, phone, color, role, status, joined_at)
    select p_form, auth.uid(), v_name, v_email, v_phone, coalesce(v_color,'#6E6B78'), 'member', 'active', now()
    where not exists(select 1 from cf_members where form_id=p_form and user_id=auth.uid());
  return jsonb_build_object('ok',true,'joined',true);
end $function$;

-- 5. Admin manages the position slate (while open).
create or replace function public.cf_set_positions(p_form uuid, p_positions text[])
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_clean text[];
begin
  if not public.cf_is_admin(p_form) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  if coalesce((select election_status from cf_forms where id=p_form),'open') <> 'open'
    then return jsonb_build_object('ok',false,'error','election_closed'); end if;
  select array_agg(distinct t) into v_clean
    from (select trim(x) t from unnest(coalesce(p_positions,'{}')) x where nullif(trim(x),'') is not null) s;
  update cf_forms set election_positions=coalesce(v_clean,'{}') where id=p_form;
  return jsonb_build_object('ok',true,'positions',coalesce(v_clean,'{}'));
end $function$;

-- 6. Declare candidacy for a position (one per member per position).
create or replace function public.cf_declare_candidacy(p_form uuid, p_position text, p_running text, p_plan text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_status text; v_positions text[];
begin
  perform public.cf_election_ensure_member(p_form);
  if not public.cf_is_member(p_form) then return jsonb_build_object('ok',false,'error','not_member'); end if;
  select election_status, election_positions into v_status, v_positions from cf_forms where id=p_form;
  if coalesce(v_status,'open') <> 'open' then return jsonb_build_object('ok',false,'error','election_closed'); end if;
  if nullif(trim(coalesce(p_position,'')),'') is null then return jsonb_build_object('ok',false,'error','position_required'); end if;
  if array_length(v_positions,1) is not null and not (trim(p_position) = any(v_positions))
    then return jsonb_build_object('ok',false,'error','unknown_position'); end if;
  if nullif(trim(coalesce(p_running,'')),'') is null then return jsonb_build_object('ok',false,'error','reason_required'); end if;
  -- one candidacy per member per election (cannot run for two positions)
  if exists(select 1 from cf_entries where form_id=p_form and author_id=auth.uid() and status='candidate')
    then return jsonb_build_object('ok',false,'error','already_candidate'); end if;
  insert into cf_entries(form_id, author_id, values, status)
    values(p_form, auth.uid(),
           jsonb_build_object('position',trim(p_position),'running',trim(p_running),'plan',trim(coalesce(p_plan,''))),
           'candidate')
    returning id into v_id;
  return jsonb_build_object('ok',true,'entry_id',v_id);
end $function$;

-- 7. Cast a For/Against vote (with reason) on a candidate — one per voter per candidate.
create or replace function public.cf_election_vote(p_entry uuid, p_value text, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_form uuid; v_status text;
begin
  if p_value not in ('for','against') then return jsonb_build_object('ok',false,'error','bad_value'); end if;
  select form_id into v_form from cf_entries where id=p_entry and status='candidate';
  if v_form is null then return jsonb_build_object('ok',false,'error','no_candidate'); end if;
  perform public.cf_election_ensure_member(v_form);
  if not public.cf_is_member(v_form) then return jsonb_build_object('ok',false,'error','not_member'); end if;
  select election_status into v_status from cf_forms where id=v_form;
  if coalesce(v_status,'open') <> 'open' then return jsonb_build_object('ok',false,'error','election_closed'); end if;
  insert into cf_votes(entry_id, voter_id, value, reason)
    values(p_entry, auth.uid(), p_value, nullif(trim(coalesce(p_reason,'')),''))
    on conflict (entry_id, voter_id) do update set value=excluded.value, reason=excluded.reason, created_at=now();
  return jsonb_build_object('ok',true);
end $function$;

-- 8. Full election payload — positions, candidates (tallied), per-position winner when closed, vote reasons.
create or replace function public.cf_election_results(p_form uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_uid uuid := auth.uid(); v_parent uuid; v_status text; v_closed timestamptz; v_admin boolean;
        v_positions text[]; v_folder uuid; v_closed_by text; v_out jsonb; v_cands jsonb;
begin
  select parent_id, election_status, election_closed_at, election_positions
    into v_parent, v_status, v_closed, v_positions from cf_forms where id=p_form;
  if not (public.cf_is_member(p_form) or (v_parent is not null and public.cf_is_member(v_parent)))
    then return jsonb_build_object('ok',false,'error','not_member'); end if;
  v_admin := public.cf_is_admin(p_form);
  select id into v_folder from cf_folders where form_id=p_form and name='Election' order by created_at limit 1;
  select coalesce(pr.name, m.name, 'Admin') into v_closed_by
    from cf_forms f left join cf_members m on m.form_id=p_form and m.user_id=f.election_closed_by
    left join cf_profiles pr on pr.user_id=f.election_closed_by where f.id=p_form;

  -- candidates with tallies + net; winner flag set per position only when closed
  with c as (
    select e.id, e.author_id, e.created_at,
           e.values->>'position' as position, e.values->>'running' as running, e.values->>'plan' as plan,
           coalesce(m.name, pr.name, 'Member') as name,
           (select count(*) from cf_votes v where v.entry_id=e.id and v.value='for')     as f,
           (select count(*) from cf_votes v where v.entry_id=e.id and v.value='against') as a,
           (select value from cf_votes v where v.entry_id=e.id and v.voter_id=v_uid)     as my_vote,
           (select reason from cf_votes v where v.entry_id=e.id and v.voter_id=v_uid)    as my_reason
    from cf_entries e
    left join cf_members m on m.form_id=p_form and m.user_id=e.author_id
    left join cf_profiles pr on pr.user_id=e.author_id
    where e.form_id=p_form and e.status='candidate'
  ), ranked as (
    select c.*, (f - a) as net,
      row_number() over (partition by position order by (f-a) desc, f desc, created_at asc) as rnk
    from c
  )
  select jsonb_agg(jsonb_build_object(
    'entry_id', id, 'author_id', author_id, 'name', name, 'position', position,
    'running', running, 'plan', plan, 'declared_at', created_at,
    'for', f, 'against', a, 'net', net,
    'my_vote', my_vote, 'my_reason', my_reason,
    'winner', (v_status='closed' and rnk=1 and (f+a) > 0)
  ) order by position asc, net desc, f desc, created_at asc) into v_cands from ranked;

  select jsonb_build_object(
    'ok', true,
    'status', coalesce(v_status,'open'),
    'closed_at', v_closed,
    'closed_by', v_closed_by,
    'is_admin', v_admin,
    'positions', coalesce(to_jsonb(v_positions), '[]'::jsonb),
    'election_folder', v_folder,
    'my_candidacies', coalesce((select jsonb_agg(e.values->>'position') from cf_entries e
       where e.form_id=p_form and e.author_id=v_uid and e.status='candidate'), '[]'::jsonb),
    'candidates', coalesce(v_cands, '[]'::jsonb),
    'reasons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'entry_id', v.entry_id, 'candidate', coalesce(cm.name, cpr.name, 'Member'),
        'position', e.values->>'position', 'value', v.value, 'reason', v.reason,
        'voter', coalesce(vm.name, vpr.name, 'Member'), 'created_at', v.created_at
      ) order by v.created_at desc)
      from cf_votes v
      join cf_entries e on e.id=v.entry_id and e.form_id=p_form and e.status='candidate'
      left join cf_members cm on cm.form_id=p_form and cm.user_id=e.author_id
      left join cf_profiles cpr on cpr.user_id=e.author_id
      left join cf_members vm on vm.form_id=p_form and vm.user_id=v.voter_id
      left join cf_profiles vpr on vpr.user_id=v.voter_id
      where coalesce(v.reason,'') <> ''
    ), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $function$;

-- 9. Close the election (admin) — freeze, then return results + recipient emails for the notification.
create or replace function public.cf_close_election(p_form uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_parent uuid; v_res jsonb; v_recips jsonb;
begin
  if not public.cf_is_admin(p_form) then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  select parent_id into v_parent from cf_forms where id=p_form;
  update cf_forms
    set election_status='closed', election_closed_at=coalesce(election_closed_at,now()), election_closed_by=auth.uid()
    where id=p_form and coalesce(election_status,'open') <> 'closed';
  v_res := public.cf_election_results(p_form);
  -- distinct emails of everyone in the election sub-form + the parent roster
  select coalesce(jsonb_agg(distinct email), '[]'::jsonb) into v_recips from (
    select lower(trim(email)) email from cf_members
    where form_id in (p_form, v_parent) and status in ('active','invited') and email is not null and email <> ''
  ) s;
  return v_res || jsonb_build_object('recipients', v_recips);
end $function$;

grant execute on function public.cf_create_vote_subform(uuid,text,text) to authenticated, anon;
grant execute on function public.cf_subforms(uuid) to authenticated, anon;
grant execute on function public.cf_election_ensure_member(uuid) to authenticated, anon;
grant execute on function public.cf_set_positions(uuid,text[]) to authenticated, anon;
grant execute on function public.cf_declare_candidacy(uuid,text,text,text) to authenticated, anon;
grant execute on function public.cf_election_vote(uuid,text,text) to authenticated, anon;
grant execute on function public.cf_election_results(uuid) to authenticated, anon;
grant execute on function public.cf_close_election(uuid) to authenticated, anon;
