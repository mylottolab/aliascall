-- =====================================================================
-- 에일리어스콜 — 사람 번호(1:1) + 회선 번호 함께 쓰기 (2026-11-01 · 이미화 님 결정)
--   · 번호마다 연결할 곳을 주인이 고릅니다:  나에게(1:1) · 이 회선에
--   · 사람 번호로 연락이 오면 → 두 사람만의 1:1 대화방(2인 회선)이 생기고, 그 방에서 메시지 · 음성 · 영상
--     같은 분이 다시 누르면 같은 방으로 (방이 하나씩만 생김)
--   · 받는 방식(부름번호와 같음):  승인 받기(기본) · 모두 받기 · 번호로 안 받기
--   · 1:1 대화방은 번호 주인의 이용권(체험 포함)이 살아 있는 동안 무료. 이용권이 끝나면 쉬고, 다시 사면 그대로 살아남
--   · 무료 8자리 사람 번호: 계정마다 하나
--   ⚠ line_numbers.sql(2번) 다음에 돌립니다. 다시 돌려도 안전합니다. 맨 아래 'person numbers ok'
-- =====================================================================

alter table public.ac_line_numbers add column if not exists target text not null default 'line';     -- person · line
alter table public.ac_line_numbers add column if not exists mode   text not null default 'request';  -- request · all · off

/* 1:1 대화방: 번호 주인 + 연락해 온 분(로그인 계정 또는 이 폰 표시) → 회선 하나 */
create table if not exists public.ac_direct_rooms (
  hotline_id  uuid primary key,
  owner_id    uuid not null,
  peer_key    text not null,             -- 'u:<계정>' 또는 'a:<폰 표시>'
  number      text,
  created_at  timestamptz not null default now(),
  unique (owner_id, peer_key)
);
alter table public.ac_direct_rooms enable row level security;
revoke all on public.ac_direct_rooms from anon, authenticated;
grant all on public.ac_direct_rooms to service_role;

