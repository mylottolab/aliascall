/* =====================================================================
   DialHome — ☎ 다이얼 첫 화면 (2026-11-22) · 와파 · 부름 · 누름 · 바로너 공용 (저장소마다 같은 파일)
   · 숫자 구멍을 톡 → 가운데에 그 번호 이름 + 아래 「따라하기 3단계」 · 한 번 더 톡 / [▶ 열기] → 실행
   · 구멍에 손가락을 넣고 오른쪽 아래 멈춤쇠까지 돌렸다 놓으면 → 드르륵 · 딸깍딸깍 되돌아간 뒤 바로 실행
   · 아래 번호 목록을 눌러도 같음(돌리기 어려운 분 · 화면 읽기 프로그램) · 키보드 0~9 · Enter
   · 다음에 할 번호(next)는 구멍이 깜빡임 · 할 일(need)엔 ! · 새 소식(badge)은 숫자 배지
   · 다이얼 소리 · 목소리 안내(폰이 읽어 줌) 켜고 끄기 — 이 폰에만 기억

   쓰는 법:
     var dh = DialHome.mount(host, {
       en: false, key: 'wafa',                       // 저장 이름 앞머리
       brand: { plate:'#0F6E68', rim:'#0B524D', ring:'#0A4743', ink:'#FFFFFF' },
       center: function(){ return { title:'WAFA', sub:'010 1234 5678' } },
       hint: '숫자를 톡 …',                           // 아무것도 안 골랐을 때 아래 글
       next: '4',                                     // 깜빡일 번호(없으면 null)
       centerTap: { label:'톡 = 전화 걸기', go:function(){} },   // 가운데를 톡 = 본화면 바로가기(선택)
       centerCall: { label:'📞 전화 걸기', sub:'큰 번호판', color:'#E8734A', go:function(){} },   // (선택) 가운데를 위아래 반으로 — 위 반원 = 전화 걸기
       items: { '1': { ico:'☎️', t:'전화 걸기', d:'한 줄 설명', info:'설명', steps:['…','…','…'], pic:'<svg…>',
                       need:false, badge:0, url:'page.html' | go:function(){} , blank:false, mico:'목록용 아이콘(선택)' }, … '0': {…} }
     });
     dh.update({ items:…, next:…, hint:… })   // 배지 · 할 일이 바뀌었을 때
   ===================================================================== */
