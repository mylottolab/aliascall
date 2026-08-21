// =====================================================
// Aliascall — 핫라인(2부) 전용 결제 공용 헬퍼
// 2026-08-21 신설.
//
// ⚠ 기존 aliascall_payments.js(등록물 구독/포인트충전 전용)는 전혀 안 건드림 — 완전히
// 독립된 새 파일. 다만 "작동 방식"은 그 파일에서 검증된 것과 완전히 동일하게 맞춤:
//   - 이니시스는 INIPayPro_v2.js 공식 SDK로 window.INIPayPro.requestPayment(...) 호출
//   - SDK는 페이지 로드 즉시 미리 불러와둠(클릭 시점에 처음 불러오면 브라우저가 팝업 차단으로
//     오인해서 결제창이 안 뜨는 버그가 있었다고 함 — 그 교훈을 그대로 반영)
//   - PayPal은 client-id를 서버에서 동적으로 받아와서 SDK를 그때그때 불러옴
// 다른 점은 딱 하나 — 호출하는 Edge Function이 핫라인 전용(aliascall-hotline-*)이라는 것.
// =====================================================

const HOTLINE_PAYMENTS_FN_BASE = 'https://qmwaraittiurkynszjts.supabase.co/functions/v1';

async function _hlGetAuthToken(sb){
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token || null;
}

let _hlIniPaySdkLoaded = false;
let _hlIniPaySdkLoading = null;

function _hlLoadIniPaySdk(){
  if (_hlIniPaySdkLoaded) return Promise.resolve();
  if (_hlIniPaySdkLoading) return _hlIniPaySdkLoading;
  _hlIniPaySdkLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://paypro.inicis.com/std/payment/js/INIPayPro_v2.js';
    script.charset = 'UTF-8';
    script.onload = () => { _hlIniPaySdkLoaded = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return _hlIniPaySdkLoading;
}

// ── 핫라인 이니시스 결제 시작 ──
// opts: { tier, durationMonths, buyername, buyertel, buyeremail }
async function startHotlineInicisPayment(sb, opts){
  const { tier, durationMonths, buyername, buyertel, buyeremail } = opts;
  const token = await _hlGetAuthToken(sb);
  if (!token) { alert('로그인이 필요합니다.'); return; }

  let data;
  try {
    const res = await fetch(`${HOTLINE_PAYMENTS_FN_BASE}/aliascall-hotline-inicis-prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ tier, durationMonths, buyername, buyertel, buyeremail }),
    });
    data = await res.json();
    if (!res.ok) { alert(data.error || '결제 준비에 실패했어요.'); return; }
  } catch (e) {
    console.error('[hotline-payments] 이니시스 준비 요청 실패', e);
    alert('결제 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
    return;
  }

  try {
    await _hlLoadIniPaySdk();
  } catch (e) {
    console.error('[hotline-payments] 이니시스 SDK 로드 실패', e);
    alert('결제 모듈을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
    return;
  }

  const deviceType = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'MOBILE' : 'WEB';

  window.INIPayPro.requestPayment({
    P_MID: data.mid,
    P_OID: data.oid,
    P_PAY_TYPE: 'CARD',
    P_DEVICE_TYPE: deviceType,
    P_IDCCODE: 'Y',
    P_AMT: data.amt,
    P_GOODS: data.goodname,
    P_UNAME: data.buyername,
    P_MOBILE: data.buyertel || '',
    P_EMAIL: data.buyeremail || '',
    P_NEXT_URL: data.nextUrl,
    P_NOTI_URL: data.notiUrl,
    P_CLOSE_URL: data.closeUrl,
    P_CHARSET: 'UTF-8',
    P_TIMESTAMP: data.timestamp,
    P_CHKFAKE: data.chkfake,
  });
}

// ── 핫라인 PayPal 버튼 렌더링 ──
// containerId: 버튼을 그릴 <div id="..."> / opts: { tier, durationMonths }
// onSuccess(data): 결제 성공 후 호출할 콜백 (data.hotlineId, data.inviteToken 포함)
async function renderHotlinePayPalButtons(sb, containerId, opts, onSuccess){
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';

  let idData;
  try {
    const idRes = await fetch(`${HOTLINE_PAYMENTS_FN_BASE}/aliascall-paypal-client-id`); // 읽기 전용 정보 조회라 기존 함수 그대로 재사용(안전)
    idData = await idRes.json();
    if (!idRes.ok) throw new Error(idData.error || 'client-id 조회 실패');
  } catch (e) {
    console.error('[hotline-payments] PayPal client-id 조회 실패', e);
    el.innerHTML = '<div style="font-size:12px;color:#C1483A;text-align:center;padding:10px;">PayPal을 불러오지 못했어요.</div>';
    return;
  }

  if (!window.paypal || window.__aliascallPaypalClientId !== idData.clientId) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(idData.clientId)}&currency=USD`;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    window.__aliascallPaypalClientId = idData.clientId;
  }

  window.paypal.Buttons({
    style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
    createOrder: async () => {
      const token = await _hlGetAuthToken(sb);
      if (!token) { alert('로그인이 필요합니다.'); throw new Error('no session'); }
      const res = await fetch(`${HOTLINE_PAYMENTS_FN_BASE}/aliascall-hotline-paypal-create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(opts),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || '주문 생성에 실패했어요.'); throw new Error(data.error || 'create-order failed'); }
      return data.id;
    },
    onApprove: async (dataApprove) => {
      try {
        const res = await fetch(`${HOTLINE_PAYMENTS_FN_BASE}/aliascall-hotline-paypal-capture-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderID: dataApprove.orderID }),
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error || '결제 승인에 실패했어요.'); return; }
        if (onSuccess) onSuccess(data);
      } catch (e) {
        console.error('[hotline-payments] PayPal capture 실패', e);
        alert('결제 승인 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
      }
    },
    onError: (err) => {
      console.error('[hotline-payments] PayPal 버튼 오류', err);
      alert('PayPal 결제 중 오류가 발생했어요.');
    },
  }).render('#' + containerId);
}

// 이니시스 SDK를 페이지가 열리는 즉시(백그라운드로) 미리 불러와둠 — 클릭할 때 바로 결제창이
// 뜨도록(원본 aliascall_payments.js와 동일한 이유)
_hlLoadIniPaySdk().catch((e) => console.warn('[hotline-payments] 이니시스 SDK 사전로드 실패(결제 시도 시 재시도됨)', e));
