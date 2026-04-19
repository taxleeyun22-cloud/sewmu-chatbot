// 관리자 전체 데이터 백업 다운로드 (owner 전용)
// GET /api/admin-backup?key=ADMIN_KEY
// 응답: JSON 파일 다운로드 (users + conversations + rooms + faqs + client_*)
//
// 주의: 전체 conversations 는 양이 많을 수 있으므로 시간 제한 고려.
// 대용량 대비 압축 없음(가독성 우선). 월 1회 수동 다운로드 권장.

import { checkAdmin, adminUnauthorized, ownerOnly } from "./_adminAuth.js";

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!auth.owner) return ownerOnly();

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB 없음" }, { status: 500 });

  try {
    // 각 테이블 덤프 (큰 테이블은 임베딩 제외)
    const dump = {};

    const dumpTable = async (table, query) => {
      try {
        const { results } = await db.prepare(query).all();
        dump[table] = results || [];
      } catch (e) {
        dump[table] = { error: e.message };
      }
    };

    await dumpTable("users",
      `SELECT id, provider, name, real_name, email, phone, profile_image, approval_status, approved_at, name_confirmed,
              is_admin, declared_client, consent_overseas, consent_overseas_at, consent_all_at,
              created_at, last_login_at FROM users`);

    await dumpTable("conversations",
      `SELECT id, session_id, user_id, role, content, confidence, reviewed, reported, room_id, deleted_at, created_at
       FROM conversations ORDER BY created_at ASC`);

    await dumpTable("chat_rooms",
      `SELECT id, name, created_by_admin, created_by_user_id, max_members, ai_mode, status, created_at, closed_at
       FROM chat_rooms`);

    await dumpTable("room_members",
      `SELECT room_id, user_id, role, joined_at, left_at, last_read_at FROM room_members`);

    try { await dumpTable("room_notices",
      `SELECT id, room_id, title, content, author_user_id, pinned, created_at, updated_at FROM room_notices`); } catch {}

    // faqs 는 embedding 제외 (크기 크고 재생성 가능)
    await dumpTable("faqs",
      `SELECT id, q_number, category, question, answer, law_refs, active,
              verified_status, verified_note, verified_at,
              created_at, updated_at,
              CASE WHEN embedding IS NULL THEN 0 ELSE 1 END as has_embedding
       FROM faqs ORDER BY q_number ASC`);

    try { await dumpTable("client_businesses",
      `SELECT * FROM client_businesses`); } catch {}

    try { await dumpTable("client_profiles",
      `SELECT * FROM client_profiles`); } catch {}

    try { await dumpTable("daily_usage",
      `SELECT * FROM daily_usage`); } catch {}

    const exported = {
      backup_version: "1.0",
      exported_at: new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").substring(0, 19),
      note: "Cloudflare D1 전체 덤프. embedding 컬럼은 재생성 가능하므로 제외. R2 이미지·파일은 별도 백업 필요.",
      counts: Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])),
      data: dump,
    };

    const filename = `sewmu-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const body = JSON.stringify(exported, null, 2);

    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
