-- =====================================================================
-- 에일리어스콜 — 회선번호 (2026-11-01 · 결정 2026-10-29 「에일리어스콜 승인 후 할 일」)
--
--   번호      4~8자리 숫자, 0으로 시작하지 않음. 자릿수가 달라도 겹치지 않음([연결]을 눌러야 걸림)
--   무엇에    번호 하나 = 회선(hotlines) 하나. 번호를 누르면 그 회선에 "참가 요청" → 주인 승인(지금의 회선 초대와 같음)
--   값        자릿수   기본      좋은 번호
--             4      110,000   220,000
--             5       55,000   110,000
--             6       33,000    66,000
--             7       11,000    22,000
--             8        무료      11,000      (회선마다 8자리 기본 번호 하나 무료)
--   좋은 번호  목록(ac_good_numbers, 3_good_numbers.sql 이 채움)에 있는 번호
--   쓰는 동안  회선이 살아 있는 동안(만료 전) 번호로 연결됩니다.
--   잡아 두기  회선이 끝나도 기본 90일 · 좋은 번호 180일 동안 내 번호로 남습니다(그 뒤 6개월 쉬고 다시 판매)
--   🔴 돈이 드는 번호는 서버(aliascall-google-verify · aliascall-web-pay)가 결제를 확인한 뒤에만
--      ac_num_grant 로 들어옵니다. 화면은 ac_num_hold 로 "이 번호를 사려 한다" 고 2시간 잡아 둘 뿐입니다.
--   ⚠ 표는 화면이 직접 못 읽습니다(정책 없음). 함수만 씁니다.
--   ⚠ 다시 돌려도 안전합니다. 3_good_numbers.sql 을 이 파일 다음에 돌리세요.
-- =====================================================================

create table if not exists public.ac_line_numbers (
  number       text primary key check (number ~ '^[1-9][0-9]{3,7}$'),
  hotline_id   uuid,                                   -- 연결되는 회선 (쉬는 번호는 비어 있을 수 있음)
  owner_id     uuid,                                   -- 번호 주인
  grade        text not null default 'normal',         -- normal · good
  source       text not null default 'free',           -- free · purchase · admin · transfer
  status       text not null default 'active',         -- active · released
  payment_id   uuid,
  created_at   timestamptz not null default now(),
  released_at  timestamptz,
  keep_until   timestamptz                             -- "1년 더 잡아 두기" 로 늘어난 날
);
create unique index if not exists ac_line_numbers_hotline on public.ac_line_numbers(hotline_id) where status = 'active';
create index if not exists ac_line_numbers_owner on public.ac_line_numbers(owner_id, status);
alter table public.ac_line_numbers enable row level security;

create table if not exists public.ac_good_numbers (
  number text primary key check (number ~ '^[1-9][0-9]{3,7}$'),
  len    int generated always as (length(number)) stored
);
create index if not exists ac_good_numbers_len on public.ac_good_numbers(len);
alter table public.ac_good_numbers enable row level security;

create table if not exists public.ac_num_holds (
  number      text primary key,
  user_id     uuid not null,
  hotline_id  uuid not null,
  sku         text not null,
  expires_at  timestamptz not null default now() + interval '2 hours'
);
alter table public.ac_num_holds enable row level security;

revoke all on public.ac_line_numbers, public.ac_good_numbers, public.ac_num_holds from anon, authenticated;
grant all on public.ac_line_numbers, public.ac_good_numbers, public.ac_num_holds to service_role;

-- ── 도우미 ──────────────────────────────────────────────────────────
create or replace function public.ac_num_clean(p text) returns text
language sql immutable as $$ select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') $$;

create or replace function public.ac_num_is_good(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ac_good_numbers where number = ac_num_clean(p))
$$;

/* 상품 번호(스토어 SKU). 8자리 기본은 무료 → null */
create or replace function public.ac_num_sku(p text) returns text
language plpgsql stable security definer set search_path = public as $$
declare n text := ac_num_clean(p); g boolean;
begin
  if n !~ '^[1-9][0-9]{3,7}$' then return null; end if;
  g := ac_num_is_good(n);
  if length(n) = 8 and not g then return null; end if;
  return 'ac_num_' || length(n) || '_' || case when g then 'good' else 'basic' end;
