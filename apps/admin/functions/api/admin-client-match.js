/**
 * GET /api/admin-client-match?user_id=N — 승인 대기 카톡 사용자의 위하고 매칭 후보 (읽기 전용)
 *
 * 사장님 2026-10-20: "매칭 … 위하고랑 엮어서 2차 검증까지 자동화. 자동 연결은 하지 말고 내 버튼은 있어야."
 * 이 엔드포인트는 후보·근거·등급만 돌려준다. 아무것도 바꾸지 않는다 (연결은 승인 화면 버튼).
 * 판정 로직은 _client-match.js (테스트: client-match.test.ts).
 *
 * 응답에 생년월일 값은 싣지 않는다 — 고객이 적었는지(has_birth)와 위하고와 맞는지(evidence.birth)만.
 */
import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";
import { findMatchCandidates, ensureClaimColumns, isMergeable } from "./_client-match.js";

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });
  const url = new URL(context.request.url);
  const userId = Number(url.searchParams.get("user_id"));
  if (!userId) return Response.json({ error: "user_id 가 필요합니다" }, { status: 400 });
  try {
    await ensureClaimColumns(db);
    const u = await db.prepare(
      `SELECT id, name, real_name, phone, claim_birth_date, claim_business_number, claim_at, approval_status, provider
         FROM users WHERE id = ?`
    ).bind(userId).first();
    if (!u) return Response.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });
    const claims = {
      real_name: u.real_name || '',
      birth_date: u.claim_birth_date || null,
      phone: u.phone || '',
      business_number: u.claim_business_number || '',
    };
    const r = await findMatchCandidates(db, claims, userId);
    return Response.json({
      ok: true,
      user: {
        id: u.id, name: u.name, real_name: u.real_name, phone: u.phone, provider: u.provider,
        approval_status: u.approval_status, claim_business_number: u.claim_business_number || null,
        has_birth: !!u.claim_birth_date, claim_at: u.claim_at || null,
      },
      ...r,
      /* 합칠 수 있는 사람 = 위하고·직접 등록 (카톡·네이버 계정이 아닌 사람) — [연결] 버튼과 같은 기준 */
      persons: r.persons.map((p) => ({ ...p, mergeable: isMergeable(p) })),
    });
  } catch (e) {
    console.error('[admin-client-match]', e);
    return Response.json({ error: "매칭 후보를 불러오지 못했습니다" }, { status: 500 });
  }
}
