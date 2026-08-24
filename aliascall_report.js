// =====================================================
// Aliascall — 신고 기능 공용 스크립트
// 2026-08-24 신설.
//
// 사건함 / 핫라인 대화방 / 찾습니다 게시판 세 곳에서 공용으로 씀.
// 각 화면에서 <script src="aliascall_report.js"></script> 로 불러온 뒤,
// 신고 버튼을 만들 자리에 아래처럼 호출하면 됨:
//
//   aliascallReportButton({ context: 'case',    targetId: caseId })
//   aliascallReportButton({ context: 'hotline', targetId: hotlineId })
//   aliascallReportButton({ context: 'board',   targetId: postId })
//
// 반환값은 <button> 엘리먼트. appendChild로 원하는 곳에 붙이면 됨.
// 또는 이미 만들어둔 버튼의 클릭 핸들러에서 직접 열 수도 있음:
//
//   myButton.onclick = () => aliascallOpenReport({ context:'case', targetId: caseId });
// =====================================================

const REPORT_FN_URL = 'https://qmwaraittiurkynszjts.supabase.co/functions/v1/aliascall-report-submit';

const ALIASCALL_REPORT_REASONS = [
  { value: 'sexual',   label: '음란물 · 성적인 콘텐츠' },
  { value: 'violence', label: '폭력 · 위협' },
  { value: 'abuse',    label: '욕설 · 괴롭힘' },
  { value: 'spam',     label: '스팸 · 광고' },
  { value: 'fraud',    label: '사기 · 금전 요구' },
  { value: 'privacy',  label: '개인정보 노출' },
  { value: 'other',    label: '기타' },
];

// ── 스타일 주입 (한 번만) ──
function _injectReportStyle(){
  if (document.getElementById('aliascall-report-style')) return;
  const style = document.createElement('style');
  style.id = 'aliascall-report-style';
  style.textContent = `
    .ac-report-btn {
      background: none; border: none; cursor: pointer;
      color: #b9483a; font-size: 13px; padding: 6px 10px;
      border-radius: 8px; opacity: .85;
    }
    .ac-report-btn:hover { background: rgba(185,72,58,.08); opacity: 1; }

    .ac-report-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.5);
      display: flex; align-items: center; justify-content: center;
      z-index: 99999; padding: 16px;
      padding-top: calc(16px + env(safe-area-inset-top, 0px));
      padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    }
    .ac-report-modal {
      background: #fff; color: #222; border-radius: 16px;
      width: 100%; max-width: 420px; max-height: 100%;
      overflow-y: auto; padding: 20px;
      box-shadow: 0 12px 40px rgba(0,0,0,.3);
    }
    .ac-report-title { font-size: 18px; font-weight: 700; margin: 0 0 6px; }
    .ac-report-desc  { font-size: 13px; color: #666; margin: 0 0 16px; line-height: 1.5; }
    .ac-report-reason { display: block; padding: 10px 12px; margin-bottom: 6px;
      border: 1px solid #e3e3e3; border-radius: 10px; cursor: pointer; font-size: 14px; }
    .ac-report-reason:has(input:checked) { border-color: #b9483a; background: #fdf3f1; }
    .ac-report-reason input { margin-right: 8px; }
    .ac-report-detail {
      width: 100%; box-sizing: border-box; margin-top: 10px; padding: 10px;
      border: 1px solid #e3e3e3; border-radius: 10px; font-size: 14px;
      font-family: inherit; resize: vertical; min-height: 70px;
    }
    .ac-report-actions { display: flex; gap: 8px; margin-top: 16px; }
    .ac-report-actions button {
      flex: 1; padding: 12px; border-radius: 10px; font-size: 15px;
      font-weight: 600; cursor: pointer; border: none;
    }
    .ac-report-cancel  { background: #f0f0f0; color: #444; }
    .ac-report-submit  { background: #b9483a; color: #fff; }
    .ac-report-submit:disabled { opacity: .55; cursor: default; }
    .ac-report-done { text-align: center; padding: 24px 8px; }
    .ac-report-done .ac-emoji { font-size: 40px; }
  `;
  document.head.appendChild(style);
}

