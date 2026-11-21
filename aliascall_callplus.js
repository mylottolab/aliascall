/* =====================================================================
   🔴 2026-11-21 가림콜 통화 더하기 (ACPlus) — 회선 방(aliascall_hotline_room.html) 통화 화면
     📮 음성사서함 : 통화를 시작했는데 40초 동안 아무도 안 들어오면 → 띠리링 + 음성 안내 → 삐 + 진동
                     → 저절로 녹음 → 말 끝나고 3초 조용하면 저절로 이 방 대화에 「📮 음성사서함」 으로 보냄
     ⏸ 보류       : 내 마이크 · 카메라와 들리는 소리를 끄고, 방 안 사람들에게 "보류 중" 을 알림(대기음)
     👥 초대       : 통화 중 [➕] — 이 방 초대 링크를 보내 한 사람 더(정원 안에서)
     ⏳ 통화 중 대기 : 통화 중 내 다른 회선에서 통화가 시작되면 위쪽 띠 [끊고 받기] [💬 통화 중] [닫기]
   방 화면의 전역 값(activeCall · peers · callChannel · localStream · hotlineId …)을 그대로 씁니다.
   ===================================================================== */
(function(){
  'use strict';
  var EN = function(){ try { return LANG === 'en'; } catch (e) { return false; } };
  var t = function(ko, en){ return EN() ? en : ko; };
  var S = { vmTimer: null, vmOff: false, rec: null, hold: false, peerHold: false, holdTone: null, cwTimer: null, cwShown: null, cwSkip: {}, roomMax: 0, roomN: 0 };

  /* ── 소리 · 말 · 진동 ─────────────────────────────────── */
  var AC = null;
  function ctx(){ try { var C = window.AudioContext || window.webkitAudioContext; AC = AC || new C(); if (AC.state === 'suspended') AC.resume(); return AC; } catch (e) { return null; } }
  function tones(list){
    var ac = ctx(); if (!ac) return 0; var t0 = ac.currentTime + 0.05, end = 0;
    list.forEach(function(x){ var o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = x[0];
      g.gain.setValueAtTime(0.0001, t0 + x[1]); g.gain.exponentialRampToValueAtTime(0.25, t0 + x[1] + 0.02);
      g.gain.setValueAtTime(0.25, t0 + x[1] + x[2] - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t0 + x[1] + x[2]);
      o.connect(g); g.connect(ac.destination); o.start(t0 + x[1]); o.stop(t0 + x[1] + x[2] + 0.02); end = Math.max(end, x[1] + x[2]); });
    return end * 1000 + 100;
  }
  function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  function say(text){
    return new Promise(function(done){
      var fin = false, ok = function(){ if (!fin) { fin = true; done(); } };
      try {
        var N = window.AliasNative;
        if (N && N.speak && N.ttsReady && N.ttsReady()) {
          var id = 'ac' + Date.now(); window.__wafaSpoke = function(x){ if (x === id) ok(); };
          N.speak(text, EN() ? 'en' : 'ko', id); setTimeout(ok, 12000); return;
        }
        var ss = window.speechSynthesis; if (!ss || !window.SpeechSynthesisUtterance) return ok();
        var u = new SpeechSynthesisUtterance(text), lg = EN() ? 'en' : 'ko'; u.lang = EN() ? 'en-US' : 'ko-KR';
        var vs = ss.getVoices() || [], v = vs.filter(function(x){ return (x.lang || '').toLowerCase().indexOf(lg) === 0; })[0];
        if (v) u.voice = v; else if (vs.length) return ok();
        u.onend = ok; u.onerror = ok; ss.cancel(); ss.speak(u); setTimeout(ok, 9000);
      } catch (e) { ok(); }
    });
  }
  function quiet(){ try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {} try { window.AliasNative && AliasNative.stopSpeak && AliasNative.stopSpeak(); } catch (e) {} }
  function buzz(p){ try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function connectedCount(){
    var n = 0; try { for (var k in peers) { var pc = peers[k] && peers[k].pc; if (pc && (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed')) n++; } } catch (e) {}
    return n;
  }
  function othersPresent(){
    try { var st = callChannel && callChannel.presenceState(); return st ? Object.keys(st).filter(function(k){ return k !== mySenderAnonId; }).length : 0; } catch (e) { return 0; }
  }

  /* ── 겹쳐 띄우는 판 ─────────────────────────────────── */
  function sheet(html){
    var old = document.getElementById('acpSheet'); if (old) old.remove();
    var bg = document.createElement('div'); bg.id = 'acpSheet';
    bg.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(8,12,18,.92);color:#EEF2F7;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center';
    bg.innerHTML = html; document.body.appendChild(bg); return bg;
  }
  function btn(txt, bg, id){ return '<button type="button" id="' + id + '" style="margin:4px;padding:14px 20px;border:0;border-radius:14px;font:inherit;font-weight:800;font-size:16px;color:#fff;background:' + bg + '">' + txt + '</button>'; }

  /* =====================================================================
     📮 음성사서함
     ===================================================================== */
  function vmArm(){
    vmDisarm(); S.vmOff = false;
    S.vmTimer = setTimeout(function(){
      S.vmTimer = null;
      if (!activeCall || connectedCount() > 0 || othersPresent() > 0) return;
      vmOffer();
    }, 40000);
  }
  function vmDisarm(){ if (S.vmTimer) { clearTimeout(S.vmTimer); S.vmTimer = null; } }

  async function vmOffer(){
    try { await endCall(); } catch (e) {}
    try { showState('stateChat'); updateNavActive('navChat'); } catch (e) {}
    var sh = sheet('<div style="font-size:40px">📮</div><div style="font-size:20px;font-weight:800" id="acpSt">' + t('아무도 받지 않았습니다', 'No one answered') + '</div>' +
      '<div style="opacity:.8" id="acpSub">' + t('음성 메시지를 남길 수 있어요 (최대 1분)', 'You can leave a voice message (up to 1 min)') + '</div>' +
      '<div id="acpBtns">' + btn(t('🎙 음성 메시지 남기기', '🎙 Leave a message'), '#0F6E68', 'acpRec') + btn(t('닫기', 'Close'), 'rgba(128,128,128,.4)', 'acpClose') + '</div>');
    document.getElementById('acpRec').onclick = function(){ quiet(); vmStart(); };
    document.getElementById('acpClose').onclick = function(){ quiet(); S.vmOff = true; sh.remove(); };
    await wait(400); if (S.vmOff || S.rec) return;
    await wait(tones([[660, 0, .16], [880, .18, .16], [1100, .36, .22]])); if (S.vmOff || S.rec) return;
    await say(t('아무도 받지 않습니다. 삐 소리가 나면 메시지를 남겨 주세요. 말씀을 마치면 저절로 보내집니다.', 'No one answered. Please leave a message after the tone. It will be sent when you stop talking.'));
    if (S.vmOff || S.rec) return;
    buzz([180, 90, 180]); await wait(tones([[1000, 0, .45]])); if (S.vmOff || S.rec) return;
    vmStart();
  }

  async function vmStart(){
    if (S.rec) return;
    var sub = document.getElementById('acpSub'), bb = document.getElementById('acpBtns');
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      var types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
      var mime = types.filter(function(x){ try { return MediaRecorder.isTypeSupported(x); } catch (e) { return false; } })[0] || '';
      var rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [], st = Date.now();
      rec.ondataavailable = function(e){ if (e.data && e.data.size) chunks.push(e.data); };
      rec.start(1000);
      S.rec = { rec: rec, stream: stream, chunks: chunks, st: st, mime: mime || rec.mimeType || 'audio/webm' };
      document.getElementById('acpSt').textContent = t('지금 말씀하세요', 'Speak now');
      bb.innerHTML = btn(t('■ 보내기', '■ Send'), '#1E9E5A', 'acpSend') + btn(t('취소', 'Cancel'), 'rgba(128,128,128,.4)', 'acpCancel');
      document.getElementById('acpSend').onclick = function(){ vmStop(true); };
      document.getElementById('acpCancel').onclick = function(){ vmStop(false); };
      var heard = false, quietSince = Date.now(), an = null, buf = null;
      try { var ac = ctx(); if (ac) { an = ac.createAnalyser(); an.fftSize = 1024; ac.createMediaStreamSource(stream).connect(an); buf = new Uint8Array(an.fftSize); } } catch (e) { an = null; }
      S.rec.tick = setInterval(function(){
        var ms = Date.now() - st;
        if (an) {
          an.getByteTimeDomainData(buf); var sum = 0; for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; sum += v * v; }
          if (Math.sqrt(sum / buf.length) > 0.04) { heard = true; quietSince = Date.now(); }
          if (heard && Date.now() - quietSince > 3000) { vmStop(true); return; }
          if (!heard && ms > 10000) { vmStop(false, true); return; }
        }
        sub.textContent = '🔴 ' + t('녹음 중', 'Recording') + ' ' + Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0') + ' / 1:00';
        if (ms >= 60000) vmStop(true);
      }, 250);
    } catch (e) {
      sub.textContent = t('마이크를 쓸 수 없어요. 대화에 글로 남겨 주세요.', 'Microphone unavailable. Leave a text instead.');
      bb.innerHTML = btn(t('닫기', 'Close'), 'rgba(128,128,128,.4)', 'acpClose2');
      document.getElementById('acpClose2').onclick = function(){ var s = document.getElementById('acpSheet'); if (s) s.remove(); };
    }
  }

  function vmStop(send, silent){
    var r = S.rec; if (!r || r.stopping) return; r.stopping = true; clearInterval(r.tick);
    var ms = Math.min(Date.now() - r.st, 60000);
    r.rec.onstop = async function(){
      r.stream.getTracks().forEach(function(x){ x.stop(); }); S.rec = null;
      var sh = document.getElementById('acpSheet');
      if (!send || ms < 800 || !r.chunks.length) {
        if (silent) { tones([[500, 0, .25], [400, .3, .3]]); await say(t('메시지가 없어 끝냅니다.', 'No message. Goodbye.')); }
        if (sh) sh.remove(); return;
      }
      document.getElementById('acpSub').textContent = t('보내는 중…', 'Sending…'); document.getElementById('acpBtns').innerHTML = '';
      try {
        var type = (r.mime || 'audio/webm').split(';')[0], ext = type.indexOf('mp4') >= 0 ? 'm4a' : (type.indexOf('ogg') >= 0 ? 'ogg' : 'webm');
        /* 먼저 「📮 음성사서함」 한 줄 → 그 아래 음성 */
        try {
          var label = t('📮 음성사서함 (' + Math.round(ms / 1000) + '초)', '📮 Voicemail (' + Math.round(ms / 1000) + 's)');
          var payload = roomIsSecure ? await e2eeEncryptText(roomKey, label) : label;
          await fetch(SUPABASE_URL + '/functions/v1/aliascall_hotline_message', { method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ hotlineId: hotlineId, text: payload, memberAnonId: accessToken ? undefined : hotlineAnonId }) });
        } catch (e) {}
        await uploadAndSendFile(new File([new Blob(r.chunks, { type: type })], 'voicemail_' + Date.now() + '.' + ext, { type: type }));
        document.getElementById('acpSt').textContent = t('음성 메시지를 남겼어요', 'Message left');
        document.getElementById('acpSub').textContent = '';
        buzz(120); await wait(tones([[880, 0, .18], [660, .22, .3]]));
        await say(t('메시지를 보냈습니다.', 'Your message was sent.'));
      } catch (e) {
        document.getElementById('acpSub').textContent = t('보내지 못했어요. 대화에 다시 남겨 주세요.', 'Could not send. Please try again in the chat.');
        await wait(1500);
      }
      var s2 = document.getElementById('acpSheet'); if (s2) s2.remove();
    };
    try { r.rec.stop(); } catch (e) {}
  }

  /* =====================================================================
     ⏸ 보류 · 👥 초대 — 통화 단추 줄에 더함
     ===================================================================== */
  function remoteMute(on){ try { document.querySelectorAll('#tilesGrid audio, #tilesGrid video').forEach(function(m){ m.muted = !!on; }); } catch (e) {} }
  function setHold(on){
    S.hold = !!on;
    try { if (localStream) localStream.getTracks().forEach(function(x){ x.enabled = !S.hold && !(x.kind === 'audio' && (typeof isMuted !== 'undefined' && isMuted)); }); } catch (e) {}
    remoteMute(S.hold);
    try { callChannel && callChannel.send({ type: 'broadcast', event: 'hold', payload: { from: mySenderAnonId, on: S.hold } }); } catch (e) {}
    var b = document.getElementById('acpHoldBtn'); if (b) { b.textContent = S.hold ? '▶' : '⏸'; b.classList.toggle('active-off', S.hold); }
    status(S.hold ? t('⏸ 보류 중 — 상대는 기다리는 중입니다', '⏸ On hold') : '');
  }
  function status(txt){
    var el = document.getElementById('acpHoldNote');
    if (!el) { el = document.createElement('div'); el.id = 'acpHoldNote'; el.style.cssText = 'text-align:center;font-weight:800;font-size:14px;margin:6px 0;color:#FFD27A';
      var cc = document.querySelector('#stateCall .call-controls'); if (cc && cc.parentNode) cc.parentNode.insertBefore(el, cc); }
    el.textContent = txt || '';
  }
  function onHold(p){
    if (!p || p.from === mySenderAnonId) return;
    if (S.holdTone) { clearInterval(S.holdTone); S.holdTone = null; }
    if (p.on) {
      var nm = ''; try { nm = memberNicknames[p.from] || ''; } catch (e) {}
      status(t('⏸ ' + (nm ? nm + ' 님이 ' : '상대가 ') + '통화를 잠시 보류했어요', '⏸ ' + (nm || 'Someone') + ' put the call on hold'));
      var bt = function(){ tones([[523, 0, .25], [659, .3, .25], [784, .6, .35]]); }; bt(); S.holdTone = setInterval(bt, 4000);
    } else if (!S.hold) status('');
  }
  async function invite(){
    var en = EN(), full = S.roomMax && S.roomN >= S.roomMax;
    var tok = ''; try { tok = new URLSearchParams(location.search).get('t') || ''; } catch (e) {}
    var url = tok ? location.origin + '/aliascall_hotline_join.html?t=' + encodeURIComponent(tok) : '';
    if (url && roomIsSecure) { try { var k = localStorage.getItem('aliascall_hotline_key_' + hotlineId); if (k) url += '#k=' + k; } catch (e) {} }
    var sh = sheet('<div style="font-size:36px">👥</div><div style="font-size:19px;font-weight:800">' + t('한 사람 더 부르기', 'Add a person') + '</div>' +
      '<div style="opacity:.85;max-width:420px;line-height:1.6">' + (full ? t('이 방은 정원(' + S.roomMax + '명)이 가득 차 더 부를 수 없어요.', 'This room is full (' + S.roomMax + ' people).')
        : url ? t('아래 초대 링크를 보내면, 받은 사람이 이 방에 들어와 함께 통화합니다.', 'Send this invite link. They join this room and the call.')
              : t('초대 링크는 [회선 관리] 화면에 있어요. 거기서 보내 주세요.', 'The invite link is in Manage line. Send it from there.')) + '</div>' +
      (url && !full ? '<div style="word-break:break-all;font-size:12.5px;opacity:.7;max-width:420px">' + esc(url.split('#')[0]) + '</div>' + btn(t('🔗 초대 링크 보내기', '🔗 Send invite link'), '#0F6E68', 'acpShare') : '') +
      btn(t('닫기', 'Close'), 'rgba(128,128,128,.4)', 'acpInvClose'));
    document.getElementById('acpInvClose').onclick = function(){ sh.remove(); };
    var sb2 = document.getElementById('acpShare');
    if (sb2) sb2.onclick = async function(){
      try { if (navigator.share) { await navigator.share({ title: t('가림콜 초대', 'Aliascall invite'), url: url }); sh.remove(); return; } } catch (e) {}
      try { await navigator.clipboard.writeText(url); this.textContent = t('복사했어요 · 문자나 카톡에 붙여 넣으세요', 'Copied'); } catch (e) { prompt('', url); }
    };
  }
  function addButtons(){
    var cc = document.querySelector('#stateCall .call-controls'); if (!cc || document.getElementById('acpHoldBtn')) return;
    var hb = document.createElement('button'); hb.className = 'call-btn'; hb.id = 'acpHoldBtn'; hb.textContent = '⏸'; hb.title = t('보류', 'Hold');
    hb.onclick = function(){ setHold(!S.hold); };
    var ib = document.createElement('button'); ib.className = 'call-btn'; ib.id = 'acpInvBtn'; ib.textContent = '➕'; ib.title = t('초대', 'Invite');
    ib.onclick = invite;
    var hang = document.getElementById('hangupBtn');
    cc.insertBefore(hb, hang); cc.insertBefore(ib, hang);
  }

  /* =====================================================================
     ⏳ 통화 중 대기 — 내 다른 회선에서 통화가 시작되면
     ===================================================================== */
  function cwStart(){
    cwStop();
    S.cwTimer = setInterval(async function(){
      if (!activeCall) { cwStop(); return; }
      var rows = [];
      try { var r = await sb.rpc('my_hotline_calls', { p_limit: 10 }); rows = (r && !r.error && r.data) || []; } catch (e) { return; }
      var now = Date.now();
      var w = rows.filter(function(x){ return x.hotline_id !== hotlineId && !x.ended_at && !x.started_by_me && (now - new Date(x.started_at).getTime() < 90000) && !S.cwSkip[x.hotline_id + x.started_at]; })[0];
      if (w && (!S.cwShown || S.cwShown.hotline_id !== w.hotline_id)) cwShow(w); else if (!w && S.cwShown) cwHide();
    }, 4000);
  }
  function cwStop(){ if (S.cwTimer) { clearInterval(S.cwTimer); S.cwTimer = null; } cwHide(); }
  function cwHide(){ var b = document.getElementById('acpCw'); if (b) b.remove(); if (S.cwBeep) { clearInterval(S.cwBeep); S.cwBeep = null; } S.cwShown = null; }
  function cwShow(w){
    cwHide(); S.cwShown = w;
    var nm = w.started_by_nickname || w.room_name || t('다른 회선', 'Another line');
    var bar = document.createElement('div'); bar.id = 'acpCw';
    bar.style.cssText = 'position:fixed;left:10px;right:10px;top:calc(10px + env(safe-area-inset-top,0px));z-index:9997;background:#1C2A3A;color:#fff;border:1px solid #2F4258;border-radius:16px;padding:12px;box-shadow:0 8px 24px rgba(0,0,0,.45);display:flex;flex-direction:column;gap:8px';
    var bs = 'flex:1;min-height:42px;border:0;border-radius:12px;color:#fff;font:inherit;font-weight:800;font-size:14px;';
    bar.innerHTML = '<div style="font-weight:800;font-size:15px">⏳ ' + esc(nm) + t(' 님 전화 대기 중', ' is calling') + (w.room_name && w.started_by_nickname ? ' · ' + esc(w.room_name) : '') + '</div>' +
      '<div style="display:flex;gap:6px"><button data-cw="take" style="' + bs + 'background:#1E9E5A">' + t('끊고 받기', 'End & answer') + '</button>' +
      '<button data-cw="msg" style="' + bs + 'background:#34495E">' + t('💬 통화 중', '💬 Busy') + '</button>' +
      '<button data-cw="no" style="' + bs + 'background:#5A6470">' + t('닫기', 'Dismiss') + '</button></div>';
    document.body.appendChild(bar);
    var beep = function(){ tones([[440, 0, .18], [440, .25, .18]]); }; beep(); S.cwBeep = setInterval(beep, 4000);
    bar.onclick = async function(e){
      var b = e.target.closest('[data-cw]'); if (!b) return;
      var k = b.dataset.cw; S.cwSkip[w.hotline_id + w.started_at] = 1; cwHide();
      if (k === 'take') {
        try { await endCall(); } catch (er) {}
        location.href = 'aliascall_hotline_room.html?hotline=' + encodeURIComponent(w.hotline_id) + '&from=calls&go=' + (w.mode === 'video' ? 'video' : 'voice');
        return;
      }
      if (k === 'msg') {
        try {
          await fetch(SUPABASE_URL + '/functions/v1/aliascall_hotline_message', { method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ hotlineId: w.hotline_id, text: t('지금 다른 통화 중이에요. 끝나고 바로 연락드릴게요.', 'I’m on another call. I’ll get back to you soon.') }) });
        } catch (er) {}
      }
    };
  }

  /* ── 방 화면이 부름 ───────────────────────────────────── */
  window.ACPlus = {
    room: function(max, n){ S.roomMax = +max || 0; S.roomN = +n || 0; },
    callStarted: function(){ addButtons(); S.hold = false; status(''); vmArm(); cwStart(); },
    callEnded: function(){ vmDisarm(); cwStop(); S.hold = false; if (S.holdTone) { clearInterval(S.holdTone); S.holdTone = null; } status(''); },
    onHold: onHold,
    peerJoined: function(){ vmDisarm(); },
    voicemail: function(){ return vmOffer(); },   // 시험용으로도 부를 수 있게
  };
})();
