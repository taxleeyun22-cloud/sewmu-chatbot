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

    // user_type 'client' = 기장거래처 신청 (사장님 승인 대기)
    // user_type 'guest' = 무료 사용 (바로 approved_guest)
    let approvalStatus = 'pending';
    let declaredClient = 0;
    if (userType === 'client') {
      approvalStatus = 'pending';
      declaredClient = 1;
    } else {
      approvalStatus = 'approved_guest';
      declaredClient = 0;
    }

    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    const approvedAt = approvalStatus === 'approved_guest' ? kst : null;

    await db.prepare(
      `UPDATE users SET real_name = ?, phone = ?, name_confirmed = 1,
         approval_status = ?, declared_client = ?, approved_at = ?
       WHERE id = ?`
    ).bind(realName, phone, approvalStatus, declaredClient, approvedAt, session.user_id).run();

    return Response.json({ ok: true, approval_status: approvalStatus });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
