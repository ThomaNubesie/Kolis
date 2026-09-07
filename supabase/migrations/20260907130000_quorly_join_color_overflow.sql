-- Quorly: join must never dead-end when the colour palette is exhausted.
-- Auto-assign a free colour (base 16 palette, then unlimited golden-angle overflow).

create or replace function public.cf_hsl_hex(h numeric, s numeric, l numeric)
returns text language plpgsql immutable as $$
declare c numeric; x numeric; m numeric; r numeric; g numeric; b numeric; hp numeric;
begin
  c := (1 - abs(2*l - 1)) * s;
  hp := h / 60.0;
  x := c * (1 - abs((hp - 2*floor(hp/2)) - 1));
  m := l - c/2;
  if    hp < 1 then r:=c; g:=x; b:=0;
  elsif hp < 2 then r:=x; g:=c; b:=0;
  elsif hp < 3 then r:=0; g:=c; b:=x;
  elsif hp < 4 then r:=0; g:=x; b:=c;
  elsif hp < 5 then r:=x; g:=0; b:=c;
  else              r:=c; g:=0; b:=x; end if;
  return '#' || lpad(to_hex((round((r+m)*255))::int),2,'0')
             || lpad(to_hex((round((g+m)*255))::int),2,'0')
             || lpad(to_hex((round((b+m)*255))::int),2,'0');
end $$;

-- returns p_pref if it's free on the form, else the first free colour from the
-- base palette, else a generated golden-angle colour that isn't already used.
create or replace function public.cf_pick_color(p_form uuid, p_pref text)
returns text language plpgsql stable as $$
declare v text;
begin
  if p_pref is not null and nullif(trim(p_pref),'') is not null
     and not exists(select 1 from cf_members where form_id=p_form and color=p_pref and status<>'removed')
  then return p_pref; end if;
  select col into v from (
    select c col, ord from unnest(array[
      '#3B6FE0','#E4632A','#1F9D6B','#8A4FD0','#C99A1E','#D14D8B','#2AA6B8','#7A8340',
      '#D93A3A','#6D28D9','#0891B2','#BE5D1E','#3F8F3F','#C2417E','#5B7C99','#8A6D3B']
      ) with ordinality as t(c,ord)
    union all
    select public.cf_hsl_hex(((g*137.5)::numeric - floor((g*137.5)/360)*360), 0.60, 0.48), 100+g
      from generate_series(1,300) g
  ) p
  where not exists(select 1 from cf_members m where m.form_id=p_form and m.color=p.col and m.status<>'removed')
  order by ord limit 1;
  return coalesce(v, public.cf_hsl_hex((random()*360)::numeric, 0.55, 0.5));
end $$;

create or replace function public.cf_join_token(p_token text, p_color text, p_name text DEFAULT ''::text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_form uuid; v_name text; v_nda text; v_color text; begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','not_authed'); end if;
  select id, form_id into v_id, v_form from public.cf_members where invite_token=p_token and status='invited' limit 1;
  if v_id is null then return jsonb_build_object('ok',false,'error','invalid_or_used'); end if;
  v_color := public.cf_pick_color(v_form, p_color);
  if nullif(trim(coalesce(p_name,'')),'') is not null then perform public.cf_set_profile(p_name); end if;
  select name into v_name from public.cf_profiles where user_id = auth.uid();
  select nullif(trim(coalesce(nda_text,'')),'') into v_nda from public.cf_forms where id=v_form;
  update public.cf_members set user_id=auth.uid(), color=v_color, status='active', joined_at=now(),
    invite_token=null, invite_code=null,
    name=coalesce(nullif(trim(coalesce(p_name,'')),''), v_name, name),
    nda_accepted_at=case when v_nda is not null then now() else nda_accepted_at end,
    email=coalesce(email, auth.jwt()->>'email')
  where id=v_id;
  return jsonb_build_object('ok',true,'form_id',v_form,'color',v_color);
end $function$;

create or replace function public.cf_join(p_form uuid, p_color text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_color text;
        v_email text := lower(coalesce(auth.jwt()->>'email',''));
        v_phone text := regexp_replace(coalesce(auth.jwt()->>'phone',''),'[^0-9+]','','g');
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','not_authed'); end if;
  select id into v_id from public.cf_members
    where form_id=p_form and status='invited'
      and ((v_email <> '' and lower(email)=v_email) or (v_phone <> '' and phone=v_phone) or user_id = auth.uid())
    limit 1;
  if v_id is null then
    if public.cf_is_member_deep(p_form) then return public.cf_ensure_member(p_form); end if;
    return jsonb_build_object('ok',false,'error','no_invite');
  end if;
  v_color := public.cf_pick_color(p_form, p_color);
  update public.cf_members set user_id=auth.uid(), color=v_color, status='active', joined_at=now() where id=v_id;
  return jsonb_build_object('ok',true,'form_id',p_form,'color',v_color);
end $function$;

grant execute on function public.cf_hsl_hex(numeric,numeric,numeric) to authenticated, anon;
grant execute on function public.cf_pick_color(uuid,text) to authenticated, anon;
