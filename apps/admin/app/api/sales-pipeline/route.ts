/**
 * 💼 영업 파이프라인 wrapper (2026-07-08): 옛 functions/api/sales-pipeline.js → Next.js route.ts
 */
export const runtime = 'edge';

import { callLegacy } from '@/lib/cf-context';
import { onRequestGet, onRequestPost, onRequestPatch, onRequestDelete } from '../../../functions/api/sales-pipeline.js';

export async function GET(request: Request) {
  return callLegacy(onRequestGet as any, request);
}

export async function POST(request: Request) {
  return callLegacy(onRequestPost as any, request);
}

export async function PATCH(request: Request) {
  return callLegacy(onRequestPatch as any, request);
}

export async function DELETE(request: Request) {
  return callLegacy(onRequestDelete as any, request);
}
