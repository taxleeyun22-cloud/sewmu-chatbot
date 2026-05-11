/**
 * Auto-generated wrapper (2026-05-11): 옛 functions/api/*.js → Next.js route.ts
 * 사장님 명령 "Next.js 변환하면서 복사".
 */
export const runtime = 'edge';

import { callLegacy } from '@/lib/cf-context';
import { onRequestPost } from '../../../functions/api/admin-doc-request.js';

export async function POST(request: Request) {
  return callLegacy(onRequestPost as any, request);
}
