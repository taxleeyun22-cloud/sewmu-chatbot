/**
 * Auto-generated wrapper (2026-05-11): 옛 functions/api/*.js → Next.js route.ts
 * 사장님 명령 "Next.js 변환하면서 복사".
 */
export const runtime = 'edge';

import { callLegacy } from '@/lib/cf-context';
import { onRequestGet, onRequestPost, onRequestPatch, onRequestDelete } from '../../../functions/api/documents.js';

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
