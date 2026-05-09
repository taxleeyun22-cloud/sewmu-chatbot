/**
 * Phase Next-Day15 (2026-05-09): 로그인 페이지.
 * 거래처 사장님 1순위 = 카카오 (50~70대 친숙).
 */
'use client';

import { signIn } from 'next-auth/react';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function LoginContent() {
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') || '/';
  const error = params.get('error');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">세무회계 이윤</h1>
          <p className="text-sm text-gray-600">AI 세무 챗봇 — 로그인</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
            로그인 오류: {error}
          </div>
        )}

        <button
          onClick={() => signIn('kakao', { callbackUrl })}
          className="w-full bg-yellow-300 hover:bg-yellow-400 text-gray-900 font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 mb-3"
        >
          <span>💬</span>
          카카오 계정으로 시작
        </button>

        <button
          onClick={() => signIn('naver', { callbackUrl })}
          className="w-full bg-green-500 hover:bg-green-600 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <span>N</span>
          네이버 계정으로 시작
        </button>

        <p className="text-xs text-gray-500 text-center mt-6">
          가입만 해도 일 5회 무료 상담 / 기장거래처는 무제한
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">로딩...</div>}>
      <LoginContent />
    </Suspense>
  );
}
