/* =====================================================================
   🔴 2026-10-29 — 유치대리점 매장용 인쇄물 (aliascall_partner.html 에서 씀)
     PartnerPrint.open('poster' | 'tent' | 'cards', { code, store })
       poster : A4 세로 포스터 1장 (벽 · 유리문)
       tent   : A4 1장을 반으로 접어 세우는 계산대 POP (위쪽은 거꾸로 찍혀 접으면 양면)
       cards  : 명함 크기(9 × 5cm) 안내문 10장 + 자르는 점선
     QR 두 개: 부름 · 에일리어스콜 링크(?ref=코드). 코드도 크게 찍어 앱 스토어 설치 손님도 넣을 수 있게.
   ⚠ 인쇄 창에서 "PDF로 저장"도 됩니다. 앱(아이폰)에서는 인쇄가 막힐 수 있어 컴퓨터를 권합니다.
   ===================================================================== */
(function(){
  'use strict';
  function qr(text, px){
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(box);
    try { new QRCode(box, { text: text, width: px, height: px, correctLevel: QRCode.CorrectLevel.M }); } catch (e) { box.remove(); return ''; }
    var c = box.querySelector('canvas'), url = '';
    try { url = c ? c.toDataURL('image/png') : ((box.querySelector('img') || {}).src || ''); } catch (e) {}
    box.remove();
    return url;
  }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  var CSS = [
    '@page{size:A4;margin:0}',
    '#ppArea{display:none}',
    '@media print{body.pp-printing>*:not(#ppArea){display:none!important}body.pp-printing #ppArea{display:block!important}body.pp-printing{background:#fff!important;padding:0!important;margin:0!important}}',
    '#ppArea *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '#ppArea{font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;color:#12302E;word-break:keep-all}',
    '.pp-page{width:210mm;height:297mm;position:relative;overflow:hidden;page-break-after:always;break-after:page;background:#fff}',
    /* 포스터 */
    '.pp-top{background:#123F3D;color:#fff;padding:16mm 14mm 13mm;text-align:center}',
    '.pp-kick{font-size:13pt;font-weight:700;color:#E9C46A;letter-spacing:.04em}',
    '.pp-h{font-size:38pt;line-height:1.22;font-weight:900;margin:5mm 0 4mm}',
    '.pp-sub{font-size:14pt;color:#CFE3DF;line-height:1.5}',
    '.pp-two{display:flex;gap:8mm;padding:11mm 12mm 6mm;justify-content:center}',
    '.pp-app{flex:1;border:1.2mm solid #1F6F6B;border-radius:6mm;padding:6mm 5mm 5mm;text-align:center}',
    '.pp-app.ac{border-color:#E8734A}',
    '.pp-app .nm{font-size:22pt;font-weight:900}',
    '.pp-app.ac .nm{color:#C0532E}',
    '.pp-app .d{font-size:11.5pt;line-height:1.5;margin:2mm 0 4mm;color:#3E5654;min-height:12mm}',
    '.pp-app img{width:58mm;height:58mm;display:block;margin:0 auto}',
    '.pp-app .s{font-size:11pt;font-weight:700;margin-top:3mm}',
    '.pp-code{margin:2mm 14mm 0;border-radius:6mm;background:#FDEAE1;padding:6mm;text-align:center}',
    '.pp-code .l{font-size:13pt;font-weight:700;line-height:1.5}',
    '.pp-code .c{font-size:44pt;font-weight:900;letter-spacing:.14em;color:#123F3D;margin-top:1mm}',
    '.pp-foot{position:absolute;left:0;right:0;bottom:12mm;text-align:center;font-size:13pt;color:#3E5654}',
    '.pp-foot b{color:#12302E;font-size:16pt}',
    /* 세움 POP */
    '.pp-half{height:148.5mm;padding:9mm 12mm 7mm;text-align:center;position:relative}',
    '.pp-half.flip{transform:rotate(180deg)}',
    '.pp-fold{position:absolute;left:0;right:0;top:148.5mm;border-top:.4mm dashed #9AA;}',
    '.pp-fold span{position:absolute;right:6mm;top:-4mm;font-size:8pt;color:#899;background:#fff;padding:0 2mm}',
    '.pp-half .pp-h{font-size:26pt;margin:0 0 2mm;color:#123F3D}',
    '.pp-half .pp-sub{color:#3E5654;font-size:11.5pt}',
    '.pp-half .pp-two{padding:5mm 0 3mm;gap:6mm}',
    '.pp-half .pp-app{padding:3.5mm 3mm}',
    '.pp-half .pp-app .nm{font-size:16pt}',
    '.pp-half .pp-app .d{font-size:9.5pt;min-height:8mm;margin:1mm 0 2mm}',
    '.pp-half .pp-app img{width:38mm;height:38mm}',
    '.pp-half .pp-code{margin:0;padding:3mm}',
    '.pp-half .pp-code .l{font-size:10.5pt}',
    '.pp-half .pp-code .c{font-size:28pt}',
    '.pp-half .st{font-size:10pt;color:#3E5654;margin-top:2.5mm}',
    /* 명함 */
    '.pp-cards{position:absolute;left:15mm;top:23.5mm;width:180mm;display:grid;grid-template-columns:90mm 90mm;grid-auto-rows:50mm}',
    '.pp-card{border:.25mm dashed #AAB;padding:3.2mm 3.5mm;display:flex;gap:2.5mm;align-items:stretch}',
    '.pp-card .tx{flex:1;display:flex;flex-direction:column;justify-content:space-between;min-width:0}',
    '.pp-card .k{font-size:7pt;font-weight:700;color:#C0532E}',
    '.pp-card .h{font-size:11.5pt;font-weight:900;line-height:1.25;margin-top:.5mm}',
    '.pp-card .cl{font-size:6.8pt;color:#3E5654;line-height:1.35}',
    '.pp-card .cc{font-size:15pt;font-weight:900;letter-spacing:.1em;color:#123F3D}',
    '.pp-card .st{font-size:6.5pt;color:#3E5654;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.pp-card .q{width:22mm;text-align:center;font-size:6.5pt;font-weight:800}',
    '.pp-card .q img{width:21mm;height:21mm;display:block;margin:0 auto .5mm}',
    '.pp-cut{position:absolute;left:0;right:0;bottom:8mm;text-align:center;font-size:8pt;color:#899}'
  ].join('\n');

  var AC_D = '차 · 물건 · 반려동물 QR 긴급연락<br>1회용 임시연락처 · 보안회선';
  var BU_D = '내 전화번호 대신 부름번호로<br>전화 · 메신저 · 영상통화';

  function poster(o){
    return '<div class="pp-page">' +
      '<div class="pp-top"><div class="pp-kick">부름 · 에일리어스콜</div>' +
      '<div class="pp-h">내 번호는 숨기고<br>연락은 그대로</div>' +
      '<div class="pp-sub">전화번호를 알려 주지 않아도 통화 · 메신저 · 긴급연락이 됩니다</div></div>' +
      '<div class="pp-two">' +
        '<div class="pp-app"><div class="nm">부름</div><div class="d">' + BU_D + '</div><img src="' + o.qBu + '" alt=""><div class="s">📷 카메라로 찍어 보세요</div></div>' +
        '<div class="pp-app ac"><div class="nm">에일리어스콜</div><div class="d">' + AC_D + '</div><img src="' + o.qAc + '" alt=""><div class="s">📷 카메라로 찍어 보세요</div></div>' +
      '</div>' +
      '<div class="pp-code"><div class="l">앱 스토어에서 설치하셨나요? 가입 후 <b>"추천 대리점"</b>에 이 코드를 넣어 주세요</div><div class="c">' + esc(o.code) + '</div></div>' +
      '<div class="pp-foot">' + (o.store ? '<b>' + esc(o.store) + '</b> 추천 · ' : '') + '설치가 어려우시면 직원에게 말씀해 주세요</div>' +
    '</div>';
  }
  function half(o, flip){
    return '<div class="pp-half' + (flip ? ' flip' : '') + '">' +
      '<div class="pp-h">내 번호는 숨기고, 연락은 그대로</div>' +
      '<div class="pp-sub">번호를 알려 주지 않아도 통화 · 메신저 · 긴급연락</div>' +
      '<div class="pp-two">' +
        '<div class="pp-app"><div class="nm">부름</div><div class="d">' + BU_D + '</div><img src="' + o.qBu + '" alt=""></div>' +
        '<div class="pp-app ac"><div class="nm">에일리어스콜</div><div class="d">' + AC_D + '</div><img src="' + o.qAc + '" alt=""></div>' +
      '</div>' +
      '<div class="pp-code"><div class="l">앱으로 설치하셨으면 가입 후 "추천 대리점"에</div><div class="c">' + esc(o.code) + '</div></div>' +
      '<div class="st">' + (o.store ? esc(o.store) + ' 추천 · ' : '') + '카메라로 QR을 찍어 보세요</div>' +
    '</div>';
  }
  function tent(o){
    return '<div class="pp-page">' + half(o, true) + '<div class="pp-fold"><span>✂ 접는 선 — 반으로 접어 세우세요</span></div>' + half(o, false) + '</div>';
  }
  function cards(o){
    var one = '<div class="pp-card"><div class="tx"><div><div class="k">부름 · 에일리어스콜</div><div class="h">내 번호는 숨기고<br>연락은 그대로</div></div>' +
      '<div><div class="cl">앱 설치 후 "추천 대리점"에</div><div class="cc">' + esc(o.code) + '</div>' +
      (o.store ? '<div class="st">' + esc(o.store) + ' 추천</div>' : '') + '</div></div>' +
      '<div class="q"><img src="' + o.qBu + '" alt="">부름</div><div class="q"><img src="' + o.qAc + '" alt="">에일리어스콜</div></div>';
    var s = ''; for (var i = 0; i < 10; i++) s += one;
    return '<div class="pp-page"><div class="pp-cards">' + s + '</div><div class="pp-cut">✂ 점선을 따라 잘라 쓰세요 · 같은 안내문 10장</div></div>';
  }

  function open(kind, o){
    if (typeof QRCode === 'undefined') { alert('QR을 만들지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.'); return; }
    var data = { code: o.code, store: (o.store || '').trim(),
      qBu: qr('https://burum.kr/?ref=' + o.code, 600), qAc: qr('https://aliascall.com/?ref=' + o.code, 600) };
    var st = document.getElementById('ppCss');
    if (!st) { st = document.createElement('style'); st.id = 'ppCss'; st.textContent = CSS; document.head.appendChild(st); }
    var area = document.getElementById('ppArea');
    if (!area) { area = document.createElement('div'); area.id = 'ppArea'; document.body.appendChild(area); }
    area.innerHTML = kind === 'tent' ? tent(data) : kind === 'cards' ? cards(data) : poster(data);
    document.body.classList.add('pp-printing');
    var done = function(){ document.body.classList.remove('pp-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    var imgs = area.querySelectorAll('img'), left = imgs.length;
    var go = function(){ setTimeout(function(){ window.print(); }, 150); };
    if (!left) return go();
    imgs.forEach(function(im){ if (im.complete) { if (--left === 0) go(); } else im.onload = im.onerror = function(){ if (--left === 0) go(); }; });
  }
  window.PartnerPrint = { open: open };
})();
