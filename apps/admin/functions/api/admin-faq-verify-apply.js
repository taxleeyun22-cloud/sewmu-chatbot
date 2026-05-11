// Claude 삼중체크 검증 리포트(_faq-verify-report.js) 를 D1 faqs 테이블에 일괄 적용
// POST /api/admin-faq-verify-apply?key=ADMIN_KEY
// 응답: { ok, applied, skipped, missing_q: [...] }

import { checkAdmin, adminUnauthorized, ownerOnly } from "./_adminAuth.js";
import { VERIFY_REPORT } from "./_faq-verify-report.js";

function kst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!auth.owner) return ownerOnly();

  // 리포트 요약 반환 (미리보기)
  const counts = { verified: 0, suspicious: 0, wrong: 0 };
  for (const r of VERIFY_REPORT) counts[r.status] = (counts[r.status] || 0) + 1;
  return Response.json({
    total: VERIFY_REPORT.length,
    counts,
    items: VERIFY_REPORT,
  });
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!auth.owner) return ownerOnly();

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB 없음" }, { status: 500 });

  const now = kst();
  let applied = 0, skipped = 0;
  const missing = [];

  for (const r of VERIFY_REPORT) {
    // q_number로 FAQ 찾기
    const row = await db.prepare(`SELECT id FROM faqs WHERE q_number = ? LIMIT 1`).bind(r.q).first();
    if (!row) { missing.push(r.q); skipped++; continue; }
    try {
      await db.prepare(
        `UPDATE faqs SET verified_status = ?, verified_note = ?, verified_at = ? WHERE id = ?`
      ).bind(r.status, r.note || null, now, row.id).run();
      applied++;
    } catch (e) {
      skipped++;
    }
  }

  return Response.json({
    ok: true,
    applied,
    skipped,
    missing_q: missing,
    total_in_report: VERIFY_REPORT.length,
  });
}
