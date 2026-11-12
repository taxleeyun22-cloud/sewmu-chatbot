/**
 * POST /api/admin-client-link — 승인 화면 [연결] 버튼 (사장님 전용)
 *
 * 사장님 2026-10-20: "매칭 … 위하고랑 엮어서 2차 검증까지 자동화. 자동 연결은 하지 말고 내 버튼은 있어야."
 * 버튼 한 번에: (선택 시) 위하고 사람과 합치기 → 고른 사업장 연결 → 기장거래처 승인 → (선택 시) 사업장 상담방 참여.
 *
 * body: { user_id, merge_user_id?: number|null, links: [{ business_id, role: '대표자'|'담당자' }], join_rooms?: bool }
 *
 * 2차 검증: 서버가 _client-match.js 로 후보를 다시 계산해서, 화면에서 보낸 사람·사업장이 그 후보 안에 있을 때만 진행한다.
 *   (후보 밖 사업장을 붙이려면 기존 "기장거래처 승인" 모달을 쓴다.)
 * 다시 눌러도 안전하다 — 이미 있는 연결은 살리기만 하고 중복으로 만들지 않는다.
 */
import { checkOriginCsrf } from "./_adminAuth.js";
import { checkRole, roleForbidden } from "./_authz.js";
import { findMatchCandidates, ensureClaimColumns, isMergeable } from "./_client-match.js";
import { mergeManualIntoKakao } from "./_user-merge.js";
import { logAudit } from "./_audit.js";

const kstNow = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);