end $$;

create or replace function public.ac_num_price(p text) returns int
language plpgsql stable security definer set search_path = public as $$
declare n text := ac_num_clean(p); g boolean; base int;
begin
  if n !~ '^[1-9][0-9]{3,7}$' then return null; end if;
  g := ac_num_is_good(n);
  base := case length(n) when 4 then 110000 when 5 then 55000 when 6 then 33000 when 7 then 11000 else 0 end;
  if length(n) = 8 then return case when g then 11000 else 0 end; end if;
  return case when g then base * 2 else base end;
end $$;

/* 회선이 살아 있나 (만료 전 · 보관함에 넣지 않음) */
create or replace function public.ac_hotline_alive(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from hotlines h where h.id = p_id
                 and (h.expires_at is null or h.expires_at > now()) and h.archived_at is null)
$$;

/* 이 번호를 지금 가질 수 있나: 쓰는 중이 아니고, 쉬는 6개월이 지났고, 남이 잡아 두지 않았음 */
create or replace function public.ac_num_free(p text, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from ac_line_numbers l where l.number = ac_num_clean(p)
                       and (l.status = 'active' or (l.released_at is not null and l.released_at > now() - interval '6 months')))
     and not exists (select 1 from ac_num_holds h where h.number = ac_num_clean(p) and h.expires_at > now()
                       and h.user_id is distinct from p_user)
$$;

-- ── ① 번호로 걸기 (로그인 없이도) ─────────────────────────────────────
/* 돌려주는 것: ok · title · tier · secure · token(암호화 회선이 아니면) · mine(내 회선) · hotline(내 회선일 때만)
   error: bad · none(없는 번호) · resting(회선이 끝나 쉬는 중) */
create or replace function public.ac_num_lookup(p_number text) returns json
language plpgsql stable security definer set search_path = public as $$
declare n text := ac_num_clean(p_number); l ac_line_numbers; h hotlines; v_secure boolean;
begin
  if n !~ '^[1-9][0-9]{3,7}$' then return json_build_object('ok', false, 'error', 'bad'); end if;
  select * into l from ac_line_numbers where number = n and status = 'active';
  if l.number is null then return json_build_object('ok', false, 'error', 'none'); end if;
  select * into h from hotlines where id = l.hotline_id;
  if h.id is null or not ac_hotline_alive(h.id) then return json_build_object('ok', false, 'error', 'resting'); end if;
  v_secure := coalesce(h.tier, '') like '%\_secure';
  if auth.uid() is not null and h.owner_user_id = auth.uid() then
    return json_build_object('ok', true, 'mine', true, 'hotline', h.id, 'title', h.title, 'number', n);
  end if;
  return json_build_object('ok', true, 'mine', false, 'title', h.title, 'tier', h.tier, 'secure', v_secure,
    'token', case when v_secure then null else h.invite_token end, 'number', n);
end $$;

-- ── ② 내 번호들 ───────────────────────────────────────────────────────
create or replace function public.ac_num_mine() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'number', l.number, 'hotline', l.hotline_id, 'grade', l.grade, 'source', l.source,
           'title', h.title, 'alive', ac_hotline_alive(l.hotline_id), 'keep_until', l.keep_until,
           'expires_at', h.expires_at) order by l.created_at), '[]'::json)
    from ac_line_numbers l left join hotlines h on h.id = l.hotline_id
   where l.owner_id = auth.uid() and l.status = 'active'
$$;

