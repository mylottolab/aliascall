-- 체험 끝 알림: '7일 전' 알림을 '3일 전' 에 보냄 (가림콜 서버) — 2026-11-28
--   알림 프로그램(aliascall-sweep)이 남은 날짜(days_left)를 그대로 문구에 넣는 것을 확인했습니다 → "무료 체험이 3일 남았어요"
do $$
declare d text; d2 text;
begin
  d := pg_get_functiondef('public.trial_notice_targets()'::regprocedure);
  d2 := replace(d, 'p.trial_ends_at <= now() + interval ''7 days''', 'p.trial_ends_at <= now() + interval ''3 days''');
  if d2 <> d then execute d2; end if;
end $$;
select 'notice 3d ok' as result, pg_get_functiondef('public.trial_notice_targets()'::regprocedure) like '%now() + interval ''3 days''%' as three_day_window;
