// 본명 확인 (카톡 로그인 직후 1회)
export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  const cookie = context.request.headers.get("Cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return Response.json({ error: "로그인 필요" }, { status: 401 });

  try {
    const session = await db.prepare(
      `SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')`
    ).bind(match[1]).first();
    if (!session) return Response.json({ error: "세션 만료" }, { status: 401 });

    // declared_client 컬럼 보장
    try { await db.prepare(`ALTER TABLE users ADD COLUMN declared_client INTEGER DEFAULT 0`).run(); } catch {}

    const body = await context.request.json();
    const realName = (body.real_name || "").trim();
    const phoneRaw = (body.phone || "").trim();
    const userType = (body.user_type || "guest").trim(); // 'client' or 'guest'
    // 전화번호 정규화: 숫자만 추출 후 010-XXXX-XXXX 포맷
    const digits = phoneRaw.replace(/\D/g, "");
    let phone = "";
    if (digits.length === 11 && digits.startsWith("010")) {
      phone = `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
    } else if (digits.length === 10 && (digits.startsWith("011") || digits.startsWith("016") || digits.startsWith("017") || digits.startsWith("018") || digits.startsWith("019"))) {
      phone = `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
    }

    if (!realName || realName.length < 2 || realName.length > 20) {
      return Response.json({ error: "이름을 2~20자로 입력해 주세요." }, { status: 400 });
    }
    if (!/^[가-힣a-zA-Z\s]+$/.test(realName)) {
      return Response.json({ error: "한글 또는 영문 이름만 입력 가능합니다." }, { status: 400 });
    }
    if (!phone) {
      return Response.json({ error: "올바른 휴대폰 번호를 입력해 주세요. (예: 010-1234-5678)" }, { status: 400 });
    }

    // 사장님 명령 (2026-05-07): 모든 가입자 = pending (사장님 승인 후 사용).
    // 'approved_guest' (자동 승인) 폐지. user_type 은 declared_client 구분만.
    let approvalStatus = 'pending';
    let declaredClient = (userType === 'client') ? 1 : 0;

    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    const approvedAt = null;

    await db.prepare(
      `UPDATE users SET real_name = ?, phone = ?, name_confirmed = 1,
         approval_status = ?, declared_client = ?, approved_at = ?
       WHERE id = ?`
    ).bind(realName, phone, approvalStatus, declaredClient, approvedAt, session.user_id).run();

    // 📋 unbound_client_profiles 에 이 전화번호로 매칭되는 거래처 있으면 자동 승격
    let autoMatched = false;
    try {
      const unbound = await db.prepare(
        `SELECT * FROM unbound_client_profiles WHERE phone = ? LIMIT 1`
      ).bind(phone).first();
      if (unbound) {
        await db.prepare(`
          INSERT INTO client_profiles (
            user_id, company_name, business_number, ceo_name, industry,
            business_type, tax_type, establishment_date, address, phone,
            employee_count, last_revenue, vat_period, notes, updated_at, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto-match')
          ON CONFLICT(user_id) DO UPDATE SET
            company_name = excluded.company_name,
            business_number = excluded.business_number,
            updated_at = excluded.updated_at
        `).bind(
          session.user_id,
          unbound.company_name, unbound.business_number, unbound.ceo_name,
          unbound.industry, unbound.business_type, unbound.tax_type,
          unbound.establishment_date, unbound.address, unbound.phone,
          unbound.employee_count, unbound.last_revenue, unbound.vat_period,
          unbound.notes, kst
        ).run();
        try {
          await db.prepare(
            `UPDATE unbound_client_profiles SET matched_user_id = ? WHERE id = ?`
          ).bind(session.user_id, unbound.id).run();
        } catch {}
        await db.prepare(
          `UPDATE users SET approval_status = 'approved_client', approved_at = ?, approved_by = 'auto-match' WHERE id = ?`
        ).bind(kst, session.user_id).run();
        autoMatched = true;
      }
    } catch (e) { console.error("unbound match error:", e); }

    return Response.json({
      ok: true,
      approval_status: autoMatched ? 'approved_client' : approvalStatus,
      auto_matched: autoMatched
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
