/**
 * Phase Next-Day27 (2026-05-11): GET /api/permissions
 *
 * 옛 admin.html / staff.html 이 진입 시 호출 → 권한 catalog 받음.
 * SSOT — packages/auth/src/rbac.ts 가 단일 진실, build 시 JSON 으로 export.
 *
 * 사용 (admin.js):
 *   const r = await fetch('/api/permissions');
 *   const { permissions, version } = await r.json();
 *   window.__PERMISSIONS = permissions;
 *   // 그 후 코드: canDo('admin:business:delete')
 *
 * 인증: 없음 (catalog 자체는 비밀 X — 어떤 role 이 어떤 권한 필요한지만 노출).
 *      개별 액션은 백엔드 endpoint 에서 checkPermission() 으로 차단.
 */

import permissionsData from "./_permissions.json" with { type: "json" };

export async function onRequestGet() {
  return Response.json(permissionsData, {
    headers: {
      'Cache-Control': 'public, max-age=300, must-revalidate',  // 5분 cache
    },
  });
}
