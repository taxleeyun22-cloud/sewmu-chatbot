/**
 * Phase Next-1.3 (2026-05-09): "/" 챗봇 메인 (placeholder).
 *
 * Week 2 에서 실제 챗봇 UI:
 *   - 메시지 입력
 *   - GPT-4.1-mini 호출 (existing chat.js 로직 재사용)
 *   - FAQ RAG retrieval
 *   - 카카오 로그인 후 daily 한도
 */
export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          세무회계 이윤 — AI 세무 챗봇
        </h1>
        <p className="text-gray-600 mb-2">
          Week 1 — Next.js 15 + Turborepo monorepo 골격 ✅
        </p>
        <p className="text-sm text-gray-400">
          Week 2 에서 실제 챗봇 UI 마이그레이션 시작
        </p>
        <a
          href="https://sewmu-chatbot.pages.dev"
          className="inline-block mt-6 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          → 현재 prod 챗봇 (옛 시스템)
        </a>
      </div>
    </main>
  );
}
