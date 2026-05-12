/**
 * Phase Next-Day29 (2026-05-12): @mention 자동완성 — TS 모듈 추출.
 *
 * admin.js 의 _mentionStaffCache / _mentionEnsureBox / _mentionOnInput /
 * _mentionPick / _mentionOnKeydown / mentionify 의 TypeScript 등가물.
 *
 * admin.js 본체는 cross-script global 패턴 (var/function 선언) 유지하되,
 * 신규 admin React 컴포넌트 + 단위 테스트는 이 모듈을 import 해서 사용.
 *
 * 사장님 명령 (2026-05-12): "구글수준으로 모듈분리".
 */

export interface MentionStaff {
  id: number;
  name: string;
  is_admin?: number | null;
}

export interface MentionState {
  active: boolean;
  matches: MentionStaff[];
  selIdx: number;
  /** @ 시작 위치 (textarea value 기준) */
  start: number;
}

export function createMentionState(): MentionState {
  return { active: false, matches: [], selIdx: 0, start: -1 };
}

/**
 * HTML attribute / text 안에 안전하게 삽입할 문자열로 escape.
 * 사용처는 `mentionify` 의 캡처 그룹 — regex char class 가 이미 좁지만
 * 향후 char class 가 완화돼도 XSS 안 나도록 defensive.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 메시지 본문의 `@홍길동` 을 강조 span 으로 변환.
 *
 * 보안: 입력 텍스트는 이미 escape 됐다고 가정 — 호출자가 e()/escAttr() 적용.
 * 추가로 캡처 그룹도 `escapeHtml` 통과시킴 (defense-in-depth).
 *
 * @param text 이미 HTML escape 된 메시지 본문
 * @param selfName 본인 표시명 — `@홍길동` 또는 `@홍길동대표` 인 경우 노란 강조
 */
export function mentionify(text: string, selfName?: string | null): string {
  if (!text) return text;
  return String(text).replace(
    /(^|[\s(\[])@([가-힣A-Za-z0-9_.]{1,20})/g,
    (_full, pre: string, name: string) => {
      const isMe = !!selfName && (name === selfName || name === selfName + '대표');
      const style = isMe
        ? 'background:#fef08a;color:#854d0e;border-radius:4px;padding:0 3px'
        : 'color:#3182f6';
      const safeName = escapeHtml(name);
      return `${pre}<span style="${style};font-weight:700" data-mention="${safeName}">@${safeName}</span>`;
    },
  );
}

/**
 * textarea value + caret 위치에서 `@token` 추출. `@` 가 직전 공백/줄바꿈 뒤에 와야 hit.
 *
 * @param value textarea 의 현재 value
 * @param caret selectionStart
 * @returns 매칭된 `@` 위치 + token (없으면 null)
 */
export function findMentionToken(value: string, caret: number): { start: number; query: string } | null {
  let i = caret - 1;
  while (i >= 0 && !/[\s\n]/.test(value[i])) i--;
  const token = value.slice(i + 1, caret);
  if (!token.startsWith('@')) return null;
  const q = token.slice(1);
  if (q.length > 20) return null;
  return { start: i + 1, query: q };
}

/**
 * staff list 에서 query 매칭 후보 — startsWith 우선, includes fallback. 최대 8개.
 */
export function filterMentionCandidates(staff: MentionStaff[], query: string, max = 8): MentionStaff[] {
  const qLow = query.toLowerCase();
  return staff
    .filter((s) => {
      const n = (s.name || '').toLowerCase();
      return !query || n.startsWith(qLow) || n.includes(qLow);
    })
    .slice(0, max);
}

/**
 * `@name ` 으로 input value 치환. caret 위치도 갱신.
 *
 * @returns {value, caret} — input.value / selectionStart 에 적용
 */
export function applyMentionPick(
  value: string,
  caret: number,
  state: MentionState,
  picked: MentionStaff,
): { value: string; caret: number } {
  const before = value.slice(0, state.start);
  const after = value.slice(caret);
  const insert = '@' + picked.name + ' ';
  const newValue = before + insert + after;
  const newCaret = (before + insert).length;
  return { value: newValue, caret: newCaret };
}

/**
 * 화살표/Enter/Tab/Esc 키 처리. preventDefault 여부 반환.
 *
 * @returns 호출자가 ev.preventDefault() 해야 하면 true
 */
export function handleMentionKey(
  state: MentionState,
  key: string,
): { consume: boolean; action: 'up' | 'down' | 'pick' | 'close' | null } {
  if (!state.active) return { consume: false, action: null };
  if (key === 'ArrowDown') {
    state.selIdx = Math.min(state.matches.length - 1, state.selIdx + 1);
    return { consume: true, action: 'down' };
  }
  if (key === 'ArrowUp') {
    state.selIdx = Math.max(0, state.selIdx - 1);
    return { consume: true, action: 'up' };
  }
  if (key === 'Enter' || key === 'Tab') {
    return { consume: true, action: 'pick' };
  }
  if (key === 'Escape') {
    state.active = false;
    state.matches = [];
    state.selIdx = 0;
    state.start = -1;
    return { consume: true, action: 'close' };
  }
  return { consume: false, action: null };
}
