// 대용량 파일(>95MB) 업로드 — Cloudflare R2 멀티파트 업로드 래퍼
// Cloudflare Pages Functions의 요청 본문 100MB 한계를 우회하기 위해
// 클라이언트에서 파일을 ~10MB 청크로 쪼개서 이 엔드포인트로 여러 번 전송.
//
// 엔드포인트 (단일 파일, action 파라미터로 분기):
//   POST /api/upload-multipart?action=start       — 멀티파트 시작, {k(ey), uploadId} 반환
//   POST /api/upload-multipart?action=part        — 청크 업로드, {etag, partNumber} 반환
//     · query: k(객체 키), uploadId, partNumber
//     · body: 바이너리 청크 (5MB~95MB)
//   POST /api/upload-multipart?action=complete    — 완료 처리 + DB 메시지 생성
//     · body JSON: { key, uploadId, parts: [{partNumber, etag}], name, size, type, room_id? }
//   POST /api/upload-multipart?action=abort       — 취소 (업로드 중단 시 정리)
//     · body JSON: { key, uploadId }
//
// 주의: 쿼리 파라미터 이름 `k`는 객체 키, `key`는 ADMIN_KEY 인증용.
// body JSON의 `key`는 객체 키(충돌 없음).
//
// 인증: 세션 쿠키(고객) 또는 ?key=ADMIN_KEY

const MAX_FILE_SIZE = 300 * 1024 * 1024; // 300MB (카톡 매칭)
const PART_MIN = 5 * 1024 * 1024;        // R2/S3 멀티파트 최소 5MB (마지막 파트 제외)
const PART_MAX = 95 * 1024 * 1024;       // Workers 요청 본문 100MB 한계 아래 버퍼

const EXT_WHITELIST = ['pdf','xls','xlsx','doc','docx','ppt','pptx','hwp','hwpx','txt','csv','zip','mp4','mov','m4v','webm','mp3','m4a','wav'];

async function resolveAuth(context) {
  const url = new URL(context.request.url);
  const adminKey = context.env.ADMIN_KEY;
  if (adminKey && url.searchParams.get('key') === adminKey) {
    return { ok: true, isAdmin: true, userId: null };
  }
  const db = context.env.DB;
  if (!db) return { ok: false };
  const cookie = context.request.headers.get('Cookie') || '';
  const m = cookie.match(/session=([^;]+)/);
  if (!m) return { ok: false };
  try {
    const s = await db.prepare(
      `SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')`
    ).bind(m[1]).first();
    if (s) return { ok: true, isAdmin: false, userId: s.user_id };
  } catch {}
  return { ok: false };
}

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

