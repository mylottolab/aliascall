/* =====================================================================
   Aliascall — 단축회선 (2026-10-23, 처음 이름: 단축 다이얼 — 전화가 아니라 방을 열어서 이름을 바꿈)
   · 1~9 칸에 자주 쓰는 회선(대화방)을 미리 넣어 두고, 누르면 그 방이 바로 열립니다
     (방 안에서 바로 음성 · 영상 통화와 메시지).
   · 빈 칸을 누르거나 [편집]을 누른 뒤 칸을 누르면 회선 목록에서 고릅니다.
   · 아래 네 단추: 회선 전체 · 긴급 연락 · 임시 연락 · 회선 관리 (연락처의 각 갈래로 바로)
   · 칸 정보는 이 폰에만 적어 둡니다(localStorage). 다른 폰에서는 다시 넣어야 합니다.

   쓰는 법:  <div class="sd-box" data-sd></div>  +  <script src="aliascall_speeddial.js"></script>
             화면이 sb(supabase 클라이언트)를 만든 뒤 AliasSD.mountAll() 을 부릅니다.
   ===================================================================== */
(function(){
  'use strict';
  var KEY = 'aliascall_speeddial_v1';
  var css = '' +
    '.sd-box{max-width:420px;margin:10px auto 0}' +
    '.sd-head{display:flex;align-items:center;justify-content:space-between;padding:0 2px 6px}' +
    '.sd-head .sd-t{font-size:13px;font-weight:800;color:#fff;letter-spacing:.01em}' +
    '.sd-head button{background:none;border:1px solid rgba(255,255,255,.3);color:#cfe7e4;font-size:11.5px;font-weight:700;border-radius:999px;padding:4px 11px;cursor:pointer;font-family:inherit}' +
    '.sd-head button.on{background:#E8734A;border-color:#E8734A;color:#fff}' +
    '.sd-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}' +
    '.sd-k{position:relative;display:flex;align-items:center;gap:8px;min-height:50px;padding:7px 9px;border-radius:12px;cursor:pointer;font-family:inherit;text-align:left;' +
      'background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;overflow:hidden}' +
    '.sd-k:active{background:rgba(255,255,255,.2)}' +
    '.sd-k .d{flex:0 0 auto;font-size:21px;font-weight:800;line-height:1;font-family:"Space Grotesk",sans-serif;color:#8ED6CF;min-width:14px}' +
    '.sd-k .nm{flex:1;min-width:0;font-size:12px;font-weight:700;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:keep-all}' +
    '.sd-k.empty .nm{opacity:.45;font-weight:500}' +
    '.sd-k.gone .nm{opacity:.5;text-decoration:line-through}' +
    '.sd-box.edit .sd-k{border-style:dashed;border-color:#E8734A}' +
    '.sd-go{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px}' +
    '.sd-go a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:48px;padding:6px 2px;border-radius:12px;text-decoration:none;' +
      'background:rgba(232,115,74,.16);border:1px solid rgba(232,115,74,.5);color:#fff;font-size:11.5px;font-weight:800;text-align:center;line-height:1.25;word-break:keep-all}' +
    '.sd-go a span{font-size:16px}' +
    '.sd-go a:active{background:rgba(232,115,74,.3)}' +
    '#sdSheetBg{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.55);display:none}' +
    '#sdSheet{position:fixed;left:0;right:0;bottom:0;z-index:9001;max-height:78vh;overflow:auto;background:#fff;color:#16302E;border-radius:18px 18px 0 0;padding:16px 16px 22px;display:none;box-shadow:0 -8px 24px rgba(0,0,0,.3)}' +
    '#sdSheet h3{margin:0 0 4px;font-size:16px}' +
    '#sdSheet .sub{font-size:12px;color:#5b6f6d;margin-bottom:10px;line-height:1.5}' +
    '#sdSheet .it{display:flex;align-items:center;gap:10px;width:100%;padding:12px 10px;border:none;border-bottom:1px solid #e6ecec;background:none;text-align:left;font-family:inherit;color:inherit;cursor:pointer}' +
    '#sdSheet .it .e{font-size:20px}' +
    '#sdSheet .it .n{flex:1;min-width:0}' +
    '#sdSheet .it .n b{display:block;font-size:14px}' +
    '#sdSheet .it .n small{display:block;font-size:11.5px;color:#5b6f6d;margin-top:2px}' +
    '#sdSheet .it .tag{font-size:11px;font-weight:800;color:#E8734A;white-space:nowrap}' +
    '#sdSheet .row{display:flex;gap:8px;margin-top:14px}' +
    '#sdSheet .row button{flex:1;padding:12px;border-radius:10px;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;border:1px solid #cdd8d7;background:#f3f6f6;color:#16302E}' +
    '#sdSheet .row button.bad{color:#B4410C;border-color:rgba(234,88,12,.4);background:rgba(234,88,12,.06)}' +
    '#sdSheet .none{padding:16px 4px;font-size:13px;color:#5b6f6d;line-height:1.6}' +
    /* 🔴 2026-11-01 — 회선번호 숫자판: 짧게 = 번호 누르기 · 길게 = 단축회선 */
    '.sd-num{display:flex;align-items:center;gap:6px;min-height:46px;margin:0 0 6px;padding:4px 6px 4px 12px;border-radius:12px;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.18)}' +
    '.sd-num .v{flex:1;min-width:0;font-family:"Space Grotesk",sans-serif;font-size:24px;font-weight:700;letter-spacing:.08em;color:#fff;white-space:nowrap;overflow:hidden}' +
    '.sd-num .v.ph{font-family:inherit;font-size:12.5px;font-weight:600;letter-spacing:0;color:rgba(255,255,255,.6);white-space:normal;line-height:1.35}' +
    '.sd-num button{flex:0 0 auto;min-width:44px;min-height:38px;border-radius:10px;border:none;background:rgba(255,255,255,.14);color:#fff;font-size:18px;cursor:pointer}' +
    '.sd-row0{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px}' +
    '.sd-row0 button{min-height:50px;border-radius:12px;font-family:inherit;font-weight:800;cursor:pointer;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#fff;font-size:15px}' +
    '.sd-row0 .z{font-family:"Space Grotesk",sans-serif;font-size:21px;color:#8ED6CF}' +
    '.sd-row0 .call{background:#2E9E6B;border-color:#2E9E6B;font-size:15px}' +
    '.sd-row0 .call:disabled{opacity:.45}' +
    '.sd-k{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:manipulation}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function en(){ try { return (localStorage.getItem('aliascall_lang') || '').indexOf('en') === 0; } catch (e) { return false; } }
  var TX = {
    ko: { title:'⚡ 단축회선', edit:'편집', done:'완료', empty:'비어 있음', add:'＋ 넣기', gone:'끝난 회선',
          all:'회선 전체', emg:'긴급 연락', tmp:'임시 연락', mng:'회선 관리',
          pick:'번 단축회선에 넣을 회선을 고르세요', pickSub:'누르면 그 회선 대화방이 바로 열려 통화 · 메시지를 할 수 있습니다. 이 폰에만 저장됩니다.',
          inSlot:'번에 있음', clear:'이 칸 비우기', cancel:'닫기', loading:'회선을 읽는 중…', noLines:'아직 회선이 없습니다. 회선을 먼저 만들거나 초대를 받아 들어가 주세요.',
          login:'로그인하면 회선을 단축회선에 넣을 수 있습니다.', goneAsk:'이 회선은 끝났거나 이 폰에서 찾을 수 없습니다. 다른 회선으로 바꿀까요?',
          ph:'회선번호를 누르고 [연결] · 숫자를 길게 누르면 단축회선', del:'지움', call:'📞 연결', short:'회선번호는 4~8자리예요.', noZero:'회선번호는 0으로 시작하지 않아요.',
          none:'없는 회선번호예요. 번호를 다시 확인해 주세요.', resting:'지금 쉬고 있는 회선번호예요(회선 기간이 끝남).',
          secure:'🔒 암호화 회선이라 번호만으로는 대화를 열 수 없어요. 회선 주인에게 초대 링크를 받아 주세요.', fail:'연결하지 못했어요. 잠시 뒤 다시 해 주세요.' },
    en: { title:'⚡ Quick Lines', edit:'Edit', done:'Done', empty:'Empty', add:'＋ Add', gone:'Ended',
          all:'All lines', emg:'Emergency', tmp:'Temporary', mng:'Manage lines',
          pick:': choose a line', pickSub:'Tap it later to open that line’s chat right away for calls and messages. Saved on this phone only.',
          inSlot:' in use', clear:'Clear this slot', cancel:'Close', loading:'Loading your lines…', noLines:'You have no lines yet. Open a line or join one by invitation first.',
          login:'Log in to add lines to Quick Lines.', goneAsk:'This line has ended or cannot be found on this phone. Choose another line?',
          ph:'Dial a line number, then [Connect] · hold a digit for Quick Lines', del:'Del', call:'📞 Connect', short:'Line numbers have 4–8 digits.', noZero:'Line numbers never start with 0.',
          none:'No such line number. Please check it.', resting:'This line number is resting (the line has ended).',
          secure:'🔒 This is an encrypted line — a number alone cannot open its chat. Ask the owner for an invitation link.', fail:'Could not connect. Please try again.' }
  };
  function T(){ return en() ? TX.en : TX.ko; }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function readSlots(){ try { var o = JSON.parse(localStorage.getItem(KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; } }
  function writeSlots(o){ try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }

  /* ── 회선 읽기 — 연락처 화면(aliascall_contacts.html)의 [회선] 갈래와 같은 규칙 ── */
  var lines = null, loading = null, loggedIn = false;
  function load(){
    if (loading) return loading;
    loading = (async function(){
      var out = [], mine = {};
      var sb = window.sb || null;
      var session = null;
      try { session = sb ? (await sb.auth.getSession()).data.session : null; } catch (e) {}
      loggedIn = !!session;
      if (session) {
        try {
          var labels = {};
          try {
            var lr = await sb.from('contact_labels').select('kind, ref_id, label').eq('kind', 'line');
            (lr.data || []).forEach(function(r){ labels[r.ref_id] = r.label; });
          } catch (e) {}
          var r = await sb.from('hotlines')
            .select('id, client_label, title, tier, last_activity_at, archived_at, expires_at, status')
            .eq('owner_user_id', session.user.id).order('last_activity_at', { ascending:false }).limit(200);
          var alive = (r.data || []).filter(function(x){ return !x.archived_at && x.status === 'active' && new Date(x.expires_at) > new Date(); });
          var peers = {};
          if (alive.length) {
            try {
              var m = await sb.from('hotline_members').select('hotline_id, nickname, role, status').in('hotline_id', alive.map(function(x){ return x.id; }));
              (m.data || []).forEach(function(p){
                if (p.role === 'owner' || (p.status && p.status !== 'active') || !p.nickname) return;
                (peers[p.hotline_id] = peers[p.hotline_id] || []).push(p.nickname);
              });
            } catch (e) {}
          }
          alive.forEach(function(x){
            mine[x.id] = 1;
            var room = x.client_label || x.title || x.tier || '';
            var p = peers[x.id] || [];
            out.push({ ref:x.id, name: labels[x.id] || room, detail: p.length ? p.join(', ') : room,
                       emoji: /_secure$/.test(x.tier || '') ? '🔒' : '💬',
                       href:'aliascall_hotline_room.html?hotline=' + encodeURIComponent(x.id) + '&from=speeddial' });
          });
        } catch (e) { console.warn('[speeddial] 회선 읽기 실패', e); }
      }
      try {
        var raw = JSON.parse(localStorage.getItem('aliascall_my_lines') || '[]');
        (Array.isArray(raw) ? raw : []).forEach(function(x){
          if (!x || !x.hotlineId || x.isOwner || mine[x.hotlineId] || !x.token) return;
          out.push({ ref:x.hotlineId, name: x.title || x.tier || '', detail: x.title || '',
                     emoji: /_secure$/.test(x.tier || '') ? '🔒' : '💬',
                     href:'aliascall_hotline_room.html?t=' + encodeURIComponent(x.token) });
        });
      } catch (e) {}
      lines = out;
      return out;
    })();
    return loading;
  }
  function lineOf(ref){ if (!lines) return null; for (var i = 0; i < lines.length; i++) if (lines[i].ref === ref) return lines[i]; return null; }

  /* ── 그리기 ── */
  var editing = false;
  function paint(box){
    var t = T(), s = readSlots(), h = '';
    h += '<div class="sd-head"><span class="sd-t">' + esc(t.title) + '</span><button type="button" data-sd-edit class="' + (editing ? 'on' : '') + '">' + esc(editing ? t.done : t.edit) + '</button></div>';
    h += '<div class="sd-num"><span class="v' + (dial ? '' : ' ph') + '" data-sd-v>' + esc(dial ? fmtNum(dial) : t.ph) + '</span>' +
         (dial ? '<button type="button" data-sd-del aria-label="' + esc(t.del) + '">⌫</button>' : '') + '</div>';
    h += '<div class="sd-pad">';
    for (var d = 1; d <= 9; d++) {
      var x = s[d], ln = x ? lineOf(x.ref) : null;
      var gone = !!(x && lines && !ln);
      var nm = x ? ((ln && ln.name) || x.name || '') : (editing ? t.add : t.empty);
      h += '<button type="button" class="sd-k' + (x ? '' : ' empty') + (gone ? ' gone' : '') + '" data-sd-k="' + d + '"><span class="d">' + d + '</span><span class="nm">' + esc(gone ? (nm + ' · ' + t.gone) : nm) + '</span></button>';
    }
    h += '</div>';
    h += '<div class="sd-row0"><button type="button" data-sd-del2>⌫ ' + esc(t.del) + '</button><button type="button" class="z" data-sd-zero>0</button>' +
         '<button type="button" class="call" data-sd-call' + (dial.length >= 4 ? '' : ' disabled') + '>' + esc(t.call) + '</button></div>';
    h += '<div class="sd-go">' +
      '<a href="aliascall_contacts.html?tab=line&amp;from=msg"><span>📇</span>' + esc(t.all) + '</a>' +
      '<a href="aliascall_contacts.html?tab=emergency&amp;from=msg"><span>🚨</span>' + esc(t.emg) + '</a>' +
      '<a href="aliascall_contacts.html?tab=temp&amp;from=msg"><span>🎫</span>' + esc(t.tmp) + '</a>' +
      '<a href="aliascall_hotline_manage.html"><span>👥</span>' + esc(t.mng) + '</a>' +
      '</div>';
    box.innerHTML = h;
    box.classList.toggle('edit', editing);
    box.querySelector('[data-sd-edit]').onclick = function(){ editing = !editing; paintAll(); };
    box.querySelectorAll('[data-sd-k]').forEach(function(b){ wireKey(b, +b.dataset.sdK); });
    box.querySelector('[data-sd-zero]').onclick = function(){ press(0); };
    box.querySelector('[data-sd-del2]').onclick = function(){ dial = dial.slice(0, -1); paintAll(); };
    var dl = box.querySelector('[data-sd-del]'); if (dl) dl.onclick = function(){ dial = dial.slice(0, -1); paintAll(); };
    box.querySelector('[data-sd-call]').onclick = connect;
  }

  /* ── 🔴 2026-11-01 회선번호 누르기 ── */
  var dial = '';
  function fmtNum(n){ return n.length === 7 ? n.slice(0, 3) + ' ' + n.slice(3) : n.length === 8 ? n.slice(0, 4) + ' ' + n.slice(4) : n; }
  function press(d){
    if (editing) return;
    if (!dial && d === 0) { flash(T().noZero); return; }
    if (dial.length >= 8) return;
    dial += String(d);
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
    paintAll();
  }
  function flash(text){
    boxes().forEach(function(bx){ var v = bx.querySelector('[data-sd-v]'); if (v) { v.className = 'v ph'; v.textContent = text; } });
    clearTimeout(flash._t); flash._t = setTimeout(paintAll, 1800);
  }
  /* 짧게 누르면 숫자, 길게(0.5초) 누르면 단축회선. 편집 중에는 늘 단축회선 고르기 */
  function wireKey(b, d){
    var timer = null, long = false;
    function start(e){
      if (editing) return;
      long = false; clearTimeout(timer);
      timer = setTimeout(function(){ long = true; try { if (navigator.vibrate) navigator.vibrate(25); } catch (er) {} tap(d); }, 500);
    }
    function cancel(){ clearTimeout(timer); }
    b.addEventListener('pointerdown', start);
    b.addEventListener('pointerleave', cancel);
    b.addEventListener('pointercancel', cancel);
    b.addEventListener('contextmenu', function(e){ e.preventDefault(); });
    b.onclick = function(){
      clearTimeout(timer);
      if (editing) { tap(d); return; }
      if (long) { long = false; return; }
      press(d);
    };
  }
  async function connect(){
    var t = T(), n = dial;
    if (n.length < 4) { flash(t.short); return; }
    var sb = window.sb;
    if (!sb) { flash(t.fail); return; }
    try {
      var r = await sb.rpc('ac_num_lookup', { p_number: n });
      var o = (r && r.data) || {};
      if (r.error) throw r.error;
      if (!o.ok) { flash(o.error === 'resting' ? t.resting : o.error === 'bad' ? t.short : t.none); return; }
      dial = ''; paintAll();
      if (o.mine && o.hotline) { location.href = 'aliascall_hotline_room.html?hotline=' + encodeURIComponent(o.hotline) + '&from=dial'; return; }
      if (o.secure || !o.token) { alert(t.secure); return; }
      location.href = 'aliascall_hotline_join.html?t=' + encodeURIComponent(o.token) + '&via=number';
    } catch (e) { console.warn('[speeddial] 번호 연결 실패', e); flash(t.fail); }
  }
  function boxes(){ return document.querySelectorAll('[data-sd]'); }
  function paintAll(){ boxes().forEach(paint); }

  async function tap(d){
    var s = readSlots(), x = s[d];
    if (x && !editing) {
      await load();
      var ln = lineOf(x.ref);
      if (ln) { location.href = ln.href; return; }
      if (!confirm(T().goneAsk)) return;
    }
    openSheet(d);
  }

  /* ── 고르는 창 ── */
  function sheetEls(){
    var bg = document.getElementById('sdSheetBg'), sh = document.getElementById('sdSheet');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'sdSheetBg'; document.body.appendChild(bg);
      sh = document.createElement('div'); sh.id = 'sdSheet'; document.body.appendChild(sh);
      bg.onclick = closeSheet;
    }
    return { bg:bg, sh:sh };
  }
  function closeSheet(){ var e = sheetEls(); e.bg.style.display = e.sh.style.display = 'none'; }
  async function openSheet(d){
    var t = T(), e = sheetEls();
    e.sh.innerHTML = '<h3>' + d + esc(t.pick) + '</h3><div class="sub">' + esc(t.pickSub) + '</div><div class="none">' + esc(t.loading) + '</div>';
    e.bg.style.display = e.sh.style.display = 'block';
    await load();
    var s = readSlots(), used = {};
    Object.keys(s).forEach(function(k){ if (s[k]) used[s[k].ref] = k; });
    var list = '';
    if (!loggedIn && !(lines || []).length) list = '<div class="none">' + esc(t.login) + '</div>';
    else if (!(lines || []).length) list = '<div class="none">' + esc(t.noLines) + '</div>';
    else list = lines.map(function(ln, i){
      var u = used[ln.ref];
      return '<button type="button" class="it" data-i="' + i + '"><span class="e">' + esc(ln.emoji) + '</span><span class="n"><b>' + esc(ln.name) + '</b>' +
        (ln.detail && ln.detail !== ln.name ? '<small>' + esc(ln.detail) + '</small>' : '') + '</span>' +
        (u ? '<span class="tag">' + esc(u + t.inSlot) + '</span>' : '') + '</button>';
    }).join('');
    e.sh.innerHTML = '<h3>' + d + esc(t.pick) + '</h3><div class="sub">' + esc(t.pickSub) + '</div>' + list +
      '<div class="row">' + (s[d] ? '<button type="button" class="bad" data-clear>' + esc(t.clear) + '</button>' : '') + '<button type="button" data-close>' + esc(t.cancel) + '</button></div>';
    e.sh.querySelectorAll('[data-i]').forEach(function(b){
      b.onclick = function(){
        var ln = lines[+b.dataset.i], o = readSlots();
        Object.keys(o).forEach(function(k){ if (o[k] && o[k].ref === ln.ref) delete o[k]; });   // 한 회선은 한 칸에만
        o[d] = { ref: ln.ref, name: ln.name };
        writeSlots(o); closeSheet(); paintAll();
      };
    });
    var c = e.sh.querySelector('[data-clear]');
    if (c) c.onclick = function(){ var o = readSlots(); delete o[d]; writeSlots(o); closeSheet(); paintAll(); };
    e.sh.querySelector('[data-close]').onclick = closeSheet;
  }

  window.AliasSD = {
    mountAll: function(){ paintAll(); load().then(paintAll); },
    refresh: function(){ lines = null; loading = null; paintAll(); load().then(paintAll); },
    repaint: paintAll
  };
})();
