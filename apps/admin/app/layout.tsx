import type { Metadata } from 'next';
import './globals.css';
import { ClientErrorHookup } from './client-error-hookup';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: '관리자 — 세무회계 이윤',
  description: '세무회계 이윤 관리자 패널',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* Phase 14 (2026-05-12): FOUC 방지 — paint 전 dark 클래스 적용.
            React hydration 전에 실행돼서 깜빡임 0. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark');}catch(_){}})();`,
          }}
        />
      </head>
      <body>
        <ClientErrorHookup source="admin" />
        {/* Providers 안에 Toaster + ConfirmDialog 가 mount 됨 (Phase 11) */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
