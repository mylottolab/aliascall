// =====================================================
// Aliascall — 웹푸시 구독 공용 헬퍼
// 2026-08-19 신설. "60초 무응답시 긴급 알림"을 전화번호 없이 웹푸시로 구현.
// aliascall_my_account.html / aliascall_registration_mockup.html / aliascall_incoming_calls.html
// 에서 <script src="aliascall_push.js">로 불러다 씀.
// =====================================================

const PUSH_FN_BASE = 'https://qmwaraittiurkynszjts.supabase.co/functions/v1';

// VAPID 공개키 (비밀키 아님 — 클라이언트에 노출돼도 안전. 서버의 VAPID_PRIVATE_KEY와 짝을 이룸)
const VAPID_PUBLIC_KEY = 'BJxWgI0hDS1z_PoTu5T5VRkHl5Rti38Dih4Vx4vHryduNlgeuBCRQP1-Y8LiyeV9k4mOLCbZyMn3I_Ac-HnkpGA';

function _urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// ── 환경 판별 ──
function _isIOS(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function _isStandalone(){
  // iOS Safari: navigator.standalone / 그 외: display-mode 미디어쿼리
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}
function pushIsSupported(){
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// ── 서비스워커 등록 (알림을 실제로 받아야 하는 페이지에서 호출) ──
async function registerAliascallServiceWorker(){
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (e) {
    console.error('[push] 서비스워커 등록 실패', e);
    return null;
  }
}

// ── 알림 켜기 UI 렌더링 ──
// containerId: 버튼/안내를 그릴 <div id="...">
// 상태에 따라 3가지 중 하나를 보여줌:
//   1) iOS인데 홈화면 추가(PWA) 상태가 아님 -> "홈화면에 추가해주세요" 안내
//   2) 그 외 -> "긴급 알림 켜기" 버튼
//   3) 이미 구독중 -> "긴급 알림 켜짐" 상태 + 끄기 버튼
async function renderPushOptIn(sb, containerId){
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!pushIsSupported()) {
    el.innerHTML = '<div class="push-optin-note">이 브라우저는 알림 기능을 지원하지 않아요.</div>';
    return;
  }

  // iOS는 홈화면에 추가(PWA 설치)해야만 웹푸시가 동작함 (iOS 16.4+ 제약사항)
  if (_isIOS() && !_isStandalone()) {
    el.innerHTML = `
      <div class="push-optin-card push-optin-ios-guide">
        <div class="push-optin-title">📲 긴급 알림을 받으시려면</div>
        <div class="push-optin-desc">
          아이폰(사파리)은 <b>홈 화면에 추가</b>한 뒤에만 알림을 받을 수 있어요.<br><br>
          1. 하단의 <b>공유 버튼(⬆️)</b>을 눌러주세요<br>
          2. <b>"홈 화면에 추가"</b>를 선택해주세요<br>
          3. 홈 화면의 Aliascall 아이콘으로 다시 접속한 뒤, 이 화면에서 "긴급 알림 켜기"를 눌러주세요
        </div>
      </div>`;
    return;
  }

  const reg = await registerAliascallServiceWorker();
  if (!reg) {
    el.innerHTML = '<div class="push-optin-note">알림 모듈을 불러오지 못했어요. 잠시 후 다시 시도해주세요.</div>';
    return;
  }

  const existingSub = await reg.pushManager.getSubscription();

  if (existingSub && Notification.permission === 'granted') {
    el.innerHTML = `
      <div class="push-optin-card push-optin-active">
        <div class="push-optin-title">🔔 긴급 알림이 켜져 있어요</div>
        <div class="push-optin-desc">앱을 안 보고 있어도, 60초 안에 응답이 없으면 알림으로 알려드려요.</div>
        <button type="button" class="push-optin-btn push-optin-btn-off" id="pushOptOutBtn">알림 끄기</button>
      </div>`;
    document.getElementById('pushOptOutBtn').addEventListener('click', () => unsubscribeAliascallPush(sb, containerId));
    return;
  }

  el.innerHTML = `
    <div class="push-optin-card">
      <div class="push-optin-title">🔔 긴급 알림을 켜두시면 좋아요</div>
      <div class="push-optin-desc">누군가 연결을 시도했는데 60초간 응답이 없으면, 앱을 안 보고 있어도 알림으로 알려드려요.</div>
      <button type="button" class="push-optin-btn" id="pushOptInBtn">긴급 알림 켜기</button>
    </div>`;
  document.getElementById('pushOptInBtn').addEventListener('click', () => subscribeAliascallPush(sb, containerId));
}

async function subscribeAliascallPush(sb, containerId){
  const btn = document.getElementById('pushOptInBtn');
  if (btn) { btn.disabled = true; btn.textContent = '설정 중…'; }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('알림을 허용해주셔야 긴급 알림을 받을 수 있어요. 브라우저 설정에서 다시 허용할 수 있어요.');
      if (btn) { btn.disabled = false; btn.textContent = '긴급 알림 켜기'; }
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true, // 브라우저 정책상 필수 — 눈에 안 보이는 조용한 푸시는 금지되어 있음
      applicationServerKey: _urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const { data: { session } } = await sb.auth.getSession();
    if (!session) { alert('로그인이 필요합니다.'); return; }

    const subJson = sub.toJSON();
    const res = await fetch(`${PUSH_FN_BASE}/aliascall-push-subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth_key: subJson.keys.auth,
        user_agent: navigator.userAgent,
      }),
    });
    if (!res.ok) throw new Error('구독 정보 저장 실패');

    await renderPushOptIn(sb, containerId); // "켜짐" 상태로 다시 그림
  } catch (e) {
    console.error('[push] 구독 실패', e);
    alert('긴급 알림 설정 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.');
    if (btn) { btn.disabled = false; btn.textContent = '긴급 알림 켜기'; }
  }
}

async function unsubscribeAliascallPush(sb, containerId){
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      const { data: { session } } = await sb.auth.getSession();
      if (session) {
        await fetch(`${PUSH_FN_BASE}/aliascall-push-subscribe`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
          body: JSON.stringify({ endpoint }),
        });
      }
    }
  } catch (e) {
    console.error('[push] 구독 해제 실패', e);
  } finally {
    await renderPushOptIn(sb, containerId);
  }
}