/* 주인의 이용권 끝나는 날(체험 포함) */
create or replace function public.ac_plan_until(p_user uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select subscription_expires_at from profiles where id = p_user
$$;

-- ── ① 번호로 걸기: 사람 번호도 알려 줌 ─────────────────────────────────
create or replace function public.ac_num_lookup(p_number text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare n text := ac_num_clean(p_number); l ac_line_numbers; h hotlines; v_secure boolean;
begin
  if n !~ '^[1-9][0-9]{3,7}$' then return json_build_object('ok', false, 'error', 'bad'); end if;
  select * into l from ac_line_numbers where number = n and status = 'active';
  if l.number is null then return json_build_object('ok', false, 'error', 'none'); end if;
  if l.mode = 'off' then return json_build_object('ok', false, 'error', 'off'); end if;
  /* 사람 번호(1:1) */
  if l.target = 'person' then
    if auth.uid() is not null and l.owner_id = auth.uid() then return json_build_object('ok', false, 'error', 'self'); end if;
    if coalesce(ac_plan_until(l.owner_id), '-infinity') < now() then return json_build_object('ok', false, 'error', 'resting'); end if;
    return json_build_object('ok', true, 'kind', 'person', 'number', n, 'auto', l.mode = 'all');
  end if;
  /* 회선 번호 */
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

-- ── ② 사람 번호로 연결: 1:1 대화방을 찾거나 만들고 초대 열쇠(token)를 돌려줌 ──────────
/* p_anon = 연락하는 분의 이 폰 표시(회선 참가 때 쓰는 것과 같음). 로그인했으면 계정으로 찾습니다.
   돌려주는 것: ok · token · hotline · auto(모두 받기면 바로 들어감) · again(전에 연결한 방) */
create or replace function public.ac_num_dial(p_number text, p_anon text, p_nick text default null) returns json
language plpgsql volatile security definer set search_path = public as $$
declare n text := ac_num_clean(p_number); l ac_line_numbers; v_key text; d ac_direct_rooms; h hotlines;
        v_until timestamptz; v_nick text := left(coalesce(nullif(trim(p_nick), ''), '연락 주신 분'), 20); v_member text;
begin
  select * into l from ac_line_numbers where number = n and status = 'active' and target = 'person';
  if l.number is null then return json_build_object('ok', false, 'error', 'none'); end if;
  if l.mode = 'off' then return json_build_object('ok', false, 'error', 'off'); end if;
  if auth.uid() is not null and l.owner_id = auth.uid() then return json_build_object('ok', false, 'error', 'self'); end if;
  v_until := ac_plan_until(l.owner_id);
  if coalesce(v_until, '-infinity') < now() then return json_build_object('ok', false, 'error', 'resting'); end if;
  if auth.uid() is not null then v_key := 'u:' || auth.uid();
  elsif coalesce(length(p_anon), 0) between 8 and 120 then v_key := 'a:' || p_anon;
  else return json_build_object('ok', false, 'error', 'bad'); end if;
  if (select count(*) from ac_direct_rooms where owner_id = l.owner_id and created_at > now() - interval '1 day') >= 50 then
    return json_build_object('ok', false, 'error', 'busy'); end if;     -- 하루 새 방 50개까지(장난 막기)
  perform pg_advisory_xact_lock(hashtext('acdir:' || l.owner_id || v_key));
  select * into d from ac_direct_rooms where owner_id = l.owner_id and peer_key = v_key;
  if d.hotline_id is not null then
    select * into h from hotlines where id = d.hotline_id;
    if h.id is not null then
      /* 주인 이용권에 맞춰 방 기간을 늘려 둠(끝났던 방도 다시 살아남) */
      update hotlines set expires_at = greatest(coalesce(expires_at, now()), v_until), archived_at = null where id = h.id;
      if l.mode = 'all' and coalesce(length(p_anon), 0) between 8 and 120
         and not exists (select 1 from hotline_members where hotline_id = h.id and member_anon_id = p_anon) then
        insert into hotline_members(hotline_id, member_anon_id, nickname, role) values (h.id, p_anon, v_nick, 'member');
      end if;
      return json_build_object('ok', true, 'token', h.invite_token, 'hotline', h.id, 'auto', l.mode = 'all', 'again', true);
    end if;
    delete from ac_direct_rooms where hotline_id = d.hotline_id;
  end if;
  insert into hotlines(owner_user_id, tier, duration_months, price_paid_krw, usage_cap_gb, purpose, title, started_at, expires_at, max_participants)
  values (l.owner_id, 'hotline_everybody', 12, 0, 2, 'personal', '1:1 · ' || v_nick || ' (#' || n || ')', now(), v_until, 2)
  returning * into h;
  insert into hotline_members(hotline_id, member_anon_id, nickname, role) values (h.id, 'owner-' || l.owner_id, '개설자', 'owner');
  insert into ac_direct_rooms(hotline_id, owner_id, peer_key, number) values (h.id, l.owner_id, v_key, n);
  if l.first_used_at is null then update ac_line_numbers set first_used_at = now() where number = n; end if;
  /* 모두 받기: 연락하는 분을 바로 참가자로 넣음(승인 없이) */
  if l.mode = 'all' and coalesce(length(p_anon), 0) between 8 and 120 then
    insert into hotline_members(hotline_id, member_anon_id, nickname, role) values (h.id, p_anon, v_nick, 'member');
  end if;
  return json_build_object('ok', true, 'token', h.invite_token, 'hotline', h.id, 'auto', l.mode = 'all', 'again', false);
end $$;

-- ── ③ 번호 설정: 연결할 곳 · 받는 방식 ─────────────────────────────────
create or replace function public.ac_num_set(p_number text, p_target text, p_hotline uuid default null, p_mode text default null) returns json
language plpgsql security definer set search_path = public as $$
declare n text := ac_num_clean(p_number); l ac_line_numbers;
begin
  select * into l from ac_line_numbers where number = n and owner_id = auth.uid() and status = 'active';
  if l.number is null then return json_build_object('ok', false, 'error', 'not_owner'); end if;
  if p_mode is not null and p_mode not in ('request', 'all', 'off') then return json_build_object('ok', false, 'error', 'bad'); end if;
  if p_target = 'person' then
    update ac_line_numbers set target = 'person', hotline_id = null, mode = coalesce(p_mode, mode) where number = n;
  elsif p_target = 'line' then
    if p_hotline is null or not exists (select 1 from hotlines where id = p_hotline and owner_user_id = auth.uid()) or not ac_hotline_alive(p_hotline) then
      return json_build_object('ok', false, 'error', 'line_ended'); end if;
    if exists (select 1 from ac_line_numbers where hotline_id = p_hotline and status = 'active' and number <> n) then
      return json_build_object('ok', false, 'error', 'has_number'); end if;
    if exists (select 1 from ac_direct_rooms where hotline_id = p_hotline) then
      return json_build_object('ok', false, 'error', 'direct_room'); end if;   -- 1:1 대화방에는 번호를 붙이지 않음
    update ac_line_numbers set target = 'line', hotline_id = p_hotline, mode = coalesce(p_mode, mode) where number = n;
  elsif p_target is null then
    update ac_line_numbers set mode = coalesce(p_mode, mode) where number = n;
  else return json_build_object('ok', false, 'error', 'bad'); end if;
  return json_build_object('ok', true);
end $$;

-- ── ④ 무료 8자리 사람 번호 (계정마다 하나) ─────────────────────────────
create or replace function public.ac_num_take_free_person(p_number text) returns json
language plpgsql security definer set search_path = public as $$
declare n text := ac_num_clean(p_number);
begin
  if auth.uid() is null then return json_build_object('ok', false, 'error', 'login'); end if;
  if exists (select 1 from ac_line_numbers where owner_id = auth.uid() and source = 'free' and target = 'person') then
    return json_build_object('ok', false, 'error', 'free_used'); end if;
  if n !~ '^[1-9][0-9]{7}$' or ac_num_is_good(n) then return json_build_object('ok', false, 'error', 'not_free'); end if;
  if not ac_num_free(n, auth.uid()) then return json_build_object('ok', false, 'error', 'taken'); end if;
  insert into ac_line_numbers(number, hotline_id, owner_id, grade, source, target, mode)
  values (n, null, auth.uid(), 'normal', 'free', 'person', 'request')
  on conflict (number) do update set hotline_id = null, owner_id = excluded.owner_id, grade = 'normal', source = 'free',
    target = 'person', mode = 'request', status = 'active', released_at = null, keep_until = null, created_at = now(), first_used_at = null;
  return json_build_object('ok', true, 'number', n);
end $$;

-- ── ⑤ 사기: 연결할 곳을 정하지 않으면(회선 없이) 사람 번호로 ──────────────
create or replace function public.ac_num_hold(p_hotline uuid, p_number text) returns json
language plpgsql security definer set search_path = public as $$
declare n text := ac_num_clean(p_number); h hotlines; v_sku text;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'error', 'login'); end if;
  if p_hotline is not null then
    select * into h from hotlines where id = p_hotline and owner_user_id = auth.uid();
    if h.id is null then return json_build_object('ok', false, 'error', 'not_owner'); end if;
    if not ac_hotline_alive(h.id) then return json_build_object('ok', false, 'error', 'line_ended'); end if;
  end if;
  v_sku := ac_num_sku(n);
  if v_sku is null then return json_build_object('ok', false, 'error', 'not_for_sale'); end if;
  if not ac_num_free(n, auth.uid()) then return json_build_object('ok', false, 'error', 'taken'); end if;
  delete from ac_num_holds where user_id = auth.uid() or (number = n and expires_at < now());
  insert into ac_num_holds(number, user_id, hotline_id, sku) values (n, auth.uid(), p_hotline, v_sku);
  return json_build_object('ok', true, 'number', n, 'sku', v_sku, 'price', ac_num_price(n));
end $$;
alter table public.ac_num_holds alter column hotline_id drop not null;

/* 결제 확인 뒤: 회선을 고른 잡아 두기면 그 회선에, 아니면 사람 번호로 */
create or replace function public.ac_num_grant(p_user uuid, p_sku text, p_payment uuid) returns json
language plpgsql security definer set search_path = public as $$
declare hd ac_num_holds; it ac_num_intents; t ac_num_transfers; v_base timestamptz;
begin
  if p_sku = 'ac_num_keep' then
    select * into it from ac_num_intents where user_id = p_user and kind = 'keep';
    if it.number is null then return json_build_object('ok', false, 'error', 'no_hold'); end if;
    select coalesce(case when l.target = 'person' then ac_plan_until(l.owner_id) else h.expires_at end, l.created_at)
           + case when l.grade = 'good' then interval '180 days' else interval '90 days' end
      into v_base from ac_line_numbers l left join hotlines h on h.id = l.hotline_id
     where l.number = it.number and l.owner_id = p_user and l.status = 'active';
    if not found then return json_build_object('ok', false, 'error', 'not_owner'); end if;
    update ac_line_numbers set keep_until = greatest(now(), coalesce(keep_until, now()), coalesce(v_base, now())) + interval '1 year'
     where number = it.number;
    delete from ac_num_intents where user_id = p_user and kind = 'keep';
    return json_build_object('ok', true, 'kept', true, 'number', it.number,
      'keep_until', (select keep_until from ac_line_numbers where number = it.number));
  end if;
  if p_sku = 'ac_num_transfer' then
    select * into t from ac_num_transfers where buyer = p_user and status = 'accepted' and created_at > now() - interval '8 days'
     order by accepted_at desc limit 1 for update;
    if t.id is null then return json_build_object('ok', false, 'error', 'no_hold'); end if;
    if not exists (select 1 from ac_line_numbers where number = t.number and owner_id = t.seller and status = 'active') then
      update ac_num_transfers set status = 'cancelled' where id = t.id;
      return json_build_object('ok', false, 'error', 'seller_gone'); end if;
    /* 넘겨받은 번호는 받는 분의 사람 번호(1:1)로 시작합니다 */
    update ac_line_numbers set owner_id = p_user, hotline_id = null, target = 'person', mode = 'request', source = 'transfer',
      created_at = now(), payment_id = p_payment, first_used_at = null where number = t.number;
    update ac_num_transfers set status = 'done', done_at = now(), payment_id = p_payment where id = t.id;
    return json_build_object('ok', true, 'transferred', true, 'number', t.number, 'hotline', null);
  end if;
  select * into hd from ac_num_holds where user_id = p_user and sku = p_sku order by expires_at desc limit 1;
  if hd.number is null then return json_build_object('ok', false, 'error', 'no_hold'); end if;
  if exists (select 1 from ac_line_numbers where number = hd.number and status = 'active' and owner_id is distinct from p_user) then
    return json_build_object('ok', false, 'error', 'taken'); end if;
  if hd.hotline_id is not null then
    update ac_line_numbers set status = case when source = 'free' then 'released' else status end,
           released_at = case when source = 'free' then now() else released_at end, hotline_id = null,
           target = case when source = 'free' then target else 'person' end
     where hotline_id = hd.hotline_id and status = 'active' and number <> hd.number;
  end if;
  insert into ac_line_numbers(number, hotline_id, owner_id, grade, source, payment_id, target, mode)
  values (hd.number, hd.hotline_id, p_user, case when ac_num_is_good(hd.number) then 'good' else 'normal' end, 'purchase', p_payment,
          case when hd.hotline_id is null then 'person' else 'line' end, 'request')
  on conflict (number) do update set hotline_id = excluded.hotline_id, owner_id = excluded.owner_id, grade = excluded.grade,
    source = 'purchase', status = 'active', payment_id = excluded.payment_id, released_at = null, keep_until = null, created_at = now(),
    target = excluded.target, mode = 'request', first_used_at = null;
  delete from ac_num_holds where number = hd.number;
  return json_build_object('ok', true, 'number', hd.number, 'hotline', hd.hotline_id);
end $$;

-- ── ⑥ 내 번호 목록: 연결할 곳 · 받는 방식 · 1:1 방 수 ──────────────────────
create or replace function public.ac_num_mine() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'number', l.number, 'hotline', l.hotline_id, 'grade', l.grade, 'source', l.source,
           'target', l.target, 'mode', l.mode,
           'title', h.title,
           'alive', case when l.target = 'person' then coalesce(ac_plan_until(l.owner_id), '-infinity') > now() else ac_hotline_alive(l.hotline_id) end,
           'keep_until', l.keep_until, 'expires_at', h.expires_at, 'since', l.created_at,
           'rooms', (select count(*) from ac_direct_rooms d where d.owner_id = l.owner_id and d.number = l.number),
           'can_refund', (l.source = 'purchase' and l.payment_id is not null and l.first_used_at is null and l.created_at > now() - interval '7 days'))
           order by (l.target = 'person') desc, l.created_at), '[]'::json)
    from ac_line_numbers l left join hotlines h on h.id = l.hotline_id
   where l.owner_id = auth.uid() and l.status = 'active'
