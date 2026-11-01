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
  keep_until   timestamptz,                            -- "1년 더 잡아 두기" 로 늘어난 날
  first_used_at timestamptz                            -- 남이 이 번호로 처음 찾아온 때(7일 환불 판단)
);
alter table public.ac_line_numbers add column if not exists first_used_at timestamptz;
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

create table if not exists public.ac_num_intents (       -- 1년 더 잡아 두기: 어느 번호에 쓸지 결제 전에 적어 둠
  user_id uuid not null, kind text not null, number text not null, created_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.ac_num_intents enable row level security;

create table if not exists public.ac_num_transfers (     -- 명의 이전 (부름번호와 같은 방식)
  id uuid primary key default gen_random_uuid(),
  number text not null, seller uuid, buyer uuid,
  status text not null default 'offered',                 -- offered · accepted · done · cancelled · declined
  created_at timestamptz not null default now(), accepted_at timestamptz, done_at timestamptz, payment_id uuid
);
create unique index if not exists ac_num_transfers_open on public.ac_num_transfers(number) where status in ('offered', 'accepted');
alter table public.ac_num_transfers enable row level security;

create table if not exists public.ac_num_refunds (       -- 7일 환불 신청 → 관리자가 스토어 · 카드사에서 환불 후 [환불 완료]
  id uuid primary key default gen_random_uuid(),
  number text not null, user_id uuid not null, payment_id uuid, sku text, price int,
  status text not null default 'requested',               -- requested · done · rejected
  created_at timestamptz not null default now(), done_at timestamptz, note text
);
alter table public.ac_num_refunds enable row level security;

revoke all on public.ac_line_numbers, public.ac_good_numbers, public.ac_num_holds, public.ac_num_intents,
  public.ac_num_transfers, public.ac_num_refunds from anon, authenticated;
grant all on public.ac_line_numbers, public.ac_good_numbers, public.ac_num_holds, public.ac_num_intents,
  public.ac_num_transfers, public.ac_num_refunds to service_role;

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
language plpgsql volatile security definer set search_path = public as $$
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
  if l.first_used_at is null then update ac_line_numbers set first_used_at = now() where number = n; end if;   -- 7일 환불 판단
  return json_build_object('ok', true, 'mine', false, 'title', h.title, 'tier', h.tier, 'secure', v_secure,
    'token', case when v_secure then null else h.invite_token end, 'number', n);
end $$;

-- ── ② 내 번호들 ───────────────────────────────────────────────────────
create or replace function public.ac_num_mine() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'number', l.number, 'hotline', l.hotline_id, 'grade', l.grade, 'source', l.source,
           'title', h.title, 'alive', ac_hotline_alive(l.hotline_id), 'keep_until', l.keep_until,
           'expires_at', h.expires_at, 'since', l.created_at,
           'can_refund', (l.source = 'purchase' and l.payment_id is not null and l.first_used_at is null and l.created_at > now() - interval '7 days'))
           order by l.created_at), '[]'::json)
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
declare hd ac_num_holds; it ac_num_intents; t ac_num_transfers; v_base timestamptz;
begin
  /* 1년 더 잡아 두기 (1,100원) */
  if p_sku = 'ac_num_keep' then
    select * into it from ac_num_intents where user_id = p_user and kind = 'keep';
    if it.number is null then return json_build_object('ok', false, 'error', 'no_hold'); end if;
    select coalesce(h.expires_at, l.created_at) + case when l.grade = 'good' then interval '180 days' else interval '90 days' end
      into v_base from ac_line_numbers l left join hotlines h on h.id = l.hotline_id
     where l.number = it.number and l.owner_id = p_user and l.status = 'active';
    if not found then return json_build_object('ok', false, 'error', 'not_owner'); end if;
    update ac_line_numbers set keep_until = greatest(now(), coalesce(keep_until, now()), coalesce(v_base, now())) + interval '1 year'
     where number = it.number;
    delete from ac_num_intents where user_id = p_user and kind = 'keep';
    return json_build_object('ok', true, 'kept', true, 'number', it.number,
      'keep_until', (select keep_until from ac_line_numbers where number = it.number));
  end if;
  /* 명의 이전 수수료 (5,500원 · 받는 분이 냄) */
  if p_sku = 'ac_num_transfer' then
    select * into t from ac_num_transfers where buyer = p_user and status = 'accepted' and created_at > now() - interval '8 days'
     order by accepted_at desc limit 1 for update;
    if t.id is null then return json_build_object('ok', false, 'error', 'no_hold'); end if;
    if not exists (select 1 from ac_line_numbers where number = t.number and owner_id = t.seller and status = 'active') then
      update ac_num_transfers set status = 'cancelled' where id = t.id;
      return json_build_object('ok', false, 'error', 'seller_gone'); end if;
    update ac_line_numbers set owner_id = p_user, hotline_id = null, source = 'transfer', created_at = now(),
      payment_id = p_payment, first_used_at = null where number = t.number;
    update ac_num_transfers set status = 'done', done_at = now(), payment_id = p_payment where id = t.id;
    return json_build_object('ok', true, 'transferred', true, 'number', t.number, 'hotline', null);
  end if;
  select * into hd from ac_num_holds where user_id = p_user and sku = p_sku order by expires_at desc limit 1;
  if hd.number is null then return json_build_object('ok', false, 'error', 'no_hold'); end if;
  if exists (select 1 from ac_line_numbers where number = hd.number and status = 'active' and owner_id is distinct from p_user) then
    return json_build_object('ok', false, 'error', 'taken'); end if;
  /* 회선의 예전 번호: 무료 번호는 놓아 주고(6개월 쉼), 돈 주고 산 번호는 회선에서만 떼어 내 내 번호로 남김(다른 회선에 붙일 수 있음) */
  update ac_line_numbers set status = case when source = 'free' then 'released' else status end,
         released_at = case when source = 'free' then now() else released_at end, hotline_id = null
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


