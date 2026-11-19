-- =====================================================================
-- 가림콜 — 번호를 10자리로 (2026-11-19 · 보스 지시 · 이미화 님 결정)
--
--   번호      10자리 4-3-3 (예: 4829-051-318). 0으로 시작하지 않음. 부름과 같은 모양 · 같은 좋은 번호 기준
--             가림콜 번호는 가림콜 안에서만 씁니다(부름 · 와파 번호와 같아도 상관없음)
--   값        ★5 110,000 · ★4 55,000 · ★3 11,000 · 일반은 회선마다 / 계정마다 하나 무료
--   스토어    새 상품을 만들지 않고, 값이 같은 기존 상품을 씁니다
--               ★5 → ac_num_4_basic (110,000)   ★4 → ac_num_5_basic (55,000)   ★3 → ac_num_7_basic (11,000)
--             (결제창에 보이는 상품 이름만 콘솔에서 「좋은 번호 ★5」 등으로 고쳐 주세요)
--   지금 있는 번호(4~8자리)는 이 파일이 10자리로 바꿔 드립니다
--             산 번호 → 낸 값에 맞는 등급의 10자리 좋은 번호 · 무료 번호 → 10자리 일반 번호
--             바뀐 내역은 ac_num_renumber 표와 맨 아래 결과에 나옵니다
--   ⚠ line_numbers.sql · person_numbers.sql 다음에 통째로 Run. 다시 돌려도 안전합니다. 맨 아래 'numbers 10 ok'
-- =====================================================================

-- ── 등급 (부름 bn_grade 와 같은 기준) ─────────────────────────────────
create or replace function public.ac_bn_same(s text) returns boolean
language sql immutable as $$ select s is not null and length(s) > 0 and s = repeat(left(s, 1), length(s)) $$;

create or replace function public.ac_bn_is_seq(s text) returns boolean
language plpgsql immutable as $$
declare i int; up boolean := true; dn boolean := true;
begin
  if s is null or length(s) < 2 then return false; end if;
  for i in 2..length(s) loop
    if substr(s, i, 1)::int <> substr(s, i - 1, 1)::int + 1 then up := false; end if;
    if substr(s, i, 1)::int <> substr(s, i - 1, 1)::int - 1 then dn := false; end if;
  end loop;
  return up or dn;
end $$;

/* '5' · '4' · '3' · 'N'(일반) · null(10자리가 아님) — 부름: platinum=5 · gold=4 · silver=3 */
create or replace function public.ac_num_grade(p text) returns text
language plpgsql immutable as $$
declare n text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'); a text; b text; c text;
begin
  if n !~ '^[1-9][0-9]{9}$' then return null; end if;
  a := substr(n, 1, 4); b := substr(n, 5, 3); c := substr(n, 8, 3);
  if ac_bn_same(n) or ac_bn_same(b || c) or n in ('1234567890', '9876543210') then return '5'; end if;
  if ac_bn_same(a) or (ac_bn_same(b) and ac_bn_same(c)) or b = c or ac_bn_is_seq(b || c) then return '4'; end if;
  if (ac_bn_same(c) and left(c, 1) in ('7', '8', '9', '0')) or ac_bn_is_seq(substr(n, 7, 4)) or ac_bn_is_seq(a) then return '3'; end if;
  return 'N';
end $$;

/* 보기 좋게 4-3-3 */
create or replace function public.ac_num_shown(p text) returns text
language sql immutable as $$
  select case when length(n) = 10 then substr(n, 1, 4) || '-' || substr(n, 5, 3) || '-' || substr(n, 8, 3) else n end
    from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as n) z
$$;

create or replace function public.ac_num_is_good(p text) returns boolean
language sql immutable as $$ select coalesce(ac_num_grade(p) in ('5', '4', '3'), false) $$;

create or replace function public.ac_num_sku(p text) returns text
language sql immutable as $$
  select case ac_num_grade(p) when '5' then 'ac_num_4_basic' when '4' then 'ac_num_5_basic' when '3' then 'ac_num_7_basic' else null end
$$;