export async function onRequestPost(context) {
  const bucket = context.env.MEDIA_BUCKET;
  if (!bucket) return Response.json({ error: 'R2 저장소 미설정' }, { status: 500 });

  const auth = await resolveAuth(context);
  if (!auth.ok) return Response.json({ error: '로그인 필요' }, { status: 401 });

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || 'start';

  try {
    if (action === 'start') return await handleStart(context, bucket, auth);
    if (action === 'part')  return await handlePart(context, bucket, auth);
    if (action === 'complete') return await handleComplete(context, bucket, auth);
    if (action === 'abort') return await handleAbort(context, bucket, auth);
    return Response.json({ error: 'invalid action' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}

// ── start: 멀티파트 업로드 시작 ──
async function handleStart(context, bucket, auth) {
  const body = await context.request.json();
  const name = String(body.name || 'file').slice(0, 255);
  const size = Number(body.size || 0);
  const type = String(body.type || 'application/octet-stream');

  if (!size) return Response.json({ error: '파일 크기 필요' }, { status: 400 });
  if (size > MAX_FILE_SIZE) {
    return Response.json({ error: `${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB 이하만 업로드 가능합니다` }, { status: 400 });
  }

  const dotIdx = name.lastIndexOf('.');
  const ext = dotIdx >= 0 ? name.slice(dotIdx + 1).toLowerCase() : '';
  if (ext && !EXT_WHITELIST.includes(ext)) {
    return Response.json({ error: `허용되지 않은 확장자 (${ext})` }, { status: 400 });
  }

  const random = Math.random().toString(36).slice(2, 10);
  const prefix = auth.isAdmin ? 'admin/files' : `u${auth.userId}/files`;
  const safeExt = ext || 'bin';
  const key = `${prefix}/${Date.now()}_${random}.${safeExt}`;

  const mpu = await bucket.createMultipartUpload(key, {
    httpMetadata: { contentType: type },
    customMetadata: {
      user_id: auth.isAdmin ? 'admin' : String(auth.userId),
      original_name: name,
      uploaded_at: kst(),
    },
  });

  return Response.json({ ok: true, key, uploadId: mpu.uploadId });
}

// ── part: 청크 업로드 ──
async function handlePart(context, bucket, auth) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get('k'); /* `key`는 ADMIN_KEY와 충돌하므로 `k` 사용 */
  const uploadId = url.searchParams.get('uploadId');
  const partNumber = parseInt(url.searchParams.get('partNumber') || '0', 10);
  if (!key || !uploadId || !partNumber) {
    return Response.json({ error: 'key, uploadId, partNumber 필요' }, { status: 400 });
  }
  if (partNumber < 1 || partNumber > 10000) {
    return Response.json({ error: 'partNumber 범위 오류' }, { status: 400 });
  }
  // 소유권 검증: key에 사용자 prefix 포함되어 있어야 함
  const expectedPrefix = auth.isAdmin ? 'admin/files/' : `u${auth.userId}/files/`;
  if (!key.startsWith(expectedPrefix)) {
    return Response.json({ error: '권한 없음' }, { status: 403 });
  }

  const body = context.request.body;
  if (!body) return Response.json({ error: '본문 비어있음' }, { status: 400 });

  const mpu = bucket.resumeMultipartUpload(key, uploadId);
  const part = await mpu.uploadPart(partNumber, body);
  return Response.json({ ok: true, partNumber: part.partNumber, etag: part.etag });
}

// ── complete: 완료 + DB 메시지 생성 ──
async function handleComplete(context, bucket, auth) {
  const db = context.env.DB;
  const body = await context.request.json();
  const { key, uploadId, parts, name, size, type, room_id } = body;
  if (!key || !uploadId || !Array.isArray(parts) || !parts.length) {
    return Response.json({ error: 'key, uploadId, parts 필요' }, { status: 400 });
  }
  const expectedPrefix = auth.isAdmin ? 'admin/files/' : `u${auth.userId}/files/`;
  if (!key.startsWith(expectedPrefix)) {
    return Response.json({ error: '권한 없음' }, { status: 403 });
  }

  const mpu = bucket.resumeMultipartUpload(key, uploadId);
  // 파트 번호 순으로 정렬 필수
  const ordered = parts.map(p => ({ partNumber: Number(p.partNumber), etag: String(p.etag || '') }))
                       .sort((a, b) => a.partNumber - b.partNumber);
  await mpu.complete(ordered);

  const fileUrl = `/api/file?k=${encodeURIComponent(key)}&name=${encodeURIComponent(name || 'file')}`;

  // 채팅방에 [FILE] 메시지로 기록 (room_id 있을 때만)
  let messageId = null;
  if (room_id && db) {
    try {
      const payload = JSON.stringify({ url: fileUrl, name: name || 'file', size: size || 0 });
      const content = `[FILE]${payload}`;
      const role = auth.isAdmin ? 'admin' : 'user';
      const r = await db.prepare(
        `INSERT INTO conversations (room_id, user_id, role, content, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(room_id, auth.isAdmin ? null : auth.userId, role, content, kst()).run();
      messageId = r.meta?.last_row_id;
    } catch (e) {
      // DB 실패해도 업로드 자체는 성공으로 처리
    }
  }

  return Response.json({ ok: true, key, url: fileUrl, name, size, type, messageId });
}

// ── abort: 업로드 중단 ──
async function handleAbort(context, bucket, auth) {
  const body = await context.request.json();
  const { key, uploadId } = body;
  if (!key || !uploadId) return Response.json({ error: 'key, uploadId 필요' }, { status: 400 });
  const expectedPrefix = auth.isAdmin ? 'admin/files/' : `u${auth.userId}/files/`;
  if (!key.startsWith(expectedPrefix)) return Response.json({ error: '권한 없음' }, { status: 403 });
  try {
    const mpu = bucket.resumeMultipartUpload(key, uploadId);
    await mpu.abort();
  } catch {}
  return Response.json({ ok: true });
}
