-- =====================================================================
-- 위브앱 안전 관리 (2026-11-27) — 접속 기록 · 신고 처리 · 이용 정지 기록
--   두 서버에 각각 한 번씩 Run 합니다. 같은 파일 그대로 써도 됩니다.
--     ① 부름 서버   (azredlrnvsssfjytaotb) — 와파 · 부름 · 누름 · 바로너
--     ② 가림콜 서버 (qmwaraittiurkynszjts) — 가림콜 · 바로카 · 단톡방 · 단골창구
--   다시 돌려도 안전합니다. 맨 아래 'weave safety ok' 가 나오면 끝입니다.
--   2026-11-27 더함: 하루 만들기 제한(누름 · 바로너 라인, 단톡방 방) · 정지된 계정과 같은 기기 막기.
--   2026-11-27 고침: 부름 서버에 이미 있는 admin_find_user 와 겹치지 않게 함수 이름을 모두 weave_ 로 바꿨습니다.
--   표 3개를 새로 만들고, 기존 reports 표(부름 서버)에는 처리 칸만 더합니다.
-- =====================================================================

-- ── 0. 관리자 판정: 서버마다 이름이 달라서 둘 다 물어봅니다 ─────────────
create or replace function public.weave_is_admin() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v boolean := false;
begin
  begin execute 'select coalesce(public.is_admin(), false)' into v; exception when others then v := false; end;
  if v then return true; end if;
  begin execute 'select coalesce(public.is_global_admin(), false)' into v; exception when others then v := false; end;
  return coalesce(v, false);
end $$;
revoke all on function public.weave_is_admin() from public, anon;
grant execute on function public.weave_is_admin() to authenticated;

-- ── 1. 접속 기록 (3개월 보관) ─────────────────────────────────────────
create table if not exists public.weave_access_log (
  id      bigserial primary key,
  user_id uuid,
  app     text not null,
  event   text not null default 'open',
  ip      text,
  ua      text,
  at      timestamptz not null default now()
);
create index if not exists weave_access_log_user on public.weave_access_log(user_id, at desc);
create index if not exists weave_access_log_at on public.weave_access_log(at);
alter table public.weave_access_log enable row level security;   -- 정책 없음 = 앱에서 직접 읽기 · 쓰기 불가
revoke all on public.weave_access_log from anon, authenticated;

-- 기기 표시: 앱이 기기마다 만든 무작위 값(실제 기기 번호 아님). 정지된 계정이 같은 기기로 돌아오는지 보는 데만 씁니다. 1년 보관.
alter table public.weave_access_log add column if not exists dev text;
create table if not exists public.weave_devices (
  user_id  uuid not null,
  dev      text not null,
  first_at timestamptz not null default now(),
  last_at  timestamptz not null default now(),
  primary key (user_id, dev)
);
create index if not exists weave_devices_dev on public.weave_devices(dev);
alter table public.weave_devices enable row level security;
revoke all on public.weave_devices from anon, authenticated;

drop function if exists public.weave_log_access(text, text);
create or replace function public.weave_log_access(p_app text, p_event text default 'open', p_dev text default null)
returns void language plpgsql security definer set search_path = public as $$
declare h json; v_ip text; v_ua text; v_uid uuid := auth.uid(); v_app text := left(coalesce(p_app, '?'), 30);
        v_dev text := case when p_dev ~ '^[A-Za-z0-9_-]{8,64}$' then p_dev end;
begin
  begin h := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json; exception when others then h := '{}'::json; end;
  v_ip := coalesce(nullif(h ->> 'cf-connecting-ip', ''), nullif(trim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''), h ->> 'x-real-ip');
  v_ua := left(h ->> 'user-agent', 300);
  if v_uid is not null and v_dev is not null then
    insert into weave_devices(user_id, dev) values (v_uid, v_dev)
      on conflict (user_id, dev) do update set last_at = now();
  end if;
  -- 같은 사람 · 같은 앱 · 같은 IP 는 10분에 한 번만
  if exists (select 1 from weave_access_log l where l.app = v_app and l.ip is not distinct from v_ip
               and l.user_id is not distinct from v_uid and l.at > now() - interval '10 minutes') then return; end if;
  insert into weave_access_log(user_id, app, event, ip, ua, dev) values (v_uid, v_app, left(coalesce(p_event, 'open'), 30), v_ip, v_ua, v_dev);