create or replace function public.ac_num_price(p text) returns int
language sql immutable as $$
  select case ac_num_grade(p) when '5' then 110000 when '4' then 55000 when '3' then 11000 when 'N' then 0 else null end
$$;

/* 등급에 맞는 번호를 하나 지어냄 (와파와 같은 방식) — 고른 등급보다 높게 나오면 부르는 쪽이 버립니다 */
create or replace function public.ac_num_cand(g text) returns text
language plpgsql volatile as $$
declare a text := (1000 + floor(random()*9000))::int::text; d text; x text; i int;
  runs6 text[] := array['012345','123456','234567','345678','456789','987654','876543','765432','654321','543210'];
  runs4 text[] := array['0123','1234','2345','3456','4567','5678','6789','9876','8765','7654','6543','5432','4321','3210'];
  runs4a text[] := array['1234','2345','3456','4567','5678','6789','9876','8765','7654','6543','5432','4321'];
begin
  if g = '5' then return a || repeat(floor(random()*10)::int::text, 6);
  elsif g = '4' then
    i := floor(random()*4)::int;
    if i = 0 then d := (1 + floor(random()*9))::int::text; return repeat(d, 4) || lpad(floor(random()*1e6)::int::text, 6, '0'); end if;
    if i = 1 then x := lpad(floor(random()*1000)::int::text, 3, '0'); return a || x || x; end if;
    if i = 2 then return a || repeat(floor(random()*10)::int::text, 3) || repeat(floor(random()*10)::int::text, 3); end if;
    return a || runs6[1 + floor(random()*10)::int];
  elsif g = '3' then
    i := floor(random()*3)::int;
    if i = 0 then return a || lpad(floor(random()*1000)::int::text, 3, '0') || repeat((array['7','8','9','0'])[1 + floor(random()*4)::int], 3); end if;
    if i = 1 then return a || lpad(floor(random()*100)::int::text, 2, '0') || runs4[1 + floor(random()*14)::int]; end if;
    return runs4a[1 + floor(random()*12)::int] || lpad(floor(random()*1e6)::int::text, 6, '0');
  end if;
  return a || lpad(floor(random()*1e6)::int::text, 6, '0');
end $$;

-- ── 지금 있는 번호를 10자리로 ──────────────────────────────────────────
create table if not exists public.ac_num_renumber (
  old_number text primary key, new_number text not null, owner_id uuid, star text, source text,
  created_at timestamptz not null default now()
);
alter table public.ac_num_renumber enable row level security;
revoke all on public.ac_num_renumber from anon, authenticated;
grant all on public.ac_num_renumber to service_role;

do $$
declare c record; r record; st text; nn text; tries int;
begin
  /* 예전 4~8자리 규칙을 떼어 냄 */
  for c in select conname from pg_constraint
            where conrelid = 'public.ac_line_numbers'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%{3,7}%' loop
    execute format('alter table public.ac_line_numbers drop constraint %I', c.conname);
  end loop;
  /* 쉬는(놓아 준) 예전 번호는 지움 — 다시 팔 일이 없음 */
  delete from public.ac_line_numbers where status <> 'active' and number !~ '^[1-9][0-9]{9}$';
  delete from public.ac_num_holds where number !~ '^[1-9][0-9]{9}$';
  /* 쓰는 번호: 낸 값에 맞는 등급으로 */
  for r in select * from public.ac_line_numbers where number !~ '^[1-9][0-9]{9}$' order by created_at loop
    st := case
      when r.source = 'free' then 'N'
      when length(r.number) = 4 then '5'
      when length(r.number) = 5 then case when r.grade = 'good' then '5' else '4' end
      when length(r.number) = 6 then '4'
      when length(r.number) = 7 then '3'
      when length(r.number) = 8 then case when r.grade = 'good' then '3' else 'N' end
      else 'N' end;
    tries := 0;
    loop
      tries := tries + 1;
      nn := public.ac_num_cand(st);
      exit when public.ac_num_grade(nn) = st and public.ac_num_free(nn, r.owner_id)
            and not exists (select 1 from public.ac_num_renumber where new_number = nn);
      if tries > 5000 then raise exception 'no number for %', r.number; end if;
    end loop;
    update public.ac_line_numbers set number = nn, grade = case when st = 'N' then 'normal' else 'good' end where number = r.number;
    update public.ac_direct_rooms set number = nn where number = r.number;
    update public.ac_num_transfers set status = 'cancelled' where number = r.number and status in ('offered', 'accepted');
    insert into public.ac_num_renumber(old_number, new_number, owner_id, star, source)
    values (r.number, nn, r.owner_id, st, r.source) on conflict (old_number) do nothing;
  end loop;
  /* 새 규칙: 10자리 */
  if not exists (select 1 from pg_constraint where conrelid = 'public.ac_line_numbers'::regclass and conname = 'ac_line_numbers_number_10') then
    alter table public.ac_line_numbers add constraint ac_line_numbers_number_10 check (number ~ '^[1-9][0-9]{9}$');
  end if;
