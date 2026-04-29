// 관리자 전역 검색
// GET /api/admin-search?q=XXX
// 반환: { users, conversations, rooms, room_messages, memos, businesses, documents } 각 최대 10~30건
import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

export async function onRequestGet(context) {
  if (!(await checkAdmin(context))) return adminUnauthorized();
  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q || q.length < 2) {
    return Response.json({ users: [], conversations: [], rooms: [], room_messages: [], memos: [], businesses: [], documents: [], query: q });
  }

  const pat = `%${q}%`;

  try {
    // 1) 사용자 (이름/본명/이메일/전화)
    const usersR = await db.prepare(`
      SELECT id, provider, name, real_name, email, phone, profile_image,
             approval_status, is_admin, created_at, last_login_at
      FROM users
      WHERE name LIKE ? OR real_name LIKE ? OR email LIKE ? OR phone LIKE ?
      ORDER BY last_login_at DESC
      LIMIT 10
    `).bind(pat, pat, pat, pat).all();

    // 2) 일반 대화 (방 외부)
    const convsR = await db.prepare(`
      SELECT c.id, c.session_id, c.user_id, c.role, c.content, c.created_at, c.confidence,
             u.real_name, u.name
      FROM conversations c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.content LIKE ? AND (c.room_id IS NULL OR c.room_id = '')
      ORDER BY c.created_at DESC
      LIMIT 10
    `).bind(pat).all();

    // 3) 상담방 (방 이름)
    let roomsR = { results: [] };
    try {
      roomsR = await db.prepare(`
        SELECT id, name, status, created_at,
               (SELECT COUNT(*) FROM conversations WHERE room_id = r.id) as msg_count
        FROM chat_rooms r
        WHERE name LIKE ?
        ORDER BY created_at DESC
        LIMIT 10
      `).bind(pat).all();
    } catch {}

    // 4) 상담방 메시지
    let roomMsgsR = { results: [] };
    try {
      roomMsgsR = await db.prepare(`
        SELECT c.id, c.room_id, c.role, c.content, c.created_at,
               u.real_name, u.name,
               r.name as room_name
        FROM conversations c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN chat_rooms r ON c.room_id = r.id
        WHERE c.content LIKE ? AND c.room_id IS NOT NULL AND c.room_id != ''
        ORDER BY c.created_at DESC
        LIMIT 10
      `).bind(pat).all();
    } catch {}

    // 5) 메모 — content 검색 + 메모가 박힌 위치(room/user/business) 컨텍스트 JOIN
    //    메모 빡센 세팅 (2026-04-29): category, tags, attachments 같이 반환 + tag 필터 지원
    const tagParam = (url.searchParams.get('tag') || '').trim();
    const categoryParam = (url.searchParams.get('category') || '').trim();
    let memosR = { results: [] };
    try {
      const memoWhere = [`m.deleted_at IS NULL`];
      const memoBinds = [];
      /* 검색어가 있으면 content + tags JSON 둘 다 LIKE */
      if (q) {
        memoWhere.push(`(m.content LIKE ? OR m.tags LIKE ?)`);
        memoBinds.push(pat, pat);
      }
      if (tagParam) {
        const tagStr = tagParam.slice(0, 50);
        memoWhere.push(`(m.tags IS NOT NULL AND (m.tags LIKE ? OR m.tags LIKE ? OR m.tags LIKE ? OR m.tags = ?))`);
        memoBinds.push(`%"${tagStr}"%`, `%"${tagStr}",%`, `%,"${tagStr}"%`, `["${tagStr}"]`);
      }
      if (categoryParam) {
        memoWhere.push(`m.category = ?`);
        memoBinds.push(categoryParam.slice(0, 30));
      }
      const sql = `SELECT m.id, m.room_id, m.target_user_id, m.target_business_id,
                          m.memo_type, m.content, m.due_date, m.author_name, m.created_at,
                          m.category, m.tags, m.attachments,
                          r.name AS room_name,
                          u.real_name AS target_user_real_name, u.name AS target_user_name,
                          b.company_name AS target_business_name
                     FROM memos m
                     LEFT JOIN chat_rooms r ON m.room_id = r.id AND m.room_id != '__none__'
                     LEFT JOIN users u ON m.target_user_id = u.id
                     LEFT JOIN businesses b ON m.target_business_id = b.id
                    WHERE ${memoWhere.join(' AND ')}
                    ORDER BY m.created_at DESC
                    LIMIT 30`;
      memosR = await db.prepare(sql).bind(...memoBinds).all();
      /* tags / attachments JSON parse */
      memosR.results = (memosR.results || []).map(r => ({
        ...r,
        tags: r.tags ? (function(){ try { return JSON.parse(r.tags); } catch { return []; } })() : [],
        attachments: r.attachments ? (function(){ try { return JSON.parse(r.attachments); } catch { return []; } })() : [],
      }));
    } catch {}

    // 6) 사업장 (회사명/사업자번호/대표자명)
    let businessesR = { results: [] };
    try {
      businessesR = await db.prepare(`
        SELECT id, company_name, business_number, ceo_name, company_form,
               business_category, industry, status
          FROM businesses
         WHERE company_name LIKE ? OR business_number LIKE ? OR ceo_name LIKE ?
         ORDER BY id DESC
         LIMIT 20
      `).bind(pat, pat, pat).all();
    } catch {}

    // 7) 문서 (vendor / note / category)
    let docsR = { results: [] };
    try {
      docsR = await db.prepare(`
        SELECT d.id, d.user_id, d.room_id, d.doc_type, d.vendor, d.amount, d.vat_amount,
               d.receipt_date, d.category, d.status, d.created_at,
               u.real_name, u.name
          FROM documents d
          LEFT JOIN users u ON d.user_id = u.id
         WHERE d.vendor LIKE ? OR d.note LIKE ? OR d.category LIKE ?
         ORDER BY d.created_at DESC
         LIMIT 20
      `).bind(pat, pat, pat).all();
    } catch {}

    return Response.json({
      query: q,
      users: usersR.results || [],
      conversations: convsR.results || [],
      rooms: roomsR.results || [],
      room_messages: roomMsgsR.results || [],
      memos: memosR.results || [],
      businesses: businessesR.results || [],
      documents: docsR.results || [],
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
