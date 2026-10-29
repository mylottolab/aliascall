/* =====================================================================
   🔴 2026-10-29 — 🚗 주차 알림판 인쇄 (전화번호 대신 QR)
     ParkingPlate.print({ token, label })   ← 내 차량 등록물의 QR 로 A4 한 장
       위: 접어 세우는 알림판(앞 · 뒤)  /  아래: 대시보드에 눕혀 두는 납작한 판
     ParkingPlate.print({ blank:true })     ← 무료 배포용: QR 자리를 비워 둔 판(QR 스티커를 붙임)
   ⚠ 앱 안에서는 window.print 가 안 되어 AliasNative.printPage 를 씁니다(QR 인쇄와 같은 방식).
   ⚠ 햇빛에 바래지 않게 두꺼운 종이 · 코팅을 권합니다. QR 은 흰 바탕 · 검정으로만 찍습니다.
   ===================================================================== */
(function(){
  'use strict';
  var CONNECT = 'https://aliascall.com/aliascall_connect.html?t=';
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function en(){ try { return (localStorage.getItem('aliascall_lang') || '').indexOf('en') === 0; } catch (e) { return false; } }
  function qr(text, px){
    var box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(box);
    try { new QRCode(box, { text: text, width: px, height: px, colorDark:'#000000', colorLight:'#ffffff', correctLevel: QRCode.CorrectLevel.M }); } catch (e) { box.remove(); return ''; }
    var c = box.querySelector('canvas'), u = '';
    try { u = c ? c.toDataURL('image/png') : ((box.querySelector('img') || {}).src || ''); } catch (e) {}
    box.remove(); return u;
  }
  var CSS = [
    '@page{size:A4;margin:0}',
    '#plArea{display:none}',
    '@media print{body.pl-printing>*:not(#plArea){display:none!important}body.pl-printing #plArea{display:block!important}body.pl-printing{background:#fff!important;margin:0!important;padding:0!important}}',
    '#plArea *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '#plArea{font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;color:#12302E;word-break:keep-all}',
    '.pl-page{width:210mm;height:297mm;position:relative;background:#fff;overflow:hidden}',
    '.pl-guide{position:absolute;left:10mm;right:10mm;font-size:8pt;color:#8A9A98;text-align:center}',
    /* 접는 판: 190 × 75mm 두 면 */
    '.pl-tent{position:absolute;left:10mm;top:14mm;width:190mm;height:150mm;border:.3mm dashed #AAB}',
    '.pl-face{height:75mm;display:flex;align-items:stretch;overflow:hidden}',
    '.pl-face.back{transform:rotate(180deg);background:#123F3D;color:#fff;justify-content:center;align-items:center;text-align:center;flex-direction:column}',
    '.pl-fold{position:absolute;left:0;right:0;top:75mm;border-top:.3mm dashed #AAB}',
    '.pl-band{width:13mm;background:#E8734A;color:#fff;display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;font-weight:900;font-size:10pt;letter-spacing:.2em}',
    '.pl-txt{flex:1;padding:7mm 4mm 6mm 7mm;display:flex;flex-direction:column;justify-content:space-between}',
    '.pl-h{font-size:21pt;font-weight:900;line-height:1.22;color:#123F3D}',
    '.pl-h em{font-style:normal;color:#C0532E}',
    '.pl-s{font-size:10.5pt;line-height:1.5;color:#3E5654;margin-top:2mm}',
    '.pl-b{font-size:8.5pt;color:#3E5654;display:flex;align-items:center;gap:2mm}',
    '.pl-b b{color:#123F3D;font-size:10pt}',
    '.pl-qr{width:68mm;padding:5mm 6mm 4mm 2mm;display:flex;flex-direction:column;align-items:center;justify-content:center}',
    '.pl-qr img{width:56mm;height:56mm;display:block}',
    '.pl-qr .t{font-size:8.5pt;font-weight:800;margin-top:1.5mm;color:#123F3D}',
    '.pl-slot{width:56mm;height:56mm;border:.6mm dashed #1F6F6B;border-radius:3mm;display:flex;align-items:center;justify-content:center;text-align:center;font-size:9pt;color:#1F6F6B;font-weight:800;line-height:1.5;background:#F3F8F7}',
    '.pl-face.back .k{font-size:9pt;color:#E9C46A;font-weight:800;letter-spacing:.1em}',
    '.pl-face.back .h{font-size:17pt;font-weight:900;margin:2mm 0;line-height:1.3}',
    '.pl-face.back .d{font-size:9.5pt;color:#CFE3DF;line-height:1.55}',
    /* 납작한 판 150 × 70mm */
    '.pl-flat{position:absolute;left:30mm;top:186mm;width:150mm;height:70mm;border:.3mm dashed #AAB;display:flex;overflow:hidden}',
    '.pl-flat .pl-txt{padding:6mm 3mm 5mm 6mm}',
    '.pl-flat .pl-h{font-size:16pt}',
    '.pl-flat .pl-s{font-size:9pt}',
    '.pl-flat .pl-qr{width:56mm;padding:4mm 5mm 3mm 1mm}',
    '.pl-flat .pl-qr img, .pl-flat .pl-slot{width:46mm;height:46mm}'
  ].join('\n');

  function texts(){
    return en() ? {
      band:'PARKING', h:'Need me to<br><em>move my car?</em>', s:'Scan the QR — you reach the owner right away.<br>No phone number shown · no app needed',
      b:'<b>Aliascall</b> · make your own free at aliascall.com', scan:'📷 Scan with your camera',
      bk:'ALIASCALL', bh:'My number stays private', bd:'Calls and messages come through the QR.<br>Make your own free at aliascall.com',
      slot:'Stick your<br>QR sticker here', g1:'✂ Cut along the dashed line, fold in the middle and stand it on the dashboard (front faces out)',
      g2:'✂ Or lay this flat card on the dashboard', g3:'Tip: thick paper or lamination keeps it from fading in the sun.'
    } : {
      band:'주차 알림', h:'차를 빼 드릴까요?<br><em>QR을 찍어 주세요</em>', s:'전화번호 없이 차주에게 바로 연락됩니다<br>앱 설치 없이 카메라로 찍기만 하면 돼요',
      b:'<b>에일리어스콜</b> · 나도 무료로 만들기 aliascall.com', scan:'📷 카메라로 찍어 주세요',
      bk:'ALIASCALL', bh:'제 전화번호는 안전하게 숨겨져 있어요', bd:'연락은 QR로 받습니다. 낯선 사람에게 번호가 퍼지지 않아요.<br>나도 무료로 만들기 · aliascall.com',
      slot:'QR 스티커를<br>여기에 붙이세요', g1:'✂ 점선을 따라 자르고 가운데 선을 접어 대시보드에 세우세요 (주황 띠가 있는 면이 바깥)',
      g2:'✂ 또는 이 납작한 판을 대시보드에 눕혀 두세요', g3:'두꺼운 종이에 찍거나 코팅하면 햇빛에 오래 버팁니다.'
    };
  }
  function front(t, q, flat){
    return '<div class="pl-band">' + t.band + '</div>' +
      '<div class="pl-txt"><div><div class="pl-h">' + t.h + '</div><div class="pl-s">' + t.s + '</div></div><div class="pl-b">' + t.b + '</div></div>' +
      '<div class="pl-qr">' + (q ? '<img src="' + q + '" alt="">' : '<div class="pl-slot">' + t.slot + '<br>(' + (flat ? '4.5 × 4.5' : '5.5 × 5.5') + 'cm)</div>') + '<div class="t">' + t.scan + '</div></div>';
  }
  function page(q){
    var t = texts();
    return '<div class="pl-page">' +
      '<div class="pl-guide" style="top:7mm">' + t.g1 + '</div>' +
      '<div class="pl-tent"><div class="pl-face back"><div class="k">' + t.bk + '</div><div class="h">' + t.bh + '</div><div class="d">' + t.bd + '</div></div>' +
      '<div class="pl-fold"></div><div class="pl-face">' + front(t, q) + '</div></div>' +
      '<div class="pl-guide" style="top:178mm">' + t.g2 + '</div>' +
      '<div class="pl-flat">' + front(t, q, true) + '</div>' +
      '<div class="pl-guide" style="top:266mm">' + t.g3 + '</div>' +
    '</div>';
  }
  function print(o){
    o = o || {};
    if (!o.blank && typeof QRCode === 'undefined') { alert(en() ? 'Could not make the QR. Please try again.' : 'QR을 만들지 못했습니다. 잠시 뒤 다시 눌러 주세요.'); return; }
    var q = o.blank ? '' : qr(CONNECT + o.token, 700);
    var st = document.getElementById('plCss');
    if (!st) { st = document.createElement('style'); st.id = 'plCss'; st.textContent = CSS; document.head.appendChild(st); }
    var area = document.getElementById('plArea');
    if (!area) { area = document.createElement('div'); area.id = 'plArea'; document.body.appendChild(area); }
    area.innerHTML = page(q);
    document.body.classList.add('pl-printing');
    var done = function(){ document.body.classList.remove('pl-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    // 앱 인쇄는 afterprint 가 안 올 수 있어, 다음에 화면을 누를 때 원래대로 돌립니다(다른 QR 인쇄가 이 판으로 찍히지 않게)
    setTimeout(function(){ document.addEventListener('pointerdown', done, { once: true }); }, 1500);
    setTimeout(function(){
      if (window.AliasNative && typeof AliasNative.printPage === 'function') AliasNative.printPage('Aliascall parking plate');
      else window.print();
    }, 200);
  }
  window.ParkingPlate = { print: print };
})();