end $$;

-- ── 10자리로 바뀐 함수들 ───────────────────────────────────────────────
create or replace function public.ac_num_lookup(p_number text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare n text := ac_num_clean(p_number); l ac_line_numbers; h hotlines; v_secure boolean;
begin
  if n !~ '^[1-9][0-9]{9}$' then return json_build_object('ok', false, 'error', 'bad'); end if;
  select * into l from ac_line_numbers where number = n and status = 'active';
  if l.number is null then return json_build_object('ok', false, 'error', 'none'); end if;
  if l.mode = 'off' then return json_build_object('ok', false, 'error', 'off'); end if;
  if l.target = 'person' then
    if auth.uid() is not null and l.owner_id = auth.uid() then return json_build_object('ok', false, 'error', 'self'); end if;
    if coalesce(ac_plan_until(l.owner_id), '-infinity') < now() then return json_build_object('ok', false, 'error', 'resting'); end if;
    return json_build_object('ok', true, 'kind', 'person', 'number', n, 'auto', l.mode = 'all');
  end if;
  select * into h from hotlines where id = l.hotline_id;
  if h.id is null or not ac_hotline_alive(h.id) then return json_build_object('ok', false, 'error', 'resting'); end if;
  v_secure := coalesce(h.tier, '') like '%\_secure';
  if auth.uid() is not null and h.owner_user_id = auth.uid() then
    return json_build_object('ok', true, 'kind', 'line', 'mine', true, 'hotline', h.id, 'title', h.title, 'number', n);
  end if;
  if l.first_used_at is null then update ac_line_numbers set first_used_at = now() where number = n; end if;
  return json_build_object('ok', true, 'kind', 'line', 'mine', false, 'title', h.title, 'tier', h.tier, 'secure', v_secure,
    'token', case when v_secure then null else h.invite_token end, 'number', n);
end $$;

/* 무료 일반 번호 3개 보여 주기 */
create or replace function public.ac_num_offer_free() returns json
language plpgsql volatile security definer set search_path = public as $$
declare out text[] := '{}'; c text; tries int := 0;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'error', 'login'); end if;
  while coalesce(array_length(out, 1), 0) < 3 and tries < 200 loop
    tries := tries + 1;
    c := ac_num_cand('N');
    if ac_num_grade(c) = 'N' and ac_num_free(c, auth.uid()) and not (c = any(out)) then out := out || c; end if;
  end loop;
  return json_build_object('ok', true, 'numbers', to_json(out));
end $$;