// ── 신고 모달 열기 ──
function aliascallOpenReport(opts){
  const { context, targetId, messageId } = opts || {};
  if (!context || !targetId) {
    console.error('[report] context, targetId가 필요합니다.', opts);
    return;
  }

  _injectReportStyle();

  const backdrop = document.createElement('div');
  backdrop.className = 'ac-report-backdrop';

  const reasonsHtml = ALIASCALL_REPORT_REASONS.map((r, i) => `
    <label class="ac-report-reason">
      <input type="radio" name="acReportReason" value="${r.value}"${i === 0 ? '' : ''}>
      ${r.label}
    </label>`).join('');

  backdrop.innerHTML = `
    <div class="ac-report-modal" role="dialog" aria-modal="true">
      <h3 class="ac-report-title">🚩 신고하기</h3>
      <p class="ac-report-desc">
        부적절한 내용을 발견하셨나요? 확인 후 조치하겠습니다.<br>
        신고 내용은 신고당한 상대에게 알려지지 않습니다.
      </p>
      <div id="acReportReasons">${reasonsHtml}</div>
      <textarea class="ac-report-detail" id="acReportDetail"
        placeholder="어떤 점이 문제였는지 적어주세요 (선택)" maxlength="1000"></textarea>
      <div class="ac-report-actions">
        <button type="button" class="ac-report-cancel" id="acReportCancel">취소</button>
        <button type="button" class="ac-report-submit" id="acReportSubmit" disabled>신고 접수</button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);

  const submitBtn = backdrop.querySelector('#acReportSubmit');
  const cancelBtn = backdrop.querySelector('#acReportCancel');

  // 사유를 골라야 접수 버튼이 활성화됨
  backdrop.querySelector('#acReportReasons').addEventListener('change', () => {
    submitBtn.disabled = !backdrop.querySelector('input[name="acReportReason"]:checked');
  });

  const close = () => backdrop.remove();
  cancelBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  submitBtn.addEventListener('click', async () => {
    const reason = backdrop.querySelector('input[name="acReportReason"]:checked')?.value;
    if (!reason) return;

    submitBtn.disabled = true;
    submitBtn.textContent = '접수 중…';

    try {
      const headers = { 'Content-Type': 'application/json' };

      // 로그인 상태면 토큰을 실어 보냄 (발견자는 비로그인이라 없을 수 있음)
      try {
        if (typeof sb !== 'undefined' && sb?.auth?.getSession) {
          const { data: { session } } = await sb.auth.getSession();
          if (session) headers.Authorization = 'Bearer ' + session.access_token;
        }
      } catch (_) { /* 비로그인 — 그대로 진행 */ }

      const res = await fetch(REPORT_FN_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          context,
          targetId,
          messageId: messageId || null,
          reason,
          detail: backdrop.querySelector('#acReportDetail').value.trim() || null,
          sourceUrl: location.href,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || '접수 실패');

      backdrop.querySelector('.ac-report-modal').innerHTML = `
        <div class="ac-report-done">
          <div class="ac-emoji">✅</div>
          <h3 class="ac-report-title">신고가 접수되었습니다</h3>
          <p class="ac-report-desc">${json.message || '확인 후 조치하겠습니다.'}</p>
          <button type="button" class="ac-report-submit" id="acReportClose"
            style="width:100%">확인</button>
        </div>`;
      backdrop.querySelector('#acReportClose').addEventListener('click', close);

    } catch (e) {
      console.error('[report] 신고 실패', e);
      alert('신고 접수 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.');
      submitBtn.disabled = false;
      submitBtn.textContent = '신고 접수';
    }
  });
}

// ── 신고 버튼 엘리먼트 만들기 ──
// 원하는 자리에 appendChild 해서 쓰면 됨.
function aliascallReportButton(opts){
  _injectReportStyle();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ac-report-btn';
  btn.textContent = opts?.label || '🚩 신고';
  btn.addEventListener('click', () => aliascallOpenReport(opts));
  return btn;
}
