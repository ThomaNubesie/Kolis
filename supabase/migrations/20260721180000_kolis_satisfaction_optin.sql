-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Gate post-delivery satisfaction surveys behind a per-org opt-in (default  ║
-- ║  OFF). The trigger + functions are live in prod ahead of the UI release,   ║
-- ║  so default-off ensures NO surveys fire (and no broken rate-page links     ║
-- ║  reach customers) until a business explicitly enables it post-release.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

alter table public.kolis_orgs
  add column if not exists satisfaction_surveys_enabled bool not null default false;

-- Only fire the survey when the org has opted in.
create or replace function public.kolis_satisfaction_trg()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered'
     and new.org_id is not null and coalesce(new.recipient_email,'') <> ''
     and (select satisfaction_surveys_enabled from public.kolis_orgs where id = new.org_id) then
    perform net.http_post(
      url := 'https://kzjptcpjpwlxfofzhyku.functions.supabase.co/kolis-satisfaction',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='kolis_cron_key')),
      body := jsonb_build_object('parcel_id', new.id));
  end if;
  return new;
end; $$;

-- Let a business toggle its own survey setting (role-gated).
create or replace function public.kolis_org_set_satisfaction(p_org uuid, p_enabled bool)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(kolis_org_role(p_org),'') not in ('owner','admin') then raise exception 'forbidden'; end if;
  update public.kolis_orgs set satisfaction_surveys_enabled = coalesce(p_enabled,false) where id = p_org;
end; $$;