create or replace function public.ac_num_take_free(p_hotline uuid, p_number text) returns json
language plpgsql security definer set search_path = public as $$
declare n text := ac_num_clean(p_number); h hotlines;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'error', 'login'); end if;
  select * into h from hotlines where id = p_hotline and owner_user_id = auth.uid();
  if h.id is null then return json_build_object('ok', false, 'error', 'not_owner'); end if;
  if not ac_hotline_alive(h.id) then return json_build_object('ok', false, 'error', 'line_ended'); end if;
  if exists (select 1 from ac_line_numbers where hotline_id = h.id and status = 'active') then
    return json_build_object('ok', false, 'error', 'has_number'); end if;
  if exists (select 1 from ac_line_numbers where hotline_id = h.id and source = 'free') then
    return json_build_object('ok', false, 'error', 'free_used'); end if;
  if coalesce(ac_num_grade(n), '') <> 'N' then return json_build_object('ok', false, 'error', 'not_free'); end if;
  if not ac_num_free(n, auth.uid()) then return json_build_object('ok', false, 'error', 'taken'); end if;
  insert into ac_line_numbers(number, hotline_id, owner_id, grade, source)
  values (n, h.id, auth.uid(), 'normal', 'free')
  on conflict (number) do update set hotline_id = excluded.hotline_id, owner_id = excluded.owner_id,
    grade = 'normal', source = 'free', status = 'active', released_at = null, keep_until = null, created_at = now(), target = 'line', first_used_at = null;
  return json_build_object('ok', true, 'number', n);
end $$;

create or replace function public.ac_num_take_free_person(p_number text) returns json
language plpgsql security definer set search_path = public as $$
declare n text := ac_num_clean(p_number);
begin
  if auth.uid() is null then return json_build_object('ok', false, 'error', 'login'); end if;
  if exists (select 1 from ac_line_numbers where owner_id = auth.uid() and source = 'free' and target = 'person') then
    return json_build_object('ok', false, 'error', 'free_used'); end if;
  if coalesce(ac_num_grade(n), '') <> 'N' then return json_build_object('ok', false, 'error', 'not_free'); end if;
  if not ac_num_free(n, auth.uid()) then return json_build_object('ok', false, 'error', 'taken'); end if;
  insert into ac_line_numbers(number, hotline_id, owner_id, grade, source, target, mode)
  values (n, null, auth.uid(), 'normal', 'free', 'person', 'request')
  on conflict (number) do update set hotline_id = null, owner_id = excluded.owner_id, grade = 'normal', source = 'free',
    target = 'person', mode = 'request', status = 'active', released_at = null, keep_until = null, created_at = now(), first_used_at = null;
  return json_build_object('ok', true, 'number', n);
end $$;

/* 번호 하나 물어보기: 살 수 있나 · 등급 · 값 */
create or replace function public.ac_num_check(p_number text) returns json
language plpgsql stable security definer set search_path = public as $$
declare n text := ac_num_clean(p_number);
begin
  if n !~ '^[1-9][0-9]{9}$' then return json_build_object('ok', false, 'error', 'bad'); end if;
  return json_build_object('ok', true, 'number', n, 'shown', ac_num_shown(n), 'star', ac_num_grade(n), 'good', ac_num_is_good(n),
    'price', ac_num_price(n), 'sku', ac_num_sku(n), 'free', ac_num_free(n, auth.uid()));
end $$;

/* 좋은 번호 고르기: p_len 자리에 등급(5 · 4 · 3)을 넣습니다. p_contains 를 넣으면 그 숫자가 들어간 번호만 */
create or replace function public.ac_num_good_list(p_len int, p_contains text default null, p_limit int default 40) returns json
language plpgsql volatile security definer set search_path = public as $$
declare g text := p_len::text; want text := ac_num_clean(p_contains); lim int := least(greatest(coalesce(p_limit, 40), 1), 60);
        out json[] := '{}'; seen text[] := '{}'; c text; tries int := 0; maxt int;
begin
  if g not in ('5', '4', '3') then return '[]'::json; end if;
  maxt := case when want = '' then lim * 30 else 4000 end;
  while coalesce(array_length(out, 1), 0) < lim and tries < maxt loop
    tries := tries + 1;
    c := ac_num_cand(g);
    if want <> '' and position(want in c) = 0 then
      /* 찾는 숫자를 끝 또는 가운데에 넣어 봄 */
      if length(want) <= 3 then c := left(c, 10 - length(want)) || want; end if;
    end if;
    if c = any(seen) then continue; end if;
    seen := seen || c;
    if ac_num_grade(c) <> g then continue; end if;
    if want <> '' and position(want in c) = 0 then continue; end if;
    if not ac_num_free(c, auth.uid()) then continue; end if;
    out := out || json_build_object('number', c, 'shown', ac_num_shown(c), 'star', g, 'price', ac_num_price(c));
  end loop;
  return coalesce(array_to_json(out), '[]'::json);
