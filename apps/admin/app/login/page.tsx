/**
 * Phase Next-Day27 (2026-05-11): admin 로그인 페이지.
 *
 * 사장님 / 직원 카톡 로그인 후 admin 사이드바 진입.
 */
'use client';

import { signIn } from 'next-auth/react';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function LoginContent() {
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') || '/admin/dashboard';
  const error = params.get('error');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">세무회계 이윤</h1>
          <p className="text-sm text-gray-600">관리자 로그인</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
            로그인 오류: {error}
          </div>
        )}

        <button
          onClick={() => signIn('kakao', { callbackUrl })}
          className="w-full bg-yellow-300 hover:bg-yellow-400 text-gray-900 font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <span>💬</span>
          카카오 계정으로 시작
        </button>

        <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-500 text-center space-y-1">
          <p>⚠️ 관리자 권한이 있어야 진입 가능합니다.</p>
          <p>권한 요청 → 사장님께 문의</p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen flex items-center justify-center">로딩...</div>}
    >
      <LoginContent />
    </Suspense>
  );
}
