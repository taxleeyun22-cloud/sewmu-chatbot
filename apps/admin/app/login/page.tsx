/**
 * Phase Next-Day27 (2026-05-11): admin 로그인 페이지 — 2가지 방식.
 *
 * 1. **ADMIN_KEY 비번** (사장님 빠른 진입 — 옛 admin.html 방식)
 * 2. **카카오 OAuth** (직원 + 거래처)
 */
'use client';

import { signIn } from 'next-auth/react';
import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function LoginContent() {
  const params = useSearchParams();
  const router = useRouter();
  const callbackUrl = params.get('callbackUrl') || '/admin/dashboard';
  const error = params.get('error');

  const [adminKey, setAdminKey] = useState('');
  const [keyError, setKeyError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loginWithKey(e: React.FormEvent) {
    e.preventDefault();
    setKeyError('');
    setSubmitting(true);
    try {
      const r = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: adminKey }),
      });
      const data = (await r.json()) as { ok: boolean; redirect?: string; error?: string };
      if (!data.ok) {
        setKeyError(data.error || '로그인 실패');
        setSubmitting(false);
        return;
      }
      router.push(data.redirect || callbackUrl);
    } catch (err) {
      setKeyError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">세무회계 이윤</h1>
          <p className="text-sm text-gray-600">관리자 로그인</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
            로그인 오류: {error}
          </div>
        )}

        {/* 사장님 비번 진입 (옛 admin.html 방식) */}
        <form onSubmit={loginWithKey} className="mb-4">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            👑 사장님 비번
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="관리자 비밀번호"
              disabled={submitting}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
              autoFocus
            />
            <button
              type="submit"
              disabled={submitting || !adminKey}
              className="bg-brand-primary text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-50 text-sm"
            >
              {submitting ? '...' : '진입'}
            </button>
          </div>
          {keyError && (
            <p className="text-xs text-red-600 mt-1">{keyError}</p>
          )}
        </form>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">또는</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* 직원 카톡 로그인 */}
        <button
          onClick={() => signIn('kakao', { callbackUrl })}
          className="w-full bg-yellow-300 hover:bg-yellow-400 text-gray-900 font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <span>💬</span>
          직원 — 카카오 계정으로 시작
        </button>

        <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-500 text-center space-y-1">
          <p>⚠️ 관리자 권한이 있어야 진입 가능합니다.</p>
          <p>비번 분실 시 → 사장님께 문의</p>
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
