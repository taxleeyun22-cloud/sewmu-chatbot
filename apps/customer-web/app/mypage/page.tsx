/**
 * Phase Next-Week2 (2026-05-09): /mypage 마이페이지.
 *
 * 기존 index.html mypage 영역 → Next.js page.
 *
 * Week 2 단계:
 *   1. 기본 마크업 (이번 commit)
 *   2. 사용자 정보 fetch (tRPC)
 *   3. 매핑 사업장 list
 *   4. 상담방 list
 *   5. 문서함
 *   6. 사장님 카드 (D-day 신고일 / 재무 요약 / 새 메시지)
 */
import Link from 'next/link';

export default function MyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-brand-primary text-sm">
          ← 챗봇
        </Link>
        <h1 className="text-lg font-bold">내 정보</h1>
        <button className="text-sm text-gray-500">새로고침</button>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Status 배너 — Week 2 Day 3 에서 fetch */}
        <div className="bg-gradient-to-r from-brand-primary to-blue-600 text-white rounded-2xl p-5">
          <p className="text-sm opacity-90">✓ 기장거래처</p>
          <p className="text-xl font-bold mt-1">무제한 이용</p>
          <p className="text-xs opacity-75 mt-2">오늘 0건 사용</p>
        </div>

        {/* 내 사업장 — Week 2 Day 4 에서 fetch */}
        <section className="bg-white rounded-2xl p-5">
          <h2 className="font-bold mb-3">🏢 내 사업장</h2>
          <p className="text-sm text-gray-500">
            (Week 2 Day 4 마이그레이션 예정)
          </p>
        </section>

        {/* 내 상담방 — Week 2 Day 4 에서 fetch */}
        <section className="bg-white rounded-2xl p-5">
          <h2 className="font-bold mb-3">💬 내 상담방</h2>
          <p className="text-sm text-gray-500">
            (Week 2 Day 4 마이그레이션 예정)
          </p>
        </section>

        {/* 내 문서함 — Week 2 Day 5 에서 fetch */}
        <section className="bg-white rounded-2xl p-5">
          <h2 className="font-bold mb-3">📂 내 문서함</h2>
          <p className="text-sm text-gray-500">
            (Week 2 Day 5 마이그레이션 예정 — 영수증 업로드 + R2)
          </p>
        </section>

        {/* 빠른 액션 */}
        <section className="bg-white rounded-2xl p-5">
          <h2 className="font-bold mb-3">⚡ 빠른 액션</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/"
              className="bg-brand-primary text-white text-center py-3 rounded-xl font-medium hover:bg-blue-600 transition-colors"
            >
              💬 챗봇 상담
            </Link>
            <button className="bg-gray-100 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-200 transition-colors">
              📷 영수증 업로드
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