(function(){
  'use strict';
  if (window.DialHome) return;
  var ORDER = ['1','2','3','4','5','6','7','8','9','0'];
  var KO_NUM = { '1':'일','2':'이','3':'삼','4':'사','5':'오','6':'육','7':'칠','8':'팔','9':'구','0':'영' };
  var NS = 'http://www.w3.org/2000/svg';
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); };
  function lsGet(k, d){ try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }

  var CSS = '' +
  ':root{--dh-base:#F4F1E6;--dh-base-line:#DCD5C3;--dh-stop:#B9BEC4;--dh-num:#1B2430;--dh-lab:#5E6773;--dh-hot:#E0A42E;--dh-hot-ink:#1B2430;--dh-center:#FAF8F2;' +
  '--dh-card:#FFFFFF;--dh-line:#E2DED5;--dh-chip:#ECE8DF;--dh-ink:#1B2430;--dh-sub:#5E6773;--dh-soft:#EEF4F2}' +
  '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]):not([data-mode="light"]){--dh-base:#1E252C;--dh-base-line:#323C46;--dh-stop:#7C8590;--dh-num:#ECEFF2;--dh-lab:#A3ACB6;--dh-hot:#F0B848;--dh-hot-ink:#12171C;--dh-center:#161C22;' +
  '--dh-card:#1B2229;--dh-line:#2C353F;--dh-chip:#242C35;--dh-ink:#ECEFF2;--dh-sub:#A3ACB6;--dh-soft:#1B2A2A}}' +
  ':root[data-theme="dark"],:root[data-mode="dark"]{--dh-base:#1E252C;--dh-base-line:#323C46;--dh-stop:#7C8590;--dh-num:#ECEFF2;--dh-lab:#A3ACB6;--dh-hot:#F0B848;--dh-hot-ink:#12171C;--dh-center:#161C22;' +
  '--dh-card:#1B2229;--dh-line:#2C353F;--dh-chip:#242C35;--dh-ink:#ECEFF2;--dh-sub:#A3ACB6;--dh-soft:#1B2A2A}' +
  '.dh{display:flex;flex-direction:column;gap:10px;color:var(--dh-ink)}' +
  '.dh [hidden]{display:none!important}' +
  '.dh-wrap{position:relative;width:100%;max-width:440px;margin:0 auto;aspect-ratio:1/1;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}' +
  '.dh-wrap svg{width:100%;height:100%;display:block;overflow:visible;outline:none}' +
  '.dh-num{font:800 23px/1 "Pretendard","Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif;fill:var(--dh-num)}' +
  '.dh-ico{font-size:15px}.dh-hole{cursor:pointer}' +
  '.dh-plate{transform-origin:180px 180px;will-change:transform}' +
  '.dh-ct{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:31%;text-align:center;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:3px;word-break:keep-all}' +
  '.dh-ct b{font-size:clamp(14px,4.2vw,19px);line-height:1.25}' +
  '.dh-ct span{font-size:clamp(11px,3vw,13px);color:var(--dh-lab);line-height:1.35}' +
  '.dh-ct .tap{font-style:normal;font-size:clamp(10.5px,2.9vw,12.5px);font-weight:800;color:var(--dh-brand);border:1.5px solid var(--dh-brand);border-radius:999px;padding:2px 8px;margin-top:3px;white-space:nowrap}' +
  /* 📞 2026-11-23 가운데를 위아래 반으로(centerCall) — 위 = 전화 걸기 · 아래 = 원래 가운데 */
  '.dh-split .dh-ct{top:60.5%;width:30%;gap:2px}.dh-split .dh-ct b{font-size:clamp(12.5px,3.7vw,16px);line-height:1.2}.dh-split .dh-ct .tap{margin-top:1px;padding:1px 7px;font-size:clamp(9.5px,2.6vw,11.5px)}' +
  '.dh-split .dh-ct .k2{font:900 clamp(15px,4.6vw,20px)/1 "Pretendard",system-ui,sans-serif;color:var(--dh-brand);margin-right:4px}' +
  '.dh-call{position:absolute;left:50%;top:41.8%;transform:translate(-50%,-50%);pointer-events:none;color:#fff;text-align:center;line-height:1.15;display:flex;flex-direction:column;align-items:center;gap:1px}' +
  '.dh-call b{font-size:clamp(13.5px,4.1vw,18px);font-weight:900;white-space:nowrap}.dh-call small{font-size:clamp(9.5px,2.6vw,11.5px);opacity:.92;white-space:nowrap}' +
  '.dh-ct .k{font:900 clamp(26px,8vw,36px)/1 "Pretendard",system-ui,sans-serif;color:var(--dh-brand)}' +
  '.dh-hint{text-align:center;font-size:14.5px;color:var(--dh-sub);margin:0;min-height:22px;line-height:1.55}' +
  '.dh-go{display:flex;gap:8px}' +
  '.dh-go button{flex:1;min-height:50px;border-radius:14px;font:inherit;font-weight:800;font-size:16px;cursor:pointer;border:0}' +
  '.dh-go .o{background:var(--dh-brand);color:var(--dh-brand-ink)}' +
  '.dh-go .c{background:none;color:var(--dh-brand);border:1.5px solid var(--dh-brand)}' +
  '.dh-steps{background:var(--dh-card);border:1px solid var(--dh-line);border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}' +
  '.dh-steps b{font-size:14px}' +
  '.dh-steps ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px}' +
  '.dh-steps li{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;line-height:1.45}' +
  '.dh-steps li i{flex:0 0 auto;width:24px;height:24px;border-radius:50%;background:var(--dh-brand);color:var(--dh-brand-ink);display:grid;place-items:center;font-style:normal;font-weight:900;font-size:13px;margin-top:1px}' +
  '.dh-steps .pic{border-radius:12px;background:var(--dh-chip);padding:8px;color:var(--dh-ink)}.dh-steps .pic svg{width:100%;height:auto;display:block}' +
  '.dh-menu{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}' +
  '.dh-menu button{min-width:0;display:flex;align-items:center;gap:10px;background:var(--dh-card);border:1px solid var(--dh-line);border-radius:14px;padding:10px 12px;font:inherit;color:var(--dh-ink);text-align:left;cursor:pointer;min-height:56px;position:relative}' +
  '.dh-menu button.on{border-color:var(--dh-brand);background:var(--dh-soft)}' +
  '.dh-menu button.need .t>span{color:var(--dh-hot);font-weight:700}.dh-menu .bd.nd{background:var(--dh-hot);color:var(--dh-hot-ink)}'   /* 🔴 2026-11-23 할 일(!)은 테두리 대신 ! 표시 — 노란 테두리가 「고른 칸」처럼 보였음 */ +
  '.dh-menu button.blank{opacity:.55}' +
  '.dh-menu .d{flex:0 0 auto;width:30px;height:30px;border-radius:50%;background:var(--dh-chip);display:grid;place-items:center;font-weight:900}' +
  '.dh-menu .t{display:flex;flex-direction:column;min-width:0}.dh-menu .t b{font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
  '.dh-menu .t span{font-size:12px;color:var(--dh-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
  '.dh-menu .bd{position:absolute;top:6px;right:8px;min-width:20px;height:20px;border-radius:10px;background:#E5484D;color:#fff;font-size:11.5px;font-weight:900;display:grid;place-items:center;padding:0 5px}' +
  '.dh-first{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--dh-card);border:1px solid var(--dh-line);border-radius:14px;padding:10px 14px;font-size:13.5px}' +
  '.dh-first span{color:var(--dh-sub);min-width:0}.dh-first button{flex:0 0 auto;border:1.5px solid var(--dh-brand);color:var(--dh-brand);background:none;border-radius:999px;padding:7px 12px;font:inherit;font-weight:800;cursor:pointer;white-space:nowrap}' +
  '.dh-tog{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;font-size:13px}' +
  '.dh-tog button{color:var(--dh-sub);background:none;border:0;font:inherit;text-decoration:underline;cursor:pointer;padding:6px 2px}' +
  '@keyframes dhblink{0%,100%{stroke:var(--dh-hot);stroke-width:6}50%{stroke:var(--dh-ring);stroke-width:2.5}}' +
  '.dh-blink{animation:dhblink 1.1s ease-in-out infinite}' +
  '@media (prefers-reduced-motion:reduce){.dh-blink{animation:none;stroke:var(--dh-hot);stroke-width:5}}';

  function mount(host, O){
    if (!document.getElementById('dh-css')) { var st = document.createElement('style'); st.id = 'dh-css'; st.textContent = CSS; document.head.appendChild(st); }
    var EN = !!O.en, T = function(ko, en){ return EN ? en : ko; };
    var B = O.brand || {};
    var root = document.createElement('div'); root.className = 'dh';
    root.style.setProperty('--dh-brand', B.plate || '#0F6E68');
    root.style.setProperty('--dh-brand-ink', B.ink || '#FFFFFF');
    root.style.setProperty('--dh-plate', B.plate || '#0F6E68');
    root.style.setProperty('--dh-rim', B.rim || '#0B524D');
    root.style.setProperty('--dh-ring', B.ring || '#0A4743');
    root.innerHTML =
      '<div class="dh-wrap"><svg viewBox="0 0 360 360" role="img" aria-label="' + esc(T('다이얼', 'Dial')) + '"></svg><div class="dh-ct"></div></div>' +
      '<div class="dh-slot-top"></div>' +
      '<p class="dh-hint"></p>' +
      '<div class="dh-steps" hidden></div>' +
      '<div class="dh-go" hidden><button type="button" class="c"></button><button type="button" class="o"></button></div>' +
      '<div class="dh-slot-mid"></div>' +
      '<div class="dh-menu"></div>' +
      '<div class="dh-tog"><button type="button" class="snd"></button><button type="button" class="vce"></button></div>' +
      (O.firstScreen ? '<div class="dh-first"><span></span><button type="button"></button></div>' : '');
    host.appendChild(root);
    var svg = root.querySelector('svg'), ct = root.querySelector('.dh-ct'), hint = root.querySelector('.dh-hint'),
        stepsEl = root.querySelector('.dh-steps'), goEl = root.querySelector('.dh-go'), menu = root.querySelector('.dh-menu');
    var S = { items: O.items, next: O.next || null, hint: O.hint || '' };

    /* ── 그리기 ── */
    var CX = 180, CY = 180, RR = 120, HR = 24, R_OUT = 158, R_IN = 70, A1 = -32, STEP = 28.5, STOP_A = 38;
    function angOf(i){ return A1 - i * STEP; }
    function maxRot(i){ return STOP_A - angOf(i); }
    function pt(a, r){ var t = a * Math.PI / 180; return [CX + r * Math.cos(t), CY + r * Math.sin(t)]; }
    function cp(x, y, r){ return 'M' + (x - r) + ' ' + y + 'a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + (-2 * r) + ' 0Z'; }
    function el(tag, a, p){ var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); (p || svg).appendChild(e); return e; }
    el('circle', { cx:CX, cy:CY, r:R_OUT + 14, fill:'var(--dh-base)', stroke:'var(--dh-base-line)', 'stroke-width':2 });
    var under = el('g', {});
    var plate = el('g', { class:'dh-plate' });
    var d = cp(CX, CY, R_OUT) + cp(CX, CY, R_IN);
    ORDER.forEach(function(k, i){ var p = pt(angOf(i), RR); d += cp(p[0], p[1], HR); });
    el('path', { d:d, 'fill-rule':'evenodd', fill:'var(--dh-plate)', stroke:'var(--dh-rim)', 'stroke-width':2 }, plate);
    var rings = {};
    ORDER.forEach(function(k, i){ var p = pt(angOf(i), RR);
      rings[k] = el('circle', { cx:p[0], cy:p[1], r:HR, fill:'transparent', stroke:'var(--dh-ring)', 'stroke-width':2.5, class:'dh-hole' }, plate); });
    el('circle', { cx:CX, cy:CY, r:R_IN - 3, fill:'var(--dh-center)', stroke:'var(--dh-rim)', 'stroke-width':2 });
    if (O.centerCall) {   // 📞 위 반원 = 전화 걸기
      var rc = R_IN - 4;
      el('path', { d:'M' + (CX - rc) + ',' + CY + ' A' + rc + ',' + rc + ' 0 0 1 ' + (CX + rc) + ',' + CY + ' Z', fill:O.centerCall.color || 'var(--dh-brand)', class:'dh-hole' });
      el('line', { x1:CX - rc, y1:CY, x2:CX + rc, y2:CY, stroke:'var(--dh-rim)', 'stroke-width':2 });
      root.classList.add('dh-split');
      var cl = document.createElement('div'); cl.className = 'dh-call';
      cl.innerHTML = '<b>' + esc(O.centerCall.label) + '</b>' + (O.centerCall.sub ? '<small>' + esc(O.centerCall.sub) + '</small>' : '');
      ct.parentNode.appendChild(cl);
    }
    var s1 = pt(STOP_A + 12, R_OUT - 6), s2 = pt(STOP_A + 12, R_OUT + 16);
    el('line', { x1:s1[0], y1:s1[1], x2:s2[0], y2:s2[1], stroke:'var(--dh-stop)', 'stroke-width':9, 'stroke-linecap':'round' });
    var marks = el('g', {});
    function drawUnder(){
      while (under.firstChild) under.removeChild(under.firstChild);
      while (marks.firstChild) marks.removeChild(marks.firstChild);
      ORDER.forEach(function(k, i){
        var p = pt(angOf(i), RR), it = S.items[k] || {};
        el('text', { x:p[0], y:p[1] - 3, 'text-anchor':'middle', class:'dh-num', opacity: it.blank ? .45 : 1 }, under).textContent = k;
        el('text', { x:p[0], y:p[1] + 15, 'text-anchor':'middle', class:'dh-ico' }, under).textContent = it.ico || '';
        var q = pt(angOf(i) - 13, RR + 30);
        if (it.badge) { el('circle', { cx:q[0], cy:q[1], r:10, fill:'#E5484D' }, marks);
          el('text', { x:q[0], y:q[1] + 4, 'text-anchor':'middle', style:'font:900 11.5px system-ui;fill:#fff' }, marks).textContent = it.badge > 99 ? '99+' : String(it.badge); }
        else if (it.need) { el('circle', { cx:q[0], cy:q[1], r:9, fill:'var(--dh-hot)' }, marks);
          el('text', { x:q[0], y:q[1] + 4.5, 'text-anchor':'middle', style:'font:900 13px system-ui;fill:var(--dh-hot-ink)' }, marks).textContent = '!'; }
      });
    }

    /* ── 소리 · 목소리 ── */
    var SK = (O.key || 'dh') + '_home_dial_sound', VK = (O.key || 'dh') + '_home_dial_voice';
    var soundOn = lsGet(SK, 'on') !== 'off', voiceOn = lsGet(VK, 'off') === 'on';
    var ac = null;
    function actx(){ if (!soundOn) return null; if (!ac) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { ac = new C(); } catch (e) { return null; } }
      if (ac.state === 'suspended') { try { ac.resume(); } catch (e) {} } return ac; }
    function tick(vol, f){ var c = actx(); if (!c) return; var t = c.currentTime, o = c.createOscillator(), g = c.createGain();
      o.type = 'square'; o.frequency.value = f || 1800; o.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol || .12, t + .002); g.gain.exponentialRampToValueAtTime(.0001, t + .025); o.start(t); o.stop(t + .04); }
    function buzz(ms){ try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
    function say(text){ if (!voiceOn || !('speechSynthesis' in window)) return;
      try { speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(text); u.lang = EN ? 'en-US' : 'ko-KR'; u.rate = EN ? 1 : .95; speechSynthesis.speak(u); } catch (e) {} }

    /* ── 고르기 · 실행 ── */
    var sel = null;
    function paint(){
      var it = sel && S.items[sel];
      if (!it) {
        var c = O.center ? O.center() : { title:'', sub:'' };
        ct.innerHTML = '<b>' + esc(c.title) + '</b>' + (c.sub ? '<span>' + esc(c.sub) + '</span>' : '') +
          (O.centerTap ? '<em class="tap">' + esc(O.centerTap.label) + '</em>' : '');
        hint.textContent = S.hint; stepsEl.hidden = true; goEl.hidden = true;
      } else {
        ct.innerHTML = '<span class="k">' + sel + '</span><b>' + esc(it.t) + '</b><span>' + esc(it.d || '') + '</span>';
        hint.textContent = it.info || '';
        if (it.steps && it.steps.length) {
          stepsEl.hidden = false;
          stepsEl.innerHTML = '<b>' + esc(T(sel + '번 따라하기', 'Step by step — ' + sel)) + '</b><ol>' +
            it.steps.map(function(x, j){ return '<li><i>' + (j + 1) + '</i><span>' + esc(x) + '</span></li>'; }).join('') + '</ol>' +
            (it.pic ? '<div class="pic">' + it.pic + '</div>' : '');
        } else stepsEl.hidden = true;
        goEl.hidden = !!it.blank && !it.go && !it.url;
        goEl.querySelector('.o').textContent = '▶ ' + (it.open || T(sel + '번 열기', 'Open ' + sel));
        goEl.querySelector('.c').textContent = T('✕ 닫기', '✕ Close');
      }
      if (O.centerCall) {   // 📞 아래 반원은 좁아서 이름 · 톡 안내만
        var c0 = O.center ? O.center() : { title:'' };
        ct.innerHTML = it ? '<b><span class="k2">' + sel + '</span>' + esc(it.t) + '</b>' : '<b>' + esc(c0.title) + '</b>' + (O.centerTap ? '<em class="tap">' + esc(O.centerTap.label) + '</em>' : '');
      }
      ORDER.forEach(function(k){ var on = k === sel;
        rings[k].setAttribute('stroke', on ? 'var(--dh-hot)' : 'var(--dh-ring)'); rings[k].setAttribute('stroke-width', on ? 5 : 2.5);
        if (rings[k].classList) rings[k].classList.toggle('dh-blink', !sel && k === S.next); });
      [].forEach.call(menu.querySelectorAll('button'), function(b){ b.classList.toggle('on', b.dataset.k === sel); });
    }
    function drawMenu(){
      menu.innerHTML = ORDER.map(function(k){ var it = S.items[k] || {};
        return '<button type="button" data-k="' + k + '" class="' + (it.need ? 'need ' : '') + (it.blank ? 'blank' : '') + '"><span class="d">' + k + '</span>' +
          '<span class="t"><b>' + esc(((it.mico != null ? it.mico : it.ico) ? (it.mico != null ? it.mico : it.ico) + ' ' : '') + (it.t || '')) + '</b><span>' + esc(it.d || '') + '</span></span>' +
          (it.badge ? '<span class="bd">' + (it.badge > 99 ? '99+' : it.badge) + '</span>' : it.need ? '<span class="bd nd">!</span>' : '') + '</button>'; }).join('');
      [].forEach.call(menu.querySelectorAll('button'), function(b){ b.onclick = function(){ pick(b.dataset.k); try { root.scrollIntoView({ behavior:'smooth', block:'start' }); } catch (e) {} }; });
    }
    function pick(k){
      if (sel === k) { run(k); return; }
      sel = k; tick(.08, 1400); buzz(8); paint();
      var it = S.items[k] || {};
      say((EN ? k : KO_NUM[k] + '번') + ', ' + (it.t || '') + '. ' + (it.steps || []).join('. '));
    }
    function run(k){
      var it = S.items[k]; if (!it) return;
      try { sessionStorage.setItem('dh_from_home', String(Date.now())); } catch (e) {}
      if (typeof it.go === 'function') { it.go(); return; }
      if (it.url) location.href = it.url;
    }
    goEl.querySelector('.o').onclick = function(){ if (sel) run(sel); };
    goEl.querySelector('.c').onclick = function(){ sel = null; paint(); };

    /* ── 돌리기 ── */
    var drag = null;
    function local(e){ var r = svg.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 360, (e.clientY - r.top) / r.height * 360]; }
    function setRot(deg){ plate.style.transform = 'rotate(' + deg + 'deg)'; }
    svg.addEventListener('pointerdown', function(e){
      if (drag) return;
      var p = local(e), best = null, bd = 1e9;
      if (O.centerCall && Math.hypot(p[0] - CX, p[1] - CY) < R_IN - 4 && p[1] < CY) {   // 📞 위 반원 = 전화 걸기
        e.preventDefault(); actx(); tick(.08, 1400); buzz(8);
        if (sel) { sel = null; paint(); }
        setTimeout(function(){ O.centerCall.go(); }, 60); return;
      }
      if (O.centerTap && Math.hypot(p[0] - CX, p[1] - CY) < R_IN - 4) {   // 가운데 톡 = 본화면 바로가기
        e.preventDefault(); actx(); tick(.08, 1400); buzz(8);
        if (sel) { sel = null; paint(); }
        try { sessionStorage.setItem('dh_from_home', String(Date.now())); } catch (er) {}
        setTimeout(function(){ O.centerTap.go(); }, 60); return;
      }
      ORDER.forEach(function(k, i){ var h = pt(angOf(i), RR), dd = Math.hypot(p[0] - h[0], p[1] - h[1]); if (dd < bd) { bd = dd; best = i; } });
      if (best === null || bd > HR + 10) return;
      e.preventDefault(); actx();
      var a = Math.atan2(p[1] - CY, p[0] - CX) * 180 / Math.PI;
      drag = { i: best, k: ORDER[best], last: a, rot: 0, ticks: 0, id: e.pointerId };
      try { svg.setPointerCapture(e.pointerId); } catch (er) {}
    });
    svg.addEventListener('pointermove', function(e){
      if (!drag || drag.back || e.pointerId !== drag.id) return;
      var p = local(e), a = Math.atan2(p[1] - CY, p[0] - CX) * 180 / Math.PI, dA = a - drag.last;
      if (dA > 180) dA -= 360; if (dA < -180) dA += 360;
      drag.last = a; drag.rot = Math.max(0, Math.min(maxRot(drag.i), drag.rot + dA)); setRot(drag.rot);
      var tk = Math.floor(drag.rot / 9); if (tk > drag.ticks) { tick(.05, 2600); drag.ticks = tk; } else if (tk < drag.ticks) drag.ticks = tk;
      if (drag.rot >= maxRot(drag.i) - 1 && !drag.hit) { drag.hit = true; tick(.18, 900); buzz(15); }
    });
    function release(e){
      if (!drag || drag.back || (e && e.pointerId !== drag.id)) return;
      var g = drag, full = g.rot >= maxRot(g.i) - 6;
      if (g.rot < 6) { drag = null; setRot(0); pick(g.k); return; }
      g.back = true;
      var from = g.rot, n = (g.k === '0' ? 10 : +g.k), t0 = performance.now(), dur = Math.max(260, from * 3.2), clicked = 0;
      (function step(now){
        var f = Math.min(1, (now - t0) / dur); setRot(from * (1 - f));
        if (full) { var want = Math.floor(f * n); while (clicked < want) { clicked++; tick(.14, 1500); } }
        if (f < 1) requestAnimationFrame(step);
        else { setRot(0); drag = null; if (full) { sel = g.k; paint(); var it = S.items[g.k] || {};
          if (it.blank && !it.go && !it.url) return; setTimeout(function(){ run(g.k); }, 180); } }
      })(t0);
    }
    svg.addEventListener('pointerup', release);
    svg.addEventListener('pointercancel', release);
    svg.setAttribute('tabindex', '0');
    svg.addEventListener('keydown', function(e){ if (/^[0-9]$/.test(e.key)) pick(e.key); else if (e.key === 'Enter' && sel) run(sel); else if (e.key === 'Enter' && O.centerTap) O.centerTap.go(); else if (e.key === 'Escape') { sel = null; paint(); } });

    /* ── 소리 · 목소리 단추 ── */
    var bs = root.querySelector('.snd'), bv = root.querySelector('.vce');
    function paintTog(){ bs.textContent = soundOn ? T('🔊 다이얼 소리 켬', '🔊 Dial sound on') : T('🔇 다이얼 소리 끔', '🔇 Dial sound off');
      bv.textContent = voiceOn ? T('🗣 목소리 안내 켬', '🗣 Voice guide on') : T('🗣 목소리 안내 끔', '🗣 Voice guide off'); }
    bs.onclick = function(){ soundOn = !soundOn; lsSet(SK, soundOn ? 'on' : 'off'); paintTog(); };
    bv.onclick = function(){ voiceOn = !voiceOn; lsSet(VK, voiceOn ? 'on' : 'off'); paintTog();
      if (voiceOn) say(T('목소리 안내를 켰습니다. 숫자를 누르면 읽어 드립니다.', 'Voice guide on. Tap a number and I will read it.')); else { try { speechSynthesis.cancel(); } catch (e) {} } };
    if (!('speechSynthesis' in window)) bv.hidden = true;
    paintTog();

    /* 앱을 열면 무엇부터 — 다이얼 / 본화면 바로 (이 폰에만) */
    if (O.firstScreen) {
      var fr = root.querySelector('.dh-first');
      fr.querySelector('span').textContent = T('앱을 열면: ☎ 다이얼 첫 화면', 'On open: ☎ Dial home');
      fr.querySelector('button').textContent = T('본화면부터 보기로', 'Open main screen instead');
      fr.querySelector('button').onclick = function(){ O.firstScreen(); };
    }

    drawUnder(); drawMenu(); paint();
    return {
      root: root, top: root.querySelector('.dh-slot-top'), mid: root.querySelector('.dh-slot-mid'), tog: root.querySelector('.dh-tog'),
      update: function(u){ if (u.items) S.items = u.items; if ('next' in u) S.next = u.next; if ('hint' in u) S.hint = u.hint; drawUnder(); drawMenu(); paint(); },
      select: function(k){ pick(k); }
    };
  }
  window.DialHome = { mount: mount, ORDER: ORDER };
})();