-- ── ③ 무료 8자리 번호 (회선마다 하나) ────────────────────────────────
create or replace function public.ac_num_offer_free() returns json
language plpgsql volatile security definer set search_path = public as $$
declare out text[] := '{}'; c text; tries int := 0;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'error', 'login'); end if;
  while coalesce(array_length(out, 1), 0) < 3 and tries < 200 loop
    tries := tries + 1;
    c := (10000000 + floor(random() * 90000000))::bigint::text;
    if not ac_num_is_good(c) and ac_num_free(c, auth.uid()) and not (c = any(out)) then out := out || c; end if;
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
    return json_build_object('ok', false, 'error', 'free_used'); end if;   -- 회선마다 무료는 한 번
  if n !~ '^[1-9][0-9]{7}$' or ac_num_is_good(n) then return json_build_object('ok', false, 'error', 'not_free'); end if;
  if not ac_num_free(n, auth.uid()) then return json_build_object('ok', false, 'error', 'taken'); end if;
  insert into ac_line_numbers(number, hotline_id, owner_id, grade, source)
  values (n, h.id, auth.uid(), 'normal', 'free')
  on conflict (number) do update set hotline_id = excluded.hotline_id, owner_id = excluded.owner_id,
    grade = 'normal', source = 'free', status = 'active', released_at = null, keep_until = null, created_at = now();
  return json_build_object('ok', true, 'number', n);
end $$;

-- ── ④ 사는 번호 찾기 · 잡아 두기 ──────────────────────────────────────
/* 번호 하나를 물어보기: 살 수 있나 · 값 · 좋은 번호인가 */
create or replace function public.ac_num_check(p_number text) returns json
language plpgsql stable security definer set search_path = public as $$
declare n text := ac_num_clean(p_number);
begin
  if n !~ '^[1-9][0-9]{3,7}$' then return json_build_object('ok', false, 'error', 'bad'); end if;
  return json_build_object('ok', true, 'number', n, 'good', ac_num_is_good(n), 'price', ac_num_price(n),
    'sku', ac_num_sku(n), 'free', ac_num_free(n, auth.uid()));
end $$;

/* 좋은 번호 목록에서 아직 주인 없는 번호를 몇 개 (자릿수별 · 들어 있는 숫자로 찾기) */
create or replace function public.ac_num_good_list(p_len int, p_contains text default null, p_limit int default 40) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('number', g.number, 'price', ac_num_price(g.number))), '[]'::json)
    from (select number from ac_good_numbers
           where len = p_len and (coalesce(ac_num_clean(p_contains), '') = '' or position(ac_num_clean(p_contains) in number) > 0)
             and ac_num_free(number, auth.uid())
           order by case when coalesce(ac_num_clean(p_contains), '') = '' then random() else 0 end, number
           limit least(greatest(coalesce(p_limit, 40), 1), 100)) g
$$;

/* 사기 직전: 2시간 잡아 두고 상품 번호를 돌려줍니다. 결제가 끝나면 서버가 ac_num_grant 로 넣습니다 */
create or replace function public.ac_num_hold(p_hotline uuid, p_number text) returns json
language plpgsql security definer set search_path = public as $$
declare n text := ac_num_clean(p_number); h hotlines; v_sku text;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'error', 'login'); end if;
  select * into h from hotlines where id = p_hotline and owner_user_id = auth.uid();
  if h.id is null then return json_build_object('ok', false, 'error', 'not_owner'); end if;
  if not ac_hotline_alive(h.id) then return json_build_object('ok', false, 'error', 'line_ended'); end if;
  v_sku := ac_num_sku(n);
  if v_sku is null then return json_build_object('ok', false, 'error', 'not_for_sale'); end if;
  if not ac_num_free(n, auth.uid()) then return json_build_object('ok', false, 'error', 'taken'); end if;
  /* 내 예전 잡아 두기 · 이 번호의 지난 잡아 두기만 지웁니다(남이 결제 중인 것은 건드리지 않음) */
  delete from ac_num_holds where user_id = auth.uid() or (number = n and expires_at < now());
  insert into ac_num_holds(number, user_id, hotline_id, sku) values (n, auth.uid(), h.id, v_sku);
  return json_build_object('ok', true, 'number', n, 'sku', v_sku, 'price', ac_num_price(n));
end $$;

