-- ═══════════════════════════════════════════════════════════════════════════
-- Kolis for Business — Phase 3a: apply a Stripe invoice event idempotently.
-- The kolis-stripe-webhook edge function verifies the Stripe signature, then
-- calls this RPC. Dedupe is structural: each Stripe event_id is recorded once
-- (kolis_stripe_events PK); a replayed event is a no-op. On payment, the org is
-- un-suspended (ties into Phase 3b credit controls).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.kolis_apply_stripe_invoice_event(
  p_event_id text, p_stripe_invoice_id text, p_status text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_rows int; v_org uuid;
begin
  insert into public.kolis_stripe_events(event_id) values (p_event_id) on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return false; end if;          -- replay → already processed

  if p_status = 'paid' then
    update public.kolis_invoices set status='paid', paid_at=now()
      where stripe_invoice_id = p_stripe_invoice_id and status <> 'paid'
      returning org_id into v_org;
    if v_org is not null then
      update public.kolis_orgs set status='active' where id = v_org and status = 'suspended';
    end if;
  elsif p_status = 'payment_failed' then
    -- leave the invoice 'open'; Phase 3b's suspension job handles overdue.
    null;
  end if;
  return true;
end; $$;

revoke execute on function public.kolis_apply_stripe_invoice_event(text,text,text) from public, anon;
