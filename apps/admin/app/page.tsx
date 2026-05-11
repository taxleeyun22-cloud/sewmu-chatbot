/**
 * Phase Next-Day28 (2026-05-11): / → /admin/dashboard (새 shadcn UI 우선).
 * 사장님 명령 "구글직원처럼".
 *
 * 진입 흐름:
 *   / → /admin/dashboard → middleware 인증 → 비로그인 시 /login
 *   /admin.html → 옛 admin 직접 진입 (백업, 모든 25 모달 + 기능 그대로)
 *   /login → shadcn login (ADMIN_KEY 비번 + 카카오 OAuth)
 */
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/admin/dashboard');
}
