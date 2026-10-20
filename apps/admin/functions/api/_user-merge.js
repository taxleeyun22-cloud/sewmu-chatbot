/**
 * 위하고(수동) 사용자 → 카톡 사용자 합치기 — admin-users.js merge_users 와 admin-client-link.js 가 같이 쓴다.
 *
 * 사장님 명령 (2026-05-08): "카톡으로 온 사람이 무조건 제일 상위다 거기서 임의로 만든 또는 위하고로 올린 것들을 덮는다"
 *   = 카톡 user 가 살아남고 manual user 는 archived ('merged').
 *   카톡 user 의 OAuth 정보 유지 + manual 의 위하고 데이터 (birth_date, resident_back_hash, real_name) 는 빈 칸만 채움.
 *   매핑 / 메모 / 메시지 / 등 → 카톡 user 로 이전.
 *
 * 2026-10-20 (admin-users.js 에서 옮기면서 고친 것):
 *  - user_merges 기록이 안 남던 문제 — 예전 코드가 정의 안 된 `auth` 를 읽어 ReferenceError → 조용히 삼킴 → 분리 불가.
 *    이제 actor 를 인자로 받는다.
 *  - 카톡 user 가 같은 사업장(또는 같은 방)에 이미 행이 있으면 UNIQUE 충돌로 이전 UPDATE 가 통째로 실패하고
 *    manual 의 연결이 전부 archived 쪽에 남던 문제 — 겹치는 건 카톡 쪽 행을 살리고 manual 행은 닫은 뒤 나머지를 옮긴다.
 */

const kstNow = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);

