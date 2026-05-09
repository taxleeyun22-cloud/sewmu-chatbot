import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '거래처 — 세무회계 이윤',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
