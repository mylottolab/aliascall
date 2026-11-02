-- =====================================================================
-- Aliascall(가림) — 일반 · 프리미엄 회선은 "3개월마다" 다시 채우기 (2026-11-03)
--   ⚠ usage_monthly.sql · usage_borrow.sql 을 돌린 뒤에 이 파일을 통째로 한 번 Run 합니다. 여러 번 돌려도 괜찮습니다.
--
--   일반(2인) 5GB · 프리미엄(4인) 20GB  → 이용권을 시작한 날부터 **3개월마다** 다시 채움 (나누지 않음)
--   1:1 대화방 2GB · 프로 50/150/400GB → 지금처럼 **매달**
--   당겨 쓰기: 다음 기간 몫을 통째로(5GB · 20GB) 당기고 이용 기간을 그 기간만큼(3개월) 줄임.
--             당긴 뒤에도 기간이 남아야 하므로 남은 기간이 3개월보다 길 때만. 횟수 제한 없음.
-- =====================================================================

alter table public.hotlines add column if not exists usage_cycle_months int not null default 1;

-- 이번 기간이 시작된 날 (시작한 날부터 p_months 개월씩)
create or replace function public.ac_usage_cycle_start(p_start timestamptz, p_months int) returns timestamptz
language plpgsql stable as $$
declare m int; k int; t timestamptz; step int := greatest(1, coalesce(p_months, 1));
begin
  if p_start is null then return null; end if;
  if p_start > now() then return p_start; end if;
  m := (extract(year from age(now(), p_start)) * 12 + extract(month from age(now(), p_start)))::int;
  k := (m / step) * step;
  t := p_start + make_interval(months => k);
  if t > now() then t := p_start + make_interval(months => greatest(0, k - step)); end if;
  return t;
end $$;

