// 🧹 중복 사업장 정리 (일회성 유틸)
//
// 같은 user_id 에 대해 client_businesses 중복이 과거 누적된 것을 감지·정리.
// 이번 세션 이전에 '세무회계 이윤' 과 '세무회계이윤' 처럼 공백 차이로 따로
// 저장된 row 들이 있는 상황을 해결.
//
// 규칙:
//   1. 같은 user_id 안에서만 비교 (다른 사용자 사업장 건드리지 않음)
//   2. 사업자번호(숫자만) 동일 → 같은 사업장으로 판정
//   3. 둘 다 번호 없음 → 공백 제거·소문자 상호 동일 시 같은 사업장으로 판정
//   4. 그룹 안에서 keeper 선정:
//      - 채워진 컬럼 수가 많은 쪽
//      - 동률이면 is_primary=1 쪽
//      - 동률이면 더 오래된 created_at (먼저 만든 쪽)
//   5. keeper 제외한 나머지는 삭제 후보
//
// 엔드포인트:
//   GET  /api/admin-clean-duplicate-businesses?key=        → 삭제 후보 미리보기 (dry-run, 기본)
//   POST /api/admin-clean-duplicate-businesses?key=&action=execute
//        body {confirm:true}                                → 실제 삭제 실행
//
// 안전장치:
//   - GET 은 절대 삭제 안 함
//   - POST execute 는 body.confirm=true 필수
//   - keeper 가 모든 필드 비어있으면(예: 둘 다 빈 row) 해당 그룹 skip

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

function normBiz(s) { return String(s || '').replace(/\D/g, ''); }
function normName(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }

function fieldFilledCount(row) {
  const cols = ['company_name', 'business_number', 'ceo_name', 'industry',
    'business_type', 'tax_type', 'establishment_date', 'address', 'phone',
    'employee_count', 'last_revenue', 'vat_period', 'notes'];
  let n = 0;
  for (const c of cols) {
    const v = row[c];
    if (v != null && String(v).trim() !== '') n++;
  }
  return n;
}

/* user 한 명의 row 들에서 중복 그룹 산출 → 각 그룹에 keeper + remove 후보 */
function groupDuplicates(rows) {
  /* key = 정규화 값. 같은 key 에 들어온 row 끼리 묶임 */
  const groups = new Map();
  for (const r of rows) {
    const rb = normBiz(r.business_number);
    const rn = normName(r.company_name);
    let key;
    if (rb) key = 'bn:' + rb;
    else if (rn) key = 'nm:' + rn;
    else continue; /* 키 없으면 비교 불가 — skip */
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const result = [];
  for (const [key, arr] of groups) {
    if (arr.length < 2) continue;
    /* keeper 정렬: 필드 수 desc, is_primary desc, created_at asc */
    const sorted = [...arr].sort((a, b) => {
      const fa = fieldFilledCount(a), fb = fieldFilledCount(b);
      if (fa !== fb) return fb - fa;
      const pa = a.is_primary ? 1 : 0, pb = b.is_primary ? 1 : 0;
      if (pa !== pb) return pb - pa;
      const ca = String(a.created_at || '9999');
      const cb = String(b.created_at || '9999');
      return ca.localeCompare(cb);
    });
    const keep = sorted[0];
    const remove = sorted.slice(1);
    /* keeper 가 완전 빈 row 면 skip (데이터 손실 위험) */
    if (fieldFilledCount(keep) === 0) continue;
    result.push({ key, keep, remove });
  }
  return result;
}

async function buildReport(db) {
  /* 모든 client_businesses → user_id 별로 그룹 */
  const { results: rows } = await db.prepare(
    `SELECT cb.*, u.real_name, u.name
     FROM client_businesses cb
     LEFT JOIN users u ON cb.user_id = u.id
     ORDER BY cb.user_id ASC, cb.created_at ASC`
  ).all();

  const byUser = new Map();
  for (const r of (rows || [])) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, { user_name: r.real_name || r.name || '', rows: [] });
    byUser.get(r.user_id).rows.push(r);
  }

  const report = [];
  let totalRemove = 0;
  for (const [userId, info] of byUser) {
    if (info.rows.length < 2) continue;
    const groups = groupDuplicates(info.rows);
    if (!groups.length) continue;
    const userEntry = {
      user_id: userId,
      user_name: info.user_name,
      groups: groups.map(g => ({
        match_key: g.key,
        keep: { id: g.keep.id, company_name: g.keep.company_name, business_number: g.keep.business_number, is_primary: !!g.keep.is_primary, fields: fieldFilledCount(g.keep), created_at: g.keep.created_at },
        remove: g.remove.map(r => ({ id: r.id, company_name: r.company_name, business_number: r.business_number, is_primary: !!r.is_primary, fields: fieldFilledCount(r), created_at: r.created_at })),
      })),
    };
    userEntry.removable = userEntry.groups.reduce((s, g) => s + g.remove.length, 0);
    totalRemove += userEntry.removable;
    report.push(userEntry);
  }
  return { users: report, total_removable: totalRemove, total_users_affected: report.length };
}

export async function onRequestGet(context) {
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  try {
    const r = await buildReport(db);
    return Response.json({ ok: true, dry_run: true, ...r });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  const url = new URL(context.request.url);
  const action = (url.searchParams.get('action') || '').trim();
  let body = {};
  try { body = await context.request.json(); } catch {}

  if (action !== 'execute') return Response.json({ error: "action=execute 필요" }, { status: 400 });
  if (body.confirm !== true) return Response.json({ error: 'confirm:true 필요 — 실수 방지' }, { status: 400 });

  try {
    const report = await buildReport(db);
    let deleted = 0;
    const deletedIds = [];
    const updatedPrimary = [];
    for (const u of report.users) {
      for (const g of u.groups) {
        /* keeper is_primary 보존: 제거 대상 중 is_primary=1 있으면 keeper 로 승격 */
        const hadPrimaryInRemove = g.remove.some(r => r.is_primary);
        if (hadPrimaryInRemove && !g.keep.is_primary) {
          try {
            /* 동일 user 의 is_primary 모두 해제 후 keeper 만 1 */
            await db.prepare(`UPDATE client_businesses SET is_primary = 0 WHERE user_id = ?`).bind(u.user_id).run();
            await db.prepare(`UPDATE client_businesses SET is_primary = 1 WHERE id = ?`).bind(g.keep.id).run();
            updatedPrimary.push(g.keep.id);
          } catch {}
        }
        for (const r of g.remove) {
          try {
            await db.prepare(`DELETE FROM client_businesses WHERE id = ?`).bind(r.id).run();
            deleted++;
            deletedIds.push(r.id);
          } catch {}
        }
      }
    }
    return Response.json({ ok: true, deleted, deleted_ids: deletedIds, primary_reassigned: updatedPrimary, executed_at: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
