-- =====================================================================
-- AI 통역 시간 (2026-11-28) — 부름 서버 · 가림콜 서버에 각각 한 번씩 Run
--   · 통역 시간은 계정마다 초 단위 잔액으로 쌓이고, 기한이 없습니다. 더 사면 더해집니다.
--   · 통역을 켜 둔 동안만 줄어듭니다(앱이 20초마다 알리고, 그때마다 지난 시간만큼 뺍니다).
--   · 상품: interp30 = 30분 6,600원 · interp60 = 60분 12,100원 (값은 interp_products 표 한 곳에서 바꿉니다)
--   · 다시 돌려도 안전합니다. 맨 아래 'interp ok' 가 나오면 끝.
-- =====================================================================

create table if not exists public.interp_products (
  code       text primary key,
  seconds    int  not null check (seconds > 0),
  price_krw  int  not null check (price_krw > 0),
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.interp_products(code, seconds, price_krw) values
  ('interp30', 1800, 6600), ('interp60', 3600, 12100)
on conflict (code) do nothing;
alter table public.interp_products enable row level security;
drop policy if exists interp_products_read on public.interp_products;
create policy interp_products_read on public.interp_products for select using (active);
grant select on public.interp_products to anon, authenticated;

create table if not exists public.interp_wallet (
  account_id   uuid primary key,
  seconds_left int  not null default 0,
  updated_at   timestamptz not null default now()
);
alter table public.interp_wallet enable row level security;
revoke all on public.interp_wallet from anon, authenticated;

-- 들고 남은 기록(사기 · 쓰기 · 선물 · 환불). 같은 결제(ref)는 한 번만 들어갑니다.
create table if not exists public.interp_ledger (
  id         bigserial primary key,
  account_id uuid not null,
  delta_sec  int  not null,
  kind       text not null check (kind in ('buy', 'use', 'gift', 'refund', 'fix')),
  ref        text unique,
  note       text,
  at         timestamptz not null default now()
);
create index if not exists interp_ledger_acc on public.interp_ledger(account_id, at desc);
alter table public.interp_ledger enable row level security;
revoke all on public.interp_ledger from anon, authenticated;

create table if not exists public.interp_sessions (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  call_ref   text,
  langs      text,
  app        text,
  started_at timestamptz not null default now(),
  last_beat  timestamptz not null default now(),
  used_sec   int  not null default 0,
  ended_at   timestamptz,
  end_reason text
);
create index if not exists interp_sessions_open on public.interp_sessions(account_id) where ended_at is null;
alter table public.interp_sessions enable row level security;
revoke all on public.interp_sessions from anon, authenticated;

-- 한 번 알릴 때 최대 60초까지만 셉니다(앱이 잠시 멈췄다 깨어나도 몰아서 많이 빠지지 않게).
create or replace function public._interp_charge(p_session uuid, p_close boolean, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare s interp_sessions; v_sec int; v_left int;
begin
  select * into s from interp_sessions where id = p_session for update;
  if not found or s.ended_at is not null then
    select coalesce((select seconds_left from interp_wallet where account_id = s.account_id), 0) into v_left; return v_left;
  end if;
  v_sec := least(60, greatest(0, floor(extract(epoch from (now() - s.last_beat)))::int));
  insert into interp_wallet(account_id, seconds_left) values (s.account_id, 0) on conflict (account_id) do nothing;
  update interp_wallet set seconds_left = greatest(0, seconds_left - v_sec), updated_at = now()
   where account_id = s.account_id returning seconds_left into v_left;
  update interp_sessions set used_sec = used_sec + v_sec, last_beat = now(),
         ended_at = case when p_close or v_left <= 0 then now() else null end,
         end_reason = case when p_close then coalesce(p_reason, 'end') when v_left <= 0 then 'no_balance' else null end
   where id = p_session;
  if p_close or v_left <= 0 then
    insert into interp_ledger(account_id, delta_sec, kind, ref, note)
    select account_id, -used_sec, 'use', 'session:' || id, langs from interp_sessions where id = p_session and used_sec > 0
    on conflict (ref) do nothing;
  end if;
  return v_left;
end $$;
revoke all on function public._interp_charge(uuid, boolean, text) from public, anon, authenticated;

-- 내 잔액 (앱 화면)
create or replace function public.interp_balance() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('seconds_left', coalesce((select seconds_left from interp_wallet where account_id = auth.uid()), 0),
                            'products', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'seconds', seconds, 'price_krw', price_krw) order by seconds)
                                                    from interp_products where active), '[]'::jsonb));
$$;
grant execute on function public.interp_balance() to authenticated;

