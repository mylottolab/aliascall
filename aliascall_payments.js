// =====================================================
// Aliascall — 결제 공용 헬퍼 (구독 결제 + 포인트 충전에서 공용으로 사용)
// aliascall_recharge_mockup.html / aliascall_my_account.html /
// aliascall_registration_mockup.html 세 곳에서 <script src="aliascall_payments.js">
// 로 불러다 씀. sb(supabase 클라이언트)는 각 페이지에서 이미 만들어둔 걸 그대로 전달.
// =====================================================

const PAYMENTS_FN_BASE = 'https://qmwaraittiurkynszjts.supabase.co/functions/v1';

async function _getAuthToken(sb){
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token || null;
}

// ── 이니시스 결제 시작 (INIpay PRO 공식 SDK 방식) ──
// ⚠ 2026-08-19 수정: 처음엔 이니시스 공식 SDK 코드를 못 받아서 "모바일표준결제 P_ 파라미터를
// 수동으로 폼에 담아 mobile.inicis.com에 직접 POST하는" 방식으로 추측 구현했었는데, 이게 실제
// 이니시스 스펙과 안 맞아서 결제창 자체가 안 뜨고 바로 실패했음. PaperLotto의 실제 작동 코드를
// 받아서 확인해보니, INIPayPro_v2.js라는 공식 SDK를 로드해서 INIPayPro.requestPayment(...) 함수를
// 직접 호출하는 방식이었음 — 이제 그 방식 그대로 이식함.
let _iniPaySdkLoaded = false;
let _iniPaySdkLoading = null;

function _loadIniPaySdk(){
  if (_iniPaySdkLoaded) return Promise.resolve();
  if (_iniPaySdkLoading) return _iniPaySdkLoading;
  _iniPaySdkLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://paypro.inicis.com/std/payment/js/INIPayPro_v2.js';
    script.charset = 'UTF-8';
    script.onload = () => { _iniPaySdkLoaded = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return _iniPaySdkLoading;
}

async function startInicisPayment(sb, opts){
  const { purpose, price, goodname, buyername, buyertel, buyeremail, months, returnPage } = opts;
  const token = await _getAuthToken(sb);
  if (!token) { alert('로그인이 필요합니다.'); return; }

  let data;
  try {
    const res = await fetch(`${PAYMENTS_FN_BASE}/aliascall-inicis-prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ purpose, price, goodname, buyername, buyertel, buyeremail, months, returnPage }),
    });
    data = await res.json();
    if (!res.ok) { alert(data.error || '결제 준비에 실패했어요.'); return; }
  } catch (e) {
    console.error('[payments] 이니시스 준비 요청 실패', e);
    alert('결제 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
    return;
  }

  try {
    await _loadIniPaySdk();
  } catch (e) {
    console.error('[payments] 이니시스 SDK 로드 실패', e);
    alert('결제 모듈을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
    return;
  }

  // PC/모바일 자동 감지 (INIpay PRO는 이 값 하나로 PC/모바일 결제창을 구분함)
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

// ── PayPal 버튼 렌더링 (충전/구독 공용) ──
// containerId: 버튼을 그릴 <div id="..."> / opts: { purpose, usdAmount, months }
// onSuccess(data): 결제 성공 후 호출할 콜백
async function renderPayPalButtons(sb, containerId, opts, onSuccess){
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';

  let idData;
  try {
    const idRes = await fetch(`${PAYMENTS_FN_BASE}/aliascall-paypal-client-id`);
    idData = await idRes.json();
    if (!idRes.ok) throw new Error(idData.error || 'client-id 조회 실패');
  } catch (e) {
    console.error('[payments] PayPal client-id 조회 실패', e);
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
      const token = await _getAuthToken(sb);
      if (!token) { alert('로그인이 필요합니다.'); throw new Error('no session'); }
      const res = await fetch(`${PAYMENTS_FN_BASE}/aliascall-paypal-create-order`, {
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
        const res = await fetch(`${PAYMENTS_FN_BASE}/aliascall-paypal-capture-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderID: dataApprove.orderID }),
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error || '결제 승인에 실패했어요.'); return; }
        if (onSuccess) onSuccess(data);
      } catch (e) {
        console.error('[payments] PayPal capture 실패', e);
        alert('결제 승인 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
      }
    },
    onError: (err) => {
      console.error('[payments] PayPal 버튼 오류', err);
      alert('PayPal 결제 중 오류가 발생했어요.');
    },
  }).render('#' + containerId);
}
