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
    '.sd-k{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:manipulation}' +
    /* 🔴 2026-11-01 — 첫 화면 작은 번호판을 누르면 큰 번호판이 튀어나옴 */
    '.sd-box[data-sd-pop] .sd-num,.sd-box[data-sd-pop] .sd-pad,.sd-box[data-sd-pop] .sd-row0{cursor:zoom-in}' +
    '#sdBig{position:fixed;inset:0;z-index:8000;display:none;align-items:flex-end;justify-content:center;background:rgba(4,22,20,.62);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}' +
    '#sdBig.show{display:flex}' +
    '#sdBig .sd-sheet{width:100%;max-width:560px;max-height:100%;overflow:auto;background:linear-gradient(180deg,#1d5a54,#123f3b);border-radius:24px 24px 0 0;padding:12px 16px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -10px 30px rgba(0,0,0,.4);transform:translateY(105%);transition:transform .26s cubic-bezier(.2,.9,.3,1.15)}' +
    '#sdBig.up .sd-sheet{transform:translateY(0)}' +
    '#sdBig .sd-grab{width:44px;height:5px;border-radius:9px;background:rgba(255,255,255,.35);margin:0 auto 8px}' +
    '#sdBig .sd-x{position:absolute;right:12px;top:8px;width:40px;height:40px;border-radius:50%;border:none;background:rgba(255,255,255,.14);color:#fff;font-size:20px;cursor:pointer}' +
    '#sdBig .sd-sheet{position:relative}' +
    '.sd-big{max-width:none;margin:0}' +
    '.sd-big .sd-head{padding:0 50px 10px 2px}' +
    '.sd-big .sd-head .sd-t{font-size:16px}' +
    '.sd-big .sd-num{min-height:70px;margin-bottom:10px;padding:6px 8px 6px 16px}' +
    '.sd-big .sd-num .v{font-size:38px}' +
    '.sd-big .sd-num .v.ph{font-size:15px}' +
    '.sd-big .sd-num button{min-width:58px;min-height:52px;font-size:24px}' +
    '.sd-big .sd-pad,.sd-big .sd-row0{gap:10px}' +
    '.sd-big .sd-row0{margin-top:10px}' +
    '.sd-big .sd-k{min-height:min(13vh,84px);padding:8px 12px;border-radius:16px;gap:10px}' +
    '.sd-big .sd-k .d{font-size:36px;min-width:22px}' +
    '.sd-big .sd-k .nm{font-size:14px}' +
    '.sd-big .sd-row0 button{min-height:min(13vh,84px);border-radius:16px;font-size:19px}' +
    '.sd-big .sd-row0 .z{font-size:36px}' +
    '.sd-big .sd-row0 .call{font-size:20px}' +
    '.sd-big .sd-go{gap:8px;margin-top:10px}' +
    '.sd-big .sd-go a{min-height:56px;font-size:12.5px}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function en(){ try { return (localStorage.getItem('aliascall_lang') || '').indexOf('en') === 0; } catch (e) { return false; } }
  var TX = {
    ko: { title:'⚡ 단축회선', edit:'편집', done:'완료', empty:'비어 있음', add:'＋ 넣기', gone:'끝난 회선',
          all:'회선 전체', emg:'긴급 연락', tmp:'임시 연락', mng:'회선 관리',
          pick:'번 단축회선에 넣을 회선을 고르세요', pickSub:'누르면 그 회선 대화방이 바로 열려 통화 · 메시지를 할 수 있습니다. 이 폰에만 저장됩니다.',
          inSlot:'번에 있음', clear:'이 칸 비우기', cancel:'닫기', loading:'회선을 읽는 중…', noLines:'아직 회선이 없습니다. 회선을 먼저 만들거나 초대를 받아 들어가 주세요.',
          login:'로그인하면 회선을 단축회선에 넣을 수 있습니다.', goneAsk:'이 회선은 끝났거나 이 폰에서 찾을 수 없습니다. 다른 회선으로 바꿀까요?',
          ph:'번호를 누르고 [연결] · 숫자를 길게 누르면 단축회선', del:'지움', call:'📞 연결', short:'회선번호는 4~8자리예요.', noZero:'회선번호는 0으로 시작하지 않아요.',
          none:'없는 회선번호예요. 번호를 다시 확인해 주세요.', resting:'지금 쉬고 있는 회선번호예요(회선 기간이 끝남).',
          secure:'🔒 암호화 회선이라 번호만으로는 대화를 열 수 없어요. 회선 주인에게 초대 링크를 받아 주세요.', fail:'연결하지 못했어요. 잠시 뒤 다시 해 주세요.',
          off:'번호로 연락을 받지 않는 번호예요.', myNum:'📞 내 번호', self:'내 번호예요.', busy:'지금은 연결 요청이 많아요. 잠시 뒤 다시 해 주세요.' },
    en: { title:'⚡ Quick Lines', edit:'Edit', done:'Done', empty:'Empty', add:'＋ Add', gone:'Ended',
          all:'All lines', emg:'Emergency', tmp:'Temporary', mng:'Manage lines',
          pick:': choose a line', pickSub:'Tap it later to open that line’s chat right away for calls and messages. Saved on this phone only.',
          inSlot:' in use', clear:'Clear this slot', cancel:'Close', loading:'Loading your lines…', noLines:'You have no lines yet. Open a line or join one by invitation first.',
          login:'Log in to add lines to Quick Lines.', goneAsk:'This line has ended or cannot be found on this phone. Choose another line?',
          ph:'Dial a number, then [Connect] · hold a digit for Quick Lines', del:'Del', call:'📞 Connect', short:'Line numbers have 4–8 digits.', noZero:'Line numbers never start with 0.',
          none:'No such line number. Please check it.', resting:'This line number is resting (the line has ended).',
          secure:'🔒 This is an encrypted line — a number alone cannot open its chat. Ask the owner for an invitation link.', fail:'Could not connect. Please try again.',
          off:'This number does not take contacts.', myNum:'📞 My number', self:'That is your own number.', busy:'Too many requests right now. Please try again later.' }
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
    h += '<div class="sd-head"><span class="sd-t">' + esc(t.title) + '</span><span style="display:flex;gap:6px">' +
         (window.acHeld && acHeld() ? '' : '<a href="aliascall_numbers.html" style="background:none;border:1px solid rgba(255,255,255,.3);color:#cfe7e4;font-size:11.5px;font-weight:700;border-radius:999px;padding:4px 11px;text-decoration:none">' + esc(t.myNum) + '</a>') +
         '<button type="button" data-sd-edit class="' + (editing ? 'on' : '') + '">' + esc(editing ? t.done : t.edit) + '</button></span></div>';
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
  /* 회선 참가 때 쓰는 이 폰 표시와 같은 것(aliascall_hotline_join.html) */
  function anonId(){
    try {
      var id = localStorage.getItem('aliascall_hotline_anon_id');
      if (!id) { id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Array.from({ length: 32 }, function(){ return Math.floor(Math.random() * 16).toString(16); }).join(''); localStorage.setItem('aliascall_hotline_anon_id', id); }
      return id;
    } catch (e) { return ''; }
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
      if (!o.ok) { flash(t[o.error] || (o.error === 'bad' ? t.short : t.none)); return; }
      /* 🔴 2026-11-01 — 사람 번호(1:1): 두 사람만의 대화방을 찾거나 만들어 들어감 */
      if (o.kind === 'person') {
        var nick = ''; try { nick = localStorage.getItem('aliascall_inquiry_nick') || localStorage.getItem('aliascall_caller_name') || ''; } catch (e) {}
        var dr = await sb.rpc('ac_num_dial', { p_number: n, p_anon: anonId(), p_nick: nick || null });
        var d = (dr && dr.data) || {};
        if (dr.error || !d.ok) { flash(t[d.error] || t.fail); return; }
        dial = ''; paintAll();
        try {
          var raw = JSON.parse(localStorage.getItem('aliascall_my_lines') || '[]'); if (!Array.isArray(raw)) raw = [];
          raw = raw.filter(function(x){ return x && x.hotlineId !== d.hotline; });
          raw.unshift({ hotlineId: d.hotline, title: '1:1 · #' + n, isOwner: false, token: d.token, lastVisitedAt: new Date().toISOString() });
          localStorage.setItem('aliascall_my_lines', JSON.stringify(raw.slice(0, 30)));
        } catch (e) {}
        location.href = ((d.auto || d.again) ? 'aliascall_hotline_room.html?t=' : 'aliascall_hotline_join.html?via=number&t=') + encodeURIComponent(d.token);   // 전에 연결한 방이면 바로 대화방(승인 전이면 대화방이 기다림 화면을 보여 줌)
        return;
      }
      dial = ''; paintAll();
      if (o.mine && o.hotline) { location.href = 'aliascall_hotline_room.html?hotline=' + encodeURIComponent(o.hotline) + '&from=dial'; return; }
      if (o.secure || !o.token) { alert(t.secure); return; }
      location.href = 'aliascall_hotline_join.html?t=' + encodeURIComponent(o.token) + '&via=number';
    } catch (e) { console.warn('[speeddial] 번호 연결 실패', e); flash(t.fail); }
  }

  /* ── 🔴 2026-11-01 큰 번호판 — data-sd-pop 이 붙은 작은 번호판의 숫자 · 번호 칸을 누르면 아래에서 튀어나옴 ── */
  var big = null;
  function bigEls(){
    if (big) return big;
    var wrap = document.createElement('div'); wrap.id = 'sdBig';
    wrap.innerHTML = '<div class="sd-sheet" role="dialog" aria-modal="true"><div class="sd-grab"></div>' +
      '<button type="button" class="sd-x" aria-label="닫기">✕</button><div class="sd-box sd-big" data-sd data-sd-bigbox></div></div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function(e){ if (e.target === wrap) closeBig(); });
    wrap.querySelector('.sd-x').onclick = function(){ closeBig(); };
    big = { wrap: wrap, box: wrap.querySelector('[data-sd-bigbox]') };
    return big;
  }
  var bigOpen = false;
  function openBig(){
    var b = bigEls();
    paint(b.box);
    b.wrap.classList.add('show');
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ b.wrap.classList.add('up'); }); });
    document.documentElement.style.overflow = 'hidden';
    if (!bigOpen) { bigOpen = true; try { history.pushState({ sdBig: 1 }, ''); } catch (e) {} }
    try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {}
  }
  function closeBig(fromPop){
    if (!big || !bigOpen) return;
    bigOpen = false;
    big.wrap.classList.remove('up');
    document.documentElement.style.overflow = '';
    setTimeout(function(){ if (!bigOpen) big.wrap.classList.remove('show'); }, 260);
    if (!fromPop) { try { if (history.state && history.state.sdBig) history.back(); } catch (e) {} }
  }
  window.addEventListener('popstate', function(){ if (bigOpen) closeBig(true); });
  window.addEventListener('pageshow', function(){ if (bigOpen) closeBig(true); else if (big) big.wrap.classList.remove('show', 'up'); });
  /* 작은 번호판: 숫자 · 번호 칸 · 0 · 지움 · 연결을 누르면 (편집 중이 아닐 때) 큰 번호판만 엽니다 */
  function wirePop(box){
    if (box._sdPop) return; box._sdPop = true;
    function hit(e){
      if (editing || !e.target || !e.target.closest) return null;
      return e.target.closest('.sd-num,.sd-pad,.sd-row0');
    }
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function(ev){
      box.addEventListener(ev, function(e){ if (hit(e)) e.stopPropagation(); }, true);
    });
    box.addEventListener('click', function(e){
      if (!hit(e)) return;
      e.preventDefault(); e.stopPropagation();
      openBig();
    }, true);
  }
  function boxes(){ return document.querySelectorAll('[data-sd]'); }
  function paintAll(){ boxes().forEach(function(b){ paint(b); if (b.hasAttribute('data-sd-pop')) wirePop(b); }); }

  async function tap(d){
    var s = readSlots(), x = s[d];
    if (x && !editing) {
      await load();
      var ln = lineOf(x.ref);
      if (ln) { if (bigOpen) { bigOpen = false; } location.href = ln.href; return; }
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

  /* 🔴 2026-11-01 — 첫 화면 [💬 대화방] 단추: 들어갈 수 있는 회선 · 1:1 대화방을 모두 보여 주고, 누르면 바로 그 대화방 */
  async function openLines(){
    var t = T(), e = sheetEls(), en2 = en();
    var ttl = en2 ? '💬 My chats' : '💬 내 대화방';
    var sub = en2 ? 'Lines and 1:1 chats you can enter. Tap one to open it.' : '내가 연 회선 · 승인받아 들어간 회선 · 번호로 연결된 1:1 대화방입니다. 누르면 바로 열려요.';
    e.sh.innerHTML = '<h3>' + esc(ttl) + '</h3><div class="sub">' + esc(sub) + '</div><div class="none">' + esc(t.loading) + '</div>';
    e.bg.style.display = e.sh.style.display = 'block';
    lines = null; loading = null;
    await load();
    var list = (lines || []).slice();
    var body = !list.length
      ? '<div class="none">' + esc(!loggedIn ? t.login : t.noLines) + '</div>'
      : list.map(function(ln, i){
          return '<button type="button" class="it" data-go="' + i + '"><span class="e">' + esc(ln.emoji) + '</span><span class="n"><b>' + esc(ln.name) + '</b>' +
            (ln.detail && ln.detail !== ln.name ? '<small>' + esc(ln.detail) + '</small>' : '') + '</span><span class="tag">' + (en2 ? 'Open ›' : '열기 ›') + '</span></button>';
        }).join('');
    e.sh.innerHTML = '<h3>' + esc(ttl) + '</h3><div class="sub">' + esc(sub) + '</div>' + body +
      '<div class="row"><button type="button" data-close>' + esc(t.cancel) + '</button></div>';
    e.sh.querySelectorAll('[data-go]').forEach(function(b){ b.onclick = function(){ var ln = list[+b.dataset.go]; if (ln) location.href = ln.href; }; });
    e.sh.querySelector('[data-close]').onclick = closeSheet;
  }

  window.AliasSD = {
    openLines: openLines,
    openBig: openBig, closeBig: function(){ closeBig(); },
    mountAll: function(){ paintAll(); load().then(paintAll); },
    refresh: function(){ lines = null; loading = null; paintAll(); load().then(paintAll); },
    repaint: paintAll
  };
})();
