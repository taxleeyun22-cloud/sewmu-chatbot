// Web Push 발송 유틸 (RFC 8291 aes128gcm + VAPID JWT ES256)
// Cloudflare Workers crypto.subtle만으로 구현

// ── base64url helpers ──
export function b64uEncode(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64uDecode(str) {
  const pad = str.length % 4;
  const padded = str + (pad ? '='.repeat(4 - pad) : '');
  const bin = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

// ── VAPID JWT (ES256) ──
async function makeVapidJwt(audience, env) {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY || !env.VAPID_EMAIL) {
    throw new Error("VAPID 환경변수 누락 (PRIVATE/PUBLIC/EMAIL)");
  }
  const header = b64uEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64uEncode(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_EMAIL,
  })));
  const unsigned = `${header}.${payload}`;

  // 개인키 import (JWK 형식)
  const pub = b64uDecode(env.VAPID_PUBLIC_KEY);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error("잘못된 VAPID_PUBLIC_KEY (uncompressed 65바이트 아님)");
  const jwk = {
    kty: 'EC', crv: 'P-256',
    d: env.VAPID_PRIVATE_KEY,
    x: b64uEncode(pub.slice(1, 33)),
    y: b64uEncode(pub.slice(33, 65)),
    ext: true,
  };
  const privKey = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privKey,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${b64uEncode(new Uint8Array(sig))}`;
}

// ── HKDF (RFC 5869) with SHA-256 ──
async function hkdf(salt, ikm, info, length) {
  const saltKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prk = await crypto.subtle.sign('HMAC', saltKey, ikm);
  const prkKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  let t = new Uint8Array(0);
  const result = new Uint8Array(length);
  let offset = 0;
  let counter = 1;
  while (offset < length) {
    const concat = new Uint8Array(t.length + info.length + 1);
    concat.set(t, 0); concat.set(info, t.length); concat[t.length + info.length] = counter;
    t = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, concat));
    const take = Math.min(t.length, length - offset);
    result.set(t.slice(0, take), offset);
    offset += take;
    counter += 1;
  }
  return result;
}

// ── aes128gcm Web Push 본문 암호화 (RFC 8291) ──
async function encryptPayload(payloadStr, p256dhB64, authB64) {
  const payload = new TextEncoder().encode(payloadStr);
  const recipientRaw = b64uDecode(p256dhB64);      // 65 bytes uncompressed
  const authSecret = b64uDecode(authB64);          // 16 bytes

  // 수신자 공개키 import
  const recipientPub = await crypto.subtle.importKey(
    'raw', recipientRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    true, []
  );

  // ephemeral key 쌍 생성
  const localKp = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, ['deriveBits']
  );
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localKp.publicKey)); // 65 bytes

  // ECDH shared secret
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: recipientPub },
    localKp.privateKey,
    256
  ));

  // keyinfo = "WebPush: info" || 0x00 || ua_public(65) || as_public(65)
  const webpushInfo = new TextEncoder().encode('WebPush: info\0');
  const keyInfo = new Uint8Array(webpushInfo.length + recipientRaw.length + localPubRaw.length);
  keyInfo.set(webpushInfo, 0);
  keyInfo.set(recipientRaw, webpushInfo.length);
  keyInfo.set(localPubRaw, webpushInfo.length + recipientRaw.length);

  // PRK_key = HKDF(auth, ecdh, key_info, 32)
  const prkKeyBytes = await hkdf(authSecret, ecdh, keyInfo, 32);

  // Salt 16바이트
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // CEK = HKDF(salt, prk_key, "Content-Encoding: aes128gcm\0", 16)
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const cek = await hkdf(salt, prkKeyBytes, cekInfo, 16);

  // NONCE = HKDF(salt, prk_key, "Content-Encoding: nonce\0", 12)
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  const nonce = await hkdf(salt, prkKeyBytes, nonceInfo, 12);

  // record = payload + 0x02 (single record padding delimiter)
  const record = new Uint8Array(payload.length + 1);
  record.set(payload, 0);
  record[payload.length] = 0x02;

  // AES-128-GCM
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    record
  ));

  // Body format:
  //   salt(16) | rs(4 BE uint32, 4096) | idlen(1, 65) | keyid(65 ua pub) | ciphertext
  const rsBuf = new Uint8Array(4); new DataView(rsBuf.buffer).setUint32(0, 4096, false);
  const body = new Uint8Array(16 + 4 + 1 + 65 + ciphertext.length);
  let off = 0;
  body.set(salt, off); off += 16;
  body.set(rsBuf, off); off += 4;
  body[off] = 65; off += 1;
  body.set(localPubRaw, off); off += 65;
  body.set(ciphertext, off);
  return body;
}

// ── 개별 구독에 Push 발송 ──
export async function sendPush(subscription, payloadObj, env) {
  const endpoint = subscription.endpoint;
  const audience = new URL(endpoint).origin;
  const jwt = await makeVapidJwt(audience, env);
  const payloadStr = JSON.stringify(payloadObj);
  const body = await encryptPayload(payloadStr, subscription.p256dh, subscription.auth_key);

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'TTL': '86400',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
    },
    body,
  });

  return {
    status: resp.status,
    ok: resp.ok,
    endpoint,
    gone: resp.status === 404 || resp.status === 410,
  };
}

// ── 사용자에게 알림 발송 (해당 user_id의 모든 구독에) ──
export async function notifyUser(db, env, userId, payloadObj) {
  try {
    const { results } = await db.prepare(
      `SELECT endpoint, p256dh, auth_key FROM push_subscriptions WHERE user_id = ?`
    ).bind(userId).all();
    if (!results || results.length === 0) return { sent: 0, failed: 0 };

    let sent = 0, failed = 0;
    const goneEndpoints = [];
    for (const sub of results) {
      try {
        const r = await sendPush(sub, payloadObj, env);
        if (r.ok) sent++;
        else {
          failed++;
          if (r.gone) goneEndpoints.push(sub.endpoint);
        }
      } catch (e) {
        failed++;
      }
    }
    // 만료된 구독 정리
    for (const ep of goneEndpoints) {
      try { await db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).bind(ep).run(); } catch {}
    }
    return { sent, failed };
  } catch (e) {
    return { sent: 0, failed: 0, error: e.message };
  }
}