end $$;

/* 내 번호 목록 — 등급 · 4-3-3 도 함께 */
create or replace function public.ac_num_mine() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'number', l.number, 'shown', ac_num_shown(l.number), 'star', ac_num_grade(l.number),
           'hotline', l.hotline_id, 'grade', l.grade, 'source', l.source,
           'target', l.target, 'mode', l.mode,
           'title', h.title,
           'alive', case when l.target = 'person' then coalesce(ac_plan_until(l.owner_id), '-infinity') > now() else ac_hotline_alive(l.hotline_id) end,
           'keep_until', l.keep_until, 'expires_at', h.expires_at, 'since', l.created_at,
           'rooms', (select count(*) from ac_direct_rooms d where d.owner_id = l.owner_id and d.number = l.number),
           'renumbered_from', (select r.old_number from ac_num_renumber r where r.new_number = l.number),
           'can_refund', (l.source = 'purchase' and l.payment_id is not null and l.first_used_at is null and l.created_at > now() - interval '7 days'))
           order by (l.target = 'person') desc, l.created_at), '[]'::json)
    from ac_line_numbers l left join hotlines h on h.id = l.hotline_id
   where l.owner_id = auth.uid() and l.status = 'active'
$$;

/* 관리자 현황: 등급별로 */
create or replace function public.ac_num_admin_overview() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(is_global_admin(), false) then return json_build_object('ok', false, 'error', 'admin'); end if;
  return json_build_object('ok', true,
    'counts', (select coalesce(json_object_agg(k, c), '{}'::json) from (
       select 'star' || coalesce(ac_num_grade(number), '?') || '_' || source as k, count(*) as c from ac_line_numbers where status = 'active' group by 1) z),
    'refunds', (select coalesce(json_agg(json_build_object('id', r.id, 'number', r.number, 'sku', r.sku, 'price', r.price, 'status', r.status,
       'created_at', r.created_at, 'done_at', r.done_at, 'note', r.note,
       'who', (select split_part(email, '@', 1) from auth.users where id = r.user_id),
       'method', p.method, 'ext', p.external_payment_id) order by r.created_at desc), '[]'::json)
       from ac_num_refunds r left join payments p on p.id = r.payment_id where r.created_at > now() - interval '180 days'),
    'transfers', (select coalesce(json_agg(json_build_object('number', t.number, 'status', t.status, 'created_at', t.created_at, 'done_at', t.done_at)
       order by t.created_at desc), '[]'::json) from (select * from ac_num_transfers order by created_at desc limit 50) t),
    'sales', (select coalesce(json_agg(json_build_object('sku', google_product_id, 'n', n, 'won', won) order by won desc), '[]'::json) from (
       select google_product_id, count(*) n, sum(amount_minor_units) won from payments
        where status = 'completed' and google_product_id like 'ac\_num\_%' group by 1) s),
    'renumbered', (select coalesce(json_agg(json_build_object('old', old_number, 'new', new_number, 'star', star, 'source', source)), '[]'::json) from ac_num_renumber));
end $$;

grant execute on function public.ac_bn_same(text), public.ac_bn_is_seq(text), public.ac_num_grade(text), public.ac_num_shown(text),
  public.ac_num_is_good(text), public.ac_num_sku(text), public.ac_num_price(text),
  public.ac_num_lookup(text), public.ac_num_check(text), public.ac_num_good_list(int, text, int) to anon, authenticated;
grant execute on function public.ac_num_offer_free(), public.ac_num_take_free(uuid, text), public.ac_num_take_free_person(text),
  public.ac_num_mine(), public.ac_num_admin_overview() to authenticated;
revoke all on function public.ac_num_cand(text) from public, anon, authenticated;

select 'numbers 10 ok' as result,
       (select coalesce(string_agg(old_number || ' → ' || ac_num_shown(new_number) || ' (' || case star when 'N' then '일반' else '★' || star end || ')', ' · '), '바꾼 번호 없음')
          from ac_num_renumber) as renumbered;
