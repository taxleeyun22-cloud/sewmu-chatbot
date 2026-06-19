/**
 * Wrapper (2026-06-17): 옛 functions/api/admin-scrape-trigger.js → Next.js route.ts
 * 신고서 스크래핑 enqueue (세무대리 수임동의 기반).
 */
export const runtime = 'edge';

import { callLegacy } from '@/lib/cf-context';
import { onRequestPost } from '../../../functions/api/admin-scrape-trigger.js';

export async function POST(request: Request) {
  return callLegacy(onRequestPost as any, request);
}
