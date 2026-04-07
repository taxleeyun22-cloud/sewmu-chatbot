// 대화 분석 API
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  const adminKey = context.env.ADMIN_KEY;

  if (!adminKey || key !== adminKey) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB not configured" }, { status: 500 });

  try {
    // 1. 전체 통계
    const total = await db.prepare(`
      SELECT
        COUNT(*) as total_messages,
        COUNT(DISTINCT session_id) as total_sessions,
        COUNT(DISTINCT user_id) as total_users
      FROM conversations
    `).first();

    // 2. 일별 대화 수 (최근 14일)
    const { results: daily } = await db.prepare(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count,
        COUNT(DISTINCT session_id) as sessions
      FROM conversations
      WHERE created_at >= datetime('now', '-14 days')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `).all();

    // 3. 사용자 질문만 추출 (분류용)
    const { results: questions } = await db.prepare(`
      SELECT content, created_at, user_id, session_id
      FROM conversations
      WHERE role = 'user'
      ORDER BY created_at DESC
      LIMIT 200
    `).all();

    // 4. 질문 유형 분류
    const categories = {
      "양도소득세": { keywords: ["양도", "양도세", "1세대", "주택매매", "비과세", "조정대상"], count: 0, questions: [] },
      "상속세/증여세": { keywords: ["상속", "증여", "사전증여", "차용", "2.17억", "배우자공제"], count: 0, questions: [] },
      "종합소득세": { keywords: ["종소세", "종합소득", "경비처리", "경비", "필요경비", "기장"], count: 0, questions: [] },
      "부가가치세": { keywords: ["부가세", "부가가치", "매입세액", "간이과세", "일반과세"], count: 0, questions: [] },
      "법인세": { keywords: ["법인세", "법인", "결산", "조정료"], count: 0, questions: [] },
      "원천세/급여": { keywords: ["원천세", "급여", "비과세", "식대", "유류비", "4대보험", "연말정산"], count: 0, questions: [] },
      "사업자등록/창업": { keywords: ["사업자", "창업", "개업", "간이", "폐업", "업종"], count: 0, questions: [] },
      "세무일정": { keywords: ["신고기한", "납부기한", "언제까지", "기한", "일정"], count: 0, questions: [] },
      "취득세/재산세": { keywords: ["취득세", "재산세", "생애최초", "종부세", "종합부동산"], count: 0, questions: [] },
      "경정청구/절세": { keywords: ["경정청구", "절세", "환급", "세액공제", "감면"], count: 0, questions: [] },
      "기타": { keywords: [], count: 0, questions: [] }
    };

    for (const q of questions) {
      let matched = false;
      for (const [cat, info] of Object.entries(categories)) {
        if (cat === "기타") continue;
        if (info.keywords.some(kw => q.content.includes(kw))) {
          info.count++;
          if (info.questions.length < 5) info.questions.push(q.content.substring(0, 100));
          matched = true;
          break;
        }
      }
      if (!matched) {
        categories["기타"].count++;
        if (categories["기타"].questions.length < 5) categories["기타"].questions.push(q.content.substring(0, 100));
      }
    }

    // 5. 인기 키워드 추출
    const keywordCount = {};
    const importantKeywords = ["양도세","증여세","상속세","부가세","법인세","종소세","비과세","경비","절세","환급","창업","폐업","사업자","급여","원천세","취득세","재산세","신고","납부","공제","감면","차용","배우자","1주택","다주택","간이","일반","면세"];

    for (const q of questions) {
      for (const kw of importantKeywords) {
        if (q.content.includes(kw)) {
          keywordCount[kw] = (keywordCount[kw] || 0) + 1;
        }
      }
    }

    const topKeywords = Object.entries(keywordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([keyword, count]) => ({ keyword, count }));

    // 6. 카테고리 정리
    const categoryList = Object.entries(categories)
      .map(([name, info]) => ({ name, count: info.count, sample: info.questions }))
      .sort((a, b) => b.count - a.count);

    return Response.json({
      summary: {
        total_messages: total?.total_messages || 0,
        total_sessions: total?.total_sessions || 0,
        total_users: total?.total_users || 0,
        total_questions: questions.length
      },
      daily: daily || [],
      categories: categoryList,
      topKeywords,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