$$;

/* 1:1 대화방 목록(회선 관리 화면이 1:1 방을 따로 보여 주려고) + 주인 이용권에 맞춰 방 기간 늘리기 */
create or replace function public.ac_direct_mine() returns json
language plpgsql volatile security definer set search_path = public as $$
declare v_until timestamptz := ac_plan_until(auth.uid());
begin
  if auth.uid() is null then return '[]'::json; end if;
  if v_until > now() then
    update hotlines h set expires_at = v_until
      from ac_direct_rooms d where d.hotline_id = h.id and d.owner_id = auth.uid() and coalesce(h.expires_at, now()) < v_until;
  end if;
  return (select coalesce(json_agg(json_build_object('hotline', d.hotline_id, 'number', d.number)), '[]'::json)
            from ac_direct_rooms d where d.owner_id = auth.uid());
end $$;

/* 정리: 사람 번호는 이용권 + 90 · 180일(+잡아 두기) 지나면 놓아 줌, 회선 번호는 예전 그대로 */
create or replace function public.ac_num_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  delete from ac_num_holds where expires_at < now() - interval '3 days';
  update ac_line_numbers l set status = 'released', released_at = now(), hotline_id = null
   where l.status = 'active'
     and coalesce(case when l.target = 'person' then ac_plan_until(l.owner_id)
                       else (select h.expires_at from hotlines h where h.id = l.hotline_id) end, l.created_at)
         + case when l.grade = 'good' then interval '180 days' else interval '90 days' end < now()
     and (l.target = 'person' or not ac_hotline_alive(l.hotline_id))
     and (l.keep_until is null or l.keep_until < now());
  get diagnostics c = row_count;
  return c;
end $$;

grant execute on function public.ac_num_lookup(text), public.ac_num_dial(text, text, text) to anon, authenticated;
grant execute on function public.ac_num_set(text, text, uuid, text), public.ac_num_take_free_person(text),
  public.ac_num_hold(uuid, text), public.ac_num_mine(), public.ac_direct_mine() to authenticated;
revoke all on function public.ac_num_grant(uuid, text, uuid), public.ac_num_sweep(), public.ac_plan_until(uuid) from public, anon, authenticated;
grant execute on function public.ac_num_grant(uuid, text, uuid), public.ac_num_sweep() to service_role;

select 'person numbers ok' as result;
