-- =====================================================================
-- 무료 체험 7일 (가림콜 서버: 가림콜 · 바로카 · 단톡방 · 단골창구) — 2026-11-28
--   · 이 SQL 을 Run 한 뒤에 시작하는 체험부터 적용, 이미 체험 중인 분 · 이미 연 방 · 가게 · 쿠폰 차는 그대로입니다.
--     ① 가림콜 · 바로카 가입 체험 30일 → 7일 (claim_trial 두 가지)
--     ② 체험만 하고 결제한 적 없는 분은 끝난 뒤 30일 유예 없이 멈춤(차량은 지금처럼 문자로 계속).
--        결제한 분 · 이 SQL 전에 체험을 시작한 분은 유예 30일 그대로.
--     ③ 체험 끝 알림: '7일 전' 알림을 '3일 전' 에 보냄 (1일 전 알림은 그대로)
--     ④ 단톡방 새 방 30일 → 7일, 단골창구 새 가게 30일 → 7일
--     ⑤ 차량 간편 등록 쿠폰: 전화+문자 1개월 → 7일, 그 뒤 문자만 1개월 → 7일
--        (연장하면 같은 등록 · 같은 QR 에 기간이 붙어 스티커를 다시 붙일 필요가 없습니다)
--   · 다시 돌려도 안전합니다. 맨 아래 'trial7 garim ok' 가 나오면 끝.
-- =====================================================================
create table if not exists public.weave_settings (k text primary key, v text not null, at timestamptz not null default now());
alter table public.weave_settings enable row level security;
revoke all on public.weave_settings from anon, authenticated;
insert into public.weave_settings(k, v) values ('trial7_from', now()::text) on conflict (k) do nothing;

-- ①③⑤ 함수 안의 기간만 바꿔 다시 만듭니다
do $$
declare f text; d text; d2 text;
begin
  foreach f in array array['claim_trial(text,text)', 'claim_trial(text)'] loop
    if to_regprocedure('public.' || f) is null then raise notice 'skip %', f; continue; end if;
    d := pg_get_functiondef(('public.' || f)::regprocedure);
    d2 := replace(d, 'interval ''30 days''', 'interval ''7 days''');
    if d2 <> d then execute d2; raise notice 'changed %', f; end if;
  end loop;
  if to_regprocedure('public.trial_notice_targets()') is not null then
    d := pg_get_functiondef('public.trial_notice_targets()'::regprocedure);
    d2 := replace(d, 'p.trial_ends_at <= now() + interval ''7 days''', 'p.trial_ends_at <= now() + interval ''3 days''');
    if d2 <> d then execute d2; raise notice 'changed trial_notice_targets'; end if;
  end if;
  if to_regprocedure('public.car_coupon_claim(uuid,text,text)') is not null then
    d := pg_get_functiondef('public.car_coupon_claim(uuid,text,text)'::regprocedure);
    d2 := replace(replace(d, 'v_full := now() + interval ''1 month'';', 'v_full := now() + interval ''7 days'';'),
                  'v_msg  := v_full + interval ''1 month'';', 'v_msg  := v_full + interval ''7 days'';');
    if d2 <> d then execute d2; raise notice 'changed car_coupon_claim'; end if;
  end if;
end $$;

-- ② 체험 뒤 유예: 새 규칙 체험만 쓴 분은 유예 없음
create or replace function public.ac_mode_core(p_category text, p_owner uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_exp timestamptz; v_ts timestamptz; v_grace interval := interval '30 days';
begin
  if p_owner is null then return 'blocked'; end if;
  if p_category in ('vulnerable_person', 'pet') then return 'full'; end if;     -- 언제나 무료
  select subscription_expires_at, trial_started_at into v_exp, v_ts from profiles where id = p_owner;
  if v_ts is not null
     and v_ts >= coalesce((select v::timestamptz from weave_settings where k = 'trial7_from'), 'infinity'::timestamptz)
     and not exists (select 1 from payments where user_id = p_owner and status::text = 'completed') then
    v_grace := interval '0';                                                    -- 🔴 2026-11-28 체험 7일: 체험만 쓴 분은 유예 없음
  end if;
  if v_exp is not null and now() <= v_exp + v_grace then return 'full'; end if;   -- 기간 + 유예
  if p_category = 'vehicle' then return 'message_only'; end if;                -- 🔴 차량은 메시지로 계속
  return 'blocked';
end $$;

-- ④ 새 방 · 새 가게
alter table public.dt_rooms alter column until set default now() + interval '7 days';
alter table public.dg_desks alter column until set default now() + interval '7 days';

select 'trial7 garim ok' as result,
       (select v from weave_settings where k = 'trial7_from') as trial7_from,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'claim_trial' and pg_get_functiondef(p.oid) like '%interval ''7 days''%'
           and pg_get_functiondef(p.oid) not like '%interval ''30 days''%') as claim_trial_7d,
       (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'dt_rooms' and column_name = 'until') as dantok_room,
       (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'dg_desks' and column_name = 'until') as dangol_desk,
       (select pg_get_functiondef('public.car_coupon_claim(uuid,text,text)'::regprocedure) like '%v_full := now() + interval ''7 days''%') as car_coupon_7d;
