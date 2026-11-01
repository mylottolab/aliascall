/* =====================================================================
   🔴 2026-11-01 — 왼쪽 위 Aliascall 로고(A · Aliascall)를 누르면 첫 화면으로
   · 여러 화면 머리글의 .brand-mark · .brand-name 에 공통으로 붙습니다(관리자 화면 제외).
   ===================================================================== */
(function(){
  var st = document.createElement('style');
  st.textContent = '.brand-mark,.brand-name{cursor:pointer;-webkit-tap-highlight-color:transparent}';
  document.head.appendChild(st);
  document.addEventListener('click', function(e){
    var b = e.target && e.target.closest && e.target.closest('.brand-mark,.brand-name');
    if (!b || b.closest('a')) return;      // 이미 링크 안에 있으면 그 링크를 따름
    e.preventDefault();
    location.href = 'index.html';
  }, true);
})();
