/**
 * Phase Next-Day25 (2026-05-09): R2 key 보안 utilities.
 *
 * CLAUDE.md 보안 룰:
 * - 업로드 파일명에 path traversal 차단 (../ etc)
 * - 제어 문자 / null byte 제거
 * - 확장자 화이트리스트
 * - CSPRNG (crypto.randomUUID) 강제
 */

const SAFE_EXT_PATTERN = /^[a-z0-9]{1,8}$/;
const ALLOWED_EXTS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
  'pdf',
  'hwp',
  'hwpx',
]);

export interface SafeR2KeyOptions {
  /** 사용자 ID (key prefix) — 음수/0 거부 */
  userId: number;
  /** 원본 파일명 — 확장자만 추출 */
  fileName: string;
  /** 카테고리 (documents / memos / avatars 등) */
  category?: string;
}

/**
 * 안전한 R2 key 생성. CSPRNG + path traversal 방어.
 *
 * @example
 *   makeR2Key({ userId: 7, fileName: 'receipt.jpg', category: 'documents' })
 *   → 'documents/7/1715299200000_550e8400-e29b-41d4-a716-446655440000.jpg'
 */
export function makeR2Key(options: SafeR2KeyOptions): string {
  if (!Number.isInteger(options.userId) || options.userId <= 0) {
    throw new Error('userId must be positive integer');
  }
  const ext = extractSafeExtension(options.fileName);
  const category = options.category ?? 'documents';
  if (!/^[a-z][a-z0-9_-]{0,31}$/i.test(category)) {
    throw new Error('invalid category');
  }
  const uuid = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : fallbackRandom();
  return `${category}/${options.userId}/${Date.now()}_${uuid}.${ext}`;
}

/** 확장자 추출 + 화이트리스트 검증. */
export function extractSafeExtension(fileName: string): string {
  if (!fileName || typeof fileName !== 'string') return 'bin';
  /* path traversal 방어 — 마지막 컴포넌트 만 사용 */
  const last = fileName.split(/[/\\]/).pop() ?? '';
  const dotIdx = last.lastIndexOf('.');
  if (dotIdx === -1 || dotIdx === last.length - 1) return 'bin';
  const ext = last.slice(dotIdx + 1).toLowerCase();
  /* 제어 문자 / null byte 차단 */
  if (!SAFE_EXT_PATTERN.test(ext)) return 'bin';
  if (!ALLOWED_EXTS.has(ext)) return 'bin';
  return ext;
}

/** R2 key 검증 — 외부 입력 직접 사용 시. */
export function isSafeR2Key(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  if (key.length > 512) return false;
  /* path traversal 패턴 차단 */
  if (key.includes('..')) return false;
  /* leading slash / null byte */
  if (key.startsWith('/') || key.includes('\0')) return false;
  /* control chars */
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(key)) return false;
  return /^[a-zA-Z0-9_\-./]+$/.test(key);
}

function fallbackRandom(): string {
  /* crypto.randomUUID 미지원 환경 — Math.random 만 쓰지 않음 (보안 약함).
   * Node:crypto.getRandomValues 우선 시도. */
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    arr[6] = (arr[6] & 0x0f) | 0x40; // version 4
    arr[8] = (arr[8] & 0x3f) | 0x80; // variant
    const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error('CSPRNG unavailable — refusing to generate insecure key');
}
