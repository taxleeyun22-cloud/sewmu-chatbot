/**
 * Wrapper (2026-06-17): 옛 functions/api/admin-scrape-review.js → Next.js route.ts
 * 신고서 스크래핑 검증 큐 (목록 + 승인/반려 reconcile).
 */
export const runtime = 'edge';

import { callLegacy } from '@/lib/cf-context';
import { onRequestGet, onRequestPost } from '../../../functions/api/admin-scrape-review.js';

export async function GET(request: Request) {
  return callLegacy(onRequestGet as any, request);
}

export async function POST(request: Request) {
  return callLegacy(onRequestPost as any, request);
}
