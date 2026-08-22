// =====================================================
// Aliascall — 확대 가능한 사진 뷰어 공용 함수
// 2026-08-22 신설.
//
// 기존엔 화면 크기에 딱 맞추기만 하고 그 이상 확대가 안 됐음. 이제:
//   - 모바일: 두 손가락 핀치줌, 더블탭으로 확대/축소 토글, 확대된 상태에서 한 손가락 드래그로 이동
//   - PC: 마우스 휠로 확대/축소
// =====================================================

(function(){
  if (document.getElementById('aliascallZoomStyle')) return; // 여러 화면에서 중복 로드돼도 스타일은 한 번만
  const style = document.createElement('style');
  style.id = 'aliascallZoomStyle';
  style.textContent = `
    .azl-viewport{ width:100%; height:100%; max-height:85vh; overflow:hidden; display:flex; align-items:center; justify-content:center; touch-action:none; }
    .azl-img{ max-width:100%; max-height:85vh; border-radius:8px; cursor:zoom-in; user-select:none; -webkit-user-select:none; }
    .azl-img.zoomed{ cursor:grab; }
    .azl-hint{ position:absolute; bottom:14px; left:0; right:0; text-align:center; font-size:11px; color:rgba(255,255,255,.6); pointer-events:none; }
  `;
  document.head.appendChild(style);
})();

function aliascallShowZoomableImage(contentEl, imageUrl){
  contentEl.innerHTML = `
    <div class="azl-viewport">
      <img class="azl-img" src="${imageUrl}" draggable="false">
    </div>
    <div class="azl-hint">더블탭 또는 손가락 두 개로 확대해보세요</div>
  `;
  const viewport = contentEl.querySelector('.azl-viewport');
  const img = contentEl.querySelector('.azl-img');

  let scale = 1;
  const minScale = 1, maxScale = 4;
  let tx = 0, ty = 0;
  let lastTapTime = 0;

  function applyTransform(){
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    img.classList.toggle('zoomed', scale > 1);
  }
  function clamp(){
    if (scale < minScale) scale = minScale;
    if (scale > maxScale) scale = maxScale;
    if (scale === 1) { tx = 0; ty = 0; }
  }
  function toggleZoom(clientX, clientY){
    const rect = viewport.getBoundingClientRect();
    if (scale === 1) {
      scale = 2.5;
      const offsetX = clientX - rect.left - rect.width / 2;
      const offsetY = clientY - rect.top - rect.height / 2;
      tx = -offsetX * (scale - 1);
      ty = -offsetY * (scale - 1);
    } else {
      scale = 1; tx = 0; ty = 0;
    }
    clamp();
    applyTransform();
  }

  // ── 더블탭/더블클릭으로 확대·축소 토글 ──
  img.addEventListener('dblclick', (e) => { e.stopPropagation(); toggleZoom(e.clientX, e.clientY); });
  img.addEventListener('click', (e) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTapTime < 300) toggleZoom(e.clientX, e.clientY);
    lastTapTime = now;
  });

  // ── 핀치줌 + (확대된 상태에서) 한 손가락 드래그 이동 ──
  let touchState = null;
  viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const [t1, t2] = e.touches;
      touchState = {
        mode: 'pinch',
        startDist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
        startScale: scale,
      };
    } else if (e.touches.length === 1 && scale > 1) {
      touchState = { mode: 'pan', startX: e.touches[0].clientX - tx, startY: e.touches[0].clientY - ty };
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', (e) => {
    if (!touchState) return;
    if (touchState.mode === 'pinch' && e.touches.length === 2) {
      const [t1, t2] = e.touches;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      scale = touchState.startScale * (dist / touchState.startDist);
      clamp();
      applyTransform();
      e.preventDefault();
    } else if (touchState.mode === 'pan' && e.touches.length === 1) {
      tx = e.touches[0].clientX - touchState.startX;
      ty = e.touches[0].clientY - touchState.startY;
      applyTransform();
      e.preventDefault();
    }
  }, { passive: false });

  viewport.addEventListener('touchend', () => { touchState = null; clamp(); applyTransform(); });

  // ── PC: 마우스 휠로 확대/축소 ──
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    scale += (e.deltaY < 0 ? 0.25 : -0.25);
    clamp();
    applyTransform();
  }, { passive: false });

  applyTransform();
}
