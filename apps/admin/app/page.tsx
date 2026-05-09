/**
 * Phase Next-Week4 (2026-05-09): apps/admin 진입 페이지 (placeholder).
 * Day 1 = 골격 시작. 실제 dashboard 는 /admin/dashboard.
 */
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/admin/dashboard');
}
