/**
 * Phase Next-Day28 (2026-05-11): 옛 admin.html 통째 진입 (사장님 명령 "한 큐에 복사").
 * 진입: / → /admin.html (옛 admin 그대로)
 * 새 Next.js admin pages (/admin/dashboard 등) 는 archive 로 유지.
 */
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/admin.html');
}
