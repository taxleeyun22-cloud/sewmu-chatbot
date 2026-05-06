/**
 * Phase #3 적용 (2026-05-06): admin-memos.js 의 작은 헬퍼 함수들을 TypeScript 로 추출.
 *
 * 목적:
 *   - 점진 마이그레이션 시범. admin-memos.js 700줄 통째 변환은 큰 작업이라
 *     작은 helper 부터 .ts 로 분리해 타입 안전망 + 단위 테스트 가능 형태로 변환.
 *   - 추출된 함수는 src/lib 안에서 strict 모드 검증.
 *   - admin-memos.js 가 window.__memoRender 통해 호출 (classic script 호환).
 *
 * 향후 (사장님 결정 후):
 *   - admin-memos.js 의 _renderCdMemos / _renderCdAttachments 등 점진 .ts 화
 *   - admin-customer-dash.js / admin-business-tab.js 도 동일 패턴
 */

/* ============================================================
 * D-day 배지 — 메모 due_date 까지 남은 일 수 → label + 색
 * ============================================================ */
export interface DDayBadge {
  /** 'D-3' / 'D+0' / 'D+5' 형태 */
  label: string;
  /** 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' */
  status: 'overdue' | 'today' | 'tomorrow' | 'week' | 'later';
  /** 양수 = 미래 N일, 0 = 오늘, 음수 = 지남 */
  daysLeft: number;
}

/**
 * due_date (YYYY-MM-DD) → D-day 배지 정보.
 * KST 기준 자정 비교 (시간 무시).
 *
 * @example
 *   ddayBadge('2026-05-09')  // { label: 'D-3', status: 'week', daysLeft: 3 }
 *   ddayBadge('2026-05-06')  // { label: 'D-Day', status: 'today', daysLeft: 0 }
 *   ddayBadge('2026-05-04')  // { label: 'D+2', status: 'overdue', daysLeft: -2 }
 */
export function ddayBadge(dueDate: string | null | undefined, nowMs: number = Date.now()): DDayBadge | null {
  if (!dueDate) return null;
  /* 입력 형식: 'YYYY-MM-DD' — KST 기준 자정 */
  const m = String(dueDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const due = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  /* 오늘 KST 자정을 UTC ms 로 */
  const nowKst = new Date(nowMs + 9 * 60 * 60 * 1000);
  const today = Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate());
  const daysLeft = Math.round((due - today) / 86_400_000);

  let label: string;
  let status: DDayBadge['status'];
  if (daysLeft < 0) {
    label = `D+${Math.abs(daysLeft)}`;
    status = 'overdue';
  } else if (daysLeft === 0) {
    label = 'D-Day';
    status = 'today';
  } else if (daysLeft === 1) {
    label = 'D-1';
    status = 'tomorrow';
  } else if (daysLeft <= 7) {
    label = `D-${daysLeft}`;
    status = 'week';
  } else {
    label = `D-${daysLeft}`;
    status = 'later';
  }
  return { label, status, daysLeft };
}

/* ============================================================
 * 첨부 파일 사이즈 표시 — 1024 단위 KB / MB
 * ============================================================ */
/**
 * 바이트 → 사람 친화 단위.
 * @example
 *   formatBytes(0)           // '0B'
 *   formatBytes(1234)        // '1.2KB'
 *   formatBytes(1234567)     // '1.2MB'
 *   formatBytes(1234567890)  // '1.1GB'
 */
export function formatBytes(bytes: number | null | undefined): string {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

/* ============================================================
 * 카테고리 → 아이콘 매핑 (admin-memos.js _MEMO_ICONS 와 동일)
 * ============================================================ */
export const MEMO_CATEGORY_ICONS: Record<string, string> = {
  '할 일': '📌',
  '거래처 정보': '🏢',
  '완료': '✅',
  '전화': '📞',
  '문서': '📁',
  '이슈': '⚠️',
  '약속': '📅',
  '일반': '📝',
};

/**
 * 메모 카테고리 → 아이콘. 미정의 카테고리는 fallback '📝'.
 */
export function memoIcon(category: string | null | undefined): string {
  if (!category) return '📝';
  return MEMO_CATEGORY_ICONS[category] || '📝';
}
