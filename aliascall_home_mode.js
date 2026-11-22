/* =====================================================================
   가림콜 첫 화면 고르기 (2026-11-22) — ☎ 다이얼 첫 화면(aliascall_dialhome.js)
   · 'classic' = 지금 첫 화면(네 칸)   · 'dial' = 네 칸 자리에 큰 다이얼(나머지 — 알림 띠 · 경광등 · 단축회선 · 전문업체는 그대로)
   · 모든 분을 한 번에 바꾸려면 아래 ALL 만 'dial' 로, 되돌리려면 'classic' 으로 (앱 업데이트 필요 없음)
   · 이 폰만 시험: index.html?trydial=1 · 다이얼 아래 [본화면부터 보기로] 로 원래대로
   ===================================================================== */
(function(){
  var ALL = 'classic';   // ← 전체 전환 스위치: 'classic' | 'dial'
  var m = ALL;
  try { if (/[?&]trydial=1/.test(location.search)) localStorage.setItem('aliascall_home_mode', 'dial'); } catch (e) {}
  try { var l = localStorage.getItem('aliascall_home_mode'); if (l === 'dial' || l === 'classic') m = l; } catch (e) {}
  window.ALIASCALL_HOME = m;
  window.ALIASCALL_HOME_ALL = ALL;
})();
