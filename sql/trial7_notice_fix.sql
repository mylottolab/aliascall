-- 체험 끝 알림 시점을 원래대로 (가림콜 서버) — 2026-11-28
--   알림을 보내는 프로그램의 문구를 확인하지 못해, 문구와 시점이 어긋나지 않도록 '7일 전' 알림 조건을 원래대로 돌립니다.
--   (체험이 7일이 되어 이 알림은 체험을 시작한 직후 "7일 남았습니다" 로 한 번 가고, 끝나기 1일 전 알림은 그대로입니다)
do $$
declare d text; d2 text;
begin
  d := pg_get_functiondef('public.trial_notice_targets()'::regprocedure);
  d2 := replace(d, 'p.trial_ends_at <= now() + interval ''3 days''', 'p.trial_ends_at <= now() + interval ''7 days''');
  if d2 <> d then execute d2; end if;
end $$;
select 'notice ok' as result, pg_get_functiondef('public.trial_notice_targets()'::regprocedure) like '%now() + interval ''7 days''%' as seven_day_window;
