// 관리자 대시보드 요약 데이터
import { checkAdmin, adminUnauthorized, ownerOnly } from "./_adminAuth.js";

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!auth.owner) return ownerOnly();

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB not configured" }, { status: 500 });

  try {
    // 컬럼 보장
    try { await db.prepare(`ALTER TABLE conversations ADD COLUMN confidence TEXT`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE conversations ADD COLUMN reviewed INTEGER DEFAULT 0`).run(); } catch {}
    try { await db.prepare(`ALTER TABLE conversations ADD COLUMN reported INTEGER DEFAULT 0`).run(); } catch {}

    // KST 날짜
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const kstToday = kstNow.toISOString().substring(0, 10);
    const kstYest = new Date(kstNow.getTime() - 86400000).toISOString().substring(0, 10);
    const kstWeekAgo = new Date(kstNow.getTime() - 7 * 86400000).toISOString().substring(0, 10);

    // 오늘 메시지 수
    const todayCount = await db.prepare(
      `SELECT COUNT(*) as n FROM conversations WHERE created_at LIKE ?`
    ).bind(kstToday + "%").first();

    // 어제 메시지 수
    const yestCount = await db.prepare(
      `SELECT COUNT(*) as n FROM conversations WHERE created_at LIKE ?`
    ).bind(kstYest + "%").first();

    // 오늘 활성 사용자
    const todayUsers = await db.prepare(
      `SELECT COUNT(DISTINCT user_id) as n FROM conversations WHERE created_at LIKE ? AND user_id IS NOT NULL`
    ).bind(kstToday + "%").first();

    // 전체 사용자
    let totalUsers = { n: 0 };
    try {
      totalUsers = await db.prepare(`SELECT COUNT(*) as n FROM users`).first();
    } catch {}

    // 전체 대화 수
    const totalMessages = await db.prepare(
      `SELECT COUNT(*) as n FROM conversations WHERE role IN ('user','assistant')`
    ).first();

    // 신뢰도 분포 (assistant only)
    const confidenceDist = await db.prepare(`
      SELECT
        SUM(CASE WHEN confidence = '높음' THEN 1 ELSE 0 END) as high,
        SUM(CASE WHEN confidence = '보통' THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN confidence = '낮음' THEN 1 ELSE 0 END) as low,
        SUM(CASE WHEN confidence IS NULL AND role='assistant' THEN 1 ELSE 0 END) as unknown
      FROM conversations WHERE role='assistant'
    `).first();

    // 검증 필요 건수 (보통 + 낮음 + 신고, 미검토만)
    const needReview = await db.prepare(`
      SELECT COUNT(*) as n FROM conversations
      WHERE role = 'assistant'
        AND (confidence IN ('보통','낮음') OR reported = 1)
        AND (reviewed = 0 OR reviewed IS NULL)
    `).first();

    // 주간 추세 (최근 7일 일별 메시지 수)
    const weeklyTrend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(kstNow.getTime() - i * 86400000).toISOString().substring(0, 10);
      const r = await db.prepare(
        `SELECT COUNT(*) as n FROM conversations WHERE created_at LIKE ? AND role = 'user'`
      ).bind(d + "%").first();
      weeklyTrend.push({ date: d, count: r?.n || 0 });
    }

    // 최근 대화 5개 (미리보기)
    const { results: recent } = await db.prepare(`
      SELECT c.session_id, c.user_id, c.created_at, c.content, u.name, u.profile_image, u.provider
      FROM conversations c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.role = 'user'
      ORDER BY c.created_at DESC
      LIMIT 5
    `).all();

    /* 문서 KPI (T3): 이번달 승인율, 평균 처리시간, OCR 비용 */
    let docKpi = null;
    try {
      const monthPrefix = kstToday.substring(0, 7);
      const docTotal = await db.prepare(
        `SELECT COUNT(*) as n FROM documents WHERE substr(created_at,1,7) = ?`
      ).bind(monthPrefix).first();
      const docApproved = await db.prepare(
        `SELECT COUNT(*) as n FROM documents WHERE substr(created_at,1,7) = ? AND status = 'approved'`
      ).bind(monthPrefix).first();
      const docPending = await db.prepare(
        `SELECT COUNT(*) as n FROM documents WHERE substr(created_at,1,7) = ? AND status = 'pending'`
      ).bind(monthPrefix).first();
      const docRejected = await db.prepare(
        `SELECT COUNT(*) as n FROM documents WHERE substr(created_at,1,7) = ? AND status = 'rejected'`
      ).bind(monthPrefix).first();
      const docCost = await db.prepare(
        `SELECT COALESCE(SUM(cost_cents),0) AS cents FROM ocr_usage_log WHERE substr(created_at,1,7) = ?`
      ).bind(monthPrefix).first();
      /* 수정률 (세무사가 OCR 결과를 손댄 비율) */
      const corrections = await db.prepare(
        `SELECT COUNT(DISTINCT doc_id) as n FROM corrections WHERE substr(created_at,1,7) = ?`
      ).bind(monthPrefix).first().catch(() => null);
      docKpi = {
        total: docTotal?.n || 0,
        approved: docApproved?.n || 0,
        pending: docPending?.n || 0,
        rejected: docRejected?.n || 0,
        approval_rate: (docTotal?.n || 0) > 0 ? Math.round(((docApproved?.n || 0) / docTotal.n) * 100) : 0,
        ocr_cost_krw: Math.round((docCost?.cents || 0) * 14),
        correction_count: corrections?.n || 0,
        correction_rate: (docTotal?.n || 0) > 0 ? Math.round(((corrections?.n || 0) / docTotal.n) * 100) : 0,
      };
    } catch {}

    return Response.json({
      today: {
        messages: todayCount?.n || 0,
        users: todayUsers?.n || 0,
        changePercent: yestCount?.n > 0
          ? Math.round(((todayCount?.n - yestCount?.n) / yestCount?.n) * 100)
          : 0,
      },
      totals: {
        users: totalUsers?.n || 0,
        messages: totalMessages?.n || 0,
      },
      confidence: {
        high: confidenceDist?.high || 0,
        medium: confidenceDist?.medium || 0,
        low: confidenceDist?.low || 0,
        unknown: confidenceDist?.unknown || 0,
      },
      needReview: needReview?.n || 0,
      weeklyTrend,
      docKpi,
      recent: (recent || []).map(r => ({
        session_id: r.session_id,
        user_id: r.user_id,
        created_at: r.created_at,
        preview: (r.content || "").substring(0, 60),
        name: r.name || "비로그인",
        profile_image: r.profile_image,
        provider: r.provider,
      })),
    });
  } catch (e) {
    return Response.json({ error: "처리 실패" }, { status: 500 });
  }
}