-- ── ⑤ 1년 더 잡아 두기 · 명의 이전 · 7일 환불 ───────────────────────────
/* 잡아 두기 결제 직전: 어느 번호에 쓸지 적어 둠 → 상품 ac_num_keep (1,100원) */
create or replace function public.ac_num_keep_start(p_number text) returns json
language plpgsql security definer set search_path = public as $$
declare n text := ac_num_clean(p_number);
begin
  if auth.uid() is null then return json_build_object('ok', false, 'error', 'login'); end if;
  if not exists (select 1 from ac_line_numbers where number = n and owner_id = auth.uid() and status = 'active') then
    return json_build_object('ok', false, 'error', 'not_owner'); end if;
  insert into ac_num_intents(user_id, kind, number) values (auth.uid(), 'keep', n)
  on conflict (user_id, kind) do update set number = excluded.number, created_at = now();
  return json_build_object('ok', true, 'sku', 'ac_num_keep', 'price', 1100, 'number', n);
end $$;

/* ① 넘기는 분: 신청 (받을 분의 로그인 이메일 = 화면이 닉네임에서 만들어 줌) */
create or replace function public.ac_num_transfer_offer(p_number text, p_buyer_email text) returns json
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); n text := ac_num_clean(p_number); v_buyer uuid; v_id uuid;
begin
  if v_me is null then return json_build_object('ok', false, 'error', 'login'); end if;
  if not exists (select 1 from ac_line_numbers where number = n and owner_id = v_me and status = 'active') then
    return json_build_object('ok', false, 'error', 'not_owner'); end if;
  select id into v_buyer from auth.users where lower(email) = lower(trim(p_buyer_email)) limit 1;
  if v_buyer is null then return json_build_object('ok', false, 'error', 'no_user'); end if;
  if v_buyer = v_me then return json_build_object('ok', false, 'error', 'self'); end if;
  if (select count(*) from ac_num_transfers where seller = v_me and created_at > now() - interval '1 day') >= 10 then
    return json_build_object('ok', false, 'error', 'too_many'); end if;
  update ac_num_transfers set status = 'cancelled'
   where number = n and status in ('offered', 'accepted') and created_at <= now() - interval '7 days';
  if exists (select 1 from ac_num_transfers where number = n and status in ('offered', 'accepted')) then
    return json_build_object('ok', false, 'error', 'pending'); end if;
  insert into ac_num_transfers(number, seller, buyer) values (n, v_me, v_buyer) returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end $$;

/* ② 받는 분: 수락 → 수수료 결제(ac_num_transfer)가 확인되면 서버가 옮김 */
create or replace function public.ac_num_transfer_accept(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); t ac_num_transfers;
begin
  if v_me is null then return json_build_object('ok', false, 'error', 'login'); end if;
  select * into t from ac_num_transfers where id = p_id and buyer = v_me for update;
  if t.id is null or t.status not in ('offered', 'accepted') or t.created_at <= now() - interval '7 days' then
    return json_build_object('ok', false, 'error', 'expired'); end if;
  if not exists (select 1 from ac_line_numbers where number = t.number and owner_id = t.seller and status = 'active') then
    update ac_num_transfers set status = 'cancelled' where id = t.id;
    return json_build_object('ok', false, 'error', 'seller_gone'); end if;
  update ac_num_transfers set status = 'offered', accepted_at = null where buyer = v_me and status = 'accepted' and id <> t.id;
  update ac_num_transfers set status = 'accepted', accepted_at = now() where id = t.id;
  return json_build_object('ok', true, 'need_pay', true, 'sku', 'ac_num_transfer', 'price', 5500, 'number', t.number);
end $$;

create or replace function public.ac_num_transfer_cancel(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  update ac_num_transfers set status = case when seller = v_me then 'cancelled' else 'declined' end
   where id = p_id and (seller = v_me or buyer = v_me) and status in ('offered', 'accepted');
  if not found then return json_build_object('ok', false, 'error', 'expired'); end if;
  return json_build_object('ok', true);
end $$;

create or replace function public.ac_num_transfers_mine() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', t.id, 'number', t.number,
           'role', case when t.seller = auth.uid() then 'seller' else 'buyer' end,
           'other', case when u.email like '%@guest.aliascall.internal' then split_part(u.email, '@', 1) else u.email end,
           'status', case when t.status in ('offered', 'accepted') and t.created_at <= now() - interval '7 days' then 'expired' else t.status end,
           'created_at', t.created_at, 'done_at', t.done_at) order by t.created_at desc), '[]'::json)
    from ac_num_transfers t
    left join auth.users u on u.id = case when t.seller = auth.uid() then t.buyer else t.seller end
   where (t.seller = auth.uid() or t.buyer = auth.uid()) and t.created_at > now() - interval '90 days'
