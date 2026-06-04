/**
 * Phase D4 (2026-05-21): 청구서 시스템 — section layout.
 * 2026-06-04: 사이드바 본체는 공용 ToolLayout 으로 추출 (영업 타겟과 공유).
 *
 * Sub-routes:
 *   /admin/billing          — 청구서 모아보기
 *   /admin/billing/template — 청구서 양식
 *   /admin/billing/new      — 새 청구서 발행
 *   /admin/billing/[id]     — 청구서 상세
 */
'use client';
export const runtime = 'edge';

import type { ReactNode } from 'react';
import { ToolLayout } from '@/components/ToolLayout';

export default function BillingLayout({ children }: { children: ReactNode }) {
  return <ToolLayout>{children}</ToolLayout>;
}
