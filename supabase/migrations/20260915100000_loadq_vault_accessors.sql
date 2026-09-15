-- Somewhere to keep the Stripe webhook signing secret that is neither a dashboard step nor a
-- line in a chat log.
--
-- Stripe issues a webhook signing secret at the moment the endpoint is created, and shows it
-- once. The usual dance is: create the endpoint in the dashboard, copy the secret, paste it
-- into an env var — so the secret ends up in a clipboard, a browser field and often a
-- transcript. Vault removes the copy-paste entirely: loadq-stripe-webhook-setup writes it
-- straight from Stripe's response into vault.secrets, and loadq-seat-stripe-webhook reads it
-- back. It is never printed, never pasted.
create or replace function public.loadq_vault_put(p_name text, p_value text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    perform vault.create_secret(p_value, p_name, 'LoadQ');
  else
    perform vault.update_secret(v_id, p_value, p_name, 'LoadQ');
  end if;
  return true;
end $$;

create or replace function public.loadq_vault_get(p_name text)
returns text language sql stable security definer set search_path to 'public' as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name
$$;

-- SECURITY DEFINER grants EXECUTE to PUBLIC by default, which on these two would hand the
-- Stripe signing secret to anyone holding the anon key. The service role only.
revoke execute on function public.loadq_vault_put(text, text) from public, anon, authenticated;
revoke execute on function public.loadq_vault_get(text)       from public, anon, authenticated;
grant  execute on function public.loadq_vault_put(text, text) to service_role;
grant  execute on function public.loadq_vault_get(text)       to service_role;
