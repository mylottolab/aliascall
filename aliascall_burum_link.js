/* =====================================================================
   Aliascall ↔ 부름 잇기 (aliascall_burum_link.js)
   2026-10-01 신설 — 두 앱 잇기 1 · 2단계

   왜
     에일리어스콜은 "잠깐" 연결입니다(QR · 임시연락처). 대화가 잘 되어
     "계속 연락하고 싶다" 가 되는 순간이 부름이 이어받을 자리입니다.
     번호는 끝까지 서로 모릅니다.

   ⚠ 두 앱은 계정 · 서버가 따로라, 에일리어스콜이 부름 초대장을 대신 만들 수
     없습니다(그건 3단계 "한 계정" 의 일). 그래서 손님이 부름에서 만든
     초대 링크를 이 대화에 붙여 보내고, 받는 쪽에서는 카드로 크게 보입니다.

   ACBurum.card(text)         글에 부름 초대 링크가 있으면 카드(요소)를, 없으면 null
   ACBurum.openSheet(sendFn)  [💬 부름으로 이어가기] 안내창 — sendFn(text) 로 보냅니다
   ===================================================================== */
(function(){
  var BURUM = 'https://burum.kr/';
  var PLAY = 'https://play.google.com/store/apps/details?id=com.weaveapp.alias';
  var RE = /https?:\/\/(?:www\.)?burum\.kr\/alias_join\.html\?c=([A-Za-z0-9_-]{4,40})/;
  function en(){ try { return (localStorage.getItem('aliascall_lang') || document.documentElement.lang || '').indexOf('en') === 0; } catch (e) { return false; } }
  function L(ko, e){ return en() ? e : ko; }

  /* 모양 — 한 번만 넣습니다 */
  function css(){
    if (document.getElementById('acBurumCss')) return;
    var s = document.createElement('style'); s.id = 'acBurumCss';
    s.textContent =
      '.acb-card{display:block;margin-top:8px;border-radius:12px;padding:11px 12px;background:#0E1621;color:#DDE5F0;text-decoration:none;max-width:260px}' +
      '.acb-card b{display:block;font-size:13.5px;margin-bottom:3px}' +
      '.acb-card small{display:block;font-size:11.5px;opacity:.75;line-height:1.5}' +
      '.acb-card .go{display:inline-block;margin-top:8px;background:#5B8FC7;color:#fff;border-radius:9px;padding:7px 12px;font-size:12.5px;font-weight:800}' +
      '.acb-card .inst{display:block;margin-top:6px;font-size:11px;opacity:.7;color:#DDE5F0;text-decoration:underline}' +
      '.acb-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998}' +
      '.acb-sh{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#fff;color:#12302E;border-radius:18px 18px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px));max-height:85vh;overflow:auto;font-family:inherit}' +
      '.acb-sh h3{margin:0 0 6px;font-size:17px}' +
      '.acb-sh p{margin:0 0 12px;font-size:12.5px;color:#3E5654;line-height:1.6}' +
      '.acb-st{display:flex;gap:10px;align-items:flex-start;margin:10px 0;font-size:13px;line-height:1.55}' +
      '.acb-st .n{flex:0 0 22px;height:22px;border-radius:50%;background:#123F3D;color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}' +
      '.acb-st a{color:#1F6F6B;font-weight:800}' +
      '.acb-row{display:flex;gap:7px;margin-top:6px}' +
      '.acb-row input{flex:1;min-width:0;border:1.5px solid #DCE3DE;border-radius:10px;padding:10px 11px;font-size:13px}' +
      '.acb-row button,.acb-send{border:none;border-radius:10px;padding:10px 13px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit}' +
      '.acb-row button{background:#E4EFEE;color:#123F3D}' +
      '.acb-send{display:block;width:100%;margin-top:12px;background:#123F3D;color:#fff;padding:13px}' +
      '.acb-send:disabled{opacity:.45}' +
      '.acb-x{display:block;width:100%;margin-top:8px;background:none;border:none;color:#3E5654;font-size:13px;padding:8px;cursor:pointer}' +
      '.acb-err{font-size:12px;color:#C1483A;margin-top:6px;min-height:1em}';
    document.head.appendChild(s);
  }

  /* ── 받는 쪽 · 보낸 쪽 모두: 부름 초대 링크를 카드로 ── */
  function card(text){
    var m = RE.exec(String(text || ''));
    if (!m) return null;
    css();
    var url = BURUM + 'alias_join.html?c=' + encodeURIComponent(m[1]);
    var a = document.createElement('div');
    a.className = 'acb-card';
    a.innerHTML = '<b>💬 ' + L('부름 초대장', 'Burum invitation') + '</b>' +
      '<small>' + L('번호를 몰라도 계속 대화할 수 있어요. 누르면 부름에서 열립니다.',
                    'Keep talking without sharing numbers. Tap to open in Burum.') + '</small>';
    var go = document.createElement('a');
    go.className = 'go'; go.href = url; go.target = '_blank'; go.rel = 'noopener';
    go.textContent = L('부름에서 열기 ›', 'Open in Burum ›');
    var ins = document.createElement('a');
    ins.className = 'inst'; ins.href = PLAY; ins.target = '_blank'; ins.rel = 'noopener';
    ins.textContent = L('부름이 없으면 먼저 설치하기', 'No Burum yet? Install it first');
    a.appendChild(go); a.appendChild(ins);
    return a;
  }

  /* ── 주인(나) 쪽: [💬 부름으로 이어가기] 안내창 ── */
  function openSheet(sendFn){
    css();
    var bg = document.createElement('div'); bg.className = 'acb-bg';
    var sh = document.createElement('div'); sh.className = 'acb-sh';
    sh.innerHTML =
      '<h3>💬 ' + L('부름으로 이어가기', 'Continue on Burum') + '</h3>' +
      '<p>' + L('이 분과 계속 연락하고 싶으면 부름 초대장을 보내세요. 서로의 번호는 계속 보이지 않습니다.',
                'To keep in touch, send a Burum invitation. Neither of you will see the other’s number.') + '</p>' +
      '<div class="acb-st"><span class="n">1</span><span>' +
        L('부름에서 <b>초대장 만들기</b>를 누릅니다. ', 'In Burum, tap <b>Create invitation</b>. ') +
        '<a href="' + BURUM + 'alias_invite.html" target="_blank" rel="noopener">' + L('부름 열기 ›', 'Open Burum ›') + '</a><br>' +
        '<small style="opacity:.7">' + L('부름이 없으면 ', 'No Burum yet? ') +
        '<a href="' + PLAY + '" target="_blank" rel="noopener">' + L('설치하기', 'Install') + '</a></small></span></div>' +
      '<div class="acb-st"><span class="n">2</span><span>' + L('만들어진 <b>링크를 복사</b>합니다.', '<b>Copy</b> the invitation link.') + '</span></div>' +
      '<div class="acb-st"><span class="n">3</span><span>' + L('여기에 <b>붙여넣고 보냅니다.</b>', '<b>Paste it here</b> and send.') +
        '<div class="acb-row"><input id="acbIn" placeholder="https://burum.kr/alias_join.html?c=…" autocomplete="off" autocapitalize="off" spellcheck="false">' +
        '<button type="button" id="acbPaste">' + L('붙여넣기', 'Paste') + '</button></div>' +
        '<div class="acb-err" id="acbErr"></div></span></div>' +
      '<button type="button" class="acb-send" id="acbSend" disabled>' + L('초대장 보내기', 'Send invitation') + '</button>' +
      '<button type="button" class="acb-x" id="acbClose">' + L('닫기', 'Close') + '</button>';
    document.body.appendChild(bg); document.body.appendChild(sh);
    var inp = sh.querySelector('#acbIn'), btn = sh.querySelector('#acbSend'), err = sh.querySelector('#acbErr');
    function close(){ bg.remove(); sh.remove(); }
    function check(){
      var ok = RE.test(inp.value.trim());
      btn.disabled = !ok;
      err.textContent = (inp.value.trim() && !ok) ? L('부름 초대 링크(burum.kr/alias_join.html?c=…)를 붙여 주세요.', 'Please paste a Burum invitation link (burum.kr/alias_join.html?c=…).') : '';
    }
    inp.addEventListener('input', check);
    sh.querySelector('#acbPaste').addEventListener('click', async function(){
      try { inp.value = (await navigator.clipboard.readText()) || ''; } catch (e) {
        err.textContent = L('붙여넣기가 막혀 있어요. 칸을 길게 눌러 붙여 주세요.', 'Paste is blocked. Long-press the box to paste.');
      }
      check();
    });
    bg.addEventListener('click', close);
    sh.querySelector('#acbClose').addEventListener('click', close);
    btn.addEventListener('click', async function(){
      var m = RE.exec(inp.value.trim()); if (!m) return;
      var link = BURUM + 'alias_join.html?c=' + m[1];
      btn.disabled = true;
      try {
        await sendFn(L('부름에서 계속 이야기해요 💬 ', 'Let’s keep talking on Burum 💬 ') + link);
        close();
      } catch (e) { btn.disabled = false; err.textContent = L('보내지 못했습니다. 다시 눌러 주세요.', 'Could not send. Please try again.'); }
    });
  }

  window.ACBurum = { card: card, openSheet: openSheet };
})();
