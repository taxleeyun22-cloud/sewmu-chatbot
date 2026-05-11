/**
 * Auto-generated wrapper (2026-05-11): 옛 functions/api/*.js → Next.js route.ts
 * 사장님 명령 "Next.js 변환하면서 복사".
 */
export const runtime = 'edge';

import { callLegacy } from '@/lib/cf-context';
import { onRequestGet } from '../../../functions/api/conversations.js';

export async function GET(request: Request) {
  return callLegacy(onRequestGet as any, request);
}
