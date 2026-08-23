// =====================================================
// Aliascall — 반려동물 AI 비문인식 옵션 전용 결제 공용 헬퍼
// 2026-08-23 신설.
//
// ⚠ 기존 aliascall_payments.js / aliascall_hotline_payments.js는 전혀 안 건드림 —
// 완전히 독립된 새 파일. 작동 방식은 hotline 결제 헬퍼와 동일하게 맞춤.
// =====================================================

const PET_AI_PAYMENTS_FN_BASE = 'https://qmwaraittiurkynszjts.supabase.co/functions/v1';

async function _paiGetAuthToken(sb){
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token || null;
}

let _paiIniPaySdkLoaded = false;
let _paiIniPaySdkLoading = null;

function _paiLoadIniPaySdk(){
  if (_paiIniPaySdkLoaded) return Promise.resolve();
  if (_paiIniPaySdkLoading) return _paiIniPaySdkLoading;
  _paiIniPaySdkLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://paypro.inicis.com/std/payment/js/INIPayPro_v2.js';
    script.charset = 'UTF-8';
    script.onload = () => { _paiIniPaySdkLoaded = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return _paiIniPaySdkLoading;
}

// ── AI 비문인식 옵션 이니시스 결제 시작 ──
// opts: { registrationId, durationMonths, buyername, buyertel, buyeremail }
async function startPetAiInicisPayment(sb, opts){
  const { registrationId, durationMonths, buyername, buyertel, buyeremail } = opts;
  const token = await _paiGetAuthToken(sb);
  if (!token) { alert('로그인이 필요합니다.'); return; }

  let data;
  try {
    const res = await fetch(`${PET_AI_PAYMENTS_FN_BASE}/aliascall-pet-ai-inicis-prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ registrationId, durationMonths, buyername, buyertel, buyeremail }),
    });
    data = await res.json();
    if (!res.ok) { alert(data.error || '결제 준비에 실패했어요.'); return; }
  } catch (e) {
    console.error('[pet-ai-payments] 이니시스 준비 요청 실패', e);
    alert('결제 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
    return;
  }

  try {
    await _paiLoadIniPaySdk();
  } catch (e) {
    console.error('[pet-ai-payments] 이니시스 SDK 로드 실패', e);
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

// ── AI 비문인식 옵션 PayPal 버튼 렌더링 ──
// containerId: 버튼을 그릴 <div id="..."> / opts: { registrationId, durationMonths }
// onSuccess(data): 결제 성공 후 호출할 콜백 (data.subscriptionId 포함)
async function renderPetAiPayPalButtons(sb, containerId, opts, onSuccess){
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';

  let idData;
  try {
    const idRes = await fetch(`${PET_AI_PAYMENTS_FN_BASE}/aliascall-paypal-client-id`); // 읽기 전용 정보 조회라 기존 함수 그대로 재사용
    idData = await idRes.json();
    if (!idRes.ok) throw new Error(idData.error || 'client-id 조회 실패');
  } catch (e) {
    console.error('[pet-ai-payments] PayPal client-id 조회 실패', e);
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
      const token = await _paiGetAuthToken(sb);
      if (!token) { alert('로그인이 필요합니다.'); throw new Error('no session'); }
      const res = await fetch(`${PET_AI_PAYMENTS_FN_BASE}/aliascall-pet-ai-paypal-create-order`, {
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
        const res = await fetch(`${PET_AI_PAYMENTS_FN_BASE}/aliascall-pet-ai-paypal-capture-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderID: dataApprove.orderID }),
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error || '결제 승인에 실패했어요.'); return; }
        if (onSuccess) onSuccess(data);
      } catch (e) {
        console.error('[pet-ai-payments] PayPal capture 실패', e);
        alert('결제 승인 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
      }
    },
    onError: (err) => {
      console.error('[pet-ai-payments] PayPal 버튼 오류', err);
      alert('PayPal 결제 중 오류가 발생했어요.');
    },
  }).render('#' + containerId);
}

_paiLoadIniPaySdk().catch((e) => console.warn('[pet-ai-payments] 이니시스 SDK 사전로드 실패(결제 시도 시 재시도됨)', e));
