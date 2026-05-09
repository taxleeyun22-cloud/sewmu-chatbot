/**
 * Phase Next-1.3 (2026-05-09): root layout (Next.js 15 App Router).
 *
 * 사장님 환경:
 *   - 거래처 50~70대 사장님 多 → 모바일 친화 (large tap area, 큰 글자)
 *   - 한국어 (ko-KR)
 *   - PWA 지원 (manifest.json — 추후 추가)
 */
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '세무회계 이윤 — AI 세무 상담',
  description:
    '대구 달서구 세무회계 이윤. AI 세무 챗봇 + 영수증 업로드 + 신고 관리.',
  metadataBase: new URL('https://sewmu-chatbot.pages.dev'),
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
