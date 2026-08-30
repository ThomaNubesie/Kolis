-- Quorly — the assembly holds everyone, guaranteed by the database.
--
-- Membership in the hall was synced by cf_ensure_townhall, which the app calls when
-- an organization loads. That leaves a hole: someone accepts an invite and goes
-- straight to the hall before any client has re-synced, and they are not a member of
-- the department every member belongs to. With 49 people still holding invitations
-- in one group alone, that hole would have been found.
--
-- So the rule moves into the database: become an active member of an organization
-- and you are in its hall, in the same transaction. No screen has to remember.

create or replace function public.cf_townhall_sync()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_hall uuid; v_org_admin uuid;
begin
  if new.user_id is null then return new; end if;

  -- Only rows that sit on an ORGANIZATION. A hall's own rows fall out here, which
  -- is also what stops this trigger from re-entering itself.
  if coalesce((select kind from public.cf_forms where id = new.form_id),'') <> 'org' then
    return new;
  end if;

  select id into v_hall from public.cf_forms
   where parent_id = new.form_id and kind = 'townhall' order by created_at limit 1;

  -- A brand-new organization gets its hall the moment it has its first member.
  if v_hall is null then
    if new.status <> 'active' then return new; end if;
    select admin_id into v_org_admin from public.cf_forms where id = new.form_id;
    insert into public.cf_forms(name, description, admin_id, features, approval_count,
                                kind, parent_id, group_name, emoji, post_audience)
    values ('Town Hall', '', v_org_admin,
            '{"fields":true,"files":true,"receipts":true,"member_entries":true}'::jsonb, 1,
            'townhall', new.form_id, 'Assembly', '🏟️', 'all')
    returning id into v_hall;

    insert into public.cf_fields(form_id, label, type, required, sort, label_i18n)
    values (v_hall, 'Subject', 'text', true, 0, '{"en":"Subject","fr":"Sujet"}'::jsonb),
           (v_hall, 'Details', 'longtext', false, 1, '{"en":"Details","fr":"Détails"}'::jsonb);
  end if;

  if new.status = 'active' then
    insert into public.cf_members(form_id, user_id, name, email, phone, color, role, status, joined_at)
    select v_hall, new.user_id, new.name, new.email, new.phone, new.color, new.role, 'active', now()
     where not exists (select 1 from public.cf_members t
                        where t.form_id = v_hall and t.user_id = new.user_id);

    -- Re-seat someone who had been removed, and carry an org admin's rank up. A hall
    -- admin appointed locally is never demoted from here — that appointment is its own.
    update public.cf_members t
       set status = 'active',
           role = case when new.role = 'admin' then 'admin' else t.role end
     where t.form_id = v_hall and t.user_id = new.user_id
       and (t.status <> 'active' or (new.role = 'admin' and t.role <> 'admin'));

  elsif new.status = 'removed' then
    update public.cf_members t set status = 'removed'
     where t.form_id = v_hall and t.user_id = new.user_id and t.status <> 'removed';
  end if;

  return new;
end $function$;

drop trigger if exists cf_townhall_sync_trg on public.cf_members;
create trigger cf_townhall_sync_trg
after insert or update of status, role, user_id on public.cf_members
for each row execute function public.cf_townhall_sync();

-- Catch anyone already active who is not seated (none expected — this is the net).
insert into public.cf_members(form_id, user_id, name, email, phone, color, role, status, joined_at)
select h.id, m.user_id, m.name, m.email, m.phone, m.color, m.role, 'active', now()
  from public.cf_forms o
  join public.cf_forms h on h.parent_id = o.id and h.kind = 'townhall'
  join public.cf_members m on m.form_id = o.id and m.status = 'active' and m.user_id is not null
 where o.kind = 'org'
   and not exists (select 1 from public.cf_members t where t.form_id = h.id and t.user_id = m.user_id);
