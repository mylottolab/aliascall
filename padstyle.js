/* =====================================================================
   PadStyle — 번호판 네 가지 모양 + 효과음                      2026-11-19
   함께 씀: 와파 · 부름 · 가림콜 (세 저장소에 같은 파일)

   · 모양: ☎ 다이얼(옛날 돌리는 전화) · ▦ 네모 · ● 동그라미 · 🔀 섞기(숫자 자리가 무작위)
   · 소리: 버튼 — 띵띵(실제 전화 버튼음 DTMF) · 실로폰 · 딸깍 · 끄기
           다이얼 — 감을 때 드르륵, 되돌아갈 때 숫자만큼 딸깍(0은 10번) · 켜기/끄기
   · 고른 것은 이 폰에만 저장(localStorage). 소리 파일 없이 폰 안에서 바로 만듭니다(Web Audio).

   쓰는 법 — 화면이 자기 번호판을 그린 뒤:
     PadStyle.attach({
       key:   'burum_padstyle',               // 저장 이름
       watch: 번호판이 다시 그려지는 요소,        // 다시 그려지면 모양을 다시 입힘
       digits: function(){ return { '0':el, '1':el, … } },   // 지금 숫자 단추들
       bar:   function(){ return { parent:el, before:el } }, // 고르기 줄을 넣을 곳(다시 그려지지 않는 곳)
       rotaryAt: function(){ return { parent:el, before:el } },
       hide:  function(){ return [el, …] },     // 다이얼일 때 숨길 것
       del:   function(){ return el },          // (선택) 다이얼 밑에 ⌫ 를 따로 둘 때 원래 ⌫ 단추
       holdMs: 600,                             // (선택) 꾸욱 = 단축다이얼 시간 (앱의 값과 같게)
       center: function(){ return ['부름', '부름 전화', ''] },
       colors: { plate:'#1E7A4C', rim:'#145A37', base:'#F4F1E6', ink:'#1B2430', stop:'#B9BEC4', on:'#8FE3B0', onInk:'#0E1621' },
       defaults: { mode:'square', key:'dtmf', rot:true },
       lang: function(){ return 'ko' | 'en' },
       text: { ko:{ hold:' · 꾸욱 누르면 단축회선' }, en:{…} }   // (선택) 글씨 바꾸기
     })
   ⚠ 숫자를 넣는 것은 늘 원래 단추를 누르는 것(click)으로 합니다 — 앱의 규칙(0으로 시작 금지, 자리 수, 단축다이얼)이 그대로 지켜집니다.
   ===================================================================== */
