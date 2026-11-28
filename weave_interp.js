/* =====================================================================
   위브앱 — AI 통역 (weave_interp.js · 2026-11-28 신설)
   와파 · 부름 · 누름 · 바로너 · 가림콜 · 단골창구 통화 화면이 같이 씁니다(같은 파일을 복사).

   한쪽만 켜면 양방향:
     out  내 마이크 → 오픈AI 통역(상대 언어) → 그 통역 음성을 상대에게 보냄 (통화 보내는 소리를 바꿔 끼움)
     in   상대 소리 → 오픈AI 통역(내 언어)   → 내 폰에서 틀어 줌, 상대 원래 소리는 작게
   자막: 양쪽 원문 · 통역문이 화면 위 띠에 나옵니다.

   ⚠ AudioContext(소리 상자)를 쓰지 않습니다. 안드로이드에서 소리 상자로 보내면 받은 소리가 멈춘
     적이 있습니다(2026-10-20 목소리 키우기 사건). 트랙을 그대로 넘기고 <audio> 로만 틉니다.
   ⚠ 잔액은 서버가 셉니다. 20초마다 interp_beat 를 부르고, 0 이 되면 서버가 닫고 여기서도 끕니다.
   ⚠ 상대가 이미 통역 중이면 켜지 않습니다(같은 말을 두 번 통역하지 않게).

   쓰는 법(화면 쪽):
     WI.start({ sb, fnBase, app, callRef, pc, micTrack, remoteStream, remoteEl, myLang, peerLang,
                sendSig(kind, data), onCaption(side, orig, trans), onState(state, info) })
     WI.stop(reason)         WI.onPeer(msg)   ← 상대가 보낸 'interp' 신호를 넘겨 주세요
     WI.balance(sb)          → { seconds_left, products }
   ===================================================================== */
