-- =====================================================================
-- 매출 센터 준비 — 결제 관련 표 · 지금 통계 함수 살펴보기 (읽기만 합니다. 아무것도 바꾸지 않습니다)
--   부름 서버 · 가림(에일리어스콜) 서버 두 곳에서 각각 Run 해 주세요.
--   결과는 한 칸(report)입니다. 결과 표 오른쪽 위 [Export] → [Download CSV] 로 받아 보내 주세요.
-- =====================================================================
with t as (
  select c.table_name,
         string_agg(c.column_name || ':' || c.data_type, ', ' order by c.ordinal_position) as cols
    from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
   where c.table_schema = 'public'
     and (c.table_name ~* '(pay|purchas|order|receipt|subscri|billing|pass|ticket|refund|point|bank|plan|pack|credit|gift|coupon|sale|revenue|iap|wallet|charge|topup|deposit|settle|partner)')
   group by c.table_name
),
n as (
  select relname as table_name, n_live_tup as rows_approx
    from pg_stat_user_tables where schemaname = 'public'
),
f as (
  select p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('admin_daily_stats', 'admin_signup_apps', 'admin_signup_list', 'is_global_admin')
)
select
  '### TABLES' || E'\n' ||
  coalesce((select string_agg(t.table_name || ' (~' || coalesce(n.rows_approx, 0) || ' rows): ' || t.cols, E'\n' order by t.table_name)
              from t left join n on n.table_name = t.table_name), '(none)') ||
  E'\n\n### FUNCTIONS\n' ||
  coalesce((select string_agg('-- ' || proname || E'\n' || def, E'\n\n') from f), '(none)') as report;
