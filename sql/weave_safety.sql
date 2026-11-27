-- =====================================================================
-- 위브앱 안전 관리 (2026-11-27) — 접속 기록 · 신고 처리 · 이용 정지 기록
--   두 서버에 각각 한 번씩 Run 합니다. 같은 파일 그대로 써도 됩니다.
--     ① 부름 서버   (azredlrnvsssfjytaotb) — 와파 · 부름 · 누름 · 바로너
--     ② 가림콜 서버 (qmwaraittiurkynszjts) — 가림콜 · 바로카 · 단톡방 · 단골창구
--   다시 돌려도 안전합니다. 맨 아래 'weave safety ok' 가 나오면 끝입니다.
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

create or replace function public.weave_log_access(p_app text, p_event text default 'open')
returns void language plpgsql security definer set search_path = public as $$
declare h json; v_ip text; v_ua text; v_uid uuid := auth.uid(); v_app text := left(coalesce(p_app, '?'), 30);
begin
  begin h := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json; exception when others then h := '{}'::json; end;
  v_ip := coalesce(nullif(h ->> 'cf-connecting-ip', ''), nullif(trim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''), h ->> 'x-real-ip');
  v_ua := left(h ->> 'user-agent', 300);
  -- 같은 사람 · 같은 앱 · 같은 IP 는 10분에 한 번만
  if exists (select 1 from weave_access_log l where l.app = v_app and l.ip is not distinct from v_ip
               and l.user_id is not distinct from v_uid and l.at > now() - interval '10 minutes') then return; end if;
  insert into weave_access_log(user_id, app, event, ip, ua) values (v_uid, v_app, left(coalesce(p_event, 'open'), 30), v_ip, v_ua);
end $$;
revoke all on function public.weave_log_access(text, text) from public;
grant execute on function public.weave_log_access(text, text) to anon, authenticated;

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
create or replace function public.admin_suspend_user(p_user uuid, p_reason text, p_days int default null,
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

create or replace function public.admin_unsuspend_user(p_user uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
begin
  if not weave_is_admin() then raise exception 'not_admin'; end if;
  update auth.users set banned_until = null where id = p_user;
  insert into weave_mod_actions(target_user, action, reason) values (p_user, 'unsuspend', coalesce(p_reason, ''));
  return jsonb_build_object('ok', true);
end $$;

-- 처리 메모만 남기기 (경고 · 문제없음 · 수사기관 요청 접수 등)
create or replace function public.admin_mod_note(p_user uuid, p_action text, p_reason text, p_report text default null, p_app text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not weave_is_admin() then raise exception 'not_admin'; end if;
  if p_action not in ('warn', 'dismiss', 'resolve', 'request', 'note') then return jsonb_build_object('ok', false, 'error', 'bad_action'); end if;
  insert into weave_mod_actions(target_user, action, app, reason, report_ref) values (p_user, p_action, p_app, p_reason, p_report);
  return jsonb_build_object('ok', true);
end $$;

-- 계정 찾기: 아이디(이메일 · 닉네임) 일부, 또는 계정 번호(uuid)
create or replace function public.admin_find_user(p_q text)
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
create or replace function public.admin_user_record(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not weave_is_admin() then raise exception 'not_admin'; end if;
  return jsonb_build_object(
    'user', (select jsonb_build_object('id', u.id, 'login', replace(coalesce(u.email, ''), '@u.alias.internal', ''), 'created_at', u.created_at,
                    'last_sign_in_at', u.last_sign_in_at, 'banned_until', u.banned_until) from auth.users u where u.id = p_user),
    'actions', coalesce((select jsonb_agg(to_jsonb(a) order by a.at desc) from weave_mod_actions a where a.target_user = p_user), '[]'::jsonb),
    'access', coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'app', l.app, 'event', l.event, 'ip', l.ip, 'ua', l.ua) order by l.at desc)
                          from (select * from weave_access_log where user_id = p_user order by at desc limit 500) l), '[]'::jsonb));
end $$;

-- 최근 처리 기록 (관리 화면 목록)
create or replace function public.admin_mod_recent(p_limit int default 100)
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

create or replace function public.admin_alias_reports(p_status text default 'open')
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

create or replace function public.admin_alias_report_close(p_id text, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not weave_is_admin() then raise exception 'not_admin'; end if;
  if p_status not in ('open', 'actioned', 'dismissed') then return jsonb_build_object('ok', false, 'error', 'bad_status'); end if;
  execute 'update reports set handled_status = $1, handled_at = now(), handled_by = auth.uid(), admin_note = coalesce($2, admin_note) where id::text = $3'
    using p_status, p_note, p_id;
  return jsonb_build_object('ok', true);
end $$;

-- ── 4. 기간 지난 기록 지우기 (매일 새벽) ─────────────────────────────────
create or replace function public.weave_purge_logs() returns void
language sql security definer set search_path = public as $$
  delete from weave_access_log where at < now() - interval '3 months';
  delete from weave_mod_actions where at < now() - interval '1 year' and action <> 'request';
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
  foreach f in array array['admin_suspend_user(uuid,text,integer,text,text)', 'admin_unsuspend_user(uuid,text)', 'admin_mod_note(uuid,text,text,text,text)',
                           'admin_find_user(text)', 'admin_user_record(uuid)', 'admin_mod_recent(integer)', 'admin_alias_reports(text)',
                           'admin_alias_report_close(text,text,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

select 'weave safety ok' as result,
       (select count(*) from pg_extension where extname = 'pg_cron') as cron_ready,
       (to_regclass('public.reports') is not null) as has_reports;
