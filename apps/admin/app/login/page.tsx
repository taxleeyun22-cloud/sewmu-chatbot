/**
 * Phase Next-Day28 (2026-05-11): admin 로그인 — shadcn/ui.
 *
 * 1. ADMIN_KEY 비번 (사장님 빠른 진입)
 * 2. 카카오 OAuth (직원)
 */
'use client';

import { signIn } from 'next-auth/react';
import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 via-white to-blue-50 p-6">
      {/* 브랜드 헤더 */}
      <div className="mb-6 text-center">
        <div className="w-16 h-16 mx-auto mb-3 rounded-xl bg-brand-primary text-white flex items-center justify-center text-2xl font-bold shadow-lg shadow-brand-primary/20">
          세
        </div>
        <h1 className="text-xl font-bold text-gray-900">세무회계 이윤</h1>
        <p className="text-xs text-gray-500 mt-1">대구 달서구 · 이재윤 대표세무사</p>
      </div>

      <Card className="w-full max-w-sm shadow-xl">
        <CardContent className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-md p-2.5">
              로그인 오류: {error}
            </div>
          )}

          {/* 사장님 비번 진입 */}
          <form onSubmit={loginWithKey} className="space-y-2">
            <label className="block text-xs font-medium text-gray-700">
              <span className="mr-1">👑</span> 사장님 비번
            </label>
            <div className="flex gap-1.5">
              <Input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="관리자 비밀번호"
                disabled={submitting}
                className="flex-1 h-9"
                autoFocus
              />
              <Button type="submit" disabled={submitting || !adminKey} size="default">
                {submitting ? '...' : '진입'}
              </Button>
            </div>
            {keyError && <p className="text-[11px] text-red-600">{keyError}</p>}
          </form>

          <div className="relative my-3">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-[10px] text-gray-400">
              또는
            </span>
          </div>

          {/* 직원 카톡 */}
          <button
            onClick={() => signIn('kakao', { callbackUrl })}
            className="w-full bg-yellow-300 hover:bg-yellow-400 active:bg-yellow-500 text-gray-900 font-medium py-2.5 rounded-md transition-colors flex items-center justify-center gap-2 text-sm shadow-sm"
          >
            <span>💬</span>
            직원 — 카카오 계정으로 시작
          </button>

          <p className="text-[10px] text-gray-500 text-center pt-2 border-t border-gray-100">
            ⚠️ 관리자 권한이 있어야 진입 가능합니다.
            <br />비번 분실 시 → 사장님께 문의
          </p>
        </CardContent>
      </Card>

      <p className="text-[10px] text-gray-400 mt-4">
        © 2026 세무회계 이윤 · Powered by Next.js + Cloudflare
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-xs text-gray-400">
          로딩...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
