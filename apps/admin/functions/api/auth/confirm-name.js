// 본명 확인 (카톡 로그인 직후 1회)
//
// 2026-10-20 사장님: "매칭 … 위하고랑 엮어서 2차 검증까지 자동화. 자동 연결은 하지 말고 내 버튼은 있어야."
//  - 기장거래처(client) 신청이면 생년월일(8자리)·사업자번호(아무 사업장 하나)도 받아 claim_* 에 적어 둔다.
//    승인 화면이 이 값으로 위하고 데이터와 대조한다 (_client-match.js). 주민번호는 받지 않는다.
//  - 예전 "전화번호가 명단(unbound_client_profiles)과 같으면 자동 승인" 은 없앴다 — 본인이 친 번호는 확인이 안 되고,
//    사장님이 버튼으로 확정하기로 했다.
import { ensureClaimColumns, normBirth, digits as onlyDigits } from "../_client-match.js";

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

    /* 기장거래처 신청 = 생년월일 8자리 + 사업자번호 10자리 필수 (위하고 대조용) */
    let claimBirth = null, claimBn = null;
    if (userType === 'client') {
      claimBirth = normBirth(body.birth_date);
      if (!claimBirth) {
        return Response.json({ error: "생년월일 8자리를 입력해 주세요. (예: 19720420)" }, { status: 400 });
      }
      claimBn = onlyDigits(body.business_number);
      if (claimBn.length !== 10) {
        return Response.json({ error: "사업자등록번호 10자리를 입력해 주세요. (사업장이 여러 곳이면 아무 곳 하나)" }, { status: 400 });
      }
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

    /* 이미 승인된 사람(재가입·재확인)의 상태는 이 화면이 바꾸지 않는다 — pending/guest 가입 흐름에서만 */
    const cur = await db.prepare(`SELECT approval_status FROM users WHERE id = ?`).bind(session.user_id).first();
    const curStatus = cur ? (cur.approval_status || 'pending') : 'pending';
    const keepStatus = ['approved_client', 'rejected', 'terminated'].includes(curStatus);
    const nextStatus = keepStatus ? curStatus : approvalStatus;

    await db.prepare(
      `UPDATE users SET real_name = ?, phone = ?, name_confirmed = 1,
         approval_status = ?, declared_client = ?, approved_at = COALESCE(approved_at, ?)
       WHERE id = ?`
    ).bind(realName, phone, nextStatus, declaredClient, keepStatus ? null : approvedAt, session.user_id).run();

    if (claimBirth && claimBn) {
      await ensureClaimColumns(db);
      await db.prepare(
        `UPDATE users SET claim_birth_date = ?, claim_business_number = ?, claim_at = ? WHERE id = ?`
      ).bind(claimBirth, claimBn, kst, session.user_id).run();
    }

    return Response.json({ ok: true, approval_status: nextStatus, auto_matched: false });
  } catch (e) {
    console.error('[confirm-name]', e);
    return Response.json({ error: "저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
