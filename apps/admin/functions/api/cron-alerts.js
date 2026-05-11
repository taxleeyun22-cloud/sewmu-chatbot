// D-day 알림 발송 — 트리거 도달한 alerts를 처리
//
// 호출 방법 (택 1):
//   1) Cloudflare Workers Cron Trigger (별도 Worker + wrangler.toml 설정 — 세무사님이 하실 것)
//   2) 외부 cron 서비스 (cron-job.org 무료) → POST /api/cron-alerts?key=CRON_KEY
//   3) 관리자 대시보드에서 수동 실행
//
// 매 호출 시:
//   - trigger_date - lead_days <= today 이고 status='pending' 인 alerts 조회
//   - 각 건에 대해 상담방(있으면)에 시스템 메시지로 등록
//   - status = 'sent', sent_at 기록
//
// 발송 방식:
//   - 해당 user_id의 가장 최근 active 상담방에 시스템 메시지로 insert
//   - 메시지는 human_advisor 가 아닌 [ALERT] 프리픽스로 구분 (향후 고객 UI에서 강조)

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}
function ymd() { return kst().substring(0, 10); }

async function authorized(context) {
  const url = new URL(context.request.url);
  // ADMIN_KEY 또는 CRON_KEY 허용
  const adminKey = context.env.ADMIN_KEY;
  const cronKey = context.env.CRON_KEY || context.env.ADMIN_KEY;
  const key = url.searchParams.get('key');
  if (adminKey && key === adminKey) return true;
  if (cronKey && key === cronKey) return true;
  return false;
}

export async function onRequestGet(context) { return run(context); }
export async function onRequestPost(context) { return run(context); }

async function run(context) {
  if (!await authorized(context)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'no_db' }, { status: 500 });

  const url = new URL(context.request.url);
  const dryRun = url.searchParams.get('dry_run') === '1';
  const today = ymd();

  // 테이블 보장 (독립 호출돼도 동작하게)
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS document_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, source_doc_id INTEGER, user_id INTEGER NOT NULL,
      alert_type TEXT NOT NULL, trigger_date TEXT NOT NULL, lead_days INTEGER DEFAULT 0,
      title TEXT, message TEXT, status TEXT DEFAULT 'pending',
      sent_at TEXT, dismissed_at TEXT, created_at TEXT
    )`).run();
  } catch {}

  // 트리거 도달한 pending alerts 조회
  // 조건: trigger_date - lead_days 일 수가 오늘 이하
  // SQLite: date(trigger_date, '-N days') 사용
  const { results: alerts } = await db.prepare(
    `SELECT a.*, d.room_id AS source_room_id
     FROM document_alerts a
     LEFT JOIN documents d ON a.source_doc_id = d.id
     WHERE a.status = 'pending'
       AND date(a.trigger_date, '-' || a.lead_days || ' days') <= ?
     ORDER BY a.trigger_date ASC
     LIMIT 100`
  ).bind(today).all();

  if (dryRun) {
    return Response.json({ dry_run: true, count: (alerts || []).length, alerts: alerts || [] });
  }

  let sentCount = 0;
  const results = [];

  for (const a of (alerts || [])) {
    try {
      // 해당 user의 타깃 상담방 찾기 (source_doc.room_id 우선, 없으면 가장 최근 active)
      let roomId = a.source_room_id;
      if (!roomId) {
        const r = await db.prepare(
          `SELECT rm.room_id FROM room_members rm
           JOIN chat_rooms r ON rm.room_id = r.id
           WHERE rm.user_id = ? AND rm.left_at IS NULL AND r.status = 'active'
           ORDER BY r.created_at DESC LIMIT 1`
        ).bind(a.user_id).first();
        roomId = r?.room_id || null;
      }

      if (roomId) {
        // 상담방에 [ALERT] 메시지 삽입
        const content = `[ALERT]${JSON.stringify({ t: a.title, m: a.message, d: a.trigger_date, at: a.alert_type })}`;
        await db.prepare(
          `INSERT INTO conversations (session_id, user_id, role, content, room_id, created_at)
           VALUES (?, NULL, 'assistant', ?, ?, ?)`
        ).bind('room_' + roomId, content, roomId, kst()).run();
      }

      await db.prepare(
        `UPDATE document_alerts SET status = 'sent', sent_at = ? WHERE id = ?`
      ).bind(kst(), a.id).run();

      sentCount++;
      results.push({ id: a.id, ok: true, room_id: roomId });
    } catch (e) {
      results.push({ id: a.id, ok: false, error: e.message });
    }
  }

  return Response.json({ today, checked: (alerts||[]).length, sent: sentCount, results });
}
