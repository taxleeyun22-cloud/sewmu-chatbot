/**
 * Phase Next-Day29 (2026-05-12): 메시지 본문 파서 — admin.js 의 parseMsg / linkify /
 * fileIconFor / fmtSize 의 TypeScript 등가물.
 *
 * 사장님 명령 "구글수준으로 모듈분리".
 *
 * - 순수 함수 only (DOM/window 접근 X)
 * - admin.js 의 cross-script 호출 가능한 글로벌 함수와 동등 (회귀 X)
 * - 신규 React 메시지 카드 컴포넌트가 import 해서 동일 결과
 */

export interface ParsedMessage {
  /** 답장 [REPLY] payload */
  reply: { s?: string; t?: string; i?: string | number } | null;
  /** 이미지 URL (`[IMG]url`) */
  image: string | null;
  /** 파일 첨부 (`[FILE]{...}`) */
  file: { name?: string; url?: string; size?: number; mime?: string } | null;
  /** 영수증 카드 (`[DOC:42]`) */
  doc_id: number | null;
  /** 사장님 직접 알림 (`[ALERT]{...}`) */
  alert: { t?: string; m?: string; d?: string } | null;
  /** 챗봇 Q&A 공유 (`[CHATBOT_SHARE]{...}`) */
  chatbot_share: { q?: string; a?: string } | null;
  /** 일반 텍스트 본문 */
  text: string;
}

const EMPTY: ParsedMessage = {
  reply: null,
  image: null,
  file: null,
  doc_id: null,
  alert: null,
  chatbot_share: null,
  text: '',
};

function tryJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * 메시지 content 파싱 — 답장 + (이미지/파일/문서/알림/챗봇공유) + 텍스트.
 *
 * 형식:
 *   [REPLY]{json}\n<rest>           — 답장 (rest 안에 다른 prefix 가능)
 *   [CHATBOT_SHARE]{json}          — 챗봇 Q&A 공유 (단독)
 *   [ALERT]{json}                  — 사장님 직접 알림 (단독)
 *   [DOC:42]\n<text>               — 영수증 카드
 *   [FILE]{json}\n<text>           — 파일 첨부
 *   [IMG]<url>\n<text>             — 이미지 첨부
 *   <text>                          — 순수 텍스트
 */
export function parseMsg(content: string | null | undefined): ParsedMessage {
  if (!content) return { ...EMPTY };

  let body = String(content);
  let reply: ParsedMessage['reply'] = null;

  const mr = /^\[REPLY\](\{[^\n]+\})\n([\s\S]*)$/.exec(body);
  if (mr) {
    reply = tryJson(mr[1]);
    body = mr[2];
  }

  const mc = /^\[CHATBOT_SHARE\](\{[\s\S]+\})$/.exec(body);
  if (mc) {
    const cs = tryJson<{ q?: string; a?: string }>(mc[1]);
    if (cs) return { ...EMPTY, reply, chatbot_share: cs };
  }

  const ma = /^\[ALERT\](\{[\s\S]+\})$/.exec(body);
  if (ma) {
    const al = tryJson<{ t?: string; m?: string; d?: string }>(ma[1]);
    if (al) return { ...EMPTY, reply, alert: al };
  }

  const md = /^\[DOC:(\d+)\](\n([\s\S]*))?$/.exec(body);
  if (md) {
    return { ...EMPTY, reply, doc_id: parseInt(md[1], 10), text: md[3] || '' };
  }

  const mf = /^\[FILE\](\{[^\n]+\})(\n([\s\S]*))?$/.exec(body);
  if (mf) {
    const f = tryJson<NonNullable<ParsedMessage['file']>>(mf[1]);
    if (f) return { ...EMPTY, reply, file: f, text: mf[3] || '' };
  }

  const mi = /^\[IMG\](\S+)(\n([\s\S]*))?$/.exec(body);
  if (mi) {
    return { ...EMPTY, reply, image: mi[1], text: mi[3] || '' };
  }

  return { ...EMPTY, reply, text: body };
}

/**
 * URL 을 파란 링크로 변환. 입력은 이미 HTML escape 됐다고 가정.
 * `https?://...` / `www....` 둘 다 매칭.
 */
export function linkify(text: string | null | undefined): string {
  if (!text) return text ?? '';
  return String(text).replace(
    /\b((?:https?:\/\/|www\.)[^\s<>"']+)/gi,
    (u) => {
      const href = /^www\./i.test(u) ? 'http://' + u : u;
      return (
        '<a href="' +
        href.replace(/"/g, '&quot;') +
        '" target="_blank" rel="noopener noreferrer" style="color:#3182f6;text-decoration:underline;word-break:break-all">' +
        u +
        '</a>'
      );
    },
  );
}

/** 파일 확장자 → 이모지 */
export function fileIconFor(name: string | null | undefined): string {
  const ext = (String(name || '').split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return '📕';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['doc', 'docx'].includes(ext)) return '📘';
  if (['ppt', 'pptx'].includes(ext)) return '📽️';
  if (['hwp', 'hwpx'].includes(ext)) return '📄';
  if (ext === 'zip') return '🗜️';
  if (ext === 'txt') return '📝';
  return '📎';
}

/** byte → KB/MB 사람-읽기 포맷 */
export function fmtSize(n: number | null | undefined): string {
  if (!n) return '';
  if (n < 1024) return n + 'B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + 'KB';
  return (n / 1024 / 1024).toFixed(1) + 'MB';
}
