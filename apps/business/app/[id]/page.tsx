/**
 * Phase Next-Week6 (2026-05-09): /[id] 거래처 dashboard.
 * 기존 business.html (815줄) + business.js 마이그레이션.
 *
 * URL: /business/2478?key=...  →  Next.js: /business/2478
 */
export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bizId = parseInt(id, 10);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <a href="/admin/businesses" className="text-brand-primary text-sm">
          ← 업체 list
        </a>
        <h1 className="text-lg font-bold mt-2">🏢 업체 #{bizId}</h1>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <section className="bg-white rounded-2xl p-5">
          <h2 className="font-bold mb-3">📋 기본 정보 (위하고 호환 14필드)</h2>
          <p className="text-sm text-gray-400">
            Phase Next-Week6 — Drizzle query Day 2 본격.
          </p>
        </section>
        <section className="bg-white rounded-2xl p-5">
          <h2 className="font-bold mb-3">🏢 본·지점</h2>
          <p className="text-sm text-gray-400">parent_business_id 기반.</p>
        </section>
        <section className="bg-white rounded-2xl p-5">
          <h2 className="font-bold mb-3">👥 구성원</h2>
        </section>
        <section className="bg-white rounded-2xl p-5">
          <h2 className="font-bold mb-3">💬 연결된 상담방</h2>
        </section>
      </main>
    </div>
  );
}
