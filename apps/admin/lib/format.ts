/**
 * Phase 11 cleanup (2026-05-12): 날짜/금액/사용자명 포맷 헬퍼.
 *
 * 사장님 명령 "구글개발자 시각으로 개판 정리".
 *
 * 기존 분산된 hack:
 *   - dashboard: `it.time?.slice(2, 16)` ← 표시 6글자 자름 ('26-05-12T18:0' 같은 깨진 결과)
 *   - 곳곳: `n.toLocaleString('ko-KR') + '원'`
 *   - cd: 직접 `Date.parse` 후 분기
 *
 * 단일 진실 소스로 통합 — `Intl.*` API 만 사용 (Cloudflare Workers + Next.js + Node 모두 호환).
 */

/* ─────────────────────────────────────────────────────────────
 * 날짜 / 시간
 * ───────────────────────────────────────────────────────────── */

function parseDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Asia/Seoul timezone parts 추출 — locale-independent (`en-CA` 가 ISO 형식 보장).
 */
function ymdHmAsiaSeoul(d: Date): { y: string; m: string; day: string; h: string; min: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).formatToParts(d);
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? '00';
  /* en-CA hour12=false 에서 24시간 0시가 '24' 로 나오는 케이스 가드 */
  let h = get('hour');
  if (h === '24') h = '00';
  return {
    y: get('year'),
    m: get('month'),
    day: get('day'),
    h,
    min: get('minute'),
  };
}

/**
 * "2026-05-12 18:34" 형식 (한국 시간 기준).
 */
export function formatDateTime(input: string | Date | null | undefined): string {
  const d = parseDate(input);
  if (!d) return '-';
  const { y, m, day, h, min } = ymdHmAsiaSeoul(d);
  return `${y}-${m}-${day} ${h}:${min}`;
}

/**
 * "2026-05-12" — 시각 없이.
 */
export function formatDate(input: string | Date | null | undefined): string {
  const d = parseDate(input);
  if (!d) return '-';
  const { y, m, day } = ymdHmAsiaSeoul(d);
  return `${y}-${m}-${day}`;
}

/**
 * "3분 전", "2시간 전", "어제", "2026-05-10" — chat-style relative.
 *
 * @param input ISO string 또는 Date
 * @param now 기준 시각 (테스트용. default = Date.now())
 */
export function formatRelative(
  input: string | Date | null | undefined,
  now: Date | number = Date.now(),
): string {
  const d = parseDate(input);
  if (!d) return '-';
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const diffSec = Math.floor((nowMs - d.getTime()) / 1000);
  if (diffSec < 60) return '방금';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  if (diffSec < 172800) return '어제';
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}일 전`;
  return formatDate(d);
}

/* ─────────────────────────────────────────────────────────────
 * 금액 / 숫자
 * ───────────────────────────────────────────────────────────── */

/**
 * "1,234,567원" — null 안전.
 */
export function formatWon(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('ko-KR') + '원';
}

/**
 * "1,234,567" — 단위 없이.
 */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('ko-KR');
}

/**
 * "1.5K", "2.3M" — 카드 같은 좁은 공간용.
 */
export function formatCompactNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return '-';
  return new Intl.NumberFormat('ko-KR', { notation: 'compact' }).format(Number(n));
}

/* ─────────────────────────────────────────────────────────────
 * 사용자명 / 업체명
 * ───────────────────────────────────────────────────────────── */

interface UserNameInput {
  real_name?: string | null;
  name?: string | null;
  id?: number | null;
}

/**
 * real_name 우선 → name → "#id" — 표시명 결정.
 */
export function formatUserName(u: UserNameInput | null | undefined): string {
  if (!u) return '익명';
  return u.real_name || u.name || (u.id ? `#${u.id}` : '익명');
}

/**
 * "박승호 (#42)" — admin 용 명확 표기 (id 도 같이).
 */
export function formatUserNameWithId(u: UserNameInput | null | undefined): string {
  if (!u) return '익명';
  const name = u.real_name || u.name;
  if (!name) return u.id ? `#${u.id}` : '익명';
  return u.id ? `${name} (#${u.id})` : name;
}

/* ─────────────────────────────────────────────────────────────
 * Truncation
 * ───────────────────────────────────────────────────────────── */

/**
 * 글자 잘라 ... 추가. Unicode-safe (이모지 안 깨짐).
 */
export function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, max).join('') + '…';
}
