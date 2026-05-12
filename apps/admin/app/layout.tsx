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
    <html lang="ko">
      <body>
        <ClientErrorHookup source="admin" />
        {/* Providers 안에 Toaster + ConfirmDialog 가 mount 됨 (Phase 11) */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
