/* 가림콜 로고 글자 — 한국어: 가림<em>콜</em> · 영어: Alias<em>call</em> (2026-11-13)
   <span class="ac-brand"> 를 찾아 언어에 맞게 바꿉니다. 언어를 바꾸면 window.acBrand() 를 다시 부르세요. */
(function(){
  function en(){
    try { if (/_en\.html$/.test(location.pathname)) return true; } catch (e) {}
    var l = '';
    try { l = localStorage.getItem('aliascall_lang') || ''; } catch (e) {}
    if (!l) l = document.documentElement.lang || '';
    return l.indexOf('en') === 0;
  }
  function apply(){
    var e = en();
    var els = document.querySelectorAll('.ac-brand');
    for (var i = 0; i < els.length; i++) els[i].innerHTML = e ? 'Alias<em>call</em>' : '가림<em>콜</em>';
  }
  window.acBrand = apply;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
  window.addEventListener('storage', function(ev){ if (ev.key === 'aliascall_lang') apply(); });
})();
