// =====================================================
// Aliascall — hotline-lookup-by-token Edge Function
// 2026-08-21 신설. 초대 링크(invite_token)로 핫라인 기본 정보를 조회함 (익명, 읽기 전용).
//
// 2026-08-26 수정(v51): 전문관리용 3종을 TIER_LABEL에 추가.
//   빠져 있어서 참가 화면에 "undefined 핫라인"으로 표시되던 문제를 고침.
//
// ⚠ 전문관리용 방의 이름을 무엇으로 보여줄지 (중요)
//   client_label("김철수 의뢰인")은 개설자가 자기 구분용으로 붙인 메모입니다.
//   의뢰인 본인에게 "김철수 의뢰인"이라고 보이면 어색하고,
//   다른 의뢰인 이름이 노출될 위험도 있습니다.
//   → 참가자에게는 client_label을 절대 내려주지 않습니다.
//     방 제목(title)이 있으면 그것을, 없으면 업체명이나 등급 이름을 보여줍니다.
// =====================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TIER_LABEL: Record<string, string> = {
  hotline_1to1: '핫라인', hotline_everybody: '핫라인 에브리바디',
  economy_4: '이코노미', premium_4: '프리미엄',
  // 2026-08-21: Secure 4종도 빠져 있었음 — 함께 채움
  hotline_1to1_secure: '핫라인 Secure', hotline_everybody_secure: '핫라인 에브리바디 Secure',
  economy_4_secure: '이코노미 Secure', premium_4_secure: '프리미엄 Secure',
  // 2026-08-26 신설(v51): 전문관리용
  pro_starter: '상담', pro_business: '상담', pro_enterprise: '상담',
};

const PRO_TIERS = ['pro_starter', 'pro_business', 'pro_enterprise'];
const isProTier = (t: string) => PRO_TIERS.includes(t);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: CORS });

  try {
    const { inviteToken } = await req.json();
    if (!inviteToken) return new Response(JSON.stringify({ error: 'inviteToken이 필요합니다.' }), { status: 400, headers: CORS });

    // 2026-08-26: subscription_id 함께 조회 — 전문관리용이면 업체명을 찾아 쓰기 위함
    const { data: hotline, error } = await supabase
      .from('hotlines')
      .select('id, tier, title, status, max_participants, expires_at, subscription_id')
      .eq('invite_token', inviteToken)
      .maybeSingle();
    if (error || !hotline) {
      return new Response(JSON.stringify({ error: '유효하지 않은 초대 링크입니다.' }), { status: 404, headers: CORS });
    }

    const isExpired = new Date(hotline.expires_at) < new Date();
    if (hotline.status !== 'active' || isExpired) {
      return new Response(JSON.stringify({ error: '이 핫라인은 더 이상 사용할 수 없습니다 (기간 만료 또는 종료됨).' }), { status: 410, headers: CORS });
    }

    const { count: memberCount } = await supabase
      .from('hotline_members')
      .select('id', { count: 'exact', head: true })
      .eq('hotline_id', hotline.id).eq('status', 'approved');

    // ── 참가자에게 보여줄 방 이름 정하기 ──
    const tierLabel = TIER_LABEL[hotline.tier] || hotline.tier;
    let title = hotline.title;

    if (!title && isProTier(hotline.tier) && hotline.subscription_id) {
      // 업체명이 등록돼 있으면 그것을 씁니다. ("○○법률사무소")
      // ⚠ client_label은 절대 쓰지 않습니다. 개설자만 보는 메모입니다.
      const { data: sub } = await supabase
        .from('hotline_subscriptions')
        .select('business_name')
        .eq('id', hotline.subscription_id)
        .maybeSingle();
      if (sub?.business_name) title = sub.business_name;
    }

    if (!title) {
      // 전문관리용은 "상담 핫라인"보다 그냥 "상담"이 자연스럽습니다.
      title = isProTier(hotline.tier) ? tierLabel : (tierLabel + ' 핫라인');
    }

    return new Response(JSON.stringify({
      ok: true,
      hotlineId: hotline.id,
      title,
      tierLabel,
      tier: hotline.tier, // 2026-08-21 신설: join 화면에서 암호화 대상인지 판단할 때 씀
      maxParticipants: hotline.max_participants,
      currentMemberCount: memberCount || 0,
      isFull: (memberCount || 0) >= hotline.max_participants,
      // 2026-08-26 신설: 전문관리용은 자동 승인이라 화면 안내문이 달라야 함
      autoApprove: !!hotline.subscription_id,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error).message ?? err) }), { status: 500, headers: CORS });
  }
});
