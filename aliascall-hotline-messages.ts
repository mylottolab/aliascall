// =====================================================
// Aliascall — hotline-messages Edge Function
// 2026-08-21 신설. 대화방 진입시 이력 + 참가자 목록을 함께 가져옴.
//
// 2026-08-25 추가 (v50):
//   - isOwner : 화면이 개설자 전용 메뉴(자리비움·안내판 편집)를 보일지 판단
//   - away    : 자리비움 상태. 참가자는 비로그인이라 hotlines를 직접 못 읽으므로
//               여기서 함께 내려줌 (문구는 개설자에게만 — 참가자에겐 불필요)
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

async function resolveOwnerUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// 2026-08-26 수정: Secure 4종과 전문관리용 3종이 빠져 있어서
// 대화방 제목이 "undefined 핫라인"으로 뜨던 문제를 고침.
const TIER_LABEL: Record<string, string> = {
  hotline_1to1: '핫라인', hotline_everybody: '핫라인 에브리바디',
  economy_4: '이코노미', premium_4: '프리미엄',
  hotline_1to1_secure: '핫라인 Secure', hotline_everybody_secure: '핫라인 에브리바디 Secure',
  economy_4_secure: '이코노미 Secure', premium_4_secure: '프리미엄 Secure',
  pro_starter: '상담', pro_business: '상담', pro_enterprise: '상담',
};

const PRO_TIERS = ['pro_starter', 'pro_business', 'pro_enterprise'];
const isProTier = (t: string) => PRO_TIERS.includes(t);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: CORS });

  try {
    const { hotlineId, inviteToken, memberAnonId } = await req.json();
    if (!hotlineId && !inviteToken) return new Response(JSON.stringify({ error: 'hotlineId 또는 inviteToken이 필요합니다.' }), { status: 400, headers: CORS });

    // 2026-08-25: away_status, away_message 추가 조회 (v50)
    const query = supabase.from('hotlines').select('id, owner_user_id, tier, title, status, expires_at, max_participants, music_youtube_id, music_audio_url, music_position_seconds, music_is_playing, music_updated_at, music_set_by_nickname, away_status, away_message');
    const { data: hotline } = hotlineId ? await query.eq('id', hotlineId).maybeSingle() : await query.eq('invite_token', inviteToken).maybeSingle();
    if (!hotline) return new Response(JSON.stringify({ error: '핫라인을 찾을 수 없습니다.' }), { status: 404, headers: CORS });

    const ownerId = await resolveOwnerUserId(req);
    let mySenderAnonId: string | null = null;
    let visibilitySinceTimestamp: string | null = null; // 2026-08-21: 새 참가자는 본인 입장 이후 대화만 보게 함 (상대방 교체 기능)
    let isOwner = false;

    if (ownerId) {
      if (hotline.owner_user_id !== ownerId) return new Response(JSON.stringify({ error: '이 핫라인의 개설자가 아닙니다.' }), { status: 403, headers: CORS });
      mySenderAnonId = 'owner-' + ownerId;
      isOwner = true;
      // 개설자는 전체 기록을 다 봄 (visibilitySinceTimestamp = null 유지)
    } else {
      if (!memberAnonId) return new Response(JSON.stringify({ error: '로그인 또는 memberAnonId가 필요합니다.' }), { status: 400, headers: CORS });
      const { data: member } = await supabase.from('hotline_members').select('status, joined_at').eq('hotline_id', hotline.id).eq('member_anon_id', memberAnonId).maybeSingle();
      if (!member || member.status !== 'approved') return new Response(JSON.stringify({ error: '이 핫라인의 참가자가 아닙니다.' }), { status: 403, headers: CORS });
      mySenderAnonId = memberAnonId;
      // 내가 입장한 시점 이전 대화(이전 상대방과의 대화)는 안 보여줌
      // ⚠ 2026-08-26: joined_at이 비어 있으면 아래 gte 조건이 깨져 조회가 통째로 실패합니다.
      //   그런 경우엔 제한 없이 전체를 보여주는 편이 안전합니다(대화방이 아예 안 열리는 것보다 낫습니다).
      visibilitySinceTimestamp = member.joined_at || null;
    }

    let messagesQuery = supabase.from('hotline_messages').select('id, sender_anon_id, sender_nickname, message_type, content, file_name, original_mime_type, reply_to_message_id, edited_at, deleted_at, created_at').eq('hotline_id', hotline.id).order('created_at', { ascending: true });
    if (visibilitySinceTimestamp) messagesQuery = messagesQuery.gte('created_at', visibilitySinceTimestamp);

    const [{ data: messages }, { data: members }, { data: goals }, { data: myFavorites }] = await Promise.all([
      messagesQuery,
      supabase.from('hotline_members').select('member_anon_id, nickname, role, last_read_at').eq('hotline_id', hotline.id).eq('status', 'approved'),
      supabase.from('hotline_goals').select('*').eq('hotline_id', hotline.id).order('created_at', { ascending: true }), // 2026-08-22 신설
      supabase.from('hotline_message_favorites').select('message_id').eq('hotline_id', hotline.id).eq('favorited_by_anon_id', mySenderAnonId), // 2026-08-22 신설: 내가 즐겨찾기한 것만
    ]);

    return new Response(JSON.stringify({
      ok: true,
      hotlineId: hotline.id,
      // ⚠ 전문관리용은 "상담 핫라인"보다 그냥 "상담"이 자연스럽습니다.
      //   client_label("김철수 의뢰인")은 개설자 전용 메모라 여기서 쓰지 않습니다.
      title: hotline.title
             || (isProTier(hotline.tier)
                  ? (TIER_LABEL[hotline.tier] || hotline.tier)
                  : ((TIER_LABEL[hotline.tier] || hotline.tier) + ' 핫라인')),
      tier: hotline.tier, // 2026-08-21 신설: 암호화 대상 여부(_secure 접미사) 판단에 필요
      status: hotline.status,
      maxParticipants: hotline.max_participants,
      mySenderAnonId,
      isOwner, // 2026-08-25 신설(v50): 개설자 전용 메뉴 표시 판단
      away: {  // 2026-08-25 신설(v50): 자리비움 상태
        status: hotline.away_status || 'available',
        // ⚠ 문구는 개설자에게만 내려줌. 참가자는 자동응답으로 이미 받으므로 불필요.
        message: isOwner ? (hotline.away_message || '') : undefined,
      },
      members: members || [],
      messages: messages || [],
      goals: goals || [],
      myFavoriteMessageIds: (myFavorites || []).map((f) => f.message_id),
      music: { // 2026-08-22 신설: "같이 듣기" 현재 재생 상태 — 새로 입장한 사람도 이어서 볼 수 있게
        youtubeId: hotline.music_youtube_id,
        audioUrl: hotline.music_audio_url,
        positionSeconds: hotline.music_position_seconds,
        isPlaying: hotline.music_is_playing,
        updatedAt: hotline.music_updated_at,
        setByNickname: hotline.music_set_by_nickname,
      },
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error).message ?? err) }), { status: 500, headers: CORS });
  }
});
