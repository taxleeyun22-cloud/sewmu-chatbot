/**
 * Phase Next-Day27 (2026-05-11): admin_key cookie 검증 (HMAC).
 *
 * /api/admin-login 이 발급한 cookie 의 서명 검증.
 * middleware + tRPC context 둘 다 사용.
 */

/** Base64 → Uint8Array (no padding 문제 대응) */
function b64ToBytes(s: string): Uint8Array {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** HMAC-SHA256 검증. payload 가 signature 와 매치되면 true. */
export async function verifyAdminKeyToken(
  token: string | undefined | null,
  secret: string,
): Promise<boolean> {
  if (!token || !secret) return false;
  try {
    const dotIdx = token.lastIndexOf('.');
    if (dotIdx === -1) return false;
    const payload = token.slice(0, dotIdx);
    const sigB64 = token.slice(dotIdx + 1);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const sig = b64ToBytes(sigB64);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      sig.buffer.slice(sig.byteOffset, sig.byteOffset + sig.byteLength) as ArrayBuffer,
      enc.encode(payload),
    );
    if (!ok) return false;

    /* 만료 체크 (7일) */
    const m = payload.match(/^owner:(\d+)$/);
    if (!m) return false;
    const issuedAt = Number(m[1]);
    const ageMs = Date.now() - issuedAt;
    if (ageMs > 7 * 86400 * 1000) return false;
    return true;
  } catch {
    return false;
  }
}