-- 통역 시작 (출입증 발급 함수 interp-token 만 부릅니다)
create or replace function public.interp_open(p_user uuid, p_call text, p_langs text, p_app text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_left int; v_id uuid;
begin
  for r in select id from interp_sessions where account_id = p_user and ended_at is null loop
    perform _interp_charge(r.id, true, 'replaced');
  end loop;
  select coalesce((select seconds_left from interp_wallet where account_id = p_user), 0) into v_left;
  if v_left < 30 then return jsonb_build_object('ok', false, 'error', 'no_balance', 'seconds_left', v_left); end if;
  insert into interp_sessions(account_id, call_ref, langs, app) values (p_user, left(p_call, 80), left(p_langs, 20), left(p_app, 20)) returning id into v_id;
  return jsonb_build_object('ok', true, 'session_id', v_id, 'seconds_left', v_left);
end $$;
revoke all on function public.interp_open(uuid, text, text, text) from public, anon, authenticated;

-- 통역 중 20초마다 (앱)
create or replace function public.interp_beat(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_left int; v_end timestamptz;
begin
  if not exists (select 1 from interp_sessions where id = p_session and account_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'no_session'); end if;
  v_left := _interp_charge(p_session, false, null);
  select ended_at into v_end from interp_sessions where id = p_session;
  return jsonb_build_object('ok', v_end is null, 'seconds_left', v_left, 'error', case when v_end is not null then 'no_balance' end);
end $$;
grant execute on function public.interp_beat(uuid) to authenticated;

-- 통역 끝 (앱)
create or replace function public.interp_close(p_session uuid, p_reason text default 'end') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_left int;
begin
  if not exists (select 1 from interp_sessions where id = p_session and account_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'no_session'); end if;
  v_left := _interp_charge(p_session, true, left(coalesce(p_reason, 'end'), 30));
  return jsonb_build_object('ok', true, 'seconds_left', v_left);
end $$;
grant execute on function public.interp_close(uuid, text) to authenticated;

-- 시간 넣기 (결제 확인 함수 · 관리자). 같은 ref 는 한 번만.
create or replace function public.interp_credit(p_user uuid, p_seconds int, p_kind text, p_ref text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_left int;
begin
  if p_user is null or p_seconds is null or p_seconds = 0 then return jsonb_build_object('ok', false, 'error', 'bad_args'); end if;
  if p_kind not in ('buy', 'gift', 'refund', 'fix') then return jsonb_build_object('ok', false, 'error', 'bad_kind'); end if;
  begin
    insert into interp_ledger(account_id, delta_sec, kind, ref, note) values (p_user, p_seconds, p_kind, p_ref, p_note);
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'dup', true);
  end;
  insert into interp_wallet(account_id, seconds_left) values (p_user, greatest(0, p_seconds))
  on conflict (account_id) do update set seconds_left = greatest(0, interp_wallet.seconds_left + p_seconds), updated_at = now()
  returning seconds_left into v_left;
  return jsonb_build_object('ok', true, 'seconds_left', v_left);
end $$;
revoke all on function public.interp_credit(uuid, int, text, text, text) from public, anon, authenticated;

-- 관리자: 시험용 · 보상용으로 분 넣기 (아이디 또는 계정 번호)
create or replace function public.weave_interp_gift(p_q text, p_minutes int, p_note text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid;
begin
  if not weave_is_admin() then raise exception 'not_admin'; end if;
  if coalesce(trim(p_note), '') = '' then return jsonb_build_object('ok', false, 'error', 'need_note'); end if;
  select id into v_uid from auth.users
   where id::text = trim(p_q) or lower(email) = lower(trim(p_q)) or lower(replace(email, '@u.alias.internal', '')) = lower(trim(p_q)) limit 1;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'no_user'); end if;
  return interp_credit(v_uid, p_minutes * 60, case when p_minutes > 0 then 'gift' else 'fix' end, 'gift:' || gen_random_uuid(), p_note || ' · by ' || auth.uid());
end $$;
revoke all on function public.weave_interp_gift(text, int, text) from public, anon;
grant execute on function public.weave_interp_gift(text, int, text) to authenticated;

-- 열린 채 버려진 통역(앱이 죽음 등)은 마지막 알림 뒤 2분이 지나면 닫습니다.
create or replace function public.interp_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from interp_sessions where ended_at is null and last_beat < now() - interval '2 minutes' loop
    perform _interp_charge(r.id, true, 'stale'); n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.interp_sweep() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin perform cron.unschedule('interp-sweep'); exception when others then null; end;
    perform cron.schedule('interp-sweep', '*/5 * * * *', 'select public.interp_sweep()');
  end if;
end $$;

select 'interp ok' as result,
       (select string_agg(code || ' ' || (seconds / 60) || '분 ' || price_krw || '원', ' · ' order by seconds) from interp_products) as products;
