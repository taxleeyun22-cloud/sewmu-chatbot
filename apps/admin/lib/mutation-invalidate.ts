/**
 * Phase 14 (2026-05-12): mutationDone 룰 표준화 — React Query invalidation matrix.
 *
 * apps/admin/CLAUDE.md "🔄 Mutation 후 UI 갱신 절대 룰":
 *   - fetch (POST/PUT/DELETE) 호출 후 → 무조건 mutationDone()
 *   - 영향받는 영역만 옵션 (users / businesses / rooms / memos)
 *   - sidebar 카운트 default true
 *   - 30초 polling 의존 X — 즉시 갱신
 *
 * 새 admin (React Query) 에서는 이 헬퍼가 동일 역할.
 * useMutation onSuccess 에서 호출.
 *
 * 사용:
 *   const queryClient = useQueryClient();
 *   const m = useMutation({
 *     mutationFn: ...,
 *     onSuccess: () => invalidateAfter(queryClient, { users: true, sidebar: true }),
 *   });
 */
import type { QueryClient } from '@tanstack/react-query';

export interface InvalidateScope {
  /** 사용자 list / detail */
  users?: boolean;
  /** 업체 list / dashboard */
  businesses?: boolean;
  /** 상담방 list / detail / messages */
  rooms?: boolean;
  /** 메모 (거래처 dashboard / list) */
  memos?: boolean;
  /** 문서 (영수증 등) */
  documents?: boolean;
  /** 신고 검토표 */
  filings?: boolean;
  /** FAQ */
  faq?: boolean;
  /** 검증 (review) */
  review?: boolean;
  /** 휴지통 */
  trash?: boolean;
  /** 에러 로그 */
  errorLogs?: boolean;
  /** 사이드바 카운트 — default true (대부분 mutation 이 카운트 영향) */
  sidebar?: boolean;
}

/**
 * key prefix 매핑 — 우리 trpc query key 표준 (`users.list`, `dashboard.counts` 등).
 *
 * scope → 매칭되는 query key prefix 들.
 */
const SCOPE_KEYS: Record<keyof Omit<InvalidateScope, 'sidebar'>, string[]> = {
  users: ['users.list', 'users.byId', 'users.search', 'customer.dashboard'],
  businesses: [
    'businesses.list',
    'businesses.byId',
    'customer.businessDashboard',
  ],
  rooms: ['rooms.list', 'rooms.byId', 'rooms.messages', 'customer.dashboard'],
  memos: ['memos.list', 'memos.byUser', 'memos.byBusiness'],
  documents: ['documents.list', 'documents.byId'],
  filings: ['filings.list', 'filings.byUser'],
  faq: ['faq.list'],
  review: ['review.list'],
  trash: ['trash.list'],
  errorLogs: ['errorLogs.list', 'errorLogs.recentCount'],
};

/** sidebar count 갱신 — 모든 카운트가 dashboard.counts 한 곳에 모임. */
const SIDEBAR_KEY = 'dashboard.counts';

/**
 * mutation 후 호출 — 영향받는 query 모두 자동 invalidate.
 *
 * default: sidebar=true 만. 다른 scope 는 명시.
 */
export function invalidateAfter(qc: QueryClient, scope: InvalidateScope = {}): void {
  const opts = { sidebar: true, ...scope };

  /* 사이드바 카운트 — 거의 모든 mutation 영향 (사용자 status 변경 시 카운트 바뀜) */
  if (opts.sidebar) {
    qc.invalidateQueries({ queryKey: [SIDEBAR_KEY] });
  }

  /* 각 scope 별 query key prefix invalidate */
  for (const [key, on] of Object.entries(opts)) {
    if (key === 'sidebar' || !on) continue;
    const prefixes = SCOPE_KEYS[key as keyof typeof SCOPE_KEYS];
    if (!prefixes) continue;
    for (const p of prefixes) {
      qc.invalidateQueries({ queryKey: [p] });
    }
  }
}

/**
 * cross-page dirty flag — 다른 탭/창에서 mutation 발생 시 현재 탭도 reload.
 *
 * 사용 (mutation onSuccess):
 *   invalidateAfter(qc, { users: true });
 *   markCrossPageDirty('users');
 *
 * 사용 (페이지 mount 시):
 *   useEffect(() => watchCrossPageDirty('users', () => qc.invalidateQueries(...)));
 */
export function markCrossPageDirty(scope: keyof InvalidateScope): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`_dirty_${scope}`, String(Date.now()));
  } catch {
    /* private mode etc */
  }
}

/**
 * 다른 탭에서 dirty flag 변경 시 callback 호출.
 * @returns cleanup 함수
 */
export function watchCrossPageDirty(
  scope: keyof InvalidateScope,
  onDirty: () => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const key = `_dirty_${scope}`;
  function onStorage(e: StorageEvent) {
    if (e.key === key) onDirty();
  }
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
