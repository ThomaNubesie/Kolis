-- Suspension decided in Parliament is suspension everywhere, and a suspended member
-- sees nothing.
--
-- Parliament is the department every member belongs to, so it is where the assembly
-- decides who has the floor. A suspension that applied only there would be hollow —
-- the member simply carries on in the offices and departments.
create or replace function public.cf_suspend_cascade()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_kind text; v_org uuid;
begin
  if new.suspended is not distinct from old.suspended then return new; end if;
  if new.user_id is null then return new; end if;

  select kind into v_kind from public.cf_forms where id = new.form_id;
  if coalesce(v_kind, '') <> 'townhall' then return new; end if;   -- Parliament decides

  v_org := public.cf_org_of(new.form_id);
  if v_org is null then return new; end if;

  -- Every form in this organisation, at any depth. The nested UPDATE re-fires this
  -- trigger, but those rows are not townhall rows so they return immediately, and the
  -- WHERE skips rows already at the target value — so it settles in one pass.
  -- A personal vault sits under its own root, so it is untouched: suspension is from
  -- the association, not from someone's own documents.
  with recursive tree as (
    select id from public.cf_forms where id = v_org
    union all
    select f.id from public.cf_forms f join tree t on f.parent_id = t.id
  )
  update public.cf_members m
     set suspended = new.suspended
   where m.user_id = new.user_id
     and m.form_id in (select id from tree)
     and m.suspended is distinct from new.suspended;

  return new;
end $$;

drop trigger if exists cf_suspend_cascade_trg on public.cf_members;
create trigger cf_suspend_cascade_trg
  after update of suspended on public.cf_members
  for each row execute function public.cf_suspend_cascade();

-- Is the caller suspended anywhere in this organisation? Asked once, before the app
-- renders anything.
create or replace function public.cf_am_suspended(p_org uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cf_members m
     where m.user_id = auth.uid() and m.suspended
       and (p_org is null or public.cf_org_of(m.form_id) = p_org));
$$;

-- A suspended member sees nothing. cf_is_member_deep is the single gate every read
-- surface already asks (cf_form, cf_org_tree, cf_entries, cf_departments), so
-- withholding membership here blinds all of them at once and cannot be bypassed by
-- calling a different RPC or by a client that skips the banner.
--
-- Deliberately NOT applied to cf_is_admin_deep: an admin's authority is unaffected,
-- and nobody may suspend themselves. cf_join degrades safely too — a suspended person
-- gets 'no_invite' rather than being auto-enrolled into something new.
create or replace function public.cf_is_member_deep(p_form uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.cf_ancestors(p_form) a
    join public.cf_members m on m.form_id = a.id
    where m.user_id = auth.uid()
      and m.status = 'active'
      and coalesce(m.suspended, false) = false);
$$;

revoke all on function public.cf_am_suspended(uuid) from public;
grant execute on function public.cf_am_suspended(uuid) to authenticated;
