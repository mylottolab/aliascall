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

// ── 이니시스 결제 시작 (INIpay PRO, 모바일표준결제 P_ 파라미터 방식) ──
// ⚠ 이 부분(폼 필드명·게이트웨이 주소)은 이니시스 공식 연동 가이드의 "모바일표준결제"
// 규격을 기준으로 재구성한 것입니다. 실제 결제 전에 반드시 이니시스 테스트(TEST) 모드로
// 먼저 결제 흐름을 검증해보시길 권장드립니다 (금액 위변조 방지 서명이 안 맞으면 이니시스
// 쪽에서 바로 에러를 띄워주기 때문에, 틀렸다면 실제 결제 전에 확인하실 수 있어요).
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

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = 'https://mobile.inicis.com/smart/payment/';
  form.acceptCharset = 'UTF-8';
  const fields = {
    P_INI_PAYMENT: 'CARD',
    P_MID: data.mid,
    P_OID: data.oid,
    P_AMT: data.amt,
    P_GOODS: goodname,
    P_UNAME: buyername,
    P_MOBILE: buyertel || '',
    P_EMAIL: buyeremail || '',
    P_NEXT_URL: data.nextUrl,
    P_NOTI_URL: data.notiUrl,
    P_HPP_METHOD: '1',
    P_CHARSET: 'UTF-8',
    P_TIMESTAMP: data.timestamp,
    P_CHKFAKE: data.chkfake,
    P_CLOSE_URL: data.closeUrl,
  };
  for (const [k, v] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden'; input.name = k; input.value = v;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
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
