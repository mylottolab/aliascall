/* =====================================================================
   Aliascall — 화면 설정 (주간/야간 · 색깔 · 글자 크기/굵기/글씨체)
   2026-10-07

   쓰는 법
     각 화면 <head> 맨 끝(</head> 바로 위)에 한 줄:
       <script src="aliascall_theme.js"></script>

   하는 일
     1) 고른 설정을 이 폰에 적어둡니다(localStorage).
     2) 화면이 뜨기 전에 <html> 에 표를 붙여 색을 바꿉니다. (번쩍임 없음)
     3) 언어 단추(KR/EN) 옆에 [🌙] [Aa] 단추를 붙입니다.
        🌙 = 주간/야간 바로 바꾸기, Aa = 색깔·글자 설정 창

   ⚠ 야간 모드에서 화면마다 직접 적어둔 흰 바탕·검은 글씨는
     이 파일이 알아서 어둡게/밝게 바꿉니다. 주간으로 돌아가면 원래대로.
   ⚠ 통화 화면(연결·받은 전화·핫라인 방)은 화면 전체를 키우지 않고
     대화 글씨만 키웁니다. 단추가 화면 밖으로 밀리면 전화를 못 받습니다.
   ===================================================================== */
(function(){
  'use strict';
  var KEY = 'aliascall_theme_v1';
  var DEF = { mode:'light', color:'teal', fs:'md', fw:'normal', ff:'system' };
  var root = document.documentElement;

  function en(){
    try { return (localStorage.getItem('aliascall_lang') || '').indexOf('en') === 0; }
    catch (e) { return false; }
  }
  function read(){
    try {
      var raw = localStorage.getItem(KEY);
      var t = raw ? JSON.parse(raw) : {};
      var o = {}; for (var k in DEF) o[k] = (t && t[k]) || DEF[k];
      return o;
    } catch (e) { return Object.assign({}, DEF); }
  }
  function write(t){ try { localStorage.setItem(KEY, JSON.stringify(t)); } catch (e) {} }

  /* 통화가 들어있는 화면 — 전체 확대 대신 대화 글씨만 키웁니다. */
  var NOZOOM = /aliascall_connect|aliascall_incoming_calls|aliascall_hotline_room/.test(location.pathname);
  if (NOZOOM) root.setAttribute('data-ac-nozoom', '');

  /* ── 색 ───────────────────────────────────────────────────────────
     각 색: [주간 강조, 주간 진한색, 주간 옅은색, 주간 바탕,
             야간 강조, 야간 글씨용 밝은색, 야간 옅은색, 야간 머리띠 바탕] */
  var COLORS = {
    teal:   ['#1F6F6B','#123F3D','#E4EFEE','#B8D3BE', '#2A8C86','#8ED6CF','#1C302E','#0B2C2A'],
    blue:   ['#2563A8','#173E6B','#E3ECF7','#C8D7EC', '#3B7DD1','#9CC3F0','#1B2838','#0F2340'],
    purple: ['#6B4BA8','#3F2A6B','#EEE8F7','#D8CFEB', '#8466C9','#C8B5F0','#272038','#231A3D'],
    rose:   ['#B2456E','#6B2342','#F7E6EC','#EBD0DB', '#CC5C86','#F0B0C8','#35202A','#3A1626'],
    green:  ['#2E7D4F','#1B4A2F','#E3F1E8','#C4DDCB', '#3D9A63','#9FDAB5','#1C2E23','#10291B'],
    brown:  ['#8A5A2B','#4F3218','#F3EADF','#E3D6C5', '#A87440','#E3C29D','#2E261D','#2E1E10'],
    gray:   ['#4A5560','#232A31','#E8EBEE','#D3D8DD', '#6B7785','#C3CCD6','#22272D','#1A1F25'],
    white:  ['#1F6F6B','#123F3D','#E4EFEE','#F4F6F5', '#2A8C86','#8ED6CF','#1C302E','#0B2C2A'],
  };
  var COLOR_NAMES = {
    teal:['청록(기본)','Teal (default)'], blue:['파랑','Blue'], purple:['보라','Purple'],
    rose:['분홍','Rose'], green:['초록','Green'], brown:['갈색','Brown'], gray:['회색','Gray'],
    white:['흰 바탕','White'],
  };

  function cssText(){
    var s = '';
    Object.keys(COLORS).forEach(function(k){
      var c = COLORS[k];
      s += 'html[data-ac-color="' + k + '"]:not([data-ac-mode="dark"]){' +
        '--teal:' + c[0] + ';--teal-deep:' + c[1] + ';--teal-tint:' + c[2] + ';--paper:' + c[3] +
        ';--deep:' + c[1] + ';--tint:' + c[2] + ';--ac-deep-bg:' + c[1] + ';}' +
        'html[data-ac-color="' + k + '"][data-ac-mode="dark"]{' +
        '--teal:' + c[4] + ';--teal-deep:' + c[5] + ';--teal-tint:' + c[6] +
        ';--deep:' + c[5] + ';--tint:' + c[6] + ';--ac-deep-bg:' + c[7] + ';}';
    });
    /* 야간 공통 */
    s += 'html[data-ac-mode="dark"]{color-scheme:dark;' +
      '--ink:#E3ECEA;--ink-soft:#A3B6B3;--soft:#7F9C98;--paper:#0E1716;--card:#182322;' +
      '--line:#2D3B39;--coral-tint:#3A2620;--danger-tint:#3A1F1C;--amber-tint:#3A3120;' +
      '--brass-tint:#3A331E;--found-tint:rgba(61,154,99,.18);--ok-tint:#1C2E23;--warn:#3A2620;' +
      '--danger:#E07063;--found:#4DB277;--coral:#EE8560;}' +
      'html[data-ac-mode="dark"] body{background-color:var(--paper);color:var(--ink);}' +
      'html[data-ac-mode="dark"] input:not([type=checkbox]):not([type=radio]):not([type=range]),' +
      'html[data-ac-mode="dark"] textarea,html[data-ac-mode="dark"] select{' +
        'background-color:var(--card);color:var(--ink);border-color:var(--line);}' +
      'html[data-ac-mode="dark"] ::placeholder{color:#7F9592;}' +
      'html[data-ac-mode="dark"] img.brand-mark, html[data-ac-mode="dark"] video{filter:none;}';
    /* 글자 크기 — 화면 전체 확대 (통화 화면 제외) */
    s += 'html[data-ac-fs="lg"]:not([data-ac-nozoom]) body{zoom:1.12;}' +
      'html[data-ac-fs="xl"]:not([data-ac-nozoom]) body{zoom:1.25;}' +
      'html[data-ac-fs="lg"][data-ac-nozoom] .chat-bubble,html[data-ac-fs="lg"][data-ac-nozoom] #chatInput,' +
      'html[data-ac-fs="lg"][data-ac-nozoom] .chat-input{font-size:15.5px !important;}' +
      'html[data-ac-fs="xl"][data-ac-nozoom] .chat-bubble,html[data-ac-fs="xl"][data-ac-nozoom] #chatInput,' +
      'html[data-ac-fs="xl"][data-ac-nozoom] .chat-input{font-size:18px !important;}' +
      'html[data-ac-fs="lg"][data-ac-nozoom] .msg-time-text{font-size:11.5px !important;}' +
      'html[data-ac-fs="xl"][data-ac-nozoom] .msg-time-text{font-size:12.5px !important;}';
    /* 글자 굵기 */
    s += 'html[data-ac-fw="bold"] body{font-weight:600;}' +
      'html[data-ac-fw="bold"] body p,html[data-ac-fw="bold"] body span,html[data-ac-fw="bold"] body div,' +
      'html[data-ac-fw="bold"] body li,html[data-ac-fw="bold"] body label,html[data-ac-fw="bold"] .chat-bubble{font-weight:600;}' +
      'html[data-ac-fw="bold"] b,html[data-ac-fw="bold"] strong,html[data-ac-fw="bold"] h1,' +
      'html[data-ac-fw="bold"] h2,html[data-ac-fw="bold"] h3,html[data-ac-fw="bold"] button{font-weight:800;}';
    /* 글씨체 — 폰에 있는 글꼴만 씁니다(받아오지 않음) */
    var FF = {
      gothic:   "'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic','Nanum Gothic','Roboto',system-ui,sans-serif",
      myeongjo: "'Noto Serif KR','Nanum Myeongjo','AppleMyungjo','Batang',serif",
      dotum:    "'Dotum','돋움','Gulim','굴림','Malgun Gothic',system-ui,sans-serif",
      hand:     "'Nanum Pen Script','Gaegu','Cute Font','Comic Sans MS',cursive,system-ui,sans-serif",
    };
    Object.keys(FF).forEach(function(k){
      s += 'html[data-ac-font="' + k + '"] body,html[data-ac-font="' + k + '"] body *:not(code):not(.mono):not(.code){font-family:' + FF[k] + ' !important;}';
    });
    /* 설정 단추·창 */
    s += '.ac-th-btn{border:1px solid var(--line,#DCE3DE);background:var(--card,#fff);color:var(--ink,#12302E);' +
      'border-radius:14px;min-width:28px;height:28px;padding:0 5px;font-size:12px;font-weight:800;cursor:pointer;' +
      'display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1;font-family:inherit;}' +
      '.ac-th-wrap{display:inline-flex;gap:3px;align-items:center;margin-left:4px;flex-shrink:0;}' +
      '.ac-th-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99998;}' +
      '.ac-th-sheet{position:fixed;left:0;right:0;bottom:0;z-index:99999;max-height:86vh;overflow:auto;' +
      'background:var(--card,#fff);color:var(--ink,#12302E);border-radius:18px 18px 0 0;padding:10px 16px 22px;' +
      'box-shadow:0 -8px 30px rgba(0,0,0,.25);max-width:560px;margin:0 auto;font-size:14px;zoom:1 !important;}' +
      '.ac-th-sheet .grip{width:40px;height:4px;border-radius:2px;background:var(--line,#ccc);margin:2px auto 10px;}' +
      '.ac-th-sheet h3{margin:0 0 4px;font-size:17px;}' +
      '.ac-th-sheet .lab{margin:14px 0 7px;font-size:12.5px;font-weight:800;color:var(--ink-soft,#3E5654);}' +
      '.ac-th-sheet .row{display:flex;flex-wrap:wrap;gap:7px;}' +
      '.ac-th-sheet .opt{border:1.5px solid var(--line,#DCE3DE);background:transparent;color:inherit;border-radius:12px;' +
      'padding:9px 12px;font-size:13.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit;}' +
      '.ac-th-sheet .opt.on{border-color:var(--teal,#1F6F6B);background:var(--teal-tint,#E4EFEE);color:var(--ink);}' +
      '.ac-th-sheet .dot{width:16px;height:16px;border-radius:50%;display:inline-block;border:1px solid rgba(0,0,0,.15);}' +
      '.ac-th-sheet .done{display:block;width:100%;margin-top:18px;border:none;border-radius:12px;padding:13px;' +
      'background:var(--teal,#1F6F6B);color:#fff;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit;}' +
      '.ac-th-sheet .note{font-size:12px;color:var(--ink-soft,#3E5654);margin:2px 0 0;line-height:1.5;}';
    return s;
  }

  var st = document.createElement('style');
  st.id = 'acThemeCss';
  st.textContent = cssText();
  (document.head || root).appendChild(st);

  /* ── 야간: 화면마다 직접 적어둔 색을 바꿉니다 ─────────────────────
     흰 바탕 → 카드색, 아주 밝은 바탕 → 어두운 칸, 짙은 글씨 → 밝은 글씨,
     머리띠의 진한 청록 바탕(var(--teal-deep)) → 어두운 머리띠.
     바꾼 것은 적어두었다가 주간으로 돌아가면 그대로 되돌립니다. */
  var NAMED = { white:[255,255,255], black:[0,0,0] };
  function parseColor(v){
    v = String(v || '').trim().toLowerCase();
    if (NAMED[v]) return { r:NAMED[v][0], g:NAMED[v][1], b:NAMED[v][2], a:1 };
    var m = v.match(/^#([0-9a-f]{3,8})$/);
    if (m) {
      var h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split('').map(function(x){ return x + x; }).join('');
      return { r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16),
               a: h.length === 8 ? parseInt(h.slice(6,8),16) / 255 : 1 };
    }
    m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
    if (m) {
      var a = m[4] === undefined ? 1 : (m[4].indexOf('%') > 0 ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
      return { r:+m[1], g:+m[2], b:+m[3], a:a };
    }
    return null;
  }
  function lum(c){ return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255; }
  function sat(c){ var mx = Math.max(c.r,c.g,c.b), mn = Math.min(c.r,c.g,c.b); return mx ? (mx - mn) / mx : 0; }

  /* 바탕색 하나를 야간용으로 */
  function darkBg(v){
    if (/var\(--teal-deep\)/.test(v)) return v.replace(/var\(--teal-deep\)/g, 'var(--ac-deep-bg)');
    if (/var\(--ink\)/.test(v)) return v.replace(/var\(--ink\)/g, 'var(--card)');
    var c = parseColor(v);
    if (!c) {
      // 밝은 색만으로 된 그라데이션 → 바탕색
      if (/gradient/.test(v)) {
        var cols = v.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\bwhite\b/gi) || [];
        if (cols.length && cols.every(function(x){ var p = parseColor(x); return p && (lum(p) > 0.78 || p.a < 0.2); }))
          return 'var(--paper)';
      }
      return null;
    }
    if (c.a < 0.35) return null;                     // 옅게 비치는 것은 그대로
    var L = lum(c);
    if (L > 0.93 && sat(c) < 0.12) return 'var(--card)';
    if (L > 0.80) {                                  // 연한 색 바탕(노랑 안내칸 등)
      // 색감은 남기고 아주 어둡게
      return 'rgb(' + Math.round(c.r * 0.22) + ',' + Math.round(c.g * 0.22) + ',' + Math.round(c.b * 0.22) + ')';
    }
    return null;
  }
  /* 글씨색 하나를 야간용으로 */
  function darkFg(v){
    var c = parseColor(v);
    if (!c) return null;
    var L = lum(c);
    if (L < 0.30) {
      if (sat(c) < 0.35) return 'var(--ink)';
      // 짙은 색 글씨(진한 빨강 등) → 같은 색감의 밝은 글씨
      var k = 0.62;
      return 'rgb(' + Math.round(c.r + (255 - c.r) * k) + ',' + Math.round(c.g + (255 - c.g) * k) + ',' + Math.round(c.b + (255 - c.b) * k) + ')';
    }
    return null;
  }
  function darkBorder(v){
    var c = parseColor(v);
    if (c && lum(c) > 0.80 && c.a >= 0.35) return 'var(--line)';
    return null;
  }

  var changed = [];          // [target(style decl), prop, old, oldPrio]
  function setProp(decl, prop, val){
    var old = decl.getPropertyValue(prop), pr = decl.getPropertyPriority(prop);
    if (!old || old === val) return;
    changed.push([decl, prop, old, pr]);
    decl.setProperty(prop, val, pr);
  }
  function fixDecl(decl){
    if (!decl) return;
    var bg = decl.getPropertyValue('background-color');
    var b2 = decl.getPropertyValue('background');
    var nb;
    if (bg && (nb = darkBg(bg))) setProp(decl, 'background-color', nb);
    else if (b2 && (nb = darkBg(b2))) {
      // background 한 줄짜리에서 색만 바꿉니다
      if (parseColor(b2) || /^var\(/.test(b2.trim()) || nb === 'var(--paper)') setProp(decl, 'background', nb);
      else if (/var\(--teal-deep\)|var\(--ink\)/.test(b2)) setProp(decl, 'background', nb);
    }
    var bi = decl.getPropertyValue('background-image');
    if (bi && /gradient/.test(bi) && (nb = darkBg(bi)) === 'var(--paper)') setProp(decl, 'background-image', 'none');
    var fg = decl.getPropertyValue('color'), nf;
    if (fg && (nf = darkFg(fg))) setProp(decl, 'color', nf);
    ['border-color','border-bottom-color','border-top-color','border-left-color','border-right-color'].forEach(function(p){
      var v = decl.getPropertyValue(p), nv;
      if (v && (nv = darkBorder(v))) setProp(decl, p, nv);
    });
  }
  function walkRules(rules){
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.cssRules && !r.style) { walkRules(r.cssRules); continue; }
      if (!r.style || !r.selectorText) continue;
      if (/^:root$|^html$/.test(r.selectorText.trim())) continue;
      if (/\.ac-th-/.test(r.selectorText)) continue;
      fixDecl(r.style);
    }
  }
  function fixSheets(){
    for (var i = 0; i < document.styleSheets.length; i++) {
      var sh = document.styleSheets[i];
      if (sh.ownerNode && sh.ownerNode.id === 'acThemeCss') continue;
      if (sh.__acDone) continue;
      try { walkRules(sh.cssRules); sh.__acDone = true; } catch (e) { /* 다른 곳 파일은 못 읽습니다 */ }
    }
  }
  function fixInline(scope){
    var list = (scope.querySelectorAll ? scope.querySelectorAll('[style]') : []);
    if (scope.getAttribute && scope.getAttribute('style')) fixDecl(scope.style);
    for (var i = 0; i < list.length; i++) {
      if (list[i].closest && list[i].closest('.ac-th-sheet')) continue;
      fixDecl(list[i].style);
    }
  }
  var obs = null;
  function startDark(){
    fixSheets();
    if (document.body) fixInline(document.body);
    if (!obs && window.MutationObserver) {
      obs = new MutationObserver(function(muts){
        if (root.getAttribute('data-ac-mode') !== 'dark') return;
        muts.forEach(function(m){
          if (m.type === 'attributes') { if (m.target.style) fixDecl(m.target.style); return; }
          m.addedNodes && m.addedNodes.forEach(function(n){
            if (n.nodeType !== 1) return;
            if (n.tagName === 'STYLE' || n.tagName === 'LINK') { setTimeout(fixSheets, 0); return; }
            fixInline(n);
          });
        });
      });
      obs.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['style'] });
    }
  }
  function stopDark(){
    if (obs) { obs.disconnect(); obs = null; }
    for (var i = changed.length - 1; i >= 0; i--) {
      var c = changed[i];
      try { c[0].setProperty(c[1], c[2], c[3]); } catch (e) {}
    }
    changed = [];
    for (var j = 0; j < document.styleSheets.length; j++) {
      try { document.styleSheets[j].__acDone = false; } catch (e) {}
    }
  }

  /* ── 적용 ──────────────────────────────────────────────────────── */
  var cur = read();
  function effMode(t){
    if (t.mode === 'auto') {
      return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    return t.mode;
  }
  function apply(t){
    cur = t;
    var mode = effMode(t);
    var was = root.getAttribute('data-ac-mode');
    root.setAttribute('data-ac-mode', mode);
    root.setAttribute('data-ac-color', t.color);
    root.setAttribute('data-ac-fs', t.fs);
    root.setAttribute('data-ac-fw', t.fw);
    if (t.ff && t.ff !== 'system') root.setAttribute('data-ac-font', t.ff); else root.removeAttribute('data-ac-font');
    if (mode === 'dark' && was !== 'dark') startDark();
    if (mode !== 'dark' && was === 'dark') stopDark();
    var mt = document.querySelector('meta[name="theme-color"]');
    if (mt) mt.setAttribute('content', mode === 'dark' ? '#0E1716' : (COLORS[t.color] || COLORS.teal)[1]);
    paintButtons();
  }

  /* 화면 첫 칠 — 본문이 그려지기 전에 */
  root.setAttribute('data-ac-mode', 'light');
  apply(cur);
  if (effMode(cur) === 'dark') {
    // <body> 안에 직접 적힌 색은 본문이 다 읽힌 뒤에 고칩니다.
    document.addEventListener('DOMContentLoaded', function(){ fixSheets(); fixInline(document.body); });
  }
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(){
        if (cur.mode === 'auto') apply(cur);
      });
    } catch (e) {}
  }

  /* ── 단추 ──────────────────────────────────────────────────────── */
  function paintButtons(){
    var dark = effMode(cur) === 'dark';
    document.querySelectorAll('.ac-th-mode').forEach(function(b){
      b.textContent = dark ? '☀️' : '🌙';
      b.title = dark ? (en() ? 'Day mode' : '주간으로') : (en() ? 'Night mode' : '야간으로');
      b.setAttribute('aria-label', b.title);
    });
  }
  function toggleMode(){
    var t = Object.assign({}, cur);
    t.mode = effMode(cur) === 'dark' ? 'light' : 'dark';
    write(t); apply(t);
  }

  function addButtons(){
    if (document.querySelector('.ac-th-wrap')) return;
    var anchor = document.querySelector('.lang-toggle, #langToggle, #langToggleBtn, .lang');
    if (!anchor) return;
    // 머리띠 안 다른 것들의 폭을 적어둡니다. 단추를 붙인 뒤 찌그러지면 뺍니다.
    var sibs = Array.prototype.slice.call(anchor.parentNode.querySelectorAll('*'));
    var w0 = sibs.map(function(el){ return el.getBoundingClientRect().width; });
    var wrap = document.createElement('span');
    wrap.className = 'ac-th-wrap';
    var m = document.createElement('button');
    m.type = 'button'; m.className = 'ac-th-btn ac-th-mode';
    m.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); toggleMode(); });
    var a = document.createElement('button');
    a.type = 'button'; a.className = 'ac-th-btn';
    a.textContent = 'Aa';
    a.title = en() ? 'Display settings' : '화면 설정';
    a.setAttribute('aria-label', a.title);
    a.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); openSheet(); });
    wrap.appendChild(m); wrap.appendChild(a);
    // 언어 단추 바로 뒤에 붙입니다. (위치가 absolute 인 표지 화면은 단추 묶음 안쪽 앞에)
    var pos = window.getComputedStyle(anchor).position;
    if (pos === 'absolute' || pos === 'fixed') {
      // 첫 화면: 언어 단추가 오른쪽 위에 떠 있습니다. 왼쪽 위 빈자리에 따로 띄웁니다.
      var cs = window.getComputedStyle(anchor);
      wrap.style.cssText = 'position:' + pos + ';top:' + cs.top + ';left:16px;margin:0;z-index:5;';
      anchor.parentNode.insertBefore(wrap, anchor);
      wrap.querySelectorAll('.ac-th-btn').forEach(function(b){
        b.style.background = 'rgba(255,255,255,.15)'; b.style.color = '#fff'; b.style.border = '1px solid rgba(255,255,255,.2)';
      });
      paintButtons();
      return;
    } else {
      anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
    }
    paintButtons();
    /* 머리띠가 좁아 넘치면 [Aa] 는 빼고 [🌙] 만 둡니다.
       Aa(색깔·글자)는 마이페이지 · 첫 화면에서 열 수 있습니다. */
    var bar = wrap.parentNode;
    function over(){
      for (var el = wrap; el && el !== document.body; el = el.parentNode) {
        if (el.scrollWidth > el.clientWidth + 1) return true;
      }
      var r = wrap.getBoundingClientRect();
      return r.right > (window.innerWidth || document.documentElement.clientWidth) - 2;
    }
    function squeezed(){
      for (var i = 0; i < sibs.length; i++) {
        if (w0[i] > 4 && sibs[i].getBoundingClientRect().width < w0[i] - 2) return true;
      }
      return false;
    }
    if (over() || squeezed()) { a.remove(); }
    if (over() || squeezed()) { wrap.remove(); }
  }

  /* ── 설정 창 ───────────────────────────────────────────────────── */
  function openSheet(){
    var E = en();
    var L = function(k, e){ return E ? e : k; };
    var bg = document.createElement('div'); bg.className = 'ac-th-bg';
    var sh = document.createElement('div'); sh.className = 'ac-th-sheet';
    sh.setAttribute('role', 'dialog');
    document.body.appendChild(bg); document.body.appendChild(sh);
    function close(){ bg.remove(); sh.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e){ if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    bg.addEventListener('click', close);

    var GROUPS = [
      ['mode', L('화면','Screen'), [['light', L('☀️ 주간','☀️ Day')], ['dark', L('🌙 야간','🌙 Night')], ['auto', L('📱 폰 설정 따라','📱 Follow phone')]]],
      ['color', L('색깔','Color'), Object.keys(COLORS).map(function(k){ return [k, COLOR_NAMES[k][E ? 1 : 0]]; })],
      ['fs', L('글자 크기','Text size'), [['md', L('보통','Normal')], ['lg', L('크게','Large')], ['xl', L('아주 크게','Extra large')]]],
      ['fw', L('글자 굵기','Text weight'), [['normal', L('보통','Normal')], ['bold', L('굵게','Bold')]]],
      ['ff', L('글씨체','Font'), [['system', L('폰 기본','Phone default')], ['gothic', L('고딕','Gothic')],
        ['myeongjo', L('명조','Serif')], ['dotum', L('돋움','Dotum')], ['hand', L('손글씨','Handwriting')]]],
    ];

    function draw(){
      sh.innerHTML = '<div class="grip"></div><h3>' + L('🎨 화면 설정','🎨 Display settings') + '</h3>' +
        '<p class="note">' + L('고르는 즉시 바뀝니다. 이 폰에만 적용됩니다.', 'Changes apply right away, on this phone only.') + '</p>';
      GROUPS.forEach(function(g){
        var lab = document.createElement('p'); lab.className = 'lab'; lab.textContent = g[1]; sh.appendChild(lab);
        var row = document.createElement('div'); row.className = 'row';
        g[2].forEach(function(o){
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'opt' + (cur[g[0]] === o[0] ? ' on' : '');
          if (g[0] === 'color') {
            var d = document.createElement('span'); d.className = 'dot';
            var c = COLORS[o[0]];
            d.style.background = o[0] === 'white' ? '#FFFFFF' : c[0];
            d.style.boxShadow = 'inset 0 0 0 3px ' + c[3];
            b.appendChild(d);
          }
          b.appendChild(document.createTextNode(o[1]));
          b.addEventListener('click', function(){
            var t = Object.assign({}, cur); t[g[0]] = o[0];
            write(t); apply(t); draw();
          });
          row.appendChild(b);
        });
        sh.appendChild(row);
        if (g[0] === 'fs' && NOZOOM) {
          var n = document.createElement('p'); n.className = 'note';
          n.textContent = L('통화 화면에서는 대화 글씨만 커집니다. (단추가 밀려나지 않게)',
                            'On call screens only chat text grows, so buttons stay in reach.');
          sh.appendChild(n);
        }
      });
      var done = document.createElement('button'); done.type = 'button'; done.className = 'done';
      done.textContent = L('확인', 'Done');
      done.addEventListener('click', close);
      sh.appendChild(done);
    }
    draw();
  }

  window.ACTheme = { open: openSheet, toggle: toggleMode, get: function(){ return Object.assign({}, cur); }, apply: function(t){ write(t); apply(t); } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButtons);
  else addButtons();

  /* 🔴 2026-10-08 — 영어 보충(남은 한글을 영어로). 화면마다 따로 넣지 않으려고 여기서 부릅니다. */
  try {
    if (!document.querySelector('script[src*="aliascall_en.js"]')) {
      var se = document.createElement('script');
      se.src = 'aliascall_en.js?v=20261008';
      (document.head || document.documentElement).appendChild(se);
    }
  } catch (e) {}
})();
