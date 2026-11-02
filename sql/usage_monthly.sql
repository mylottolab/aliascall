-- =====================================================================
-- Aliascall(가림) — 회선 사용량을 "매달 다시 채우기"로 (2026-11-03)
--
--   전에는  기본 2인 5GB · 프리미엄 4인 20GB · 프로 50/150/400GB 가 이용권 기간 전체에 한 번.
--   이제는  같은 양을 **매달** 다시 채웁니다. 한 달은 이용권을 시작한 날부터 셉니다
--           (예: 3월 15일 시작 → 4월 15일 · 5월 15일 … 에 다시 채움).
--
--   어떻게
--     · 쓴 양(usage_used_gb)은 전처럼 계속 쌓입니다(중계 서버가 보고 · 트리거가 더함).
--     · "이번 달 쓴 양" = 쓴 양 − 이번 달이 시작될 때까지 쓴 양(usage_reset_gb).
--     · 일반 회선의 한도(usage_cap_gb)는 늘 "매달 기본(usage_base_gb) + 아직 남은 추가 사용량"으로
--       트리거가 다시 계산합니다. 그래서 연장할 때 결제 함수가 5GB 를 더해도 매달 양은 그대로입니다.
--       2인 → 4인으로 올리면 매달 기본이 20GB 로 바뀝니다.
--     · 프로는 구독(hotline_subscriptions) 하나에 모든 방이 같이 씁니다.
--       usage_cap_gb = 매달 기본, extra_gb = 아직 남은 추가 사용량.
--     · 추가 사용량 1GB(3개월)는 그 3개월 동안 이월됩니다. 매달 기본을 먼저 쓰고, 넘친 만큼
--       끝나는 날이 가까운 묶음부터 씁니다. 3개월이 지나면 남은 것만 사라집니다.
--     · 매일 한 번(pg_cron) 달이 바뀐 회선 · 구독을 다시 채웁니다.
--
--   처음 돌릴 때 지금 쓰고 있는 회선은 모두 "이번 달 0GB 사용"으로 새로 시작합니다(손님에게 유리하게).
--   ⚠ usage_packs.sql · usage_state.sql 을 이미 돌린 뒤에 이 파일을 통째로 한 번 Run 합니다.
--   여러 번 돌려도 괜찮습니다.
-- =====================================================================

-- ① 칸 더하기 --------------------------------------------------------------
alter table public.hotlines add column if not exists usage_base_gb  numeric;
alter table public.hotlines add column if not exists usage_reset_gb numeric not null default 0;
alter table public.hotlines add column if not exists usage_cycle_at timestamptz;
alter table public.hotline_subscriptions add column if not exists usage_reset_gb numeric not null default 0;
alter table public.hotline_subscriptions add column if not exists usage_cycle_at timestamptz;
alter table public.usage_packs add column if not exists left_gb numeric;
update public.usage_packs set left_gb = gb where left_gb is null and settled_at is null;

-- 화면이 그대로 읽을 수 있는 "이번 달 쓴 양" (일반 회선)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hotlines' and column_name = 'usage_month_gb') then
    alter table public.hotlines add column usage_month_gb numeric
      generated always as (greatest(0, coalesce(usage_used_gb, 0) - coalesce(usage_reset_gb, 0))) stored;
  end if;
end $$;

-- ② 매달 기본 양 -----------------------------------------------------------
--   1:1 대화방(ac_direct_rooms) 2GB · 4인 20GB · 그 밖 2인 5GB
create or replace function public.ac_usage_std_base(p_id uuid, p_persons int) returns numeric
language sql stable security definer set search_path = public as $$
  select case
    when to_regclass('public.ac_direct_rooms') is not null
         and exists (select 1 from ac_direct_rooms d where d.hotline_id = p_id) then 2
    when coalesce(p_persons, 2) >= 4 then 20
    else 5 end::numeric
$$;

-- 이번 달이 시작된 날 (시작한 날 기준 · 오늘 이전의 가장 가까운 "달 기념일")
create or replace function public.ac_usage_cycle_start(p_start timestamptz) returns timestamptz
language plpgsql stable as $$
declare m int; t timestamptz;
begin
  if p_start is null then return null; end if;
  if p_start > now() then return p_start; end if;
  m := (extract(year from age(now(), p_start)) * 12 + extract(month from age(now(), p_start)))::int;
  t := p_start + make_interval(months => m);
  if t > now() then t := p_start + make_interval(months => m - 1); end if;
  return t;
