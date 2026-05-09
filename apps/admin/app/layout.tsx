import type { Metadata } from 'next';
import './globals.css';

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
      <body>{children}</body>
    </html>
  );
}
