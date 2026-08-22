// =====================================================
// Aliascall — 이모지 선택기 공용 데이터/함수
// 2026-08-22 신설.
//
// 애니메이션 이모지는 구글의 "Noto Animated Emoji" 프로젝트를 씀 (무료, CC BY 4.0 —
// 출처 표시 필요해서 패널 안에 작게 넣어둠). 공식 사이트: googlefonts.github.io/noto-emoji-animation
// 구글이 직접 운영하는 CDN(fonts.gstatic.com)에서 애니메이션 GIF를 그대로 가져다 씀.
//
// 동작 방식:
//   1) 선택 패널엔 움직이는 GIF로 보여줌(고르는 재미)
//   2) 실제로 채팅창에 입력될 때는 평범한 유니코드 문자로 들어감(기존 문자 저장/암호화
//      방식이 전혀 안 바뀌어도 됨 — 그냥 "그 이모지 하나만 있는 문자"일 뿐)
//   3) 메시지 내용이 "이모지 1~3개로만" 이루어져 있으면, 받는 쪽 화면에서 큰 애니메이션
//      스티커처럼 다시 보여줌 (카톡 이모티콘 전용 메시지처럼)
// =====================================================

const ALIASCALL_EMOJI_MAP = {
  '😀':'1f600', '😃':'1f603', '😄':'1f604', '😁':'1f601', '😆':'1f606', '😅':'1f605', '😂':'1f602', '🤣':'1f923',
  '😊':'1f60a', '😇':'1f607', '🙂':'1f642', '🙃':'1f643', '😉':'1f609', '😌':'1f60c', '😍':'1f60d', '🥰':'1f970',
  '😘':'1f618', '😗':'1f617', '😙':'1f619', '😚':'1f61a', '😋':'1f60b', '😛':'1f61b', '😝':'1f61d', '😜':'1f61c',
  '🤪':'1f92a', '🤔':'1f914', '🤨':'1f928', '😐':'1f610', '😑':'1f611', '😶':'1f636', '🙄':'1f644', '😏':'1f60f',
  '😣':'1f623', '😥':'1f625', '😮':'1f62e', '🤐':'1f910', '😯':'1f62f', '😪':'1f62a', '😫':'1f62b', '🥱':'1f971',
  '😴':'1f634', '😔':'1f614', '😢':'1f622', '😭':'1f62d', '😤':'1f624', '😠':'1f620', '😡':'1f621', '🤯':'1f92f',
  '😱':'1f631', '😨':'1f628', '😰':'1f630', '😓':'1f613', '🤗':'1f917', '🤭':'1f92d', '🤫':'1f92b', '🤥':'1f925',
  '😷':'1f637', '🥳':'1f973', '😎':'1f60e', '🤓':'1f913', '🧐':'1f9d0', '👍':'1f44d', '👎':'1f44e', '👏':'1f44f',
  '🙌':'1f64c', '🙏':'1f64f', '💪':'1f4aa', '🤝':'1f91d', '✌️':'270c', '🤞':'1f91e', '👌':'1f44c', '👋':'1f44b',
  '❤️':'2764', '🧡':'1f9e1', '💛':'1f49b', '💚':'1f49a', '💙':'1f499', '💜':'1f49c', '🖤':'1f5a4', '🤍':'1f90d',
  '💔':'1f494', '💯':'1f4af', '🔥':'1f525', '✨':'2728', '🎉':'1f389', '🎊':'1f38a', '⭐':'2b50', '🌟':'1f31f',
  '💤':'1f4a4', '☕':'2615', '🍀':'1f340', '🌸':'1f338', '🌈':'1f308', '🐶':'1f436', '🐱':'1f431', '🐰':'1f430', '🎂':'1f382',
};
// 긴 시퀀스(변형선택자 포함)를 먼저 매칭해야 하므로 길이 내림차순으로 정렬해둠
const ALIASCALL_EMOJI_KEYS_BY_LENGTH = Object.keys(ALIASCALL_EMOJI_MAP).sort((a, b) => b.length - a.length);

function aliascallEmojiGifUrl(char){
  const code = ALIASCALL_EMOJI_MAP[char];
  return code ? `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.gif` : null;
}

// 선택 패널을 컨테이너에 채워 넣고, 이모지를 누르면 onPick(문자)를 호출함
function renderAliascallEmojiPanel(containerEl, onPick){
  const items = Object.keys(ALIASCALL_EMOJI_MAP).map((char) => {
    const url = aliascallEmojiGifUrl(char);
    return `<button type="button" data-char="${char}" class="aliascall-emoji-btn"><img src="${url}" alt="${char}" loading="lazy"></button>`;
  }).join('');
  containerEl.innerHTML = items + '<div class="aliascall-emoji-credit">이모지: Google Noto Emoji · CC BY 4.0</div>';

  containerEl.querySelectorAll('.aliascall-emoji-btn').forEach((btn) => {
    const img = btn.querySelector('img');
    img.addEventListener('error', () => { btn.innerHTML = btn.dataset.char; }, { once: true }); // 혹시 특정 이모지 GIF가 없으면 글자로 대체
    btn.addEventListener('click', () => onPick(btn.dataset.char));
  });
}

// 메시지가 "이모지 1~3개로만" 이루어져 있으면, 각 이모지의 { char, url } 배열을 반환하고,
// 아니면(일반 문장이거나 4개 넘게 있으면) null을 반환함 — 호출한 쪽에서 null이면 그냥
// 보통 문자로 표시하면 됨
function aliascallExtractEmojiOnly(text){
  if (!text) return null;
  let remaining = text;
  const found = [];
  while (remaining.length > 0 && found.length <= 3) {
    const match = ALIASCALL_EMOJI_KEYS_BY_LENGTH.find((k) => remaining.startsWith(k));
    if (!match) return null;
    found.push({ char: match, url: aliascallEmojiGifUrl(match) });
    remaining = remaining.slice(match.length);
  }
  if (remaining.length > 0 || found.length === 0 || found.length > 3) return null;
  return found;
}
