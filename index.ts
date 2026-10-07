/* =====================================================================
   Aliascall — aliascall-case-message-delete (보낸 메시지 지우기)
   2026-10-08 신설

   누가 부르나
     발견자 화면 (aliascall_connect.html)        { messageId, caseId, finderAnonId }
     주인 화면   (aliascall_incoming_calls.html) { messageId, caseId } + 로그인 출입증

   지키는 것
     • **보낸 사람만** 지웁니다. 발견자는 sender='finder' 인 것만,
       주인은 자기 등록물의 사건에서 sender='owner' 인 것만.
     • 통화 기록 줄(call_log)은 지우지 않습니다.
     • 사진이면 저장소의 사진 파일도 함께 지웁니다.
     • 지운 줄은 서버에서 완전히 없어집니다. 상대 화면은 몇 초 안에
       "삭제된 메시지입니다" 로 바뀝니다.

   ⚠ 배포할 때 **Verify JWT 를 끄세요.** 발견자는 로그인하지 않습니다.
     (주인 출입증은 이 함수가 직접 확인합니다)
   ===================================================================== */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function out(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

/* 사진 주소에서 저장소 이름과 경로를 꺼냅니다.
   .../storage/v1/object/public/<bucket>/<path>
   .../storage/v1/object/sign/<bucket>/<path>?token=... */
function storagePath(url: string): { bucket: string; path: string } | null {
  const m = String(url || '').match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?#]+)/);
  if (!m) return null;
  return { bucket: m[1], path: decodeURIComponent(m[2]) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { messageId, caseId, finderAnonId } = await req.json().catch(() => ({}));
    if (!messageId || !caseId) return out({ error: '메시지를 찾을 수 없습니다' }, 400);

    const { data: msg, error: e1 } = await admin.from('case_messages')
      .select('id, case_id, sender, message_type, content').eq('id', messageId).maybeSingle();
    if (e1) throw e1;
    if (!msg || msg.case_id !== caseId) return out({ ok: true, already: true });   // 이미 지워짐
    if (msg.message_type === 'call_log') return out({ error: '통화 기록은 지울 수 없습니다' }, 400);

    const { data: cs, error: e2 } = await admin.from('cases')
      .select('id, registration_id, finder_anon_id').eq('id', caseId).maybeSingle();
    if (e2) throw e2;
    if (!cs) return out({ error: '대화를 찾을 수 없습니다' }, 404);

    if (finderAnonId) {
      // 발견자 — 이 사건의 발견자이고, 자기가 보낸 것이어야 합니다
      if (cs.finder_anon_id !== finderAnonId || msg.sender !== 'finder')
        return out({ error: '내가 보낸 것만 지울 수 있습니다' }, 403);
    } else {
      // 주인 — 로그인 출입증으로 확인
      const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (!jwt) return out({ error: '로그인이 필요합니다' }, 401);
      const { data: u, error: eu } = await admin.auth.getUser(jwt);
      if (eu || !u?.user) return out({ error: '로그인이 필요합니다' }, 401);
      const { data: reg } = await admin.from('registrations')
        .select('user_id').eq('id', cs.registration_id).maybeSingle();
      if (!reg || reg.user_id !== u.user.id || msg.sender !== 'owner')
        return out({ error: '내가 보낸 것만 지울 수 있습니다' }, 403);
    }

    // 사진 파일 먼저 (실패해도 메시지는 지웁니다)
    if (msg.message_type === 'photo' && msg.content) {
      const sp = storagePath(msg.content);
      if (sp) {
        const { error: es } = await admin.storage.from(sp.bucket).remove([sp.path]);
        if (es) console.warn('[case-del] 사진 파일 지우기 실패', sp, es.message);
      }
    }

    const { error: e3 } = await admin.from('case_messages').delete().eq('id', messageId);
    if (e3) {
      // 다른 표가 이 줄을 붙잡고 있으면 지울 수 없습니다 → 내용만 비웁니다
      console.warn('[case-del] 줄 삭제 실패, 내용만 비웁니다', e3.message);
      const { error: e4 } = await admin.from('case_messages')
        .update({ content: '🗑' }).eq('id', messageId);
      if (e4) throw e4;
      return out({ ok: true, blanked: true });
    }
    return out({ ok: true });
  } catch (e) {
    console.error('[case-del]', e);
    return out({ error: (e as Error).message || String(e) }, 500);
  }
});
