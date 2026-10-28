/* 🔴 2026-10-29 — 소통함 · 알림 띠에서 1회용 임시연락처 건 이름 바로잡기
   예전: 임시연락처로 온 연락은 등록물 제목이 없어 "등록물"로만 보였습니다.
   지금: 발급할 때 적은 "나만 보는 이름표"를 보여 주고, 비어 있으면 "임시발급 상대"로 보여 줍니다.
   쓰는 법: const names = await acTempNames(sb, data.cases);  →  names[caseId] 가 있으면 그 이름을 씁니다. */
(function(){
  function en(){ try { return (localStorage.getItem('aliascall_lang') || '').indexOf('en') === 0; } catch (e) { return false; } }
  window.acTempFallback = function(){ return en() ? 'One-time contact' : '임시발급 상대'; };
  window.acTempNames = async function(sb, cases){
    const out = {};
    try {
      const ids = (cases || []).filter(c => c && c.caseId && (c.category === 'temp_contact' || !c.registrationTitle)).map(c => c.caseId);
      if (!ids.length || !sb) return out;
      const [cs, tc] = await Promise.all([
        sb.from('cases').select('id, registration_id').in('id', ids),
        sb.rpc('my_temp_cards'),
      ]);
      const cards = (tc && tc.data) || [];
      const byReg = {};
      cards.forEach(t => { if (t && t.registration_id) byReg[t.registration_id] = (t.label || '').trim() || window.acTempFallback(); });
      ((cs && cs.data) || []).forEach(r => { if (byReg[r.registration_id]) out[r.id] = byReg[r.registration_id]; });
      (cases || []).forEach(c => { if (c.category === 'temp_contact' && !out[c.caseId]) out[c.caseId] = window.acTempFallback(); });
    } catch (e) {}
    return out;
  };
})();
