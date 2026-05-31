/**
 * Skeleton — 로딩 자리표시자 (사장님 UX 개선 #5, 2026-05-31).
 *
 * 메가앱(유튜브·인스타·페북)은 "불러오는 중…" 텍스트 대신 회색 박스가 반짝이는
 * 스켈레톤으로 "곧 뜬다"는 느낌을 줌. Tailwind animate-pulse 활용.
 *
 * 사용:
 *   <Skeleton className="h-4 w-40" />
 *   <SkeletonList rows={5} />   // 카드형 목록 자리표시
 */
import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded bg-gray-200', className)} />;
}

/** 카드형 목록 로딩 — 행 N개 (목록 페이지용) */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="불러오는 중">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** 카드 본문 로딩 — 제목 + 본문 줄 (상세/대시보드용) */
export function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3" role="status" aria-label="불러오는 중">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-5/6" />
      <Skeleton className="h-3.5 w-2/3" />
    </div>
  );
}
