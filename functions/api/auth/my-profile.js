// 로그인 사용자의 거래처 프로필 조회 (읽기 전용)
export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ profile: null });

  const cookie = context.request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return Response.json({ error: "로그인 필요" }, { status: 401 });

  try {
    const session = await db.prepare(
      `SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')`
    ).bind(match[1]).first();
    if (!session) return Response.json({ error: "세션 만료" }, { status: 401 });

    // 복수 사업장 조회 (우선 client_businesses, fallback client_profiles)
    let businesses = [];
    try {
      const { results } = await db.prepare(`
        SELECT company_name, business_number, ceo_name, industry, business_type,
               tax_type, establishment_date, address, phone, employee_count,
               vat_period, notes, is_primary, updated_at
        FROM client_businesses WHERE user_id = ?
        ORDER BY is_primary DESC, id ASC
      `).bind(session.user_id).all();
      businesses = results || [];
    } catch {}
    if (businesses.length === 0) {
      try {
        const old = await db.prepare(`
          SELECT company_name, business_number, ceo_name, industry, business_type,
                 tax_type, establishment_date, address, phone, employee_count,
                 vat_period, notes, 1 as is_primary, updated_at
          FROM client_profiles WHERE user_id = ?
        `).bind(session.user_id).first();
        if (old) businesses = [old];
      } catch {}
    }

    // 마스킹·메모 길이 제한
    for (const b of businesses) {
      if (b.business_number) {
        const biz = b.business_number;
        b.business_number_masked = biz.length >= 10 ? `${biz.slice(0,3)}-**-*****` : biz;
        delete b.business_number;
      }
      if (b.notes && b.notes.length > 500) b.notes = b.notes.slice(0, 500) + '...';
    }

    return Response.json({
      profile: businesses[0] || null, // 하위호환
      businesses,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
