/**
 * Phase #8 메타 (2026-05-06): 메모 utility 함수 — Vitest 단위 테스트 대상
 *
 * functions/api/memos.js 안에 있던 작은 함수들을 module 로 분리.
 * 단위 테스트 가능 + 향후 TypeScript 변환 시 시작점.
 */

/**
 * content 안의 #해시태그 자동 추출.
 * 한글·영문·숫자·언더스코어 매칭. unique 보장.
 *
 * @example
 *   extractTags('5/15 부가세 매입 #영수증 12장 #부가세')
 *   // ['영수증', '부가세']
 */
export function extractTags(content: string | null | undefined): string[] {
  if (!content) return [];
  const matches = String(content).match(/#[\w가-힣]+/g) || [];
  const tags = matches.map(m => m.slice(1)).filter(Boolean);
  return Array.from(new Set(tags));
}

/**
 * tags 입력값 (string|array|null) 을 JSON string 또는 null 로 정규화.
 * content 의 #태그 자동 머지 (set union, 중복 제거).
 *
 * @example
 *   normalizeTags(['수동태그'], '본문 #자동태그')
 *   // '["수동태그","자동태그"]'
 */
export function normalizeTags(
  tagsInput: string[] | string | null | undefined,
  content: string | null | undefined
): string | null {
  let tags: string[] = [];
  if (Array.isArray(tagsInput)) {
    tags = tagsInput;
  } else if (typeof tagsInput === 'string' && tagsInput.trim()) {
    try {
      const parsed = JSON.parse(tagsInput);
      tags = Array.isArray(parsed) ? parsed : [];
    } catch {
      tags = String(tagsInput).split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  const fromContent = extractTags(content);
  const merged = Array.from(new Set([...tags, ...fromContent].map(t => String(t).trim()).filter(Boolean)));
  return merged.length ? JSON.stringify(merged) : null;
}

/**
 * 한국 시간(KST) ISO timestamp — 'YYYY-MM-DD HH:MM:SS' 형식.
 */
export function kst(now: number = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .substring(0, 19);
}

/**
 * timing-safe 문자열 비교 (길이 고정 XOR 누적).
 * 같은 길이의 문자열을 비교 — secret key·token 비교에 사용.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
