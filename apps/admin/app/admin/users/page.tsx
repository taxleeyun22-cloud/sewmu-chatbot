/**
 * Phase 16 (2026-05-13): 옛 admin 사용자 UI 로 redirect.
 *
 * 사장님 명령: "ui가 왜이렇게 병신이고 왜 기장거래처 내가 몇명인지 볼수있게
 * 안만들어놓지?? 이거 그대로 쓰라고임마"
 *
 * 옛 admin (admin.html) 의 사용자 탭이 사장님 매일 쓰는 UI:
 * - 카운트 표시 (대기 0 / 기장거래처 254 / 일반 1 / 거절 0 / 종료 0 / 탈퇴 0 / 재가입 0 / 관리자 2)
 * - 행 별 8개 액션 (거래처정보 / 일반 / 대기로 / 거절 / 폐업 처리 / 거래 종료 / 관리자 승급 / 휴지통)
 * - 수동 거래처 추가 / 전체 내보내기 / 중복 사업장 정리
 *
 * 신규 React Query UI 는 그 매트릭스의 5%만 구현 → 폐기 + redirect.
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function UsersPage() {
  const router = useRouter();
  useEffect(() => {
    /* 옛 admin 의 사용자 탭으로 — admin.html 진입 후 hash 로 탭 선택 */
    router.replace('/admin.html#tab=users');
  }, [router]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center text-sm text-gray-500 dark:text-gray-400">
        <p>옛 admin 사용자 화면으로 이동 중...</p>
        <p className="mt-2 text-xs">
          <a href="/admin.html#tab=users" className="text-brand-primary hover:underline">
            자동 이동 안 되면 클릭
          </a>
        </p>
      </div>
    </div>
  );
}
