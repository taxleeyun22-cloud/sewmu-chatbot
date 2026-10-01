/**
 * 🕘 근태·당번·연차 wrapper (2026-10-01): 옛 functions/api/attendance.js → Next.js route.ts
 */
export const runtime = 'edge';

import { callLegacy } from '@/lib/cf-context';
import { onRequestGet, onRequestPost } from '../../../functions/api/attendance.js';

export async function GET(request: Request) {
  return callLegacy(onRequestGet as any, request);
}

export async function POST(request: Request) {
  return callLegacy(onRequestPost as any, request);
}