(function(){
  'use strict';
  if (window.PadStyle) return;
  var DIG = ['1','2','3','4','5','6','7','8','9','0'];
  function load(k){ try { var o = JSON.parse(localStorage.getItem(k) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function save(k, o){ try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) {} }

  /* ── 소리 ─────────────────────────────────────────────── */
  var ac = null, out = null, nbuf = null;
  function ctx(){
    if (!ac) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      try { ac = new C(); out = ac.createGain(); out.gain.value = .55; out.connect(ac.destination); } catch (e) { ac = null; return null; } }
    if (ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
    return ac;
  }
  function env(g, t, a, peak, dur){ g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + dur); }
  function tone(type, f, t, dur, peak, a){ var o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; o.connect(g); g.connect(out); env(g, t, a || .004, peak, dur); o.start(t); o.stop(t + dur + .03); }
  function hiss(t, dur, peak, freq, q, type){
    if (!nbuf) { nbuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); var d = nbuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = nbuf; f.type = type || 'bandpass'; f.frequency.value = freq || 2500; f.Q.value = q || 1.2;
    s.connect(f); f.connect(g); g.connect(out); env(g, t, .001, peak, dur); s.start(t, Math.random() * .5); s.stop(t + dur + .03);
    return g;
  }
  var DTMF = { '1':[697,1209],'2':[697,1336],'3':[697,1477],'4':[770,1209],'5':[770,1336],'6':[770,1477],'7':[852,1209],'8':[852,1336],'9':[852,1477],'*':[941,1209],'0':[941,1336],'#':[941,1477] };
  var SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];   // 1=도 2=레 … 9=레(위) 0=미(위)
  var Sound = {
    key: function(d, kind){
      if (!kind || kind === 'off' || !ctx()) return; var t = ac.currentTime + .005;
      if (kind === 'dtmf') { var p = DTMF[d]; if (!p) return; tone('sine', p[0], t, .17, .3); tone('sine', p[1], t, .17, .3); }
      else if (kind === 'xylo') { var n = d === '0' ? 9 : +d - 1; if (!(n >= 0)) n = 7; var f = 523.25 * Math.pow(2, SCALE[n] / 12);
        tone('sine', f, t, .55, .38, .002); tone('sine', f * 4, t, .1, .07, .001); tone('triangle', f * 2, t, .22, .06, .002); }
      else if (kind === 'click') { hiss(t, .03, .7, 3200, 1.6); tone('square', 1900, t, .012, .04, .001); }
    },
    ratchet: function(){ if (!ctx()) return; var t = ac.currentTime; hiss(t, .016, .32, 4300, 2.5); tone('square', 2600, t, .008, .02, .001); },
    pulse: function(){ if (!ctx()) return; var t = ac.currentTime; hiss(t, .03, .75, 1400, 1.4); tone('square', 160, t, .022, .07, .001); },
    whir: function(sec){ if (!ctx()) return; var t = ac.currentTime;
      var g = hiss(t, sec + .05, .1, 380, .8, 'lowpass'), lfo = ac.createOscillator(), lg = ac.createGain();
      lfo.frequency.value = 11; lg.gain.value = .045; lfo.connect(lg); lg.connect(g.gain); lfo.start(t); lfo.stop(t + sec + .1); }
  };

  /* ── 글씨 ─────────────────────────────────────────────── */
  var TX = {
    ko: { rotary:'☎ 다이얼', square:'▦ 네모', round:'● 동그라미', random:'🔀 섞기', snd:'🔊 소리', sndOff:'🔇 소리',
          keyT:'버튼 소리', dtmf:'띵띵 (전화음)', xylo:'실로폰', click:'딸깍', off:'끄기', rotT:'다이얼 소리 (드르륵)', on:'켜기',
          hint:'숫자 구멍을 오른쪽 멈춤쇠까지 돌렸다 놓으세요 · 톡 눌러도 됩니다', hold:' · 꾸욱 누르면 단축다이얼', del:'⌫ 지움', mix:'🔀 다시 섞기' },
    en: { rotary:'☎ Rotary', square:'▦ Square', round:'● Round', random:'🔀 Shuffle', snd:'🔊 Sound', sndOff:'🔇 Sound',
          keyT:'Key sound', dtmf:'Beep (phone tones)', xylo:'Xylophone', click:'Click', off:'Off', rotT:'Rotary sound (whirr)', on:'On',
          hint:'Turn a hole to the stop on the right and let go · or just tap', hold:' · hold for speed dial', del:'⌫ Delete', mix:'🔀 Shuffle again' }
  };

  var CSS = '' +
    '.ps-bar{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:8px auto 4px;max-width:420px}' +
    '.ps-bar button{appearance:none;-webkit-appearance:none;margin:0;cursor:pointer;font:inherit;font-size:12.5px;font-weight:800;line-height:1.2;padding:7px 11px;border-radius:999px;' +
      'background:rgba(128,128,128,.14);border:1px solid rgba(128,128,128,.38);color:inherit;white-space:nowrap}' +
    '.ps-bar button.on{background:var(--ps-on);border-color:var(--ps-on);color:var(--ps-on-ink)}' +
    '.ps-snd{max-width:420px;margin:2px auto 6px;padding:10px 12px;border-radius:14px;background:rgba(128,128,128,.12);border:1px solid rgba(128,128,128,.3);font-size:13px}' +
    '.ps-snd b{display:block;font-size:12px;opacity:.8;margin:2px 0 6px}' +
    '.ps-snd .r{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.ps-snd .r:last-child{margin-bottom:0}' +
    '.ps-snd button{appearance:none;-webkit-appearance:none;margin:0;cursor:pointer;font:inherit;font-size:12.5px;font-weight:700;padding:6px 11px;border-radius:10px;background:transparent;border:1px solid rgba(128,128,128,.4);color:inherit}' +
    '.ps-snd button.on{background:var(--ps-on);border-color:var(--ps-on);color:var(--ps-on-ink)}' +
    '.ps-hide{display:none !important}' +
    '.ps-rot{display:flex;flex-direction:column;align-items:center;gap:4px;margin:4px auto 2px}' +
    '.ps-rot svg{width:var(--ps-size,min(300px,80vw));height:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;cursor:grab;display:block}' +
    '.ps-rot svg text{pointer-events:none;font-family:system-ui,-apple-system,sans-serif}' +
    '.ps-rot p{margin:0;font-size:11.5px;opacity:.7;text-align:center;line-height:1.5;max-width:330px;word-break:keep-all}' +
    '.ps-rot .ps-del{appearance:none;-webkit-appearance:none;margin:2px 0 0;cursor:pointer;font:inherit;font-size:14px;font-weight:800;padding:9px 18px;border-radius:999px;background:rgba(128,128,128,.14);border:1px solid rgba(128,128,128,.38);color:inherit}';

  /* ── 다이얼 ───────────────────────────────────────────── */
  var CX = 150, RR = 104, HR = 21, STOP = 60;
  function need(i){ return 30 * (i + 2); }             // 1 → 60° … 0 → 330° (옛날 전화와 같은 순서)
  function ang(i){ return STOP - need(i); }
  function pt(a, r){ var q = a * Math.PI / 180; return [CX + r * Math.cos(q), CX + r * Math.sin(q)]; }
  var uid = 0;
  function Rotary(P){
    var id = 'psm' + (++uid), wrap = document.createElement('div'); wrap.className = 'ps-rot';
    var svgNS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 300 300'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'rotary dial');
    var s = '<defs><mask id="' + id + '"><rect width="300" height="300" fill="#fff"/>';
    DIG.forEach(function(d, i){ var p = pt(ang(i), RR); s += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + HR + '" fill="#000"/>'; });
    s += '</mask></defs><circle cx="150" cy="150" r="147" fill="var(--ps-base)" stroke="var(--ps-rim)" stroke-width="2"/>';
    DIG.forEach(function(d, i){ var p = pt(ang(i), RR);
      s += '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] + 1).toFixed(1) + '" text-anchor="middle" dominant-baseline="central" font-size="23" font-weight="700" fill="var(--ps-ink)">' + d + '</text>'; });
    s += '<g data-r><circle cx="150" cy="150" r="140" fill="var(--ps-plate)" mask="url(#' + id + ')"/>';
    DIG.forEach(function(d, i){ var p = pt(ang(i), RR); s += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + HR + '" fill="none" stroke="var(--ps-rim)" stroke-width="2.5"/>'; });
    s += '<circle cx="150" cy="150" r="140" fill="none" stroke="var(--ps-rim)" stroke-width="3"/></g>';
    s += '<circle cx="150" cy="150" r="54" fill="var(--ps-base)" stroke="var(--ps-rim)" stroke-width="3"/>';
    s += '<text data-c0 x="150" y="138" text-anchor="middle" font-size="16" font-weight="900" letter-spacing="1.5" fill="var(--ps-plate)"></text>';
    s += '<text data-c1 x="150" y="158" text-anchor="middle" font-size="11" font-weight="700" fill="var(--ps-ink)"></text>';
    s += '<text data-c2 x="150" y="174" text-anchor="middle" font-size="8.5" fill="var(--ps-ink)" opacity=".6"></text>';
    var a = pt(STOP + 13, 92), b = pt(STOP + 13, 148);
    s += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" stroke="var(--ps-stop)" stroke-width="9" stroke-linecap="round"/>';
    svg.innerHTML = s;
    var hint = document.createElement('p');
    wrap.appendChild(svg); wrap.appendChild(hint);
    var delB = null;
    if (P.del) { delB = document.createElement('button'); delB.type = 'button'; delB.className = 'ps-del'; wrap.appendChild(delB);
      delB.onclick = function(){ var d = P.del(); if (d) d.click(); }; }
    var g = svg.querySelector('[data-r]'), rot = 0, busy = false, q = [], drag = null;
    function set(r){
      if (P.sound() && Math.floor((r + 15) / 30) !== Math.floor((rot + 15) / 30) && r > 20) (r > rot ? Sound.ratchet() : Sound.pulse());   // 드르륵 / 되돌아갈 때 딸깍
      rot = r; g.setAttribute('transform', 'rotate(' + r.toFixed(2) + ' 150 150)');
    }
    function anim(from, to, speed, done){
      var t0 = null, dur = Math.abs(to - from) / speed * 1000;
      function step(ts){ if (t0 === null) t0 = ts; var k = Math.min(1, (ts - t0) / (dur || 1));
        set(from + (to - from) * (to > from ? 1 - Math.pow(1 - k, 2) : k)); if (k < 1) requestAnimationFrame(step); else if (done) done(); }
      requestAnimationFrame(step);
    }
    function back(){ busy = true; if (P.sound()) Sound.whir(rot / 340); anim(rot, 0, 340, function(){ busy = false; nextQ(); }); }   // 되돌아올 때는 일정한 속도
    function nextQ(){ if (busy || !q.length) return; var i = q.shift(); busy = true; anim(0, need(i), 650, function(){ P.digit(DIG[i]); back(); }); }
    function sp(e){ var r = svg.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 300, (e.clientY - r.top) / r.height * 300]; }
    function ao(p){ return Math.atan2(p[1] - CX, p[0] - CX) * 180 / Math.PI; }
    svg.addEventListener('pointerdown', function(e){
      var p = sp(e), hit = -1;
      DIG.forEach(function(d, i){ var h = pt(ang(i), RR); if (Math.hypot(p[0] - h[0], p[1] - h[1]) < HR + 8) hit = i; });
      if (hit < 0) return;
      e.preventDefault();
      if (busy) { q.push(hit); return; }
      drag = { i: hit, last: ao(p), acc: 0, moved: false, t: Date.now() };
      P.holdStart(DIG[hit]);
      try { svg.setPointerCapture(e.pointerId); } catch (er) {}
    });
    svg.addEventListener('pointermove', function(e){
      if (!drag) return;
      var a2 = ao(sp(e)), d = a2 - drag.last; if (d > 180) d -= 360; if (d < -180) d += 360;
      drag.last = a2; drag.acc = Math.max(0, Math.min(need(drag.i), drag.acc + d));
      if (drag.acc > 6 && !drag.moved) { drag.moved = true; P.holdCancel(DIG[drag.i]); }
      if (drag.moved) set(drag.acc);
    });
    function up(){
      if (!drag) return; var g2 = drag; drag = null;
      if (!g2.moved) {
        if (P.holdMs && Date.now() - g2.t >= P.holdMs) { P.holdEnd(DIG[g2.i]); return; }   // 꾸욱 = 앱이 단축다이얼을 이미 했음
        P.holdCancel(DIG[g2.i]); q.push(g2.i); nextQ(); return;
      }
      if (g2.acc >= need(g2.i) - 8) P.digit(DIG[g2.i]);
      back();
    }
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    return {
      el: wrap,
      paint: function(t, center){
        hint.textContent = t.hint + (P.holdMs ? t.hold : ''); if (delB) delB.textContent = t.del;
        var c = center || ['', '', ''];
        ['c0', 'c1', 'c2'].forEach(function(k, i){ svg.querySelector('[data-' + k + ']').textContent = c[i] || ''; });
      }
    };
  }

  /* ── 붙이기 ───────────────────────────────────────────── */
  var styled = false;
  function fire(el, type){
    var E = window.PointerEvent || window.MouseEvent || Event, ev;
    try { ev = new E(type, { bubbles: true, cancelable: true }); } catch (e) { ev = document.createEvent('Event'); ev.initEvent(type, true, true); }
    ev._ps = 1; el.dispatchEvent(ev);
  }
  function shuffle(){ var a = DIG.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }

  function attach(C){
    if (!styled) { var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); styled = true; }
    if (C.css) { var st2 = document.createElement('style'); st2.textContent = C.css; document.head.appendChild(st2); }
    var D = C.defaults || {}, S = load(C.key);
    if (['rotary','square','round','random'].indexOf(S.mode) < 0) S.mode = D.mode || 'square';
    if (['dtmf','xylo','click','off'].indexOf(S.key) < 0) S.key = D.key || 'dtmf';
    if (typeof S.rot !== 'boolean') S.rot = D.rot !== false;
    var perm = shuffle(), sndOpen = false, applying = false;
    function L(){ var l = C.lang ? C.lang() : 'ko'; l = l === 'en' ? 'en' : 'ko'; var o = {}, k; for (k in TX[l]) o[k] = TX[l][k]; if (C.text && C.text[l]) for (k in C.text[l]) o[k] = C.text[l][k]; return o; }
    var col = C.colors || {};
    function vars(el){
      el.style.setProperty('--ps-plate', col.plate || '#0F6E68'); el.style.setProperty('--ps-rim', col.rim || '#0A4F4A');
      el.style.setProperty('--ps-base', col.base || '#F6F1E4'); el.style.setProperty('--ps-ink', col.ink || '#1B2430');
      el.style.setProperty('--ps-stop', col.stop || '#B9BEC4'); el.style.setProperty('--ps-on', col.on || '#0F6E68');
      el.style.setProperty('--ps-on-ink', col.onInk || '#fff'); if (C.size) el.style.setProperty('--ps-size', C.size);
    }

    /* 고르기 줄 */
    var bar = document.createElement('div'); bar.className = 'ps-bar'; vars(bar);
    var snd = document.createElement('div'); snd.className = 'ps-snd'; snd.hidden = true; vars(snd);
    function paintBar(){
      var t = L();
      bar.innerHTML = ['rotary','square','round','random'].map(function(m){ return '<button type="button" data-m="' + m + '" class="' + (S.mode === m ? 'on' : '') + '">' + t[m] + '</button>'; }).join('') +
        (S.mode === 'random' ? '<button type="button" data-mix>' + t.mix + '</button>' : '') +
        '<button type="button" data-snd class="' + (sndOpen ? 'on' : '') + '">' + (S.key === 'off' && !S.rot ? t.sndOff : t.snd) + '</button>';
      snd.innerHTML = '<b>' + t.keyT + '</b><div class="r">' + ['dtmf','xylo','click','off'].map(function(k){ return '<button type="button" data-k="' + k + '" class="' + (S.key === k ? 'on' : '') + '">' + t[k] + '</button>'; }).join('') + '</div>' +
        '<b>' + t.rotT + '</b><div class="r"><button type="button" data-r="1" class="' + (S.rot ? 'on' : '') + '">' + t.on + '</button><button type="button" data-r="0" class="' + (S.rot ? '' : 'on') + '">' + t.off + '</button></div>';
      snd.hidden = !sndOpen;
      rot.paint(t, C.center ? C.center() : null);
    }
    bar.addEventListener('click', function(e){
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-snd')) { sndOpen = !sndOpen; paintBar(); return; }
      if (b.hasAttribute('data-mix')) { perm = shuffle(); Sound.key('5', S.key === 'off' ? 'off' : 'click'); apply(); return; }
      if (b.dataset.m) { if (b.dataset.m === 'random') perm = shuffle(); S.mode = b.dataset.m; save(C.key, S); paintBar(); apply(); }
    });
    snd.addEventListener('click', function(e){
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.k) { S.key = b.dataset.k; Sound.key('1', S.key); }
      if (b.dataset.r) { S.rot = b.dataset.r === '1'; if (S.rot) { Sound.ratchet(); setTimeout(Sound.pulse, 120); } }
      save(C.key, S); paintBar();
    });

    /* 다이얼 */
    var timerEl = null;
    var rot = Rotary({
      sound: function(){ return S.rot; }, holdMs: C.holdMs || 0, del: C.del,
      digit: function(d){ var b = C.digits()[d]; if (b) b.click(); },
      holdStart: function(d){ if (!C.holdMs) return; timerEl = C.digits()[d]; if (timerEl) fire(timerEl, 'pointerdown'); },
      holdCancel: function(){ if (timerEl) { fire(timerEl, 'pointercancel'); timerEl = null; } },
      holdEnd: function(){ if (timerEl) { fire(timerEl, 'pointerup'); timerEl = null; } }
    });
    vars(rot.el);

    /* 버튼 소리 — 단추를 누르는 순간 */
    function onDown(e){
      if (e._ps || S.key === 'off' || S.mode === 'rotary') return;
      var ds = C.digits(), el = e.target && e.target.closest ? e.target : null; if (!el) return;
      for (var k in ds) if (ds[k] && ds[k].contains(el)) { Sound.key(k, S.key); return; }
      if (C.extraKeys) { var x = C.extraKeys(el); if (x) Sound.key(x, S.key); }
    }

    /* 모양 입히기 — 앱이 번호판을 다시 그릴 때마다 */
    function place(order){
      var ds = C.digits(); if (!ds['1']) return;
      var marks = ds['1']._psM;
      if (!marks) { marks = DIG.map(function(d){ var m = document.createComment('ps'); ds[d].parentNode.insertBefore(m, ds[d]); return m; }); DIG.forEach(function(d){ ds[d]._psM = marks; }); }
      DIG.forEach(function(d, i){ var el = ds[order[i]]; marks[i].parentNode.insertBefore(el, marks[i].nextSibling); });
    }
    function apply(){
      if (applying) return; applying = true;
      try {
        var root = C.watch;
        root.classList.toggle('ps-round', S.mode === 'round');
        root.classList.toggle('ps-square', S.mode === 'square' || S.mode === 'random');
        root.classList.toggle('ps-rotary', S.mode === 'rotary');
        var ds = C.digits();
        if (ds['1']) place(S.mode === 'random' ? perm : DIG);
        var hid = C.hide ? C.hide() : [];
        hid.forEach(function(el){ if (el) el.classList.toggle('ps-hide', S.mode === 'rotary'); });
        if (S.mode === 'rotary') { var at = C.rotaryAt(); if (at && at.parent && (rot.el.parentNode !== at.parent || rot.el.nextSibling !== at.before)) at.parent.insertBefore(rot.el, at.before || null); }
        else if (rot.el.parentNode) rot.el.parentNode.removeChild(rot.el);
        var bp = C.bar(); if (bp && bp.parent && bar.parentNode !== bp.parent) { bp.parent.insertBefore(bar, bp.before || null); bp.parent.insertBefore(snd, bar.nextSibling); }
      } finally { if (mo) mo.takeRecords(); applying = false; }
    }
    var mo = window.MutationObserver ? new MutationObserver(function(){ if (!applying) apply(); }) : null;
    if (mo) mo.observe(C.watch, { childList: true, subtree: true });
    (C.soundRoot || C.watch).addEventListener('pointerdown', onDown, true);
    paintBar(); apply();
    return {
      reshuffle: function(){ if (S.mode === 'random') { perm = shuffle(); apply(); } },
      repaint: function(){ paintBar(); apply(); },
      settings: function(){ return { mode: S.mode, key: S.key, rot: S.rot }; }
    };
  }

  window.PadStyle = { attach: attach, sound: Sound };
})();