-- ① 기간 길이 정하기: 1:1 대화방 1개월 · 그 밖 일반 회선 3개월 ------------------
create or replace function public.ac_usage_std_cycle(p_id uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when to_regclass('public.ac_direct_rooms') is not null
               and exists (select 1 from ac_direct_rooms d where d.hotline_id = p_id) then 1 else 3 end
$$;

-- 새 회선이 생길 때(INSERT) 기간 길이도 정합니다 — 트리거는 그대로, 함수만 바꿉니다
create or replace function public.ac_hotline_cap_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.subscription_id is not null then return new; end if;
  if tg_op = 'INSERT' then
    if new.usage_base_gb is null then new.usage_base_gb := coalesce(new.usage_cap_gb, 5); end if;
    if new.usage_cycle_at is null then new.usage_cycle_at := coalesce(new.started_at, now()); end if;
    -- 1:1 대화방은 ac_direct_rooms 가 회선 뒤에 생기므로 여기선 3, 아래 ac_direct_rooms 트리거가 1 로 바꿉니다
    if new.usage_cycle_months is null or new.usage_cycle_months = 1 then new.usage_cycle_months := 3; end if;
    return new;
  end if;
  if new.usage_base_gb is null then return new; end if;
  if coalesce(new.max_participants, 2) >= 4 and coalesce(old.max_participants, 2) < 4 then
    new.usage_base_gb := greatest(new.usage_base_gb, 20);
  end if;
  new.usage_cap_gb := new.usage_base_gb + coalesce(new.usage_borrow_gb, 0)
    + coalesce((select sum(coalesce(left_gb, gb)) from usage_packs where hotline_id = new.id and settled_at is null), 0);
  return new;
end $$;

-- 1:1 대화방이 만들어지면 그 회선은 매달 · 2GB
create or replace function public.ac_direct_room_cycle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update hotlines set usage_cycle_months = 1, usage_base_gb = coalesce(usage_base_gb, 2) where id = new.hotline_id;
  return new;
end $$;
do $$ begin
  if to_regclass('public.ac_direct_rooms') is not null then
    drop trigger if exists ac_direct_room_cycle on public.ac_direct_rooms;
    create trigger ac_direct_room_cycle after insert on public.ac_direct_rooms
      for each row execute function public.ac_direct_room_cycle();
  end if;
end $$;

-- ② 지금 있는 회선 맞추기 --------------------------------------------------------
update public.hotlines h set
  usage_cycle_months = public.ac_usage_std_cycle(h.id)
 where h.subscription_id is null and h.usage_base_gb is not null;
update public.hotlines h set
  usage_cycle_at = public.ac_usage_cycle_start(coalesce(h.started_at, h.usage_cycle_at, now()), h.usage_cycle_months)
 where h.subscription_id is null and h.usage_base_gb is not null;

-- ③ 판정 — 기간 길이 · 다시 채우는 날 · 당길 수 있나 -------------------------------
create or replace function public.hotline_usage_state(p_hotline uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare h record; s record; v_used numeric; v_cap numeric; v_cm int;
begin
  select id, subscription_id, coalesce(usage_used_gb, 0) - coalesce(usage_reset_gb, 0) as used,
         coalesce(usage_cap_gb, 0) as cap, usage_cycle_at, expires_at, usage_base_gb, usage_borrow_gb,
         coalesce(usage_cycle_months, 1) as cm
    into h from hotlines where id = p_hotline;
  if not found then return json_build_object('found', false, 'over', false); end if;
  if h.subscription_id is not null then
    select coalesce(usage_cap_gb, 0) as base, coalesce(usage_borrow_gb, 0) as borrow, coalesce(extra_gb, 0) as extra,
           usage_cycle_at, expires_at
      into s from hotline_subscriptions where id = h.subscription_id;
    v_cap := s.base + s.borrow + s.extra;
    v_used := public.ac_sub_month_used(h.subscription_id);
    return json_build_object('found', true, 'pool', true, 'subscriptionId', h.subscription_id,
      'used_gb', round(v_used, 3), 'cap_gb', v_cap, 'over', v_cap > 0 and v_used >= v_cap,
      'monthly', true, 'cycle_months', 1, 'refill_at', s.usage_cycle_at + interval '1 month', 'expires_at', s.expires_at,
      'base_gb', s.base, 'borrow_gb', s.borrow,
      'can_borrow', s.expires_at - interval '1 month' > now());
  end if;
  v_used := greatest(0, h.used);
  v_cm := h.cm;
  return json_build_object('found', true, 'pool', false,
    'used_gb', round(v_used, 3), 'cap_gb', h.cap, 'over', h.cap > 0 and v_used >= h.cap,
    'monthly', v_cm = 1, 'cycle_months', v_cm,
    'refill_at', h.usage_cycle_at + make_interval(months => v_cm), 'expires_at', h.expires_at,
    'base_gb', h.usage_base_gb, 'borrow_gb', coalesce(h.usage_borrow_gb, 0),
    'can_borrow', h.usage_base_gb is not null and h.expires_at - make_interval(months => v_cm) > now()
                  and not (to_regclass('public.ac_direct_rooms') is not null and exists (select 1 from ac_direct_rooms d where d.hotline_id = h.id)));
end $$;
grant execute on function public.hotline_usage_state(uuid) to anon, authenticated, service_role;

-- ④ 당겨 쓰기 — 일반 회선은 기간 길이(3개월)만큼, 프로는 1개월 --------------------
create or replace function public.ac_usage_borrow(p_kind text, p_target uuid) returns json
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); h hotlines; s hotline_subscriptions; v_gb numeric; v_new timestamptz; v_cm int;
begin
  if v_me is null then return json_build_object('ok', false, 'error', 'login'); end if;
  if p_kind = 'line' then
    select * into h from hotlines where id = p_target for update;
    if h.id is null or h.owner_user_id is distinct from v_me or h.subscription_id is not null then
      return json_build_object('ok', false, 'error', 'not_yours'); end if;
    if h.archived_at is not null or h.usage_base_gb is null then return json_build_object('ok', false, 'error', 'not_line'); end if;
    if to_regclass('public.ac_direct_rooms') is not null and exists (select 1 from ac_direct_rooms d where d.hotline_id = h.id) then
      return json_build_object('ok', false, 'error', 'direct'); end if;
    v_cm := coalesce(h.usage_cycle_months, 3);
    if h.expires_at - make_interval(months => v_cm) <= now() then
      return json_build_object('ok', false, 'error', 'too_short', 'expires_at', h.expires_at, 'cycle_months', v_cm); end if;
    v_gb := h.usage_base_gb;
    v_new := h.expires_at - make_interval(months => v_cm);
    update hotlines set usage_borrow_gb = coalesce(usage_borrow_gb, 0) + v_gb, expires_at = v_new where id = h.id;
    insert into ac_usage_borrows(user_id, hotline_id, gb, old_expires_at, new_expires_at) values (v_me, h.id, v_gb, h.expires_at, v_new);
    return json_build_object('ok', true, 'gb', v_gb, 'cycle_months', v_cm, 'old_expires_at', h.expires_at, 'expires_at', v_new,
      'refill_at', h.usage_cycle_at + make_interval(months => v_cm), 'can_more', v_new - make_interval(months => v_cm) > now());
  elsif p_kind = 'pro' then
    select * into s from hotline_subscriptions where id = p_target for update;
    if s.id is null or s.owner_user_id is distinct from v_me then return json_build_object('ok', false, 'error', 'not_yours'); end if;
    if s.status is distinct from 'active' then return json_build_object('ok', false, 'error', 'not_active'); end if;
    if s.expires_at - interval '1 month' <= now() then
      return json_build_object('ok', false, 'error', 'too_short', 'expires_at', s.expires_at, 'cycle_months', 1); end if;
    v_gb := coalesce(s.usage_cap_gb, 0);
    v_new := s.expires_at - interval '1 month';
    update hotline_subscriptions set usage_borrow_gb = coalesce(usage_borrow_gb, 0) + v_gb, expires_at = v_new where id = s.id;
    insert into ac_usage_borrows(user_id, subscription_id, gb, old_expires_at, new_expires_at) values (v_me, s.id, v_gb, s.expires_at, v_new);
    return json_build_object('ok', true, 'gb', v_gb, 'cycle_months', 1, 'old_expires_at', s.expires_at, 'expires_at', v_new,
      'refill_at', s.usage_cycle_at + interval '1 month', 'can_more', v_new - interval '1 month' > now());
  end if;
  return json_build_object('ok', false, 'error', 'bad_kind');
end $$;
revoke execute on function public.ac_usage_borrow(text, uuid) from public, anon;
grant execute on function public.ac_usage_borrow(text, uuid) to authenticated;

-- ⑤ 다시 채우기 (매일 한 번) — 일반 회선은 기간 길이만큼 ---------------------------
create or replace function public.ac_usage_monthly_refill() returns integer
language plpgsql security definer set search_path = public as $$
declare h record; s record; v_used numeric; v_over numeric; a record; n int := 0; guard int;
begin
  for h in select id from hotlines
            where subscription_id is null and usage_base_gb is not null and archived_at is null and usage_cycle_at is not null
              and usage_cycle_at + make_interval(months => coalesce(usage_cycle_months, 1)) <= now()
            for update skip locked loop
    guard := 0;
    loop
      exit when guard > 24 or (select usage_cycle_at + make_interval(months => coalesce(usage_cycle_months, 1)) from hotlines where id = h.id) > now();
      guard := guard + 1;
      v_used := usage_pack_used(h.id, null);
      v_over := greatest(0, v_used - ac_usage_base(h.id, null));
      for a in select * from ac_usage_alloc(h.id, null, v_over) loop
        update usage_packs set left_gb = coalesce(left_gb, gb) - a.used_gb where id = a.pack_id and a.used_gb > 0;
      end loop;
      update hotlines set usage_reset_gb = coalesce(usage_used_gb, 0), usage_borrow_gb = 0,
                          usage_cycle_at = usage_cycle_at + make_interval(months => coalesce(usage_cycle_months, 1))
       where id = h.id;
      n := n + 1;
    end loop;
  end loop;
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
        usage_borrow_gb = 0,
        usage_cycle_at = usage_cycle_at + interval '1 month',
        extra_gb = coalesce((select sum(coalesce(left_gb, gb)) from usage_packs where subscription_id = s.id and settled_at is null), 0)
       where id = s.id;
      n := n + 1;
    end loop;
  end loop;
  update hotline_subscriptions set usage_cycle_at = coalesce(started_at, now()) where usage_cycle_at is null;
  return n;
end $$;
revoke execute on function public.ac_usage_monthly_refill() from public, anon, authenticated;
grant execute on function public.ac_usage_monthly_refill() to service_role;

select 'ok' as done;
