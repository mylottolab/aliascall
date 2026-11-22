/* 🌐 2026-11-22 첫 화면 한영 단추 — ⚙(설정) 바로 왼쪽에 작은 [EN] / [한] 하나만
   · 10월 애플 심사("머리글이 복잡함") 때 한영 단추를 ⚙ 안으로 넣었는데, 첫 화면에서는 바로 바꿀 수 있게 하나만 다시 꺼냅니다.
   · 실제 바꾸기는 숨겨 둔 원래 [KR][EN] 단추를 대신 눌러 줍니다(번역 코드가 그 단추에 붙어 있음). */
(function(){
  'use strict';
  var tries = 0;
  function en(){ try { return (localStorage.getItem('aliascall_lang') || 'ko') === 'en'; } catch (e) { return false; } }
  function add(){
    var g = document.querySelector('#viewHome ~ .ac-gear, .hero .ac-gear, .ac-gear');
    if (!g) { if (++tries < 30) setTimeout(add, 200); return; }
    if (document.getElementById('acLangPill')) return;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'acLangPill'; b.className = g.className.replace('ac-gear', '').trim();
    var top = g.style.top || '16px', right = parseInt(g.style.right || '16', 10);
    b.style.cssText = (g.style.position ? 'position:' + g.style.position + ';top:' + top + ';right:' + (right + 42) + 'px;z-index:5;' : 'margin-right:6px;') +
      'min-width:38px;height:34px;padding:0 10px;border-radius:17px;font-size:13px;font-weight:800;cursor:pointer;background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.25)';
    function paint(){ var E = en(); b.textContent = E ? '한' : 'EN'; b.title = b.ariaLabel = E ? '한국어로' : 'English'; }
    b.onclick = function(e){
      e.preventDefault(); e.stopPropagation();
      var want = en() ? 'ko' : 'en', t = document.querySelector('.lang-toggle [data-lang="' + want + '"]');
      if (t) t.click(); try { localStorage.setItem('aliascall_lang', want); } catch (x) {}
      var h = document.getElementById('acHelpLink'); if (h) { h.href = 'aliascall_help.html?lang=' + want; h.textContent = want === 'en' ? '❓ Guide' : '❓ 사용법'; }
      paint();
      if (document.getElementById('acDial')) setTimeout(function(){ location.reload(); }, 150);   // 다이얼 글도 새 언어로
    };
    paint(); g.parentNode.insertBefore(b, g);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
