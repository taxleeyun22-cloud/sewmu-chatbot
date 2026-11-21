// 업로드 파일(R2) 열람 권한 — /api/image, /api/file 공통
// 보안 점검 PR-2 (2026-11-21): 예전에는 memos/·guides/ 만 확인하고 나머지(신분증·사업자등록증·영수증·상담방 파일)는
// 주소만 알면 로그인 없이 열렸다. 이제:
//   - 관리자(사장님 비번·직원 로그인) → 전부
//   - memos/ · guides/ → 관리자만
//   - 거래처(로그인) → 본인이 올린 것 (u{본인}/…, documents/u{본인}/…, biz_docs/u{본인}/…)
//                    + 내가 들어가 있는(나가지 않은) 상담방에 올라온 것 (메시지 [IMG]/[FILE], 영수증 [DOC])
//   - 그 외 → 401(로그인 안 함) / 403
// 사업자등록증·신분증(biz_docs/)은 본인 외에는 admin-biz-docs·my-biz-docs 전용 경로로만 본다.

import { checkAdmin } from "./_adminAuth.js";

async function sessionUserId(db, request) {
  if (!db) return null;
  const m = (request.headers.get("Cookie") || "").match(/session=([^;]+)/);
  if (!m) return null;
  try {
    const s = await db.prepare(
      `SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')`
    ).bind(m[1]).first();
    return s ? Number(s.user_id) : null;
  } catch { return null; }
}

const kstAt = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19);

/* (room_id, created_at) 인덱스 — 방별·시간 범위로 바로 찾기 (lazy, isolate 당 1회) */
let _indexReady = false;
async function ensureIndex(db) {
  if (_indexReady) return;
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_conv_room_created ON conversations(room_id, created_at)`).run(); } catch {}
  _indexReady = true;
}

/** @returns {Promise<{ ok: true } | { ok: false, status: 401 | 403 }>} */
export async function canViewMedia(context, key) {
  const adminOnly = key.startsWith("memos/") || key.startsWith("guides/");
  const admin = await checkAdmin(context);
  if (admin) return { ok: true };
  if (adminOnly) return { ok: false, status: 401 };

  const db = context.env.DB;
  const uid = await sessionUserId(db, context.request);
  if (!uid) return { ok: false, status: 401 };

  /* 본인이 올린 것 */
  const own = /^(?:documents\/|biz_docs\/)?u(\d+)\//.exec(key);
  if (own && Number(own[1]) === uid) return { ok: true };
  if (key.startsWith("biz_docs/")) return { ok: false, status: 403 };

  try {
    /* 내 상담방에 서버가 만든 모양으로 올라온 사진·파일만 인정 — 글 중간에 남의 키를 적어 넣는 것으로는 안 열림.
       [IMG]/api/image?k=키 (끝 또는 줄바꿈) / [FILE]{"url":"/api/file?k=키(& 또는 ") */
    await ensureIndex(db);
    const enc = encodeURIComponent(key);
    const img = '[IMG]/api/image?k=' + enc;
    const file = '[FILE]{"url":"/api/file?k=' + enc;
    /* 키 안의 업로드 시각(ms)으로 찾는 범위를 좁힌다 (하루 전 ~ 1년 뒤) — 방 메시지 전체를 매번 읽지 않게.
       직원이 예전에 올린 사진을 나중에 다시 보내도 1년 안이면 거래처가 본다 */
    const ts = /\/(\d{13})_/.exec(key);
    const from = ts ? kstAt(Number(ts[1]) - 864e5) : '0000';
    const to = ts ? kstAt(Number(ts[1]) + 366 * 864e5) : '9999';
    const inRoom = await db.prepare(
      `SELECT 1 AS ok FROM room_members m
         JOIN conversations c ON c.room_id = m.room_id AND c.created_at BETWEEN ? AND ?
        WHERE m.user_id = ? AND m.left_at IS NULL
          AND (c.content = ? OR substr(c.content, 1, ?) = ?
               OR substr(c.content, 1, ?) IN (?, ?))
        LIMIT 1`
    ).bind(from, to, uid, img, img.length + 1, img + '\n', file.length + 1, file + '&', file + '"').first();
    if (inRoom) return { ok: true };
    /* 내 상담방에 올라온 영수증 */
    const doc = await db.prepare(
      `SELECT 1 AS ok FROM documents d
         JOIN room_members m ON m.room_id = d.room_id AND m.user_id = ? AND m.left_at IS NULL
        WHERE d.image_key = ? LIMIT 1`
    ).bind(uid, key).first();
    if (doc) return { ok: true };
  } catch (e) {
    console.error("[media-auth]", e);
  }
  return { ok: false, status: 403 };
}
