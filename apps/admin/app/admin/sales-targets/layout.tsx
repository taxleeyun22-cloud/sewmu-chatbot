/**
 * 영업 타겟 — section layout (공용 ToolLayout 사용, 2026-06-04).
 */
'use client';
export const runtime = 'edge';

import type { ReactNode } from 'react';
import { ToolLayout } from '@/components/ToolLayout';

export default function SalesTargetsLayout({ children }: { children: ReactNode }) {
  return <ToolLayout>{children}</ToolLayout>;
}