end $$;
revoke all on function public.weave_log_access(text, text, text) from public;
grant execute on function public.weave_log_access(text, text, text) to anon, authenticated;

-- ── 2. 정지 · 처리 기록 (1년 보관) ────────────────────────────────────
create table if not exists public.weave_mod_actions (
  id          bigserial primary key,
  target_user uuid,
  action      text not null check (action in ('suspend', 'unsuspend', 'warn', 'dismiss', 'resolve', 'request', 'note')),
  app         text,
  reason      text,
  report_ref  text,          -- 어느 신고에서 나왔는지 (예: reports:123)
  until_at    timestamptz,   -- 정지 끝나는 때 (영구면 비움)
  admin_id    uuid default auth.uid(),
  at          timestamptz not null default now()
);
create index if not exists weave_mod_actions_target on public.weave_mod_actions(target_user, at desc);
alter table public.weave_mod_actions enable row level security;
revoke all on public.weave_mod_actions from anon, authenticated;

-- 계정 정지: 로그인 · 토큰 갱신이 막히고(auth.users.banned_until), 열려 있던 세션도 끊습니다.
--   이미 받은 출입증은 길어야 1시간 안에 끝납니다.
create or replace function public.weave_suspend_user(p_user uuid, p_reason text, p_days int default null,
                                                     p_report text default null, p_app text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_until timestamptz := case when p_days is null or p_days <= 0 then null else now() + make_interval(days => p_days) end;
begin
  if not weave_is_admin() then raise exception 'not_admin'; end if;
  if p_user is null or coalesce(trim(p_reason), '') = '' then return jsonb_build_object('ok', false, 'error', 'need_reason'); end if;
  if p_user = auth.uid() then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  update auth.users set banned_until = coalesce(v_until, 'infinity'::timestamptz) where id = p_user;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_user'); end if;
  delete from auth.sessions where user_id = p_user;
  insert into weave_mod_actions(target_user, action, app, reason, report_ref, until_at)
       values (p_user, 'suspend', p_app, p_reason, p_report, v_until);
  return jsonb_build_object('ok', true, 'until', v_until);
end $$;

create or replace function public.weave_unsuspend_user(p_user uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
begin
  if not weave_is_admin() then raise exception 'not_admin'; end if;
  update auth.users set banned_until = null where id = p_user;
  insert into weave_mod_actions(target_user, action, reason) values (p_user, 'unsuspend', coalesce(p_reason, ''));
  return jsonb_build_object('ok', true);
end $$;

-- 처리 메모만 남기기 (경고 · 문제없음 · 수사기관 요청 접수 등)
create or replace function public.weave_mod_note(p_user uuid, p_action text, p_reason text, p_report text default null, p_app text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not weave_is_admin() then raise exception 'not_admin'; end if;
  if p_action not in ('warn', 'dismiss', 'resolve', 'request', 'note') then return jsonb_build_object('ok', false, 'error', 'bad_action'); end if;
  insert into weave_mod_actions(target_user, action, app, reason, report_ref) values (p_user, p_action, p_app, p_reason, p_report);
  return jsonb_build_object('ok', true);
end $$;

-- 계정 찾기: 아이디(이메일 · 닉네임) 일부, 또는 계정 번호(uuid)
create or replace function public.weave_find_user(p_q text)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare q text := trim(coalesce(p_q, '')); r jsonb;
begin
  if not weave_is_admin() then raise exception 'not_admin'; end if;
  if length(q) < 2 then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(x order by x ->> 'created_at' desc), '[]'::jsonb) into r from (
    select jsonb_build_object('id', u.id, 'login', replace(coalesce(u.email, ''), '@u.alias.internal', ''), 'created_at', u.created_at,
             'last_sign_in_at', u.last_sign_in_at, 'banned_until', u.banned_until,
             'anon', coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, false)) as x
      from auth.users u
     where u.id::text = q or u.email ilike '%' || q || '%' or replace(u.email, '@u.alias.internal', '') ilike '%' || q || '%'
     limit 30) s;
  return r;
end $$;

-- 한 계정의 정지 · 처리 기록 + 최근 3개월 접속 기록 (신고 확인 · 수사기관 요청 대응용)
create or replace function public.weave_user_record(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not weave_is_admin() then raise exception 'not_admin'; end if;
  return jsonb_build_object(
    'user', (select jsonb_build_object('id', u.id, 'login', replace(coalesce(u.email, ''), '@u.alias.internal', ''), 'created_at', u.created_at,
                    'last_sign_in_at', u.last_sign_in_at, 'banned_until', u.banned_until) from auth.users u where u.id = p_user),
    'banned_device', weave_banned_device(p_user),
    'devices', (select count(*) from weave_devices where user_id = p_user),
    'actions', coalesce((select jsonb_agg(to_jsonb(a) order by a.at desc) from weave_mod_actions a where a.target_user = p_user), '[]'::jsonb),
    'access', coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'app', l.app, 'event', l.event, 'ip', l.ip, 'ua', l.ua) order by l.at desc)
                          from (select * from weave_access_log where user_id = p_user order by at desc limit 500) l), '[]'::jsonb));