export async function onRequestPost(context) {
  const csrf = checkOriginCsrf(context.request, context.env);
  if (csrf) return csrf;
  const authz = await checkRole(context, 'owner');
  if (!authz.ok) return roleForbidden(authz);
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  let body;
  try { body = await context.request.json(); } catch { return Response.json({ error: "잘못된 요청입니다" }, { status: 400 }); }
  const userId = Number(body.user_id);
  const mergeUserId = body.merge_user_id ? Number(body.merge_user_id) : null;
  const links = Array.isArray(body.links) ? body.links : [];
  if (!userId) return Response.json({ error: "user_id 가 필요합니다" }, { status: 400 });

  try {
    await ensureClaimColumns(db);
    const u = await db.prepare(
      `SELECT id, real_name, phone, provider, approval_status, is_admin, deleted_at, claim_birth_date, claim_business_number
         FROM users WHERE id = ?`
    ).bind(userId).first();
    if (!u || (u.deleted_at && u.deleted_at !== '') || ['merged', 'deleted'].includes(u.approval_status)) {
      return Response.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });
    }
    if (u.is_admin) return Response.json({ error: "직원 계정은 거래처로 연결하지 않습니다" }, { status: 400 });
    if (!['kakao', 'naver'].includes(String(u.provider || ''))) {
      return Response.json({ error: "카톡·네이버로 가입한 사람만 연결할 수 있습니다" }, { status: 400 });
    }

    /* 2차 검증 — 후보 다시 계산 */
    const cand = await findMatchCandidates(db, {
      real_name: u.real_name || '', birth_date: u.claim_birth_date || null,
      phone: u.phone || '', business_number: u.claim_business_number || '',
    }, userId);
    const candBiz = new Map(cand.businesses.map((b) => [b.business_id, b]));

    let mergePerson = null;
    if (mergeUserId) {
      mergePerson = cand.persons.find((p) => p.user_id === mergeUserId) || null;
      if (!mergePerson) return Response.json({ error: "합칠 사람이 매칭 후보에 없습니다" }, { status: 400 });
      if (!isMergeable(mergePerson)) {
        return Response.json({ error: "이미 다른 카톡·네이버 계정인 사람은 여기서 합치지 않습니다" }, { status: 400 });
      }
    }

    const clean = [];
    const seen = new Set();
    for (const l of links) {
      const bid = Number(l && l.business_id);
      if (!bid || seen.has(bid)) continue;
      if (!candBiz.has(bid)) return Response.json({ error: "매칭 후보에 없는 사업장이 들어 있습니다" }, { status: 400 });
      seen.add(bid);
      clean.push({ business_id: bid, role: l.role === '대표자' ? '대표자' : '담당자' });
    }
    if (!mergePerson && !clean.length) {
      return Response.json({ error: "연결할 사업장이나 합칠 사람을 골라 주세요" }, { status: 400 });
    }

    const now = kstNow();
    const actor = authz.role || 'owner';
    const prevStatus = u.approval_status || 'pending';

    /* 쓰기 전에 lazy 컬럼 먼저 (합친 뒤에 실패하는 일이 없게) */
    for (const sql of [
      `ALTER TABLE business_members ADD COLUMN added_at TEXT`,
      `ALTER TABLE business_members ADD COLUMN removed_at TEXT`,
      `ALTER TABLE users ADD COLUMN approved_at TEXT`,
      `ALTER TABLE users ADD COLUMN approved_by TEXT`,
    ]) { try { await db.prepare(sql).run(); } catch {} }

    /* 1. 위하고 사람과 합치기 — 그 사람의 사업장·검토표·메모·방이 전부 따라온다 (카톡 계정이 살아남음) */
    let merged = null;
    if (mergePerson) {
      const r = await mergeManualIntoKakao(db, { kakaoUid: userId, manualUid: mergePerson.user_id, actor });
      if (!r.ok) return Response.json({ error: "합치기에 실패했습니다" }, { status: r.status || 500 });
      merged = { archived_user_id: r.archived_user_id, moved: r.moved, merge_id: r.merge_id };
    }

    /* 2. 고른 사업장 연결 + 승인 — 한 번에 (D1 batch = 하나의 트랜잭션) */
    const ACTIVE = `(removed_at IS NULL OR removed_at = '')`;
    const stmts = [];
    for (const l of clean) {
      const wantPrimary = l.role === '대표자' ? 1 : 0;
      stmts.push(db.prepare(
        `INSERT INTO business_members (business_id, user_id, role, is_primary, added_at)
         SELECT ?, ?, ?, 0, ? WHERE NOT EXISTS (SELECT 1 FROM business_members WHERE business_id = ? AND user_id = ?)`
      ).bind(l.business_id, userId, l.role, now, l.business_id, userId));
      /* 살리기 + 역할. 대표 표시는 그 사업장에 다른 대표 표시가 없을 때만 (기존 대표를 지우지 않는다) */
      stmts.push(db.prepare(
        `UPDATE business_members SET removed_at = NULL, role = ?,
           is_primary = CASE WHEN ? = 1 AND NOT EXISTS (
               SELECT 1 FROM business_members x WHERE x.business_id = ? AND x.user_id != ? AND COALESCE(x.is_primary, 0) = 1
                 AND (x.removed_at IS NULL OR x.removed_at = '')) THEN 1 ELSE COALESCE(is_primary, 0) END
         WHERE business_id = ? AND user_id = ?`
      ).bind(l.role, wantPrimary, l.business_id, userId, l.business_id, userId));
    }
    stmts.push(db.prepare(
      `UPDATE users SET approval_status = 'approved_client', approved_at = COALESCE(approved_at, ?),
         approved_by = COALESCE(NULLIF(approved_by, ''), ?) WHERE id = ?`
    ).bind(now, actor, userId));
    await db.batch(stmts);

    /* 3. 상담방 — 연결한 사업장에 열린 방이 있으면 들어가게 (방을 새로 만들지는 않는다) */
    let roomsJoined = 0;
    if (body.join_rooms && clean.length) {
      try {
        const ph = clean.map(() => '?').join(',');
        const { results: rooms } = await db.prepare(
          `SELECT DISTINCT rb.room_id FROM room_businesses rb JOIN chat_rooms r ON r.id = rb.room_id
            WHERE rb.business_id IN (${ph}) AND (rb.removed_at IS NULL OR rb.removed_at = '')
              AND COALESCE(r.status, 'active') = 'active'`
        ).bind(...clean.map((l) => l.business_id)).all();
        for (const r of rooms || []) {
          const has = await db.prepare(`SELECT left_at FROM room_members WHERE room_id = ? AND user_id = ?`).bind(r.room_id, userId).first();
          if (has) {
            if (has.left_at) { await db.prepare(`UPDATE room_members SET left_at = NULL WHERE room_id = ? AND user_id = ?`).bind(r.room_id, userId).run(); roomsJoined++; }
          } else {
            await db.prepare(`INSERT INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`).bind(r.room_id, userId, now).run();
            roomsJoined++;
          }
        }
      } catch (e) { console.error('[admin-client-link] rooms', e); }
    }

    await logAudit(db, {
      actor, action: 'client_link', entity_type: 'user', entity_id: userId,
      before: { approval_status: prevStatus },
      after: {
        approval_status: 'approved_client',
        merged_user_id: mergePerson ? mergePerson.user_id : null,
        links: clean.map((l) => ({ ...l, grade: candBiz.get(l.business_id).grade })),
        rooms_joined: roomsJoined,
      },
      request: context.request,
    });

    const { results: nowLinked } = await db.prepare(
      `SELECT COUNT(*) AS c FROM business_members WHERE user_id = ? AND ${ACTIVE}`
    ).bind(userId).all();
    return Response.json({
      ok: true, user_id: userId, approval_status: 'approved_client',
      merged, linked: clean.length, total_businesses: Number(nowLinked?.[0]?.c || 0), rooms_joined: roomsJoined,
    });
  } catch (e) {
    console.error('[admin-client-link]', e);
    return Response.json({ error: "연결 중 오류가 발생했습니다. 다시 눌러도 안전합니다." }, { status: 500 });
  }
}
