// =====================================================
// Aliascall — 종단간 암호화(E2EE) 공용 유틸리티
// 2026-08-21 신설.
//
// 원리: AES-256-GCM(브라우저 내장 WebCrypto 사용, 외부 라이브러리 불필요)으로 문자/파일을
// 암호화함. 키는 이 파일이 절대 서버로 보내지 않고, 항상 호출하는 쪽(hotline_purchase.html,
// hotline_join.html, hotline_room.html 등)이 URL의 #뒷부분이나 로컬 저장소에서 가져와서
// 넘겨줌 — 이 파일 자체는 키를 어디서 가져오는지 전혀 모르고, 그냥 "암호화/복호화" 계산만 함.
//
// 데이터 형식: 암호문은 항상 "IV(12바이트) + 실제 암호문"을 이어붙인 뒤 base64로 인코딩한
// 문자열 하나로 다룸 — DB의 content 컬럼(text)에 그대로 저장 가능하게 하기 위함.
// =====================================================

// ── base64url 인코딩/디코딩 (URL의 #뒷부분에 안전하게 넣기 위해 표준 base64 대신 사용) ──
function _e2eeBytesToBase64Url(bytes){
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function _e2eeBase64UrlToBytes(b64url){
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── 방을 새로 만들 때 딱 한 번 호출 — 새 암호키를 생성해서 base64url 문자열로 반환 ──
async function e2eeGenerateKeyBase64(){
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key);
  return _e2eeBytesToBase64Url(new Uint8Array(raw));
}

// ── base64url 문자열(URL #뒷부분에서 읽어온 값)을 실제 사용 가능한 키 객체로 변환 ──
async function e2eeImportKey(base64urlKey){
  const raw = _e2eeBase64UrlToBytes(base64urlKey);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// ── 문자 암호화/복호화 ──
async function e2eeEncryptText(cryptoKey, plaintext){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encoded);
  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.length);
  return _e2eeBytesToBase64Url(combined); // DB에 이 문자열 그대로 저장
}

async function e2eeDecryptText(cryptoKey, base64urlBlob){
  const combined = _e2eeBase64UrlToBytes(base64urlBlob);
  const iv = combined.slice(0, 12);
  const cipherBytes = combined.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, cipherBytes);
  return new TextDecoder().decode(plainBuf);
}

// ── 파일(사진/동영상/문서) 암호화/복호화 — ArrayBuffer 단위로 다룸 ──
async function e2eeEncryptBytes(cryptoKey, arrayBuffer){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, arrayBuffer);
  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.length);
  return combined; // Uint8Array — 이걸 그대로 업로드함(파일 자체가 암호화된 채로 저장됨)
}

async function e2eeDecryptBytes(cryptoKey, combinedBytes){
  const iv = combinedBytes.slice(0, 12);
  const cipherBytes = combinedBytes.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, cipherBytes);
  return plainBuf; // ArrayBuffer — Blob으로 감싸서 화면에 표시하면 됨
}

// ── 큰 파일(최대 80MB)을 base64로 안전하게 변환 — 한 번에 처리하면 브라우저가 멈출 수 있어
// 32KB씩 나눠서 처리함. 기존 업로드 API가 기대하는 표준 base64 형식(base64url 아님)으로 반환. ──
function e2eeBytesToStandardBase64(bytes){
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ── 이 상품(tier)이 종단간 암호화 대상인지 판단하는 공용 헬퍼 ──
function isSecureTier(tier){
  return typeof tier === 'string' && tier.endsWith('_secure');
}

// ── URL의 #뒷부분에서 키를 읽어옴 (예: ...html?t=xxx#k=여기가키) ──
function e2eeReadKeyFromUrlFragment(){
  const hash = window.location.hash || '';
  const match = hash.match(/[#&]k=([^&]+)/);
  return match ? match[1] : null;
}
