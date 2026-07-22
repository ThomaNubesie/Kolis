-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Public token-based rate + unsubscribe RPCs.                              ║
-- ║  Supabase edge functions on *.supabase.co are forced to text/plain (anti- ║
-- ║  phishing), so the rating/unsubscribe PAGES are served by the web app and  ║
-- ║  call these RPCs (anon) to record. Gated only by the unguessable token.   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create or replace function public.kolis_rate_by_token(p_token uuid, p_stars int, p_comment text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_org uuid; v_client uuid; v_code text;
begin
  select id, org_id, client_id, code into v_id, v_org, v_client, v_code
    from public.kolis_parcels where satisfaction_token = p_token;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_stars is not null and p_stars between 1 and 5 then
    insert into public.kolis_satisfaction(parcel_id, org_id, client_id, rating, comment)
    values (v_id, v_org, v_client, p_stars, nullif(btrim(p_comment), ''))
    on conflict (parcel_id) do update set rating = excluded.rating,
      comment = coalesce(excluded.comment, public.kolis_satisfaction.comment);
  elsif p_comment is not null then
    update public.kolis_satisfaction set comment = nullif(btrim(p_comment), '') where parcel_id = v_id;
  end if;
  return jsonb_build_object('ok', true, 'code', v_code);
end; $$;
grant execute on function public.kolis_rate_by_token(uuid, int, text) to anon, authenticated;

create or replace function public.kolis_unsubscribe_by_token(p_token uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  update public.kolis_org_clients set marketing_consent = false, unsubscribed_at = now()
    where unsubscribe_token = p_token;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0);
end; $$;
grant execute on function public.kolis_unsubscribe_by_token(uuid) to anon, authenticated;