end $$;

-- ③ 일반 회선 한도 = 매달 기본 + 남은 추가 사용량 (늘 다시 계산) -------------
create or replace function public.ac_hotline_cap_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.subscription_id is not null then return new; end if;     -- 프로 방은 구독이 한도를 가짐
  if tg_op = 'INSERT' then
    if new.usage_base_gb is null then new.usage_base_gb := coalesce(new.usage_cap_gb, 5); end if;
    if new.usage_cycle_at is null then new.usage_cycle_at := coalesce(new.started_at, now()); end if;
    return new;
  end if;
  if new.usage_base_gb is null then return new; end if;            -- 아직 바뀌기 전 회선(이 파일이 처리)
  -- 2인 → 4인으로 올림
  if coalesce(new.max_participants, 2) >= 4 and coalesce(old.max_participants, 2) < 4 then
    new.usage_base_gb := greatest(new.usage_base_gb, 20);
  end if;
  new.usage_cap_gb := new.usage_base_gb
    + coalesce((select sum(coalesce(left_gb, gb)) from usage_packs where hotline_id = new.id and settled_at is null), 0);
  return new;
end $$;
drop trigger if exists ac_hotline_cap_guard on public.hotlines;
create trigger ac_hotline_cap_guard before insert or update on public.hotlines
  for each row execute function public.ac_hotline_cap_guard();

-- ④ 지금 있는 회선 · 구독 옮기기 (이번 달 0GB 로 새로 시작) -------------------
update public.hotlines h set
  usage_base_gb  = public.ac_usage_std_base(h.id, h.max_participants),
  usage_reset_gb = coalesce(h.usage_used_gb, 0),
  usage_cycle_at = public.ac_usage_cycle_start(coalesce(h.started_at, now()))
 where h.subscription_id is null and h.usage_base_gb is null;

update public.hotline_subscriptions s set
  usage_reset_gb = coalesce((select sum(coalesce(usage_used_gb, 0)) from hotlines where subscription_id = s.id), 0),
  usage_cycle_at = public.ac_usage_cycle_start(coalesce(s.started_at, now()))
 where s.usage_cycle_at is null;
-- 남은 추가 사용량을 새 방식으로 맞춤
update public.hotline_subscriptions s set
  extra_gb = coalesce((select sum(coalesce(left_gb, gb)) from usage_packs where subscription_id = s.id and settled_at is null), 0);

-- ⑤ 이번 달 쓴 양 · 한도 --------------------------------------------------
create or replace function public.ac_sub_month_used(p_sub uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce((select sum(coalesce(usage_used_gb, 0)) from hotlines where subscription_id = p_sub), 0)
                     - coalesce((select usage_reset_gb from hotline_subscriptions where id = p_sub), 0))
$$;

