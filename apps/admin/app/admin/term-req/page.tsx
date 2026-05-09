/**
 * Phase Next-Day14 (2026-05-09): /admin/term-req 종료 요청.
 * 거래처가 직접 "거래 종료" 요청한 list.
 */
export default function TermReqPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">⚠️ 종료 요청</h1>
      <div className="bg-white rounded-2xl p-6">
        <p className="text-center text-gray-400 py-12 text-sm">
          termination_requests 테이블 list — Day 15 본격 (router 추가).
        </p>
      </div>
    </div>
  );
}
