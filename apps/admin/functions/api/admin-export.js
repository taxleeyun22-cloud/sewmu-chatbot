// 관리자 전체 내보내기 (사장님 owner 전용 — 2026-04-30 명령)
// "관리자도 내보내기 기능 추가 — 이거 나만 할 수 있어야 하고 세무사만"
//
// GET /api/admin-export?type=users    → 모든 거래처(사용자) CSV
// GET /api/admin-export?type=businesses → 모든 업체 CSV
// GET /api/admin-export?type=memos    → 모든 메모 CSV (거래처/업체 컨텍스트 포함)
// GET /api/admin-export?type=all      → 통합 zip (X — Pages Functions 에서 zip 생성 어려움 → 일단 CSV 셋 별도)
//
// 인증: ?key=ADMIN_KEY (owner 만, _adminAuth 의 auth.owner=true 필요)

import { checkAdmin, adminUnauthorized, ownerOnly } from "./_adminAuth.js";

function csvCell(v) {
  const s = String(v == null ? '' : v);
  if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function csvBlob(headers, rows) {
  const csv = headers.map(csvCell).join(',') + '\n' + rows.map(r => r.map(csvCell).join(',')).join('\n');
  /* UTF-8 BOM (엑셀 한글 깨짐 방지) */
  return '﻿' + csv;
}

function todayStr() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  /* owner 전용 — 직원 admin (cookie 기반) 거부 */
  if (!auth.owner) return ownerOnly();

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  const url = new URL(context.request.url);
  const type = url.searchParams.get('type') || 'users';

  try {
    if (type === 'users') {
      /* 모든 거래처(사용자) — is_admin=0 */
      const { results } = await db.prepare(`
        SELECT u.id, u.provider, u.name, u.real_name, u.email, u.phone,
               u.approval_status, u.created_at, u.last_login_at, u.is_admin,
               u.requested_company_name, u.requested_business_number, u.requested_role,
               (SELECT GROUP_CONCAT(b.company_name, ' | ') FROM businesses b
                INNER JOIN business_members bm ON bm.business_id = b.id
                WHERE bm.user_id = u.id) AS mapped_businesses
          FROM users u
         ORDER BY u.created_at DESC
      `).all();
      const headers = ['ID','provider','닉네임','본명','이메일','전화','승인상태','가입일','마지막로그인','관리자','요청회사명','요청사업자번호','요청역할','매핑된 업체'];
      const rows = (results || []).map(r => [
        r.id, r.provider || '', r.name || '', r.real_name || '', r.email || '', r.phone || '',
        r.approval_status || '', r.created_at || '', r.last_login_at || '',
        r.is_admin ? '👑 관리자' : '',
        r.requested_company_name || '', r.requested_business_number || '', r.requested_role || '',
        r.mapped_businesses || ''
      ]);
      const csv = csvBlob(headers, rows);
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv;charset=utf-8',
          'Content-Disposition': `attachment; filename="users_${todayStr()}.csv"`,
        }
      });
    }

    if (type === 'businesses') {
      const { results } = await db.prepare(`
        SELECT b.id, b.company_name, b.company_form, b.business_number, b.sub_business_number,
               b.corporate_number, b.ceo_name, b.business_category, b.industry, b.industry_code,
               b.tax_type, b.address, b.phone, b.establishment_date, b.contract_date,
               b.fiscal_year_start, b.fiscal_year_end, b.fiscal_term, b.hr_year, b.notes,
               b.status, b.created_at,
               (SELECT GROUP_CONCAT(COALESCE(u.real_name, u.name, 'user#'||bm.user_id), ' | ')
                  FROM business_members bm
                  LEFT JOIN users u ON bm.user_id = u.id
                 WHERE bm.business_id = b.id) AS members
          FROM businesses b
         ORDER BY b.created_at DESC
      `).all();
      const headers = ['ID','회사명','회사구분','사업자번호','종사업자번호','법인등록번호','대표자','업태','업종','업종코드','과세유형','주소','전화','개업일','수임일','회계기간시작','회계기간끝','기수','인사연도','노트','상태','생성일','구성원'];
      const rows = (results || []).map(r => [
        r.id, r.company_name || '', r.company_form || '', r.business_number || '',
        r.sub_business_number || '', r.corporate_number || '', r.ceo_name || '',
        r.business_category || '', r.industry || '', r.industry_code || '',
        r.tax_type || '', r.address || '', r.phone || '',
        r.establishment_date || '', r.contract_date || '',
        r.fiscal_year_start || '', r.fiscal_year_end || '',
        r.fiscal_term || '', r.hr_year || '',
        r.notes || '', r.status || '', r.created_at || '', r.members || ''
      ]);
      const csv = csvBlob(headers, rows);
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv;charset=utf-8',
          'Content-Disposition': `attachment; filename="businesses_${todayStr()}.csv"`,
        }
      });
    }

    if (type === 'memos') {
      const { results } = await db.prepare(`
        SELECT m.id, m.memo_type, m.category, m.content, m.tags,
               m.due_date, m.created_at, m.updated_at, m.author_name,
               m.target_user_id, m.target_business_id, m.room_id,
               u.real_name AS target_user_real_name, u.name AS target_user_name,
               b.company_name AS target_business_name,
               r.name AS room_name
          FROM memos m
          LEFT JOIN users u ON m.target_user_id = u.id
          LEFT JOIN businesses b ON m.target_business_id = b.id
          LEFT JOIN chat_rooms r ON m.room_id = r.id AND m.room_id != '__none__'
         WHERE m.deleted_at IS NULL
         ORDER BY m.created_at DESC
      `).all();
      const headers = ['ID','타입','카테고리','내용','태그','기한','생성','수정','작성자','거래처(사람)','업체','상담방'];
      const rows = (results || []).map(r => {
        let tagsArr = [];
        try { tagsArr = JSON.parse(r.tags || '[]'); } catch {}
        return [
          r.id, r.memo_type || '', r.category || '', r.content || '',
          tagsArr.map(t => '#' + t).join(' '),
          r.due_date || '', r.created_at || '', r.updated_at || '',
          r.author_name || '',
          r.target_user_real_name || r.target_user_name || '',
          r.target_business_name || '',
          r.room_name || ''
        ];
      });
      const csv = csvBlob(headers, rows);
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv;charset=utf-8',
          'Content-Disposition': `attachment; filename="memos_${todayStr()}.csv"`,
        }
      });
    }

    return Response.json({ error: 'invalid type — use users/businesses/memos' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
