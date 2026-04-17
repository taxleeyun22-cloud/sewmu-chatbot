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

    // client_profiles 테이블 없으면 null 반환
    let profile = null;
    try {
      profile = await db.prepare(`
        SELECT company_name, business_number, ceo_name, industry, business_type,
               tax_type, establishment_date, address, phone, employee_count,
               vat_period, notes, updated_at
        FROM client_profiles WHERE user_id = ?
      `).bind(session.user_id).first();
    } catch {}

    // 사업자번호 마스킹 (앞 3자리만 표시)
    if (profile && profile.business_number) {
      const biz = profile.business_number;
      profile.business_number_masked = biz.length >= 10
        ? `${biz.slice(0,3)}-**-*****`
        : biz;
      delete profile.business_number; // 원본 노출 X
    }

    // 세무사 메모는 표시하되 민감 정보라 짧게
    if (profile && profile.notes && profile.notes.length > 500) {
      profile.notes = profile.notes.slice(0, 500) + '...';
    }

    return Response.json({ profile: profile || null });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
