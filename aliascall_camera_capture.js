// =====================================================
// Aliascall — 브라우저 내장 카메라 직접 촬영 공용 모듈
// 2026-08-22 신설.
//
// ⚠ <input type="file" capture> 방식은 모바일에서만 실제 카메라 앱이 열리고, 노트북/PC
// 브라우저에서는 대부분 그냥 무시되고 파일탐색기가 열림 — 그래서 이 방식 대신, 영상통화
// 때 이미 쓰던 것과 같은 방식(getUserMedia로 카메라 스트림 직접 열기)으로 만듦. 이러면
// 모바일 후면카메라든 노트북 웹캠이든 항상 실제로 카메라 화면이 뜸.
// =====================================================

(function(){
  if (document.getElementById('aliascallCameraStyle')) return;
  const style = document.createElement('style');
  style.id = 'aliascallCameraStyle';
  style.textContent = `
    .acc-overlay{ display:none; position:fixed; inset:0; background:#000; z-index:500; flex-direction:column; align-items:center; justify-content:center; }
    .acc-overlay.show{ display:flex; }
    .acc-video, .acc-preview{ max-width:100%; max-height:80vh; }
    .acc-status{ color:#fff; font-size:13px; margin-bottom:12px; }
    .acc-controls{ display:flex; align-items:center; gap:28px; padding:22px 0; }
    .acc-shutter{ width:64px; height:64px; border-radius:50%; background:#fff; border:4px solid rgba(255,255,255,.4); cursor:pointer; }
    .acc-cancel, .acc-switch{ width:44px; height:44px; border-radius:50%; background:rgba(255,255,255,.15); color:#fff; border:none; font-size:18px; cursor:pointer; }
    .acc-confirm-controls{ display:none; gap:14px; padding:18px 0; }
    .acc-confirm-controls button{ padding:12px 22px; border-radius:10px; border:none; font-weight:700; font-size:13px; cursor:pointer; }
    .acc-retake{ background:rgba(255,255,255,.15); color:#fff; }
    .acc-send{ background:#1F6F6B; color:#fff; }
  `;
  document.head.appendChild(style);
})();

function _aliascallEnsureCameraOverlay(){
  if (document.getElementById('aliascallCameraOverlay')) return; // 이미 만들어져 있으면 중복 생성 안 함
  const overlay = document.createElement('div');
  overlay.className = 'acc-overlay';
  overlay.id = 'aliascallCameraOverlay';
  overlay.innerHTML = `
    <div class="acc-status" id="aliascallCameraStatus">카메라를 여는 중…</div>
    <video class="acc-video" id="aliascallCameraVideo" autoplay playsinline muted></video>
    <img class="acc-preview" id="aliascallCameraPreview" style="display:none;">
    <canvas id="aliascallCameraCanvas" style="display:none;"></canvas>
    <div class="acc-controls" id="aliascallCameraLiveControls">
      <button class="acc-cancel" id="aliascallCameraCancel" title="취소">✕</button>
      <button class="acc-shutter" id="aliascallCameraShutter" title="촬영"></button>
      <button class="acc-switch" id="aliascallCameraSwitch" title="전후면 전환">🔄</button>
    </div>
    <div class="acc-confirm-controls" id="aliascallCameraConfirmControls">
      <button class="acc-retake" id="aliascallCameraRetake">다시 찍기</button>
      <button class="acc-send" id="aliascallCameraSend">보내기</button>
    </div>
  `;
  document.body.appendChild(overlay);

  // 버튼 이벤트는 여기서 딱 한 번만 연결(오버레이가 방금 새로 만들어졌을 때만)
  document.getElementById('aliascallCameraCancel').addEventListener('click', _aliascallCloseCameraCapture);
  document.getElementById('aliascallCameraSwitch').addEventListener('click', async () => {
    _aliascallCameraFacing = _aliascallCameraFacing === 'environment' ? 'user' : 'environment';
    await _aliascallStartCameraStream();
  });
  document.getElementById('aliascallCameraShutter').addEventListener('click', () => {
    const video = document.getElementById('aliascallCameraVideo');
    const canvas = document.getElementById('aliascallCameraCanvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const preview = document.getElementById('aliascallCameraPreview');
    preview.src = canvas.toDataURL('image/jpeg', 0.92);
    video.style.display = 'none';
    preview.style.display = 'block';
    document.getElementById('aliascallCameraLiveControls').style.display = 'none';
    document.getElementById('aliascallCameraConfirmControls').style.display = 'flex';
  });
  document.getElementById('aliascallCameraRetake').addEventListener('click', () => {
    const video = document.getElementById('aliascallCameraVideo');
    const preview = document.getElementById('aliascallCameraPreview');
    video.style.display = 'block';
    preview.style.display = 'none';
    document.getElementById('aliascallCameraLiveControls').style.display = 'flex';
    document.getElementById('aliascallCameraConfirmControls').style.display = 'none';
  });
  document.getElementById('aliascallCameraSend').addEventListener('click', () => {
    const canvas = document.getElementById('aliascallCameraCanvas');
    canvas.toBlob((blob) => {
      if (blob && _aliascallCameraOnCapture) {
        const file = new File([blob], 'camera_' + Date.now() + '.jpg', { type: 'image/jpeg' });
        _aliascallCameraOnCapture(file);
      }
      _aliascallCloseCameraCapture();
    }, 'image/jpeg', 0.92);
  });
}

let _aliascallCameraStream = null;
let _aliascallCameraFacing = 'environment';
let _aliascallCameraOnCapture = null;

async function _aliascallStartCameraStream(){
  const statusEl = document.getElementById('aliascallCameraStatus');
  const video = document.getElementById('aliascallCameraVideo');
  if (_aliascallCameraStream) { _aliascallCameraStream.getTracks().forEach((t) => t.stop()); }
  try {
    _aliascallCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: _aliascallCameraFacing }, audio: false });
  } catch (e) {
    try {
      // 일부 노트북은 facingMode 자체를 지원 안 해서 실패할 수 있음 — 그냥 아무 카메라나 요청
      _aliascallCameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (e2) {
      statusEl.textContent = '카메라를 열 수 없어요. 권한을 확인해주세요.';
      return false;
    }
  }
  video.srcObject = _aliascallCameraStream;
  statusEl.textContent = '';
  return true;
}

function _aliascallStopCameraStream(){
  if (_aliascallCameraStream) { _aliascallCameraStream.getTracks().forEach((t) => t.stop()); _aliascallCameraStream = null; }
}

// onCapture(file)가 호출되면 촬영된 사진(File 객체, image/jpeg)을 넘겨줌
async function aliascallOpenCameraCapture(onCapture){
  _aliascallEnsureCameraOverlay(); // 처음 쓰는 순간에 오버레이를 만듦(body가 준비된 뒤에 호출되니 안전함)
  _aliascallCameraOnCapture = onCapture;
  const overlay = document.getElementById('aliascallCameraOverlay');
  const video = document.getElementById('aliascallCameraVideo');
  const preview = document.getElementById('aliascallCameraPreview');
  overlay.classList.add('show');
  video.style.display = 'block';
  preview.style.display = 'none';
  document.getElementById('aliascallCameraLiveControls').style.display = 'flex';
  document.getElementById('aliascallCameraConfirmControls').style.display = 'none';
  await _aliascallStartCameraStream();
}

function _aliascallCloseCameraCapture(){
  _aliascallStopCameraStream();
  document.getElementById('aliascallCameraOverlay').classList.remove('show');
}
