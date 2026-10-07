/* =====================================================================
   Aliascall — 보낸 메시지 지우기 (발견자 ↔ 주인 대화창)
   2026-10-08

   쓰는 화면: aliascall_connect.html (발견자) · aliascall_incoming_calls.html (주인)

   어떻게 쓰나
     • 내가 보낸 글 · 사진을 **꾹 누르면**(PC는 오른쪽 클릭) 메뉴가 뜹니다.
     • 사진 묶음 안의 사진은 그 한 장만, 또는 묶음 전체를 지울 수 있습니다.
     • 지우면 서버에서 완전히 지워지고(사진 파일 포함), 상대 화면에서도
       몇 초 안에 "삭제된 메시지입니다"로 바뀝니다.

   ⚠ 상대가 보낸 것은 지울 수 없습니다. 통화 기록 줄도 지우지 않습니다.
   ⚠ 서버 함수 aliascall-case-message-delete 가 있어야 합니다.
   ===================================================================== */
(function(){
  'use strict';
  var cfg = null;                 // { list, del(id), renderGroup(state) }
  var seen = new Map();           // id → created_at  (화면에 그린 것)
  var gone = new Set();           // 지운 것

  function en(){ try { return (localStorage.getItem('aliascall_lang') || '').indexOf('en') === 0; } catch (e) { return false; } }
  function L(k, e){ return en() ? e : k; }

  /* 화면에 그린 메시지를 적어둡니다 (appendChatMessage 에서 부름) */
  function track(msg){
    if (msg && msg.id && msg.message_type !== 'call_log') seen.set(msg.id, msg.created_at || null);
  }

  function groups(){ return Array.prototype.slice.call(document.querySelectorAll('.chat-bubble.photo-group')); }
  function groupOf(id){
    var gs = groups();
    for (var i = 0; i < gs.length; i++) {
      var st = gs[i]._pg;
      if (st && st.items.some(function(x){ return x.id === id; })) return gs[i];
    }
    return null;
  }

  /* 화면에서 지운 것으로 바꿉니다 (내가 지웠든 상대가 지웠든) */
  function applyDeleted(id){
    if (!id || gone.has(id)) return;
    gone.add(id); seen.delete(id);
    var g = groupOf(id);
    if (g) {
      var st = g._pg;
      st.items = st.items.filter(function(x){ return x.id !== id; });
      if (st.items.length && cfg && cfg.renderGroup) { cfg.renderGroup(st); return; }
      g.className = g.className.replace(/\bphoto(-group)?\b/g, '').trim() + ' deleted';
      g.innerHTML = '';
      g.textContent = L('🗑 삭제된 사진입니다', '🗑 Photo deleted');
      g._pg = null;
      return;
    }
    var el = document.querySelector('.chat-bubble[data-message-id="' + id + '"]');
    if (el) {
      el.classList.remove('emoji-sticker-bubble');
      el.style.background = '';
      el.classList.add('deleted');
      el.innerHTML = '';
      el.textContent = L('🗑 삭제된 메시지입니다', '🗑 Message deleted');
    }
  }

  /* 서버에서 받은 목록과 비교 — 사라진 것은 상대가 지운 것입니다.
     ⚠ 목록이 최근 것만 오는 경우를 생각해 목록의 가장 이른 시각보다
       나중 것만 봅니다. 화면에 없는(다른 사건) 것도 건너뜁니다. */
  function syncFromList(list){
    if (!Array.isArray(list) || !list.length) return;
    var ids = new Set(), oldest = null;
    list.forEach(function(m){
      ids.add(m.id);
      if (m.created_at && (!oldest || m.created_at < oldest)) oldest = m.created_at;
    });
    seen.forEach(function(created, id){
      if (ids.has(id)) return;
      if (oldest && created && created < oldest) return;
      var onScreen = document.querySelector('.chat-bubble[data-message-id="' + id + '"]') || groupOf(id);
      if (!onScreen) return;
      applyDeleted(id);
    });
  }

  /* ── 메뉴 ──────────────────────────────────────────────────────── */
  function sheet(title, items){
    if (document.querySelector('.acdel-sheet')) return;   // 두 번 열리지 않게
    var bg = document.createElement('div');
    bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99990;';
    var sh = document.createElement('div');
    sh.className = 'acdel-sheet';
    sh.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99991;background:var(--card,#fff);color:var(--ink,#12302E);' +
      'border-radius:18px 18px 0 0;padding:14px 16px 20px;max-width:520px;margin:0 auto;box-shadow:0 -8px 30px rgba(0,0,0,.25);';
    var h = document.createElement('div');
    h.style.cssText = 'font-size:13px;color:var(--ink-soft,#3E5654);margin:0 2px 10px;line-height:1.5;';
    h.textContent = title; sh.appendChild(h);
    function close(){ bg.remove(); sh.remove(); }
    bg.addEventListener('click', close);
    items.concat([[L('취소', 'Cancel'), null]]).forEach(function(it){
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = it[0];
      b.style.cssText = 'display:block;width:100%;margin:6px 0 0;padding:13px;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;' +
        (it[1] ? 'border:none;background:var(--danger,#C1483A);color:#fff;' : 'border:1.5px solid var(--line,#DCE3DE);background:transparent;color:inherit;');
      b.addEventListener('click', function(){ close(); if (it[1]) it[1](); });
      sh.appendChild(b);
    });
    document.body.appendChild(bg); document.body.appendChild(sh);
  }

  var busy = false;
  async function run(ids){
    if (busy || !cfg) return;
    busy = true;
    try {
      for (var i = 0; i < ids.length; i++) {
        await cfg.del(ids[i]);
        if (cfg.apply) cfg.apply(ids[i]); else applyDeleted(ids[i]);
      }
    } catch (e) {
      console.error('[delete] 실패', e);
      var net = e && /Failed to fetch|NetworkError|Load failed/i.test(e.message || '');
      alert(net
        ? L('지우지 못했습니다.\n서버에 닿지 못했습니다. 인터넷이 되는지 확인해 주세요.\n(관리자: 삭제 서버 함수가 배포되어 있고 Verify JWT 가 꺼져 있는지 확인)',
            'Could not delete.\nCould not reach the server. Check your connection.')
        : L('지우지 못했습니다. ', 'Could not delete. ') + (e && e.message ? e.message : ''));
    } finally { busy = false; }
  }

  function openFor(target){
    var bub = target.closest('.chat-bubble');
    if (!bub || !bub.classList.contains('me') || bub.classList.contains('deleted')) return;
    if (bub._pg) {
      var st = bub._pg;
      var thumb = target.closest('[data-mid]');
      var one = thumb ? thumb.getAttribute('data-mid') : null;
      var items = [];
      if (one) items.push([L('🗑 이 사진 삭제', '🗑 Delete this photo'), function(){ run([one]); }]);
      if (st.items.length > 1 || !one) {
        var all = st.items.map(function(x){ return x.id; }).filter(Boolean);
        items.push([L('🗑 사진 ' + all.length + '장 모두 삭제', '🗑 Delete all ' + all.length + ' photos'), function(){ run(all); }]);
      }
      sheet(L('보낸 사진을 지우면 상대 화면에서도 사라집니다.', 'Deleted photos disappear for the other person too.'), items);
      return;
    }
    var id = bub.getAttribute('data-message-id');
    if (!id) return;
    sheet(L('보낸 메시지를 지우면 상대 화면에서도 사라집니다.', 'Deleted messages disappear for the other person too.'),
          [[L('🗑 삭제', '🗑 Delete'), function(){ run([id]); }]]);
  }

  /* 꾹 누르기 · 오른쪽 클릭 */
  function bind(list){
    var tm = null, sx = 0, sy = 0, held = false, pressed = null;
    function unpress(){ if (pressed) { pressed.classList.remove('acdel-pressing'); pressed = null; } }
    if (!document.getElementById('acdelCss')) {
      var st = document.createElement('style'); st.id = 'acdelCss';
      st.textContent = '.chat-bubble.me{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;transition:transform .12s,filter .12s;}' +
        '.chat-bubble.acdel-pressing{transform:scale(.97);filter:brightness(.82);}';
      document.head.appendChild(st);
    }
    list.addEventListener('touchstart', function(e){
      var t = e.target; if (!t.closest || !t.closest('.chat-bubble.me')) return;
      var p = e.touches[0]; sx = p.clientX; sy = p.clientY; held = false;
      pressed = t.closest('.chat-bubble'); pressed.classList.add('acdel-pressing');
      tm = setTimeout(function(){ tm = null; held = true; unpress(); openFor(t); }, 450);
    }, { passive: true });
    list.addEventListener('touchmove', function(e){
      if (!tm) return; var p = e.touches[0];
      if (Math.abs(p.clientX - sx) > 10 || Math.abs(p.clientY - sy) > 10) { clearTimeout(tm); tm = null; unpress(); }
    }, { passive: true });
    list.addEventListener('touchend', function(){ if (tm) { clearTimeout(tm); tm = null; } unpress(); });
    list.addEventListener('touchcancel', function(){ if (tm) { clearTimeout(tm); tm = null; } unpress(); });
    // 꾹 누른 뒤 손을 떼면 사진이 크게 열리지 않게 막습니다
    list.addEventListener('click', function(e){ if (held) { held = false; e.stopPropagation(); e.preventDefault(); } }, true);
    list.addEventListener('contextmenu', function(e){
      var t = e.target; if (!t.closest || !t.closest('.chat-bubble.me')) return;
      e.preventDefault(); openFor(t);
    });
  }

  function init(c){
    cfg = c;
    if (c.list && !c.list.__acDel) { c.list.__acDel = true; bind(c.list); }
  }

  window.ACMsgDel = { init: init, track: track, applyDeleted: applyDeleted, syncFromList: syncFromList };
})();