-- usage_pack_used: 이제 "이번 달 쓴 양"
create or replace function public.usage_pack_used(p_hotline uuid, p_sub uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when p_hotline is not null
              then (select greatest(0, coalesce(usage_used_gb, 0) - coalesce(usage_reset_gb, 0)) from hotlines where id = p_hotline)
              else public.ac_sub_month_used(p_sub) end
$$;

-- 판정 (aliascall-ice · report-usage · 회선방 화면이 부름) — 이번 달 기준
create or replace function public.hotline_usage_state(p_hotline uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare h record; v_used numeric; v_cap numeric; v_next timestamptz;
begin
  select id, subscription_id, coalesce(usage_used_gb, 0) - coalesce(usage_reset_gb, 0) as used,
         coalesce(usage_cap_gb, 0) as cap, usage_cycle_at
    into h from hotlines where id = p_hotline;
  if not found then return json_build_object('found', false, 'over', false); end if;
  if h.subscription_id is not null then
    select coalesce(usage_cap_gb, 0) + coalesce(extra_gb, 0), usage_cycle_at into v_cap, v_next
      from hotline_subscriptions where id = h.subscription_id;
    v_used := public.ac_sub_month_used(h.subscription_id);
    return json_build_object('found', true, 'pool', true, 'subscriptionId', h.subscription_id,
      'used_gb', round(v_used, 3), 'cap_gb', v_cap, 'over', v_cap > 0 and v_used >= v_cap,
      'monthly', true, 'refill_at', v_next + interval '1 month');
  end if;
  v_used := greatest(0, h.used);
  return json_build_object('found', true, 'pool', false,
    'used_gb', round(v_used, 3), 'cap_gb', h.cap, 'over', h.cap > 0 and v_used >= h.cap,
    'monthly', true, 'refill_at', h.usage_cycle_at + interval '1 month');
end $$;
grant execute on function public.hotline_usage_state(uuid) to anon, authenticated, service_role;

-- ⑥ 넘친 양을 추가 사용량 묶음에 나눠 매기기 (끝나는 날 순서) ----------------
--   p_over 만큼을 열린 묶음에서 차례로 빼고, 각 묶음이 이번 달에 쓴 양을 돌려줍니다.
create or replace function public.ac_usage_alloc(p_hotline uuid, p_sub uuid, p_over numeric)
returns table (pack_id uuid, used_gb numeric)
language plpgsql stable security definer set search_path = public as $$
declare pk record; rem numeric := greatest(0, coalesce(p_over, 0)); take numeric;
begin
  for pk in select id, coalesce(left_gb, gb) as l from usage_packs
             where settled_at is null
               and ((p_hotline is not null and hotline_id = p_hotline) or (p_sub is not null and subscription_id = p_sub))
             order by expires_at, purchased_at loop
    take := least(pk.l, rem); rem := rem - take;
    pack_id := pk.id; used_gb := take; return next;
  end loop;
end $$;

-- 매달 기본 (일반: usage_base_gb · 프로: 구독 usage_cap_gb)
create or replace function public.ac_usage_base(p_hotline uuid, p_sub uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when p_hotline is not null then (select coalesce(usage_base_gb, usage_cap_gb, 0) from hotlines where id = p_hotline)
              else (select coalesce(usage_cap_gb, 0) from hotline_subscriptions where id = p_sub) end
$$;

-- ⑦ 끝난 추가 사용량 정리 (매일 aliascall-sweep 이 부름 — 이름 그대로) ---------
--   이번 달에 그 묶음에서 쓴 양은 "이미 낸 것"으로 넘기고(usage_reset_gb 에 더함), 묶음은 닫습니다.
create or replace function public.settle_usage_packs() returns integer
language plpgsql security definer set search_path = public as $$
declare pk record; v_used numeric; v_over numeric; v_take numeric; v_left numeric; n int := 0;
begin
  for pk in select * from usage_packs where settled_at is null and expires_at <= now() order by expires_at for update skip locked loop
    v_used := usage_pack_used(pk.hotline_id, pk.subscription_id);
    v_over := greatest(0, v_used - ac_usage_base(pk.hotline_id, pk.subscription_id));
    select coalesce(a.used_gb, 0) into v_take from ac_usage_alloc(pk.hotline_id, pk.subscription_id, v_over) a where a.pack_id = pk.id;
    v_take := coalesce(v_take, 0);
    v_left := coalesce(pk.left_gb, pk.gb);
    update usage_packs set settled_at = now(), unused_gb = greatest(0, v_left - v_take), left_gb = 0 where id = pk.id;
    if pk.hotline_id is not null then
      update hotlines set usage_reset_gb = coalesce(usage_reset_gb, 0) + v_take where id = pk.hotline_id;   -- 트리거가 한도를 다시 계산
    else
      update hotline_subscriptions set usage_reset_gb = coalesce(usage_reset_gb, 0) + v_take,
             extra_gb = coalesce((select sum(coalesce(left_gb, gb)) from usage_packs where subscription_id = pk.subscription_id and settled_at is null), 0)
       where id = pk.subscription_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ⑧ 환불되면 거두기 — 이 묶음을 가장 나중에 쓴 것으로 봅니다(손님에게 불리하지 않게)
create or replace function public.revoke_usage_pack(p_payment uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare pk record; v_used numeric; v_cap numeric; v_left numeric; v_unused numeric; v_take numeric;
begin
  select * into pk from usage_packs where payment_id = p_payment and settled_at is null for update;
  if not found then return false; end if;
  v_used := usage_pack_used(pk.hotline_id, pk.subscription_id);
  if pk.hotline_id is not null then
    select coalesce(usage_cap_gb, 0) into v_cap from hotlines where id = pk.hotline_id;
  else
    select coalesce(usage_cap_gb, 0) + coalesce(extra_gb, 0) into v_cap from hotline_subscriptions where id = pk.subscription_id;
  end if;
  v_left := coalesce(pk.left_gb, pk.gb);
  v_unused := least(v_left, greatest(0, v_cap - v_used));
  v_take := v_left - v_unused;
  update usage_packs set settled_at = now(), unused_gb = v_unused, left_gb = 0 where id = pk.id;
  if pk.hotline_id is not null then
    update hotlines set usage_reset_gb = coalesce(usage_reset_gb, 0) + v_take where id = pk.hotline_id;
  else
    update hotline_subscriptions set usage_reset_gb = coalesce(usage_reset_gb, 0) + v_take,
           extra_gb = coalesce((select sum(coalesce(left_gb, gb)) from usage_packs where subscription_id = pk.subscription_id and settled_at is null), 0)
     where id = pk.subscription_id;
  end if;
  return true;
end $$;

-- ⑨ 추가 사용량 붙이기 — 묶음을 먼저 넣고 한도를 다시 계산 -------------------
create or replace function public.grant_usage_pack(p_user uuid, p_kind text, p_target uuid, p_gb numeric, p_payment uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_exp timestamptz := now() + interval '3 months';
begin
  if p_gb <= 0 or p_gb > 10 then raise exception 'bad_gb'; end if;
  if p_payment is not null then
    select id into v_id from usage_packs where payment_id = p_payment;
    if found then return v_id; end if;
  end if;
  if p_kind = 'line' then
    perform 1 from hotlines where id = p_target and owner_user_id = p_user and subscription_id is null for update;
    if not found then raise exception 'not_your_line'; end if;
    insert into usage_packs (user_id, hotline_id, gb, left_gb, expires_at, payment_id) values (p_user, p_target, p_gb, p_gb, v_exp, p_payment) returning id into v_id;
    update hotlines set usage_cap_gb = usage_cap_gb where id = p_target;   -- 트리거가 기본 + 묶음으로 다시 계산
  elsif p_kind = 'pro' then
    perform 1 from hotline_subscriptions where id = p_target and owner_user_id = p_user for update;
    if not found then raise exception 'not_your_pro'; end if;
    insert into usage_packs (user_id, subscription_id, gb, left_gb, expires_at, payment_id) values (p_user, p_target, p_gb, p_gb, v_exp, p_payment) returning id into v_id;
    update hotline_subscriptions set extra_gb = coalesce((select sum(coalesce(left_gb, gb)) from usage_packs where subscription_id = p_target and settled_at is null), 0)
     where id = p_target;
  else raise exception 'bad_kind'; end if;
  return v_id;
end $$;

-- ⑩ 매달 다시 채우기 (매일 한 번) ------------------------------------------
create or replace function public.ac_usage_monthly_refill() returns integer
language plpgsql security definer set search_path = public as $$
declare h record; s record; v_used numeric; v_over numeric; a record; n int := 0; guard int;
begin
  -- 일반 회선
  for h in select id from hotlines
            where subscription_id is null and usage_base_gb is not null and archived_at is null
              and usage_cycle_at is not null and usage_cycle_at + interval '1 month' <= now()
            for update skip locked loop
    guard := 0;
    loop
      exit when guard > 24 or (select usage_cycle_at + interval '1 month' from hotlines where id = h.id) > now();
      guard := guard + 1;
      v_used := usage_pack_used(h.id, null);
      v_over := greatest(0, v_used - ac_usage_base(h.id, null));
      for a in select * from ac_usage_alloc(h.id, null, v_over) loop
        update usage_packs set left_gb = coalesce(left_gb, gb) - a.used_gb where id = a.pack_id and a.used_gb > 0;
      end loop;
      update hotlines set usage_reset_gb = coalesce(usage_used_gb, 0),
                          usage_cycle_at = usage_cycle_at + interval '1 month'
       where id = h.id;                                                    -- 트리거가 한도를 다시 계산
      n := n + 1;
    end loop;
  end loop;
  -- 프로 구독
  for s in select id from hotline_subscriptions
            where usage_cycle_at is not null and usage_cycle_at + interval '1 month' <= now()
            for update skip locked loop
    guard := 0;
    loop
      exit when guard > 24 or (select usage_cycle_at + interval '1 month' from hotline_subscriptions where id = s.id) > now();
      guard := guard + 1;
      v_used := ac_sub_month_used(s.id);
      v_over := greatest(0, v_used - ac_usage_base(null, s.id));
      for a in select * from ac_usage_alloc(null, s.id, v_over) loop
        update usage_packs set left_gb = coalesce(left_gb, gb) - a.used_gb where id = a.pack_id and a.used_gb > 0;
      end loop;
      update hotline_subscriptions set
        usage_reset_gb = coalesce((select sum(coalesce(usage_used_gb, 0)) from hotlines where subscription_id = s.id), 0),
        usage_cycle_at = usage_cycle_at + interval '1 month',
        extra_gb = coalesce((select sum(coalesce(left_gb, gb)) from usage_packs where subscription_id = s.id and settled_at is null), 0)
       where id = s.id;
      n := n + 1;
    end loop;
  end loop;
  -- 새로 생긴 프로 구독(아직 날짜가 없는 것)에 시작일을 적어 둡니다
  update hotline_subscriptions set usage_cycle_at = coalesce(started_at, now()) where usage_cycle_at is null;
  return n;
end $$;

-- ⑪ 붙일 곳 목록 (이용권 화면) — 이번 달 기준 --------------------------------
create or replace function public.my_usage_targets()
returns table (kind text, id uuid, name text, persons int, secure boolean, used_gb numeric, cap_gb numeric, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select 'line', h.id, coalesce(nullif(h.title, ''), h.tier), coalesce(h.max_participants, 2), h.tier like '%_secure',
         round(greatest(0, coalesce(h.usage_used_gb, 0) - coalesce(h.usage_reset_gb, 0)), 2), coalesce(h.usage_cap_gb, 0), h.expires_at
    from hotlines h
   where h.owner_user_id = auth.uid() and h.subscription_id is null and h.archived_at is null and h.expires_at > now()
  union all
  select 'pro', s.id, coalesce(nullif(s.display_name, ''), s.tier), null, false,
         round(public.ac_sub_month_used(s.id), 2),
         coalesce(s.usage_cap_gb, 0) + coalesce(s.extra_gb, 0), s.expires_at
    from hotline_subscriptions s
   where s.owner_user_id = auth.uid() and s.status = 'active' and s.expires_at > now()
$$;

-- ⑫ 권한 · 매일 돌리기 -------------------------------------------------------
revoke execute on function public.grant_usage_pack(uuid, text, uuid, numeric, uuid) from public, anon, authenticated;
revoke execute on function public.settle_usage_packs() from public, anon, authenticated;
revoke execute on function public.revoke_usage_pack(uuid) from public, anon, authenticated;
revoke execute on function public.usage_pack_used(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ac_usage_monthly_refill() from public, anon, authenticated;
revoke execute on function public.ac_usage_alloc(uuid, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.ac_sub_month_used(uuid) from public, anon, authenticated;
grant execute on function public.grant_usage_pack(uuid, text, uuid, numeric, uuid) to service_role;
grant execute on function public.settle_usage_packs() to service_role;
grant execute on function public.revoke_usage_pack(uuid) to service_role;
grant execute on function public.ac_usage_monthly_refill() to service_role;
revoke execute on function public.my_usage_targets() from public, anon;
grant execute on function public.my_usage_targets() to authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ac_usage_monthly_refill';
    perform cron.schedule('ac_usage_monthly_refill', '7 15 * * *', 'select public.settle_usage_packs(); select public.ac_usage_monthly_refill();');  -- 매일 한국 0시 7분
  end if;
end $$;

-- 처음 한 번 바로 돌려 둡니다
select public.ac_usage_monthly_refill();