end $$;

-- 최근 처리 기록 (관리 화면 목록)
create or replace function public.weave_mod_recent(p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not weave_is_admin() then raise exception 'not_admin'; end if;
  return coalesce((select jsonb_agg(x order by (x ->> 'at') desc) from (
    select to_jsonb(a) || jsonb_build_object('login', replace(coalesce(u.email, ''), '@u.alias.internal', '')) as x
      from weave_mod_actions a left join auth.users u on u.id = a.target_user
     order by a.at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) s), '[]'::jsonb);
end $$;

-- ── 3. 부름 서버의 대화 신고(reports) 처리 ───────────────────────────────
--   가림콜 서버의 reports 는 QR 등록물 신고라 모양이 달라 건드리지 않습니다(기존 관리 화면 그대로).
do $$
begin
  if to_regclass('public.reports') is not null and exists (select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'reports' and column_name = 'reporter_side_id') then
    execute 'alter table public.reports add column if not exists handled_status text not null default ''open''';
    execute 'alter table public.reports add column if not exists handled_at timestamptz';
    execute 'alter table public.reports add column if not exists handled_by uuid';
    execute 'alter table public.reports add column if not exists admin_note text';
  end if;
end $$;

create or replace function public.weave_alias_reports(p_status text default 'open')
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare r jsonb;
begin
  if not weave_is_admin() then raise exception 'not_admin'; end if;
  if to_regclass('public.reports') is null then return '[]'::jsonb; end if;
  execute $q$
    select coalesce(jsonb_agg(x order by (x ->> 'created_at') desc), '[]'::jsonb) from (
      select to_jsonb(rp) - 'detail' || jsonb_build_object(
               'detail', rp.detail,
               'reporter', rs.account_id, 'reporter_login', replace(coalesce(ru.email, ''), '@u.alias.internal', ''),
               'target', os.account_id, 'target_login', replace(coalesce(ou.email, ''), '@u.alias.internal', ''),
               'target_banned_until', ou.banned_until,
               'message', (select left(to_jsonb(m) ->> 'content', 500) from messages m where m.id = rp.message_id)) as x
        from reports rp
        left join link_sides rs on rs.id = rp.reporter_side_id
        left join link_sides os on os.link_id = rp.link_id and os.id <> rp.reporter_side_id
        left join auth.users ru on ru.id = rs.account_id
        left join auth.users ou on ou.id = os.account_id
       where rp.handled_status = $1
       order by to_jsonb(rp) ->> 'created_at' desc nulls last limit 200) s $q$ into r using coalesce(p_status, 'open');
  return r;
exception when undefined_column or undefined_table then
  return jsonb_build_object('error', 'schema', 'msg', sqlerrm);
end $$;

create or replace function public.weave_alias_report_close(p_id text, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not weave_is_admin() then raise exception 'not_admin'; end if;
  if p_status not in ('open', 'actioned', 'dismissed') then return jsonb_build_object('ok', false, 'error', 'bad_status'); end if;
  execute 'update reports set handled_status = $1, handled_at = now(), handled_by = auth.uid(), admin_note = coalesce($2, admin_note) where id::text = $3'
    using p_status, p_note, p_id;
  return jsonb_build_object('ok', true);
end $$;

-- ── 4. 통화 · 연결 기록 12개월 분리 보관 ─────────────────────────────────
--   통화 기록 표에서 줄이 지워질 때(이용자가 지움 · 탈퇴로 함께 지워짐) 그 줄을 그대로 옮겨 둡니다.
--   표 이름을 몰라도 되게, 아래 이름 중 이 서버에 있는 표에만 붙입니다. 대화 내용 표에는 붙이지 않습니다.
create table if not exists public.weave_call_archive (
  id          bigserial primary key,
  src         text not null,
  row_data    jsonb not null,
  archived_at timestamptz not null default now()
);
create index if not exists weave_call_archive_at on public.weave_call_archive(archived_at);
alter table public.weave_call_archive enable row level security;
revoke all on public.weave_call_archive from anon, authenticated;

create or replace function public.weave_call_keep() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into weave_call_archive(src, row_data) values (TG_TABLE_NAME, to_jsonb(OLD));
  return OLD;
exception when others then return OLD;   -- 보관이 실패해도 원래 지우기는 막지 않습니다
end $$;

do $$
declare t text;
begin
  foreach t in array array['calls', 'call_logs', 'call_records', 'call_history', 'burum_dial_log', 'wafa_calls', 'hotline_calls', 'nureum_calls'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists weave_call_keep on public.%I', t);
      execute format('create trigger weave_call_keep before delete on public.%I for each row execute function public.weave_call_keep()', t);
      raise notice 'call archive on %', t;
    end if;
  end loop;
end $$;

-- 수사기관 요청 대응: 한 계정이 들어 있는 보관 통화 기록 (관리자만)
create or replace function public.weave_call_archive_of(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not weave_is_admin() then raise exception 'not_admin'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('src', a.src, 'at', a.archived_at, 'row', a.row_data) order by a.archived_at desc)
                     from (select * from weave_call_archive where row_data::text like '%' || p_user::text || '%' order by archived_at desc limit 500) a), '[]'::jsonb);
end $$;

-- ── 5. 하루 만들기 제한 · 정지된 기기 (2026-11-27) ─────────────────────────
--   누름 · 바로너 새 라인: 가입 없이 시작 하루 3개 · 가입 계정 하루 10개 (지금의 '대기 5개' 제한은 그대로)
--   단톡방 새 방: 가입 없이 시작 하루 2개 · 가입 계정 하루 5개 (지금의 '열린 방 5개' 제한은 그대로)
--   결제한 적이 있는 분 · 관리자는 하루 제한에서 뺍니다. 정지된 계정과 같은 기기면 누구든 새로 만들 수 없습니다.
create or replace function public.weave_is_paid(p_uid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v boolean := false;
begin
  if p_uid is null then return false; end if;
  if to_regclass('public.nureum_purchases') is not null then
    begin execute 'select exists(select 1 from nureum_purchases where buyer_id = $1 and status = ''completed'' and amount > 0)' into v using p_uid;
    exception when others then v := false; end;
    if v then return true; end if;
  end if;
  if to_regclass('public.wafa_subs') is not null then
    begin execute 'select exists(select 1 from wafa_subs where user_id = $1)' into v using p_uid; exception when others then v := false; end;
    if v then return true; end if;
  end if;
  if to_regclass('public.dt_pay_log') is not null then
    begin execute 'select exists(select 1 from dt_pay_log where user_id = $1)' into v using p_uid; exception when others then v := false; end;
    if v then return true; end if;
  end if;
  return false;
end $$;

create or replace function public.weave_banned_device(p_uid uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from weave_devices d join weave_devices o on o.dev = d.dev and o.user_id <> d.user_id
                   join auth.users u on u.id = o.user_id
                  where d.user_id = p_uid and u.banned_until > now());
$$;
revoke all on function public.weave_is_paid(uuid), public.weave_banned_device(uuid) from public, anon, authenticated;

-- 트리거 인자: 앱 이름, 가입 없이 시작한 계정의 하루 개수, 가입 계정의 하루 개수, 만든 사람 칸 이름
create or replace function public.weave_create_guard() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid := (to_jsonb(NEW) ->> TG_ARGV[3])::uuid;
        v_anon boolean; v_lim int; v_cnt int;
        v_day timestamptz := ((now() at time zone 'Asia/Seoul')::date)::timestamp at time zone 'Asia/Seoul';
        HELP constant text := ' 더 필요하시면 고객센터(weapps.kr@gmail.com)로 알려 주세요.';
begin
  if v_uid is null or weave_is_admin() then return NEW; end if;
  if weave_banned_device(v_uid) then
    raise exception '이 기기에서는 지금 새로 만들 수 없어요. 고객센터(weapps.kr@gmail.com)로 문의해 주세요.' using hint = 'weave_limit';
  end if;
  if weave_is_paid(v_uid) then return NEW; end if;
  select coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, false) into v_anon from auth.users u where u.id = v_uid;
  v_lim := case when coalesce(v_anon, true) then TG_ARGV[1]::int else TG_ARGV[2]::int end;
  execute format('select count(*) from %I.%I where %I = $1 and created_at >= $2', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_ARGV[3]) into v_cnt using v_uid, v_day;
  if v_cnt >= v_lim then
    raise exception '오늘은 더 만들 수 없어요(하루 %개까지). 내일 다시 해 주세요.%', v_lim, HELP using hint = 'weave_limit';
  end if;
  return NEW;
end $$;

do $$
begin
  if to_regclass('public.nureum_lines') is not null then
    drop trigger if exists weave_create_guard on public.nureum_lines;
    create trigger weave_create_guard before insert on public.nureum_lines for each row execute function public.weave_create_guard('nureum', '3', '10', 'owner_id');
  end if;
  if to_regclass('public.dt_rooms') is not null then
    drop trigger if exists weave_create_guard on public.dt_rooms;
    create trigger weave_create_guard before insert on public.dt_rooms for each row execute function public.weave_create_guard('dantok', '2', '5', 'owner_id');
  end if;
end $$;

-- ── 6. 기간 지난 기록 지우기 (매일 새벽) ─────────────────────────────────
create or replace function public.weave_purge_logs() returns void
language sql security definer set search_path = public as $$
  delete from weave_access_log where at < now() - interval '3 months';
  delete from weave_mod_actions where at < now() - interval '1 year' and action <> 'request';
  delete from weave_call_archive where archived_at < now() - interval '12 months';
  delete from weave_devices where last_at < now() - interval '1 year';
$$;
revoke all on function public.weave_purge_logs() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin perform cron.unschedule('weave-purge-logs'); exception when others then null; end;
    perform cron.schedule('weave-purge-logs', '23 18 * * *', 'select public.weave_purge_logs()');   -- 한국 시간 새벽 3시 23분
  end if;
end $$;

-- 관리자 함수는 로그인한 관리자만
do $$
declare f text;
begin
  foreach f in array array['weave_suspend_user(uuid,text,integer,text,text)', 'weave_unsuspend_user(uuid,text)', 'weave_mod_note(uuid,text,text,text,text)',
                           'weave_find_user(text)', 'weave_user_record(uuid)', 'weave_mod_recent(integer)', 'weave_alias_reports(text)',
                           'weave_alias_report_close(text,text,text)', 'weave_call_archive_of(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

select 'weave safety ok' as result,
       (select count(*) from pg_extension where extname = 'pg_cron') as cron_ready,
       (to_regclass('public.reports') is not null) as has_reports,
       (select string_agg(event_object_table, ', ') from information_schema.triggers where trigger_name = 'weave_call_keep') as call_archive_on,
       (select string_agg(distinct event_object_table, ', ') from information_schema.triggers where trigger_name = 'weave_create_guard') as daily_limit_on;
