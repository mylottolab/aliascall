/* =====================================================================
   가림콜 ☎ 다이얼 첫 화면 (2026-11-22) — index.html · index_ios.html 의 첫 화면(viewHome) 네 칸 자리에 큰 다이얼
   ⚠ 첫 화면이 하던 다른 일은 그대로: 연결 요청이 오면 받는 창(전역) · 알림 띠 · 승인 문의 띠 · 경광등 · 단축회선 · 전문업체
   · 3번 = 수신 대기 · 알림(알림 띠 숫자) · 4번 = 보안회선 · 대화방(승인 문의 숫자) 배지
   · 가운데 톡 = 수신 대기 · 알림 · 아이폰 앱 심사 중(acHeld)에는 다이얼을 켜지 않습니다
   ===================================================================== */
(function(){
  'use strict';
  /* 원래 첫 화면(네 칸)에서 다시 다이얼로 돌아오는 작은 링크 */
  function backLink(grid){
    if (document.getElementById('acToDial')) return;
    var EN = false; try { EN = (localStorage.getItem('aliascall_lang') || 'ko') === 'en'; } catch (e) {}
    var a = document.createElement('a'); a.id = 'acToDial'; a.href = '#';
    a.textContent = EN ? '☎ Show the dial first screen' : '☎ 다이얼 첫 화면으로 보기';
    a.style.cssText = 'display:block;text-align:center;margin:10px 0 4px;color:rgba(255,255,255,.9);font-weight:600;font-size:14px;text-decoration:underline';
    a.onclick = function(e){ e.preventDefault(); try { localStorage.setItem('aliascall_home_mode', 'dial'); } catch (x) {} window.ALIASCALL_HOME = 'dial'; a.remove(); start(); };
    grid.parentNode.insertBefore(a, grid.nextSibling);
  }
  function start(){
    if (!window.DialHome) return;
    if (window.acHeld && acHeld()) return;
    var g0 = document.querySelector('#viewHome .home-grid');
    if (window.ALIASCALL_HOME !== 'dial') { if (g0) backLink(g0); return; }
    var home = document.getElementById('viewHome'), grid = home && home.querySelector('.home-grid');
    if (!grid || document.getElementById('acDial')) return;
    var EN = false; try { EN = (localStorage.getItem('aliascall_lang') || 'ko') === 'en'; } catch (e) {}
    var T = function(ko, en){ return EN ? en : ko; };
    var go = function(u){ return function(){ location.href = u; }; };
    var view = function(v){ return function(){ if (typeof showView === 'function') showView(v); }; };
    function items(b){ b = b || {}; return {
      '1': { ico:'🏷️', t:T('등록하기', 'Register'), d:T('차량 · 분실 · 반려동물 · 실종', 'Car, lost item, pet, missing'), go:go('aliascall_registration_mockup.html'),
             info:T('차 · 물건 · 반려동물 · 가족을 등록하고 QR을 붙여 두면, 찾은 분이 번호 없이 바로 연락해요.', 'Register and attach a QR — finders reach you without your number.'),
             steps:[T('무엇을 등록할지 고르세요', 'Choose what to register'), T('사진 · 특징을 적고 등록하세요', 'Add a photo and details'), T('QR을 인쇄해 붙이거나 목걸이 · 가방에 다세요', 'Print and attach the QR')] },
      '2': { ico:'🔍', t:T('찾기 · QR', 'Find · QR'), d:T('찾은 물건의 주인에게 연락', 'Contact the owner of a find'), go:go('aliascall_search_mockup.html'),
             info:T('QR을 찍거나 번호로 찾아 주인에게 번호 없이 연락합니다. 가입이 없어도 돼요.', 'Scan the QR or search to contact the owner — no sign-up needed.'),
             steps:[T('QR을 찍거나 등록 번호를 넣으세요', 'Scan the QR or enter the code'), T('문자 · 음성 · 영상 중 고르세요', 'Choose text, voice or video'), T('주인이 답하면 이 화면에서 이어져요', 'The owner’s reply shows here')] },
      '3': { ico:'🔔', t:T('수신 대기', 'Inbox & alerts'), d:T('걸려온 연락 · 소통 내역', 'Incoming contacts & history'), go:view('alert'), badge:b.alerts,
             info:T('등록물로 걸려온 연락을 받고, 진행 중인 소통과 알림 설정을 봅니다.', 'Receive contacts to your registrations and see ongoing conversations.'),
             steps:[T('수신 대기 화면을 열어 두세요', 'Keep the waiting screen open'), T('연결 요청이 오면 받기를 누르세요', 'Tap answer when a request comes'), T('지난 소통은 「진행 중인 소통함」에서', 'See past ones in the conversation box')] },
      '4': { ico:'💬', t:T('보안회선', 'Private lines'), d:T('우리끼리 · 업무 · 프로 회선', 'Personal, work & pro lines'), go:view('msg'), badge:b.wait,
             info:T('번호 없이 우리끼리만 아는 회선으로 메신저 · 음성 · 영상 · 파일을 주고받아요. 최강 보안(종단 암호화)도 고를 수 있어요.', 'Lines only your group knows — chat, voice, video and files, with optional end-to-end encryption.'),
             steps:[T('회선 종류를 고르세요 (우리끼리 · 업무 · 프로)', 'Pick a line type'), T('이용권을 고르고 회선을 여세요', 'Choose a plan and open the line'), T('초대 링크로 상대를 불러 바로 대화', 'Invite with a link and start')] },
      '5': { ico:'⏳', t:T('임시연락처', 'One-time contact'), d:T('중고거래 · 일회성 만남에', 'For deals or one-off meetings'), go:go('aliascall_temp.html'),
             info:T('기한을 정한 임시 번호(QR · 코드)를 건네고, 언제든 바로 끊을 수 있어요. 내 번호는 끝까지 드러나지 않아요.', 'Hand out a temporary QR/code with an end date; cut it off anytime.'),
             steps:[T('기한(1 · 3 · 7 · 30일)을 고르세요', 'Pick 1, 3, 7 or 30 days'), T('QR · 코드를 건네세요 (명함 인쇄도 돼요)', 'Hand over the QR or code'), T('성가시면 그 자리에서 끊기', 'Cut it off anytime')] },
      '6': { ico:'📋', t:T('찾습니다', 'Lost & found board'), d:T('잃어버린 것 · 찾는 사람', 'Lost items and people'), go:go('aliascall_public_board_mockup.html'),
             info:T('잃어버린 물건 · 반려동물 · 사람을 함께 찾습니다.', 'Search together for lost items, pets and people.'),
             steps:[T('게시판에서 찾는 글을 보세요', 'Browse the posts'), T('본 적이 있으면 번호 없이 연락하세요', 'Contact without your number if you saw it'), T('내 등록물을 올려 도움을 받으세요', 'Post your own registration')] },
      '7': { ico:'🏪', t:T('단골창구', 'Shop inbox'), d:T('가게에 묻기 · 우리 가게 창구', 'Ask shops · your shop'), go:go('dangol.html'),
             info:T('동네 가게에 번호 없이 묻고, 사장님은 우리 가게 창구를 엽니다.', 'Ask local shops without your number; owners open their own inbox.'),
             steps:[T('가게 이름이나 코드로 찾으세요', 'Find the shop'), T('문의사항을 적어 보내세요', 'Write your question'), T('사장님 답장이 오면 알림', 'Get notified on reply')] },
      '8': { ico:'📣', t:T('전문업체', 'Pro directory'), d:T('변호사 · 세무 · 병원 · 상점', 'Lawyers, tax, clinics, shops'), go:go('aliascall_directory.html'),
             info:T('검증된 전문업체에 번호 없이 문의합니다.', 'Contact verified professionals without your number.'),
             steps:[T('업종 · 지역으로 찾으세요', 'Search by field or area'), T('업체를 골라 문의하세요', 'Pick one and ask'), T('업체가 승인하면 회선으로 이어져요', 'Continue on a line once approved')] },
      '9': { ico:'👤', t:T('My Page', 'My page & plans'), d:T('계정 · 이용 현황 · 상품', 'Account, usage, plans'), go:go('aliascall_my_account.html'),
             info:T('내 계정, 긴급 · 회선 이용 현황, 이용권과 상품을 한곳에서 봅니다.', 'Your account, usage and plans in one place.'),
             steps:[T('이용 현황과 남은 기간을 보세요', 'Check usage and days left'), T('필요한 이용권 · 상품을 고르세요', 'Choose a plan or add-on'), T('로그아웃 · 계정 설정도 여기서', 'Log out and settings here')] },
      '0': { ico:'🙋', t:T('고객센터', 'Help desk'), d:T('묻고 답 받기 · 사용설명서', 'Ask us · user guides'), go:go('support.html'),
             info:T('궁금한 점을 남기면 답을 드립니다. (옛날 전화의 0번 = 교환원)', 'Leave a question and we will reply. (0 = operator)'),
             steps:[T('궁금한 점을 적으세요', 'Write your question'), T('보내기를 누르세요', 'Tap send'), T('답이 오면 알려 드려요', 'We notify you on reply')] }
    }; }
    if (!document.getElementById('acDialCss')) { var st = document.createElement('style'); st.id = 'acDialCss';
      st.textContent = '#acDial .dh-hint,#acDial .dh-tog button{color:rgba(255,255,255,.88)}#acDial .dh-hint{font-weight:600}';
      document.head.appendChild(st); }
    var box = document.createElement('div'); box.id = 'acDial'; box.style.cssText = 'margin:4px 0 8px';
    grid.parentNode.insertBefore(box, grid); grid.style.display = 'none';
    var dh = DialHome.mount(box, {
      en: EN, key: 'aliascall', brand: { plate:'#1F6F6B', rim:'#123F3D', ring:'#0D2E2C', ink:'#FFFFFF' },
      center: function(){ return { title: T('가림콜', 'Aliascall'), sub: T('내 번호 노출 없음', 'Your number stays hidden') }; },
      hint: T('숫자를 톡 누르면 안내 · 멈춤쇠까지 돌리면 바로 실행', 'Tap a number for info · dial it to the stop to open'),
      next: null, items: items(),
      centerTap: { label: T('톡 = 수신 대기', 'Tap = Inbox'), go: view('alert') },
      firstScreen: function(){ try { localStorage.setItem('aliascall_home_mode', 'classic'); } catch (e) {} window.ALIASCALL_HOME = 'classic'; clearInterval(timer); box.remove(); grid.style.display = ''; backLink(grid); }
    });
    /* 배지: 첫 화면의 알림 띠 · 승인 문의 띠 숫자를 그대로 */
    var last = '', w, timer;
    function sync(){
      var a = document.getElementById('alertsStrip'); w = document.getElementById('waitStrip');
      var na = a && a.classList.contains('show') ? (+((document.getElementById('alertsCount') || {}).textContent) || 0) : 0;
      var nw = w && (w.classList.contains('show') || w.style.display === 'flex' || w.style.display === 'block') ? (+((document.getElementById('waitCount') || {}).textContent) || 0) : 0;
      var k = na + '|' + nw + (w && w.classList.contains('unread') ? 'u' : ''); if (k === last) return; last = k;
      dh.update({ items: items({ alerts: na, wait: nw }), next: na ? '3' : nw ? '4' : null,
        hint: na ? T('확인해야 할 알림이 있어요 — 3번을 돌려 보세요', 'You have alerts — dial 3') : nw ? (w.classList.contains('unread') ? T('안 읽은 대화가 있어요 — 4번', 'Unread messages — dial 4') : T('승인을 기다리는 문의가 있어요 — 4번', 'Inquiries waiting — dial 4')) : T('숫자를 톡 누르면 안내 · 멈춤쇠까지 돌리면 바로 실행', 'Tap a number for info · dial it to the stop to open') });
    }
    sync(); timer = setInterval(sync, 2000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