(function () {
  var WI = window.WI = window.WI || {};
  /* [코드, 그 나라 말, 영어 이름, 한국어 이름] — 통역해 줄 수 있는 13개 언어 */
  WI.LANGS = [
    ['ko', '한국어', 'Korean', '한국어'], ['en', 'English', 'English', '영어'], ['ja', '日本語', 'Japanese', '일본어'], ['zh', '中文', 'Chinese', '중국어'],
    ['es', 'Español', 'Spanish', '스페인어'], ['pt', 'Português', 'Portuguese', '포르투갈어'], ['fr', 'Français', 'French', '프랑스어'],
    ['de', 'Deutsch', 'German', '독일어'], ['it', 'Italiano', 'Italian', '이탈리아어'], ['ru', 'Русский', 'Russian', '러시아어'],
    ['hi', 'हिन्दी', 'Hindi', '힌디어'], ['id', 'Bahasa Indonesia', 'Indonesian', '인도네시아어'], ['vi', 'Tiếng Việt', 'Vietnamese', '베트남어']];
  /* 🔴 판매를 열기 전(LIVE=false)에는 통역 시간이 있는 계정(관리자가 넣어 준 시험용)에만 단추가 보입니다. */
  WI.LIVE = false;
  WI.visible = false; WI._checked = false;
  WI.check = function (sb, repaint) {
    if (WI.LIVE) return true;
    if (!WI._checked && sb) {
      WI._checked = true;
      WI.balance(sb).then(function (b) { if (b && b.seconds_left > 0) { WI.visible = true; repaint && repaint(); } }).catch(function () {});
    }
    return WI.visible;
  };
  WI.active = null;       // 지금 켜진 통역
  WI.peerOn = null;       // 상대가 켠 통역 { lang }
  WI.LOW_SEC = 300;       // 5분 아래로 떨어지면 한 번 알림

  WI.balance = async function (sb) {
    var r = await sb.rpc('interp_balance');
    if (r.error) throw r.error;
    return r.data || { seconds_left: 0, products: [] };
  };
  WI.fmt = function (sec, en) {
    sec = Math.max(0, sec | 0); var m = Math.floor(sec / 60), s = sec % 60;
    return en ? (m + ' min' + (s ? ' ' + s + ' s' : '')) : (m + '분' + (s ? ' ' + s + '초' : ''));
  };

  async function connect(secret, track, onTrack, onEvent) {
    var pc = new RTCPeerConnection();
    pc.addTrack(track, new MediaStream([track]));
    var dc = pc.createDataChannel('oai-events');
    dc.onmessage = function (e) { try { onEvent(JSON.parse(e.data)); } catch (x) {} };
    pc.ontrack = function (e) { if (e.track && e.track.kind === 'audio') onTrack(e.track, e.streams && e.streams[0]); };
    var offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    var r = await fetch('https://api.openai.com/v1/realtime/translations/calls', {
      method: 'POST', body: offer.sdp, headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/sdp' } });
    if (!r.ok) { try { pc.close(); } catch (x) {} throw new Error('openai_sdp_' + r.status); }
    await pc.setRemoteDescription({ type: 'answer', sdp: await r.text() });
    return { pc: pc, dc: dc };
  }

  WI.connect = connect;   // 마주 보고 통역(interp_face.html)도 씁니다
  /* 자막: 원문(input) · 통역문(output) 조각을 모아 한 줄로 */
  function captioner(side, cb) {
    var cur = { orig: '', trans: '' }, timer = null;
    return function (ev) {
      var t = ev && ev.type || '', d = ev && (ev.delta || ev.text || ev.transcript) || '';
      if (/input_transcript\.delta$/.test(t)) cur.orig += d;
      else if (/output_transcript\.delta$/.test(t)) cur.trans += d;
      else if (/transcript\.(done|completed)$/.test(t)) { /* 한 문장 끝 */ }
      else return;
      cb && cb(side, cur.orig.slice(-160), cur.trans.slice(-160));
      clearTimeout(timer);
      timer = setTimeout(function () { cur = { orig: '', trans: '' }; }, 4000);   // 4초 조용하면 새 줄
    };
  }

  WI.captioner = function (side, cb) { return captioner(side, cb); };
  WI.start = async function (o) {
    if (WI.active) return { ok: true, already: true };
    if (WI.peerOn) return { ok: false, error: 'peer_on' };
    var st = function (s, i) { try { o.onState && o.onState(s, i || {}); } catch (x) {} };
    var sess = null, outC = null, inC = null, player = null, sender = null, prevTrack = null, prevVol = 1;
    st('starting');
    try {
      var tok = await (await fetch(o.fnBase + '/interp-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await o.sb.auth.getSession()).data.session.access_token },
        body: JSON.stringify({ call_ref: o.callRef || '', my_lang: o.myLang, peer_lang: o.peerLang, app: o.app || '', dirs: o.dirs || 'both' }),
      })).json();
      if (!tok || !tok.ok) { st('off', { error: (tok && tok.error) || 'server', seconds_left: tok && tok.seconds_left }); return tok || { ok: false, error: 'server' }; }
      sess = tok.session_id;
      var a = { sess: sess, o: o, outC: null, inC: null, player: null, sender: null, prevTrack: null, prevVol: 1, beat: null, warned: false, left: tok.seconds_left };
      WI.active = a;

      /* out — 내 목소리를 상대 언어로 */
      if (tok.out && o.micTrack && o.pc) {
        sender = o.pc.getSenders().filter(function (s) { return s.track && s.track.kind === 'audio'; })[0];
        a.outC = outC = await connect(tok.out.secret, o.micTrack, function (tr) {
          if (!sender || WI.active !== a) return;
          a.sender = sender; a.prevTrack = prevTrack = sender.track;
          sender.replaceTrack(tr).catch(function (e) { console.warn('[interp] 보내는 소리 바꾸기 실패', e); });
        }, captioner('me', o.onCaption));
      }
      /* in — 상대 목소리를 내 언어로 */
      var rt = o.remoteStream && o.remoteStream.getAudioTracks()[0];
      if (tok.in && rt) {
        a.inC = inC = await connect(tok.in.secret, rt, function (tr, ms) {
          if (WI.active !== a) return;
          player = a.player = new Audio(); player.autoplay = true; player.playsInline = true;
          player.srcObject = ms || new MediaStream([tr]);
          player.play().catch(function () {});
          if (o.remoteEl) { a.prevVol = prevVol = o.remoteEl.volume; try { o.remoteEl.volume = 0.15; } catch (x) {} }
        }, captioner('peer', o.onCaption));
      }
      try { o.sendSig && o.sendSig('interp', { on: true, lang: o.peerLang, from: o.myLang }); } catch (x) {}

      a.beat = setInterval(async function () {
        if (WI.active !== a) return;
        try {
          var r = await o.sb.rpc('interp_beat', { p_session: sess });
          var d = r.data || {};
          if (typeof d.seconds_left === 'number') { a.left = d.seconds_left; st('tick', { seconds_left: d.seconds_left }); }
          if (d.ok === false) { WI.stop(d.error || 'no_balance', true); return; }
          if (!a.warned && d.seconds_left <= WI.LOW_SEC) { a.warned = true; st('low', { seconds_left: d.seconds_left }); }
        } catch (e) { console.warn('[interp] 시간 알리기 실패', e); }
      }, 20000);
      st('on', { seconds_left: tok.seconds_left, lang: o.peerLang });
      return { ok: true, seconds_left: tok.seconds_left };
    } catch (e) {
      console.warn('[interp] 시작 실패', e);
      await WI.stop('start_fail');
      st('off', { error: 'start_fail' });
      return { ok: false, error: 'start_fail' };
    }
  };

  WI.stop = async function (reason, serverClosed) {
    var a = WI.active; if (!a) return;
    WI.active = null;
    clearInterval(a.beat);
    try { if (a.sender && a.prevTrack) await a.sender.replaceTrack(a.prevTrack); } catch (e) {}
    try { if (a.o.remoteEl) a.o.remoteEl.volume = a.prevVol || 1; } catch (e) {}
    try { if (a.player) { a.player.pause(); a.player.srcObject = null; } } catch (e) {}
    [a.outC, a.inC].forEach(function (c) { try { c && c.pc.close(); } catch (e) {} });
    try { a.o.sendSig && a.o.sendSig('interp', { on: false }); } catch (e) {}
    var left = a.left;
    if (!serverClosed && a.sess) {
      try { var r = await a.o.sb.rpc('interp_close', { p_session: a.sess, p_reason: reason || 'end' }); if (r.data) left = r.data.seconds_left; } catch (e) {}
    }
    try { a.o.onState && a.o.onState('off', { reason: reason, seconds_left: left }); } catch (e) {}
  };

  /* 상대가 보낸 신호 */
  WI.onPeer = function (m) {
    WI.peerOn = m && m.on ? { lang: m.lang, from: m.from } : null;
    return WI.peerOn;
  };

  /* 알림 문구 (한국어 · 영어) */
  WI.T = {
    btn: ['통역', 'Interpret'], on: ['통역 중', 'Interpreting'],
    title: ['AI 통역', 'AI interpreter'],
    lead: ['한쪽만 켜면 양방향으로 통역합니다. 내 말은 상대 언어로, 상대 말은 내 언어로 들립니다.',
           'Turn it on and both sides are interpreted: your words go out in their language, theirs come to you in yours.'],
    howPay: ['본 서비스는 이용권 한도를 갖고 있는 통화자 둘 중 한쪽만 사용 버튼을 누르면 됩니다. 해당 이용료는 누른 쪽의 이용권에서 차감됩니다. 그 외 특별히 준비할 것은 없습니다.',
             'Only one of the two callers needs interpreting time: whoever taps the button. The time is deducted from that person’s balance. Nothing else needs to be prepared.'],
    howPayFace: ['마주 보고 통역은 이 휴대폰으로 서비스를 이용하는 분(휴대폰 소지자)의 이용권에서만 차감됩니다. 마주한 상대방은 아무것도 준비하거나 내지 않아도 됩니다.',
                 'Face-to-face interpreting is deducted only from the balance of the person using this phone. The other person doesn’t need to prepare or pay anything.'],
    peerLang: ['상대 언어', 'Their language'], myLang: ['내 언어', 'My language'],
    left: ['남은 통역 시간', 'Interpreting time left'], start: ['통역 시작', 'Start interpreting'], stop: ['통역 끄기', 'Stop interpreting'],
    buy: ['통역 시간 사기', 'Buy interpreting time'],
    privacy: ['통역 중에는 두 사람의 목소리가 AI 통역 서버(OpenAI)로 전송됩니다. 녹음 · 저장하지 않습니다. 상대에게도 통역 중임이 표시됩니다.',
              'While interpreting, both voices are sent to an AI translation server (OpenAI). Nothing is recorded or stored. The other person is told interpreting is on.'],
    accuracy: ['기계 통역이라 숫자 · 이름은 틀릴 수 있어요. 중요한 내용은 자막으로 확인하세요.',
               'Machine interpreting can get numbers and names wrong. Check important details in the captions.'],
    noBal: ['통역 시간이 없습니다. 30분 6,600원 · 60분 12,100원 — 남은 시간은 기한 없이 쌓입니다.',
            'No interpreting time left. 30 min KRW 6,600 · 60 min KRW 12,100 — time never expires and adds up.'],
    low: ['통역 시간이 5분 남았습니다.', '5 minutes of interpreting time left.'],
    ended: ['통역 시간이 다 되어 통역을 껐습니다. 통화는 그대로 이어집니다.', 'Interpreting time ran out. The call continues.'],
    peerOnMsg: ['🌐 상대가 AI 통역을 켰습니다. 내 목소리도 통역 서버로 전송됩니다(저장하지 않음).',
                '🌐 The other person turned on AI interpreting. Your voice is also sent to the interpreting server (not stored).'],
    peerOnBlock: ['상대가 이미 통역을 켜 두었습니다. 양쪽 모두 통역되고 있어요.', 'The other person is already interpreting for both of you.'],
    fail: ['통역을 시작하지 못했습니다. 잠시 뒤 다시 해 주세요.', 'Could not start interpreting. Please try again shortly.'],
    notReady: ['통역 기능을 준비 중입니다.', 'Interpreting is being set up.'],
  };
  WI.t = function (k, en) { var v = WI.T[k]; return v ? v[en ? 1 : 0] : k; };
})();

/* ── 화면 도우미 (앱마다 따로 그리지 않게 여기서 그립니다) ─────────────────── */
(function () {
  var WI = window.WI;
  var CSS = '#wiSheet{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center;font-family:inherit}' +
    '#wiSheet .in{background:#fff;color:#1b2230;width:100%;max-width:460px;border-radius:20px 20px 0 0;padding:20px 18px calc(18px + env(safe-area-inset-bottom,0px));max-height:88vh;overflow:auto;box-sizing:border-box}' +
    '#wiSheet h3{margin:0 0 6px;font-size:18px}#wiSheet p{margin:6px 0;font-size:13.5px;line-height:1.55;color:#4a5466}' +
    '#wiSheet .bal{margin:12px 0;padding:12px 14px;border-radius:12px;background:#eef4ff;font-weight:800;font-size:15px;color:#1d4ed8}' +
    '#wiSheet label{display:block;font-size:12.5px;font-weight:700;margin:10px 0 4px;color:#4a5466}' +
    '#wiSheet select{width:100%;padding:11px;border-radius:10px;border:1px solid #cfd6e2;font-size:15px;background:#fff;color:#1b2230}' +
    '#wiSheet .row{display:flex;gap:8px;margin-top:14px}#wiSheet button{flex:1;padding:13px;border-radius:12px;border:0;font-size:15px;font-weight:800;cursor:pointer}' +
    '#wiSheet .go{background:#1d4ed8;color:#fff}#wiSheet .no{background:#eef0f4;color:#1b2230}#wiSheet .buy{background:#f59e0b;color:#1b1300}' +
    '#wiSheet .fine{font-size:12px;color:#6b7486}' +
    '#wiCap{position:fixed;left:10px;right:10px;top:calc(10px + env(safe-area-inset-top,0px));z-index:9998;background:rgba(10,14,22,.82);color:#fff;border-radius:14px;padding:10px 12px;font-size:14px;line-height:1.45;display:none;pointer-events:none}' +
    '#wiCap .l{margin:2px 0}#wiCap .o{opacity:.7;font-size:12.5px}#wiCap .tag{display:inline-block;font-size:11px;font-weight:800;padding:1px 7px;border-radius:8px;background:#1d4ed8;margin-right:6px}' +
    '#wiToast{position:fixed;left:14px;right:14px;bottom:calc(120px + env(safe-area-inset-bottom,0px));z-index:9999;background:#1b2230;color:#fff;border-radius:12px;padding:12px 14px;font-size:13.5px;line-height:1.5;display:none;text-align:center}';
  function css() { if (document.getElementById('wiCss')) return; var s = document.createElement('style'); s.id = 'wiCss'; s.textContent = CSS; document.head.appendChild(s); }
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  WI.toast = function (msg, ms) {
    css(); var t = document.getElementById('wiToast');
    if (!t) { t = document.createElement('div'); t.id = 'wiToast'; document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block'; clearTimeout(t._h);
    t._h = setTimeout(function () { t.style.display = 'none'; }, ms || 5000);
  };

  WI.caption = function (side, orig, trans, en) {
    css(); var c = document.getElementById('wiCap');
    if (!c) { c = document.createElement('div'); c.id = 'wiCap'; c.innerHTML = '<div class="l" data-s="peer"></div><div class="l" data-s="me"></div>'; document.body.appendChild(c); }
    if (side === 'clear') { c.style.display = 'none'; return; }
    var row = c.querySelector('[data-s="' + side + '"]');
    row.innerHTML = '<span class="tag">' + (side === 'me' ? (en ? 'Me' : '나') : (en ? 'Them' : '상대')) + '</span>' + esc(trans || '…') +
      (orig ? '<div class="o">' + esc(orig) + '</div>' : '');
    c.style.display = 'block'; clearTimeout(c._h);
    c._h = setTimeout(function () { c.style.display = 'none'; }, 9000);
  };

  /* 통역 창 — opts: { en, myLang, peerLang, onStart(peerLang, myLang), onBuy?(), sb } */
  WI.openSheet = async function (o) {
    css(); var en = !!o.en, T = function (k) { return WI.t(k, en); };
    var old = document.getElementById('wiSheet'); if (old) old.remove();
    var bal = { seconds_left: 0 };
    try { bal = await WI.balance(o.sb); } catch (e) {}
    var opt = function (sel) {
      return WI.LANGS.map(function (l) { var nm = en ? (l[0] === 'en' ? 'English' : l[2] + ' · ' + l[1]) : (l[0] === 'ko' ? '한국어' : l[3] + ' · ' + l[1]); return '<option value="' + l[0] + '"' + (l[0] === sel ? ' selected' : '') + '>' + nm + '</option>'; }).join('');
    };
    var on = !!WI.active, has = bal.seconds_left >= 30;
    var d = document.createElement('div'); d.id = 'wiSheet';
    d.innerHTML = '<div class="in"><h3>🌐 ' + T('title') + '</h3><p>' + T('lead') + '</p><p style="font-weight:700;color:#1b2230">' + T('howPay') + '</p>' +
      '<div class="bal">' + T('left') + ' · ' + WI.fmt(bal.seconds_left, en) + '</div>' +
      (on ? '' : '<label>' + T('peerLang') + '</label><select id="wiPeer">' + opt(o.peerLang || 'en') + '</select>' +
                 '<label>' + T('myLang') + '</label><select id="wiMy">' + opt(o.myLang || 'ko') + '</select>') +
      (has || on ? '' : '<p style="color:#b45309;font-weight:700">' + T('noBal') + '</p>') +
      '<p class="fine">' + T('privacy') + '</p><p class="fine">' + T('accuracy') + '</p>' +
      '<div class="row"><button class="no" id="wiNo">' + (en ? 'Close' : '닫기') + '</button>' +
      (on ? '<button class="go" id="wiStop">' + T('stop') + '</button>'
          : has ? '<button class="go" id="wiGo">' + T('start') + '</button>'
                : (o.onBuy ? '<button class="buy" id="wiBuy">' + T('buy') + '</button>' : '')) + '</div></div>';
    document.body.appendChild(d);
    var close = function () { d.remove(); };
    d.addEventListener('click', function (e) { if (e.target === d) close(); });
    d.querySelector('#wiNo').onclick = close;
    var go = d.querySelector('#wiGo'), stop = d.querySelector('#wiStop'), buy = d.querySelector('#wiBuy');
    if (go) go.onclick = function () {
      var p = d.querySelector('#wiPeer').value, m = d.querySelector('#wiMy').value;
      if (p === m) { WI.toast(en ? 'Pick two different languages.' : '서로 다른 언어를 골라 주세요.'); return; }
      try { localStorage.setItem('wi_peer', p); localStorage.setItem('wi_my', m); } catch (e) {}
      close(); o.onStart(p, m);
    };
    if (stop) stop.onclick = function () { close(); WI.stop('user'); };
    if (buy) buy.onclick = function () { close(); o.onBuy(); };
  };
  WI.lastPeer = function () { try { return localStorage.getItem('wi_peer') || 'en'; } catch (e) { return 'en'; } };
  WI.lastMy = function (def) { try { return localStorage.getItem('wi_my') || def || 'ko'; } catch (e) { return def || 'ko'; } };
})();
