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
  const ok = await _subscribeCore(sb);
  if (ok) {
    await renderPushOptIn(sb, containerId); // "켜짐" 상태로 다시 그림
  } else if (btn) {
    btn.disabled = false; btn.textContent = '긴급 알림 켜기';
  }
}

// ── 구독 등록/해제 핵심 로직 (DOM 렌더링과 분리 — 카드형 UI/토글형 UI 둘 다 이걸 공유해서 씀) ──
async function _subscribeCore(sb){
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('알림을 허용해주셔야 긴급 알림을 받을 수 있어요. 브라우저 설정에서 다시 허용할 수 있어요.');
      return false;
    }

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true, // 브라우저 정책상 필수 — 눈에 안 보이는 조용한 푸시는 금지되어 있음
      applicationServerKey: _urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const { data: { session } } = await sb.auth.getSession();
    if (!session) { alert('로그인이 필요합니다.'); return false; }

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
    return true;
  } catch (e) {
    console.error('[push] 구독 실패', e);
    alert('긴급 알림 설정 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.');
    return false;
  }
}

async function _unsubscribeCore(sb){
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
    return true;
  } catch (e) {
    console.error('[push] 구독 해제 실패', e);
    return false;
  }
}

async function unsubscribeAliascallPush(sb, containerId){
  await _unsubscribeCore(sb);
  if (containerId) await renderPushOptIn(sb, containerId);
}

// =====================================================
// 2026-08-19 (2차 수정) 신설: "통화·문자 알림음" + "긴급 알림" 통합 토글 스위치 UI
// 메인화면 하단 / 마이페이지 상단 / 수신대기 화면 상단에 공통으로 씀.
// 기존 카드형 renderPushOptIn(등록완료 화면용)과는 별개로, 여기서는 항상 상태가 보이는
// ON/OFF 슬라이드 스위치 형태로 통일함.
// =====================================================

// ── 알림음 on/off — 통화벨/딩동/채팅핑 등 모든 소리를 한 군데서 통제 ──
// (각 화면의 playDoorbell/startRingtone/playChatPing 함수들이 재생 직전에
//  aliascallIsSoundEnabled()를 확인하도록 되어있음)
const ALIASCALL_SOUND_KEY = 'aliascall_sound_enabled';
let _aliascallUnlockCtx = null;

function aliascallIsSoundEnabled(){
  // 기본값: 아직 한 번도 설정 안 했으면 '켜짐'으로 간주하지 않음(브라우저가 자동재생을 막고
  // 있을 가능성이 높으므로) — 사용자가 최초 1회는 명시적으로 켜야 함
  return localStorage.getItem(ALIASCALL_SOUND_KEY) === '1';
}
async function aliascallEnableSound(){
  try {
    if (!_aliascallUnlockCtx) _aliascallUnlockCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_aliascallUnlockCtx.state === 'suspended') await _aliascallUnlockCtx.resume();
    // 아주 짧고 작은 소리를 한번 내서 오디오 재생 자체를 "허가"받아둠 (사실상 무음에 가까움) —
    // 이후 각 화면에서 새로 만드는 AudioContext도 같은 페이지 세션 내라 재생이 허용됨
    const osc = _aliascallUnlockCtx.createOscillator();
    const gain = _aliascallUnlockCtx.createGain();
    gain.gain.value = 0.001;
    osc.connect(gain).connect(_aliascallUnlockCtx.destination);
    osc.start();
    osc.stop(_aliascallUnlockCtx.currentTime + 0.05);
  } catch (e) { console.warn('[sound] 오디오 언락 실패', e); }
  localStorage.setItem(ALIASCALL_SOUND_KEY, '1');
}
function aliascallDisableSound(){
  localStorage.setItem(ALIASCALL_SOUND_KEY, '0');
}

// ── 통합 토글 UI 렌더링 ──
async function renderNotifySettings(sb, containerId){
  const el = document.getElementById(containerId);
  if (!el) return;

  const soundOn = aliascallIsSoundEnabled();
  let pushOn = false, pushDisabled = false, pushNote = '화면을 안 보고 있어도 알림이 와요';

  if (!pushIsSupported()) {
    pushDisabled = true;
    pushNote = '이 브라우저는 긴급 알림을 지원하지 않아요.';
  } else if (_isIOS() && !_isStandalone()) {
    pushDisabled = true;
    pushNote = '아이폰은 홈 화면에 추가한 뒤 켤 수 있어요 (공유 버튼 → "홈 화면에 추가")';
  } else {
    const reg = await registerAliascallServiceWorker();
    if (reg) {
      const existingSub = await reg.pushManager.getSubscription();
      pushOn = !!(existingSub && Notification.permission === 'granted');
    } else {
      pushDisabled = true;
      pushNote = '알림 모듈을 불러오지 못했어요. 잠시 후 다시 시도해주세요.';
    }
  }

  el.innerHTML = `
    <div class="notify-settings">
      <div class="notify-row">
        <div class="notify-label"><b>🔔 통화·문자 알림음</b><span class="notify-sub">전화벨, 문자 도착음이 울려요</span></div>
        <button type="button" class="toggle-switch${soundOn ? ' on' : ''}" id="soundToggleBtn" role="switch" aria-checked="${soundOn}"><span class="toggle-knob"></span></button>
      </div>
      <div class="notify-row">
        <div class="notify-label"><b>🚨 긴급 알림 (푸시)</b><span class="notify-sub">${pushNote}</span></div>
        <button type="button" class="toggle-switch${pushOn ? ' on' : ''}" id="pushToggleBtn" role="switch" aria-checked="${pushOn}"${pushDisabled ? ' disabled' : ''}><span class="toggle-knob"></span></button>
      </div>
      <div class="notify-pc-note">💻 PC에서도 확실히 알림통지를 받으시려면 크롬의 백그라운드 실행 옵션을 켜두세요.</div>
    </div>`;

  document.getElementById('soundToggleBtn').addEventListener('click', async function(){
    if (this.classList.contains('on')) {
      aliascallDisableSound();
      this.classList.remove('on');
      this.setAttribute('aria-checked', 'false');
    } else {
      await aliascallEnableSound();
      this.classList.add('on');
      this.setAttribute('aria-checked', 'true');
    }
  });

  if (!pushDisabled) {
    document.getElementById('pushToggleBtn').addEventListener('click', async function(){
      this.disabled = true;
      if (this.classList.contains('on')) {
        await _unsubscribeCore(sb);
      } else {
        const ok = await _subscribeCore(sb);
        if (!ok) { this.disabled = false; return; }
      }
      await renderNotifySettings(sb, containerId); // 최신 상태로 다시 그림
    });
  }
}