/* 결제 확인 뒤(서버 전용): 이 사람이 잡아 둔 번호를 회선에 붙입니다. 예전 번호는 놓아 줍니다(무료 번호는 6개월 쉼) */
create or replace function public.ac_num_grant(p_user uuid, p_sku text, p_payment uuid) returns json
language plpgsql security definer set search_path = public as $$
declare hd ac_num_holds;
begin
  select * into hd from ac_num_holds where user_id = p_user and sku = p_sku order by expires_at desc limit 1;
  if hd.number is null then return json_build_object('ok', false, 'error', 'no_hold'); end if;
  if exists (select 1 from ac_line_numbers where number = hd.number and status = 'active' and owner_id is distinct from p_user) then
    return json_build_object('ok', false, 'error', 'taken'); end if;
  update ac_line_numbers set status = 'released', released_at = now(), hotline_id = null
   where hotline_id = hd.hotline_id and status = 'active' and number <> hd.number;
  insert into ac_line_numbers(number, hotline_id, owner_id, grade, source, payment_id)
  values (hd.number, hd.hotline_id, p_user, case when ac_num_is_good(hd.number) then 'good' else 'normal' end, 'purchase', p_payment)
  on conflict (number) do update set hotline_id = excluded.hotline_id, owner_id = excluded.owner_id, grade = excluded.grade,
    source = 'purchase', status = 'active', payment_id = excluded.payment_id, released_at = null, keep_until = null, created_at = now();
  delete from ac_num_holds where number = hd.number;
  return json_build_object('ok', true, 'number', hd.number, 'hotline', hd.hotline_id);
end $$;

/* 내 번호를 다른 (살아 있는) 내 회선으로 옮기기 — 회선을 새로 산 뒤 번호를 이어 쓸 때 */
create or replace function public.ac_num_move(p_number text, p_hotline uuid) returns json
language plpgsql security definer set search_path = public as $$
declare n text := ac_num_clean(p_number);
begin
  if not exists (select 1 from ac_line_numbers where number = n and owner_id = auth.uid() and status = 'active') then
    return json_build_object('ok', false, 'error', 'not_owner'); end if;
  if not exists (select 1 from hotlines where id = p_hotline and owner_user_id = auth.uid()) or not ac_hotline_alive(p_hotline) then
    return json_build_object('ok', false, 'error', 'line_ended'); end if;
  if exists (select 1 from ac_line_numbers where hotline_id = p_hotline and status = 'active' and number <> n) then
    return json_build_object('ok', false, 'error', 'has_number'); end if;
  update ac_line_numbers set hotline_id = p_hotline where number = n;
  return json_build_object('ok', true, 'number', n);
end $$;

/* 정리(하루 한 번 · 관리자 · 예약 작업): 회선이 끝나고 기본 90일 · 좋은 번호 180일(+잡아 두기)이 지나면 놓아 줌 */
create or replace function public.ac_num_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  delete from ac_num_holds where expires_at < now() - interval '3 days';   -- 결제가 늦게 확인되는 경우를 위해 사흘 남김
  update ac_line_numbers l set status = 'released', released_at = now(), hotline_id = null
   where l.status = 'active'
     and not ac_hotline_alive(l.hotline_id)
     and coalesce((select h.expires_at from hotlines h where h.id = l.hotline_id), l.created_at)
         + case when l.grade = 'good' then interval '180 days' else interval '90 days' end < now()
     and (l.keep_until is null or l.keep_until < now());
  get diagnostics c = row_count;
  return c;
end $$;

revoke all on function public.ac_num_grant(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.ac_num_sweep() from public, anon, authenticated;
grant execute on function public.ac_num_grant(uuid, text, uuid), public.ac_num_sweep() to service_role;
grant execute on function public.ac_num_lookup(text), public.ac_num_check(text), public.ac_num_good_list(int, text, int),
  public.ac_num_is_good(text), public.ac_num_price(text), public.ac_num_sku(text) to anon, authenticated;
grant execute on function public.ac_num_mine(), public.ac_num_offer_free(), public.ac_num_take_free(uuid, text),
  public.ac_num_hold(uuid, text), public.ac_num_move(text, uuid) to authenticated;

select 'line numbers ok' as result;
