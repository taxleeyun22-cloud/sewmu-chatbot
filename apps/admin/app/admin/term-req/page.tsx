/**
 * Phase Next-Day28 (2026-05-11): /admin/term-req — shadcn/ui.
 */
import { Card, CardContent } from '@/components/ui/card';

export default function TermReqPage() {
  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      <header>
        <h1 className="text-lg font-bold text-gray-900">⚠️ 종료 요청</h1>
        <p className="text-xs text-gray-500 mt-0.5">거래처가 요청한 거래 종료</p>
      </header>

      <Card>
        <CardContent className="py-8 text-center text-gray-400 text-xs">
          termination_requests 테이블 list — Day 15 본격 구현 예정.
        </CardContent>
      </Card>
    </div>
  );
}
