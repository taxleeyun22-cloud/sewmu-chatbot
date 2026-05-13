/**
 * Phase 16 (2026-05-13) 사장님 명령 "옛으로 통일": / → /admin.html (옛 admin 단일화).
 *
 * 진입 흐름:
 *   / → /admin.html → 옛 admin 사이드바 + 모든 기능
 *   /login → 옛 admin 의 로그인 폼 (사장님 비번 + 카카오 OAuth)
 *
 * 새 Next.js admin 페이지들은 모두 /admin.html#tab=X 으로 redirect (디자인 통일).
 */
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/admin.html');
}
