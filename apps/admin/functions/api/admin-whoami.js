/**
 * Phase #10 메타 (2026-05-06): 현재 admin 의 role 정보 조회.
 *
 * 프론트(admin.js) 에서 IS_OWNER / IS_MANAGER / IS_STAFF 결정용.
 *
 * GET /api/admin-whoami?key=ADMIN_KEY  (또는 cookie)
 * 응답:
 *   { ok: true, role: 'owner'|'manager'|'staff', owner: bool, manager: bool, userId: number|null }
 *   { ok: false, role: null, owner: false, manager: false, userId: null }
 */

import { whoami } from "./_authz.js";

export async function onRequestGet(context) {
  const result = await whoami(context);
  if (!result.ok) {
    return Response.json(result, { status: 401 });
  }
  return Response.json(result);
}