$$;

/* 7일 환불 신청: 산 지 7일 안 · 아직 아무도 이 번호로 찾아오지 않음 → 번호를 바로 놓아 주고 환불 신청을 남김 */
create or replace function public.ac_num_refund_request(p_number text) returns json
language plpgsql security definer set search_path = public as $$
declare n text := ac_num_clean(p_number); l ac_line_numbers; v_pay record;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'error', 'login'); end if;
  select * into l from ac_line_numbers where number = n and owner_id = auth.uid() and status = 'active';
  if l.number is null then return json_build_object('ok', false, 'error', 'not_owner'); end if;
  if l.source <> 'purchase' or l.payment_id is null then return json_build_object('ok', false, 'error', 'not_bought'); end if;
  if l.created_at < now() - interval '7 days' then return json_build_object('ok', false, 'error', 'too_late'); end if;
  if l.first_used_at is not null then return json_build_object('ok', false, 'error', 'used'); end if;
  select amount_minor_units as amt, google_product_id as sku into v_pay from payments where id = l.payment_id;
  update ac_line_numbers set status = 'released', hotline_id = null, released_at = now() - interval '6 months' where number = n;   -- 쓰지 않은 번호라 바로 다시 판매
  insert into ac_num_refunds(number, user_id, payment_id, sku, price) values (n, auth.uid(), l.payment_id, v_pay.sku, v_pay.amt);
  return json_build_object('ok', true, 'number', n);
end $$;

/* 관리자: 환불 신청 목록 · 환불 완료 표시 · 이전 · 번호 현황 */
create or replace function public.ac_num_admin_overview() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(is_global_admin(), false) then return json_build_object('ok', false, 'error', 'admin'); end if;
  return json_build_object('ok', true,
    'counts', (select coalesce(json_object_agg(k, c), '{}'::json) from (
       select length(number)::text || '_' || grade || '_' || source as k, count(*) as c from ac_line_numbers where status = 'active' group by 1) z),
    'refunds', (select coalesce(json_agg(json_build_object('id', r.id, 'number', r.number, 'sku', r.sku, 'price', r.price, 'status', r.status,
       'created_at', r.created_at, 'done_at', r.done_at, 'note', r.note,
       'who', (select split_part(email, '@', 1) from auth.users where id = r.user_id),
       'method', p.method, 'ext', p.external_payment_id) order by r.created_at desc), '[]'::json)
       from ac_num_refunds r left join payments p on p.id = r.payment_id where r.created_at > now() - interval '180 days'),
    'transfers', (select coalesce(json_agg(json_build_object('number', t.number, 'status', t.status, 'created_at', t.created_at, 'done_at', t.done_at)
       order by t.created_at desc), '[]'::json) from (select * from ac_num_transfers order by created_at desc limit 50) t),
    'sales', (select coalesce(json_agg(json_build_object('sku', google_product_id, 'n', n, 'won', won) order by won desc), '[]'::json) from (
       select google_product_id, count(*) n, sum(amount_minor_units) won from payments
        where status = 'completed' and google_product_id like 'ac\_num\_%' group by 1) s));
end $$;

create or replace function public.ac_num_admin_refund_done(p_id uuid, p_ok boolean, p_note text default null) returns json
language plpgsql security definer set search_path = public as $$
declare r ac_num_refunds;
begin
  if not coalesce(is_global_admin(), false) then return json_build_object('ok', false, 'error', 'admin'); end if;
  update ac_num_refunds set status = case when p_ok then 'done' else 'rejected' end, done_at = now(), note = p_note
   where id = p_id and status = 'requested' returning * into r;
  if r.id is null then return json_build_object('ok', false, 'error', 'gone'); end if;
  if p_ok and r.payment_id is not null then update payments set status = 'refunded' where id = r.payment_id; end if;
  return json_build_object('ok', true);
end $$;

grant execute on function public.ac_num_keep_start(text), public.ac_num_transfer_offer(text, text), public.ac_num_transfer_accept(uuid),
  public.ac_num_transfer_cancel(uuid), public.ac_num_transfers_mine(), public.ac_num_refund_request(text),
  public.ac_num_admin_overview(), public.ac_num_admin_refund_done(uuid, boolean, text) to authenticated;

/* 정리를 하루 한 번 저절로 (pg_cron 이 켜져 있을 때만 — 없으면 건너뜀) */
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ac_num_sweep';
    perform cron.schedule('ac_num_sweep', '17 4 * * *', 'select public.ac_num_sweep()');
  end if;
exception when others then null; end $$;

select 'line numbers ok' as result;
