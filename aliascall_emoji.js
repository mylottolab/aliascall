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

// 카테고리 구분(픽커에서 탭으로 넘나들 수 있게) — 이모지 자체는 위 ALIASCALL_EMOJI_MAP과 동일
const ALIASCALL_EMOJI_CATEGORIES = [
  { name: '표정', icon: '😀', chars: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','🥱','😴','😔','😢','😭','😤','😠','😡','🤯','😱','😨','😰','😓','🤗','🤭','🤫','🤥','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😲','😳','🥺','😬','🤤','😈','👿','💀','☠️','👻','👽','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾'] },
  { name: '손·사람', icon: '👋', chars: ['👍','👎','👏','🙌','🙏','💪','🤝','✌️','🤞','👌','🤟','🤘','👊','✊','👋','🤙','👈','👉','👆','👇','☝️','✋','🖐️','🖖','👀','👶','🧒','👦','👧','🧑','👨','👩','🧓','👴','👵','👮','🕵️','👷','💂','👨‍⚕️','👩‍⚕️','👨‍🏫','👩‍🏫','👨‍💻','👩‍💻','🧑‍🎓','🧑‍🍳','🤴','👸','🤵','👰','🤰','🤱'] },
  { name: '마음', icon: '❤️', chars: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟','💯','💢','💥','💫','💦','💨','🕳️','💬','🗨️','🗯️','💭','💤'] },
  { name: '동물', icon: '🐶', chars: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐢','🐍','🦎','🐙','🦑','🦀','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐆','🦓','🦍','🐘','🦛','🦒','🐫','🦘','🐕','🐈','🐓','🦃','🦚','🦜','🐇','🐿️'] },
  { name: '자연', icon: '🌸', chars: ['🌸','💐','🌷','🌹','🌻','🌼','🌱','🌲','🌳','🌴','🌵','🌾','🍀','🍁','🍂','🍃','🌿','☘️','🌊','🔥','💧','☀️','🌤️','⛅','🌥️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','🌪️','🌈','☔','⚡','🌙','⭐','🌟','✨','☄️','🌍','🌎','🌏'] },
  { name: '음식', icon: '🍔', chars: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🌮','🌯','🥗','🍿','🧂','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🍤','🍙','🍚','🍘','🍥','🥟','🍡','🍧','🍨','🍦','🥧','🍰','🎂','🧁','🍮','🍭','🍬','🍫','🍩','🍪','🌰','🥜','🍯','🥛','🍼','☕','🍵','🧃','🥤','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🍾'] },
  { name: '활동', icon: '⚽', chars: ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥅','⛳','🏹','🎣','🥊','🥋','🎽','🛹','🛼','🎿','⛷️','🏂','🏋️','🤼','🤸','⛹️','🤾','🏄','🏊','🤽','🚣','🧗','🚴','🚵','🏆','🥇','🥈','🥉','🎖️','🏅','🎗️','🎫','🎟️','🎪','🤹','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎲','🧩','🚗','🚕','🚙','🚌','🚓','🚑','🚒','🚚','🚲','🛵','🏍️','✈️','🚀','🛸','🚁','⛵','🚤','🛳️','⚓','🏝️','🏔️','🗽','🗼','🏰','🎡','🎢','🎠'] },
  { name: '사물', icon: '💡', chars: ['💡','🔦','🕯️','📱','💻','⌨️','🖥️','🖨️','🖱️','📷','📸','📹','🎥','📺','📻','⏰','⏱️','⏲️','🕰️','⌚','📚','📖','📕','📗','📘','📙','📔','📓','📒','📝','✏️','🖊️','🖋️','🖌️','📌','📍','✂️','🔒','🔓','🔑','🗝️','🔨','🛠️','🔧','⚙️','⛏️','⚗️','🧪','🔬','🔭','📡','💊','💉','🩹','🚪','🪑','🛏️','🛋️','🚿','🛁','🧴','🧼','🧻','🎁','🎈','🎀','🎊','🎉','🎄','🎃','🧧','💌','📩','📮','📦','📫','🕐','💰','💵','💳','💎','⚖️','🔔','🔕','📢','📣','📯','🚩','🏳️','🏴','🏁','🚦','⛔','🔞','📵','🚭','♻️','✅','❌','❓','❗','⚠️','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪'] },
];

const ALIASCALL_EMOJI_MAP = {};
ALIASCALL_EMOJI_CATEGORIES.forEach((cat) => {
  cat.chars.forEach((e) => {
    if (ALIASCALL_EMOJI_MAP[e]) return; // 중복 방지
    const cps = Array.from(e).filter((c) => c.codePointAt(0) !== 0xFE0F && c.codePointAt(0) !== 0x200D);
    const hexcode = cps.map((c) => c.codePointAt(0).toString(16)).join('_');
    ALIASCALL_EMOJI_MAP[e] = hexcode;
  });
});
// 긴 시퀀스(변형선택자 포함)를 먼저 매칭해야 하므로 길이 내림차순으로 정렬해둠
const ALIASCALL_EMOJI_KEYS_BY_LENGTH = Object.keys(ALIASCALL_EMOJI_MAP).sort((a, b) => b.length - a.length);

function aliascallEmojiGifUrl(char){
  const code = ALIASCALL_EMOJI_MAP[char];
  return code ? `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.gif` : null;
}

// 선택 패널을 컨테이너에 채워 넣음 — 카테고리 탭 + 그 카테고리의 이모지 그리드.
// 이모지를 누르면 onPick(문자)를 호출함
function renderAliascallEmojiPanel(containerEl, onPick){
  let activeCategoryIdx = 0;

  function renderGrid(){
    const cat = ALIASCALL_EMOJI_CATEGORIES[activeCategoryIdx];
    const grid = containerEl.querySelector('.aliascall-emoji-grid');
    grid.innerHTML = cat.chars.map((char) => {
      const url = aliascallEmojiGifUrl(char);
      return `<button type="button" data-char="${char}" class="aliascall-emoji-btn"><img src="${url}" alt="${char}" loading="lazy"></button>`;
    }).join('');
    grid.querySelectorAll('.aliascall-emoji-btn').forEach((btn) => {
      const img = btn.querySelector('img');
      img.addEventListener('error', () => { btn.innerHTML = btn.dataset.char; }, { once: true }); // 혹시 특정 이모지 GIF가 없으면 글자로 대체
      btn.addEventListener('click', () => onPick(btn.dataset.char));
    });
  }

  const tabsHtml = ALIASCALL_EMOJI_CATEGORIES.map((cat, i) => `<button type="button" class="aliascall-emoji-tab${i === 0 ? ' active' : ''}" data-idx="${i}">${cat.icon}</button>`).join('');
  containerEl.innerHTML =
    `<div class="aliascall-emoji-tabs">${tabsHtml}</div>` +
    `<div class="aliascall-emoji-grid"></div>` +
    `<div class="aliascall-emoji-credit">이모지: Google Noto Emoji · CC BY 4.0</div>`;

  containerEl.querySelectorAll('.aliascall-emoji-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      containerEl.querySelectorAll('.aliascall-emoji-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      activeCategoryIdx = Number(tab.dataset.idx);
      renderGrid();
    });
  });

  renderGrid();
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
