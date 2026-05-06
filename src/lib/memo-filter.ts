/**
 * Phase #3 적용 확장 (2-2, 2026-05-06): admin-memos.js 의 필터·정렬 로직 .ts 추출.
 *
 * 목적:
 *   - admin-memos.js 의 _renderCdMemos / cdMemoFilter / 정렬 로직 중
 *     순수 로직 부분을 .ts 로 분리 (DOM 조작 X, 함수형).
 *   - 단위 테스트 가능 + 타입 안전.
 *   - admin-memos.js 가 window.__memoFilter 호출 (점진 마이그레이션).
 *
 * 향후 (사장님 결정 후):
 *   - admin-memos.js 의 _renderCdMemos 내 필터 부분 → 이 모듈 호출
 *   - admin-rooms-msg.js 의 _filterMemos 도 동일 로직 재사용
 */

import type { Memo } from '@/features/memos/state';

/* ============================================================
 * 카테고리 매칭 — 신규 3종 + 구버전 6종 호환
 * ============================================================ */

/** 신규 3종 카테고리 (현재 정식) */
export const NEW_MEMO_TYPES = ['할 일', '완료', '거래처 정보'] as const;

/** 구버전 6종 (하위 호환) */
export const LEGACY_MEMO_TYPES = ['사실메모', '확인필요', '고객요청', '담당자판단', '주의사항', '완료처리', '참고'] as const;

/** 모든 허용 타입 */
export const ALLOWED_MEMO_TYPES: readonly string[] = [...NEW_MEMO_TYPES, ...LEGACY_MEMO_TYPES];

/** 카테고리 → 통합 그룹 (신규 3종 기준) */
export type MemoTypeGroup = '할 일' | '완료' | '거래처 정보';

/**
 * 메모 타입 → 통합 그룹 (구버전 자동 매핑).
 * @example
 *   normalizeMemoType('확인필요')   // '할 일'
 *   normalizeMemoType('완료처리')   // '완료'
 *   normalizeMemoType('주의사항')   // '거래처 정보'
 */
export function normalizeMemoType(memoType: string | null | undefined): MemoTypeGroup {
  const t = String(memoType || '').trim();
  if (t === '할 일' || t === '확인필요' || t === '고객요청') return '할 일';
  if (t === '완료' || t === '완료처리') return '완료';
  /* default — 거래처 정보 / 사실메모 / 담당자판단 / 주의사항 / 참고 */
  return '거래처 정보';
}

/* ============================================================
 * 카테고리 필터
 * ============================================================ */

/** 거래처 dashboard 의 카테고리 탭 */
export type CdMemoCategory =
  | 'all'
  | '할 일'
  | '거래처 정보'
  | '완료'
  | '전화'
  | '문서'
  | '이슈'
  | '약속'
  | '일반';

/**
 * 거래처 dashboard 카테고리 매칭.
 * - 'all' → 항상 true
 * - 신규 3종 → memoType 그룹 매칭
 * - 5종 카테고리 (전화/문서/이슈/약속/일반) → memo.category 매칭
 */
export function matchCdCategory(memo: Memo, category: CdMemoCategory): boolean {
  if (category === 'all') return true;
  if (category === '할 일' || category === '완료' || category === '거래처 정보') {
    return normalizeMemoType(memo.memo_type) === category;
  }
  /* 전화 / 문서 / 이슈 / 약속 / 일반 */
  return memo.category === category;
}

/* ============================================================
 * #태그 필터
 * ============================================================ */

/**
 * 메모의 tags 배열에 특정 태그 포함 여부.
 * memo.tags 가 null/undefined 면 false.
 */
export function matchTag(memo: Memo, tag: string | null): boolean {
  if (!tag) return true;
  if (!Array.isArray(memo.tags)) return false;
  return memo.tags.includes(tag);
}

/* ============================================================
 * 정렬
 * ============================================================ */

export type MemoSortMode = 'recent' | 'due' | 'type';

/**
 * 메모 배열 정렬.
 * - 'recent' (default): created_at desc
 * - 'due': due_date asc (없는 거 끝)
 * - 'type': memo_type 그룹 (할 일 → 완료 → 거래처 정보) → created_at desc
 */
export function sortMemos(memos: Memo[], mode: MemoSortMode = 'recent'): Memo[] {
  const arr = memos.slice();
  if (mode === 'recent') {
    arr.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return arr;
  }
  if (mode === 'due') {
    arr.sort((a, b) => {
      const da = a.due_date || '';
      const db = b.due_date || '';
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });
    return arr;
  }
  /* type — 할 일 → 완료 → 거래처 정보 → created_at desc */
  const order: Record<MemoTypeGroup, number> = { '할 일': 0, '완료': 1, '거래처 정보': 2 };
  arr.sort((a, b) => {
    const ga = order[normalizeMemoType(a.memo_type)];
    const gb = order[normalizeMemoType(b.memo_type)];
    if (ga !== gb) return ga - gb;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
  return arr;
}

/* ============================================================
 * 통합 필터 — 카테고리 + 태그 + 정렬 한 번에
 * ============================================================ */

export interface FilterOptions {
  category?: CdMemoCategory;
  tag?: string | null;
  sort?: MemoSortMode;
}

/**
 * 거래처 dashboard / 상담방 메모에서 사용 — 카테고리 / 태그 필터 + 정렬.
 */
export function filterMemos(memos: Memo[], opts: FilterOptions = {}): Memo[] {
  const { category = 'all', tag = null, sort = 'recent' } = opts;
  const filtered = memos.filter((m) => matchCdCategory(m, category) && matchTag(m, tag));
  return sortMemos(filtered, sort);
}
