/**
 * 📖 업무 가이드 wrapper (2026-07-07): 옛 functions/api/admin-guides.js → Next.js route.ts
 */
export const runtime = 'edge';

import { callLegacy } from '@/lib/cf-context';
import { onRequestGet, onRequestPost, onRequestPut, onRequestDelete } from '../../../functions/api/admin-guides.js';

export async function GET(request: Request) {
  return callLegacy(onRequestGet as any, request);
}

export async function POST(request: Request) {
  return callLegacy(onRequestPost as any, request);
}

export async function PUT(request: Request) {
  return callLegacy(onRequestPut as any, request);
}

export async function DELETE(request: Request) {
  return callLegacy(onRequestDelete as any, request);
}