/** 반환: { ok:true, survived_user_id, archived_user_id, survived_real_name, moved, merge_id } | { ok:false, status, error } */
export async function mergeManualIntoKakao(db, { kakaoUid, manualUid, actor }) {
  kakaoUid = Number(kakaoUid);
  manualUid = Number(manualUid);
  if (!kakaoUid || !manualUid) return { ok: false, status: 400, error: "kakao_user_id/manual_user_id required" };
  if (kakaoUid === manualUid) return { ok: false, status: 400, error: "same user" };

  try { await db.prepare(`ALTER TABLE users ADD COLUMN provider TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN provider_user_id TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN profile_image TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN deleted_at TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN resident_back_hash TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN withdrawal_reason TEXT`).run(); } catch {}

  /* 사장님 명령 (2026-05-07): user_merges audit log — 분리 시 원상복구 위해.
   * snapshot 만 저장. 데이터는 admin user 에 그대로 (사장님 워크플로). */
  try { await db.prepare(`CREATE TABLE IF NOT EXISTS user_merges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manual_user_id INTEGER NOT NULL,
    kakao_user_id INTEGER NOT NULL,
    kakao_snapshot TEXT,
    manual_snapshot TEXT,
    merged_at TEXT,
    merged_by_admin TEXT,
    unmerged_at TEXT,
    unmerged_by_admin TEXT
  )`).run(); } catch {}

  const kakao = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(kakaoUid).first();
  const manual = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(manualUid).first();
  if (!kakao || !manual) return { ok: false, status: 404, error: "user not found" };

  const now = kstNow();
  const stats = { mappings: 0, memos: 0, conversations: 0, room_members: 0, documents: 0, filings: 0 };

  /* 0. snapshot 저장 — 분리 시 원상복구용 */
  const kakaoSnapshot = JSON.stringify({
    provider: kakao.provider, provider_user_id: kakao.provider_user_id,
    name: kakao.name, profile_image: kakao.profile_image,
    email: kakao.email, phone: kakao.phone,
    approval_status: kakao.approval_status,
  });
  const manualSnapshot = JSON.stringify({
    provider: manual.provider, provider_user_id: manual.provider_user_id,
    approval_status: manual.approval_status,
    profile_image: manual.profile_image, email: manual.email,
  });
  let mergeAuditId = null;
  try {
    const mr = await db.prepare(`INSERT INTO user_merges (manual_user_id, kakao_user_id, kakao_snapshot, manual_snapshot, merged_at, merged_by_admin) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(manualUid, kakaoUid, kakaoSnapshot, manualSnapshot, now, actor || 'admin').run();
    mergeAuditId = mr.meta?.last_row_id || null;
  } catch (e) {
    /* audit 실패해도 합치기는 진행 */
    console.error('[user-merge] user_merges insert', e);
  }

  /* 1. manual user archive — UNIQUE 회피 위해 먼저 */
  const manualArchivedProviderId = `merged_manual:${manualUid}:${manual.provider_id || ''}`;
  await db.prepare(`
    UPDATE users SET
      deleted_at = ?,
      approval_status = 'merged',
      provider = 'merged',
      provider_id = ?,
      provider_user_id = NULL
    WHERE id = ?
  `).bind(now, manualArchivedProviderId, manualUid).run();

  /* 2. 카카오 user 살아남음 — manual 의 정보 흡수 (카카오 빈 컬럼만 채움, 카카오 데이터 유지). */
  await db.prepare(`
    UPDATE users SET
      real_name = COALESCE(NULLIF(real_name, ''), ?),
      name = COALESCE(NULLIF(name, ''), ?),
      phone = COALESCE(NULLIF(phone, ''), NULLIF(phone, '000-000-0000'), NULLIF(?, '000-000-0000'), ?),
      email = COALESCE(NULLIF(email, ''), ?),
      birth_date = COALESCE(birth_date, ?),
      resident_back_hash = COALESCE(resident_back_hash, ?),
      name_confirmed = 1,
      approval_status = 'approved_client',
      approved_at = COALESCE(approved_at, ?),
      last_login_at = ?,
      deleted_at = NULL,
      withdrawal_reason = NULL
    WHERE id = ?
  `).bind(
    manual.real_name, manual.name, manual.phone, manual.phone, manual.email,
    manual.birth_date, manual.resident_back_hash, now, now, kakaoUid
  ).run();

  /* 3. 매핑 / 데이터 이전 — manual_user_id → kakao_user_id (카카오 master) */
  const ACTIVE = `(removed_at IS NULL OR removed_at = '')`;
  try {
    /* 3a. 카톡 쪽에 같은 사업장 행이 이미 있으면 (지워진 행 포함) 그 행을 살린다. 위하고 쪽이 대표자면 대표자로. */
    const rA = await db.prepare(`
      UPDATE business_members SET
        removed_at = NULL,
        role = CASE WHEN EXISTS (SELECT 1 FROM business_members x WHERE x.user_id = ? AND x.business_id = business_members.business_id
                                   AND (x.removed_at IS NULL OR x.removed_at = '') AND x.role = '대표자') THEN '대표자' ELSE role END,
        is_primary = CASE WHEN EXISTS (SELECT 1 FROM business_members x WHERE x.user_id = ? AND x.business_id = business_members.business_id
                                   AND (x.removed_at IS NULL OR x.removed_at = '') AND COALESCE(x.is_primary, 0) = 1) THEN 1 ELSE is_primary END
      WHERE user_id = ? AND business_id IN (SELECT business_id FROM business_members WHERE user_id = ? AND ${ACTIVE})
    `).bind(manualUid, manualUid, kakaoUid, manualUid).run();
    /* 3b. 겹친 manual 행은 닫는다 (기록은 남김) */
    await db.prepare(`
      UPDATE business_members SET removed_at = ?
      WHERE user_id = ? AND ${ACTIVE} AND business_id IN (SELECT business_id FROM business_members WHERE user_id = ?)
    `).bind(now, manualUid, kakaoUid).run();
    /* 3c. 나머지는 그대로 옮긴다 */
    const r1 = await db.prepare(`UPDATE business_members SET user_id = ? WHERE user_id = ? AND ${ACTIVE}`).bind(kakaoUid, manualUid).run();
    stats.mappings = (rA?.meta?.changes || 0) + (r1?.meta?.changes || 0);
  } catch (e) { console.error('[user-merge] business_members', e); }
  try {
    const r2 = await db.prepare(`UPDATE memos SET target_user_id = ? WHERE target_user_id = ?`).bind(kakaoUid, manualUid).run();
    stats.memos += r2?.meta?.changes || 0;
  } catch {}
  try {
    const r3 = await db.prepare(`UPDATE memos SET author_user_id = ? WHERE author_user_id = ?`).bind(kakaoUid, manualUid).run();
    stats.memos += r3?.meta?.changes || 0;
  } catch {}
  try {
    const r4 = await db.prepare(`UPDATE conversations SET user_id = ? WHERE user_id = ?`).bind(kakaoUid, manualUid).run();
    stats.conversations = r4?.meta?.changes || 0;
  } catch {}
  try {
    /* 방도 사업장과 같은 이유로 겹치는 방은 카톡 쪽 행을 살리고 manual 행은 나간 것으로 */
    const LIVE = `(left_at IS NULL OR left_at = '')`;
    const rA = await db.prepare(`UPDATE room_members SET left_at = NULL
      WHERE user_id = ? AND room_id IN (SELECT room_id FROM room_members WHERE user_id = ? AND ${LIVE})`).bind(kakaoUid, manualUid).run();
    await db.prepare(`UPDATE room_members SET left_at = ?
      WHERE user_id = ? AND ${LIVE} AND room_id IN (SELECT room_id FROM room_members WHERE user_id = ?)`).bind(now, manualUid, kakaoUid).run();
    const r5 = await db.prepare(`UPDATE room_members SET user_id = ? WHERE user_id = ? AND ${LIVE}`).bind(kakaoUid, manualUid).run();
    stats.room_members = (rA?.meta?.changes || 0) + (r5?.meta?.changes || 0);
  } catch (e) { console.error('[user-merge] room_members', e); }
  try {
    const r6 = await db.prepare(`UPDATE documents SET user_id = ? WHERE user_id = ?`).bind(kakaoUid, manualUid).run();
    stats.documents = r6?.meta?.changes || 0;
  } catch {}
  try { await db.prepare(`UPDATE daily_usage SET user_id = ? WHERE user_id = ?`).bind(kakaoUid, manualUid).run(); } catch {}
  try { await db.prepare(`UPDATE sessions SET user_id = ? WHERE user_id = ?`).bind(kakaoUid, manualUid).run(); } catch {}
  try { await db.prepare(`UPDATE business_documents SET user_id = ? WHERE user_id = ?`).bind(kakaoUid, manualUid).run(); } catch {}
  /* 사장님 보고 (2026-06-12 데이터 audit): 병합 시 검토표·거래처사업장 끊김 방지.
   * filings 는 owner_id(owner_type='Person') 기준, client_businesses/client_profiles 는 user_id 기준
   * — 위 user_id 일괄 이전에서 누락돼 있었음. 챗봇 "내 매출/업체" 연동 유지 위해 같이 이전. */
  try { const rf = await db.prepare(`UPDATE filings SET owner_id = ? WHERE owner_type = 'Person' AND owner_id = ?`).bind(kakaoUid, manualUid).run(); stats.filings = rf?.meta?.changes || 0; } catch {}
  try { await db.prepare(`UPDATE client_businesses SET user_id = ? WHERE user_id = ?`).bind(kakaoUid, manualUid).run(); } catch {}
  try { await db.prepare(`UPDATE client_profiles SET user_id = ? WHERE user_id = ?`).bind(kakaoUid, manualUid).run(); } catch {}
  /* manual user 의 import_batch_id 도 그대로 — rollback 시 archived manual 자동 제거 */

  return {
    ok: true,
    survived_user_id: kakaoUid,
    archived_user_id: manualUid,
    survived_real_name: kakao.real_name || manual.real_name,
    moved: stats,
    merge_id: mergeAuditId,
  };
}
