// 상담방(사업장)별 저장된 직원(인건비 등록 이력) CRUD
// - GET?room_id=X: 저장된 직원 목록
// - POST: 자동 저장 (인건비 모달 등록 직후 프론트에서 호출)
// - DELETE?id=X&room_id=Y: 해당 방의 직원 1명 삭제
//
// 암호화: 환경변수 PAYROLL_ENC_KEY(32바이트 = 64자 16진수) 있으면 AES-GCM
// 으로 resident_last7 암호화 저장/복호화. 없으면 평문.
// "enc:" 접두사로 암호문 판별 → 기존 평문과 혼재 가능 (migration 없이 점진 전환).
// 접근은 방 멤버만 가능.

async function getUserFromCookie(db, request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;
  try {
    const row = await db.prepare(
      `SELECT s.user_id, u.real_name, u.name FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    ).bind(match[1]).first();
    return row || null;
  } catch { return null; }
}

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS room_employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    name TEXT NOT NULL,
    resident_first6 TEXT,
    resident_last7 TEXT,
    mode TEXT,
    last_gross_amount INTEGER,
    last_used_at TEXT,
    created_at TEXT,
    UNIQUE(room_id, name, resident_first6)
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_room_employees_room ON room_employees(room_id, last_used_at DESC)`).run();
}

async function isMember(db, roomId, userId) {
  if (!roomId || !userId) return false;
  const r = await db.prepare(
    `SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1`
  ).bind(roomId, userId).first();
  return !!r;
}

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

/* AES-GCM 암호화 (환경변수 PAYROLL_ENC_KEY 있을 때만) */
async function getEncKey(env) {
  const hex = env && env.PAYROLL_ENC_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  try {
    return await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  } catch { return null; }
}
async function encField(key, plain) {
  if (!key || !plain) return plain;
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
    const merged = new Uint8Array(12 + ct.byteLength);
    merged.set(iv);
    merged.set(new Uint8Array(ct), 12);
    let s = '';
    for (const b of merged) s += String.fromCharCode(b);
    return 'enc:' + btoa(s);
  } catch { return plain; }
}
async function decField(key, val) {
  if (!val || typeof val !== 'string' || !val.startsWith('enc:')) return val || '';
  if (!key) return ''; /* 키 없으면 암호문 못 읽음 → 빈값 반환 */
  try {
    const bin = atob(val.slice(4));
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const iv = buf.slice(0, 12);
    const ct = buf.slice(12);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch { return ''; }
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ people: [] });
  const user = await getUserFromCookie(db, context.request);
  if (!user) return Response.json({ error: "로그인 필요" }, { status: 401 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const roomId = url.searchParams.get("room_id");
  if (!roomId) return Response.json({ error: "room_id 필요" }, { status: 400 });
  if (!(await isMember(db, roomId, user.user_id))) {
    return Response.json({ error: "권한 없음" }, { status: 403 });
  }
  const { results } = await db.prepare(
    `SELECT id, name, resident_first6, resident_last7, mode, last_gross_amount, last_used_at
     FROM room_employees WHERE room_id = ?
     ORDER BY last_used_at DESC, id DESC LIMIT 50`
  ).bind(roomId).all();
  /* 암호문이면 복호화 — 키 없으면 빈값 */
  const encKey = await getEncKey(context.env);
  const people = [];
  for (const r of (results || [])) {
    const last7 = await decField(encKey, r.resident_last7);
    people.push({ ...r, resident_last7: last7 });
  }
  return Response.json({ people });
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB 미설정" }, { status: 500 });
  const user = await getUserFromCookie(db, context.request);
  if (!user) return Response.json({ error: "로그인 필요" }, { status: 401 });
  await ensureTable(db);

  let body = {};
  try { body = await context.request.json(); } catch {}
  const roomId = String(body.room_id || '').trim();
  const name = String(body.name || '').trim();
  const first6 = String(body.resident_first6 || '').replace(/[^0-9]/g, '').substring(0, 6);
  const last7 = String(body.resident_last7 || '').replace(/[^0-9]/g, '').substring(0, 7);
  const mode = body.mode === '4ins' ? '4ins' : '3.3';
  const amount = parseInt(body.amount, 10) || 0;

  if (!roomId || !name) return Response.json({ error: "room_id·name 필수" }, { status: 400 });
  if (first6 && first6.length !== 6) return Response.json({ error: "생년월일 6자리" }, { status: 400 });
  if (last7 && last7.length !== 7) return Response.json({ error: "주민번호 뒷자리 7자리" }, { status: 400 });
  if (!(await isMember(db, roomId, user.user_id))) {
    return Response.json({ error: "권한 없음" }, { status: 403 });
  }

  /* 암호화 (환경변수 있으면) */
  const encKey = await getEncKey(context.env);
  const last7Enc = last7 ? await encField(encKey, last7) : null;

  const now = kst();
  try {
    // UPSERT: 같은 room_id+name+first6 이면 last_* 갱신, 없으면 INSERT
    await db.prepare(
      `INSERT INTO room_employees (room_id, name, resident_first6, resident_last7, mode, last_gross_amount, last_used_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(room_id, name, resident_first6) DO UPDATE SET
         resident_last7 = excluded.resident_last7,
         mode = excluded.mode,
         last_gross_amount = excluded.last_gross_amount,
         last_used_at = excluded.last_used_at`
    ).bind(roomId, name, first6 || null, last7Enc, mode, amount || null, now, now).run();
    return Response.json({ ok: true, encrypted: !!encKey });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB 미설정" }, { status: 500 });
  const user = await getUserFromCookie(db, context.request);
  if (!user) return Response.json({ error: "로그인 필요" }, { status: 401 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const id = parseInt(url.searchParams.get("id") || '0', 10);
  const roomId = url.searchParams.get("room_id");
  if (!id || !roomId) return Response.json({ error: "id·room_id 필요" }, { status: 400 });
  if (!(await isMember(db, roomId, user.user_id))) {
    return Response.json({ error: "권한 없음" }, { status: 403 });
  }
  await db.prepare(`DELETE FROM room_employees WHERE id = ? AND room_id = ?`).bind(id, roomId).run();
  return Response.json({ ok: true });
}
