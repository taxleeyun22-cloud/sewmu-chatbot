/**
 * Phase Next-Day29 (2026-05-12): message-parser 단위 테스트.
 */
import { describe, it, expect } from 'vitest';
import { parseMsg, linkify, fileIconFor, fmtSize } from './message-parser';

describe('parseMsg', () => {
  it('null / undefined / empty → 빈 객체', () => {
    expect(parseMsg(null)).toMatchObject({ reply: null, text: '' });
    expect(parseMsg(undefined)).toMatchObject({ text: '' });
    expect(parseMsg('')).toMatchObject({ text: '' });
  });

  it('순수 텍스트 → text 만 채워짐', () => {
    const p = parseMsg('안녕하세요 사장님');
    expect(p.text).toBe('안녕하세요 사장님');
    expect(p.image).toBeNull();
    expect(p.file).toBeNull();
    expect(p.doc_id).toBeNull();
  });

  it('[IMG]url 단독', () => {
    const p = parseMsg('[IMG]https://r2.example.com/abc.jpg');
    expect(p.image).toBe('https://r2.example.com/abc.jpg');
    expect(p.text).toBe('');
  });

  it('[IMG]url + 캡션', () => {
    const p = parseMsg('[IMG]https://r2.example.com/x.png\n영수증입니다');
    expect(p.image).toBe('https://r2.example.com/x.png');
    expect(p.text).toBe('영수증입니다');
  });

  it('[DOC:42] 영수증 카드', () => {
    const p = parseMsg('[DOC:42]');
    expect(p.doc_id).toBe(42);
  });

  it('[DOC:42] + 텍스트', () => {
    const p = parseMsg('[DOC:7]\n급여 명세서');
    expect(p.doc_id).toBe(7);
    expect(p.text).toBe('급여 명세서');
  });

  it('[FILE]{json} 파일 첨부', () => {
    const p = parseMsg('[FILE]{"name":"세금계산서.pdf","url":"/api/file?k=abc","size":12345}');
    expect(p.file).toEqual({ name: '세금계산서.pdf', url: '/api/file?k=abc', size: 12345 });
  });

  it('[FILE] + 캡션', () => {
    const p = parseMsg('[FILE]{"name":"x.pdf","url":"u"}\n확인 부탁');
    expect(p.file?.name).toBe('x.pdf');
    expect(p.text).toBe('확인 부탁');
  });

  it('[FILE] JSON 깨졌으면 fallback (text)', () => {
    const p = parseMsg('[FILE]{잘못된 json}\n본문');
    /* JSON parse 실패 → file null → 전체가 text 로 처리되지 않음 (regex 매칭 됐기 때문) */
    /* 단, file null 인 채 다음 regex 로 fall through → text 그대로 */
    expect(p.file).toBeNull();
  });

  it('[ALERT]{json} 사장님 알림', () => {
    const p = parseMsg('[ALERT]{"t":"부가세","m":"7월 25일 마감","d":"2026-07-25"}');
    expect(p.alert).toEqual({ t: '부가세', m: '7월 25일 마감', d: '2026-07-25' });
  });

  it('[CHATBOT_SHARE]{json}', () => {
    const p = parseMsg('[CHATBOT_SHARE]{"q":"종소세?","a":"5월에 신고합니다"}');
    expect(p.chatbot_share).toEqual({ q: '종소세?', a: '5월에 신고합니다' });
  });

  it('[REPLY]{json} + 본문 — reply + IMG 둘 다', () => {
    const p = parseMsg('[REPLY]{"s":"이재윤","t":"인사하세요","i":42}\n[IMG]https://x/a.jpg');
    expect(p.reply).toEqual({ s: '이재윤', t: '인사하세요', i: 42 });
    expect(p.image).toBe('https://x/a.jpg');
  });

  it('[REPLY] + 텍스트', () => {
    const p = parseMsg('[REPLY]{"s":"박승호","t":"안녕"}\n어 안녕!');
    expect(p.reply?.s).toBe('박승호');
    expect(p.text).toBe('어 안녕!');
  });
});

describe('linkify', () => {
  it('null/empty → 그대로', () => {
    expect(linkify(null)).toBe('');
    expect(linkify('')).toBe('');
  });

  it('http URL 변환', () => {
    const out = linkify('check http://example.com page');
    expect(out).toContain('<a href="http://example.com"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('https URL 변환', () => {
    const out = linkify('https://sewmu.com/news');
    expect(out).toContain('href="https://sewmu.com/news"');
  });

  it('www. URL → http:// prefix 추가', () => {
    const out = linkify('check www.example.com');
    expect(out).toContain('href="http://www.example.com"');
  });

  it('URL 없으면 그대로', () => {
    expect(linkify('hello world')).toBe('hello world');
  });

  it('URL 매칭은 따옴표/꺾쇠 만나면 중단 (XSS guard)', () => {
    /* 실제로는 e() escape 후 호출돼서 raw " 가 없지만, 만약 들어와도 URL 은 거기서 중단 */
    const out = linkify('http://evil.com/"onerror=alert(1)');
    /* URL match 는 evil.com/ 까지만 → 그 뒤 "onerror... 는 매칭 안 됨 */
    const hrefMatch = out.match(/href="([^"]*)"/);
    expect(hrefMatch?.[1]).toBe('http://evil.com/');
    /* onerror 문자열은 href attr 안에 안 들어감 */
    expect(hrefMatch?.[1]).not.toContain('onerror');
  });

  it('이미 escape 된 input 그대로 (간섭 X)', () => {
    const escaped = '&lt;b&gt;hi&lt;/b&gt; http://x.com';
    const out = linkify(escaped);
    expect(out).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(out).toContain('href="http://x.com"');
  });
});

describe('fileIconFor', () => {
  it.each([
    ['receipt.pdf', '📕'],
    ['sheet.xlsx', '📊'],
    ['data.csv', '📊'],
    ['doc.docx', '📘'],
    ['slide.pptx', '📽️'],
    ['report.hwp', '📄'],
    ['archive.zip', '🗜️'],
    ['memo.txt', '📝'],
    ['photo.jpg', '📎'],
    ['noext', '📎'],
    ['', '📎'],
  ])('%s → %s', (name, icon) => {
    expect(fileIconFor(name)).toBe(icon);
  });

  it('대문자 확장자도 매칭', () => {
    expect(fileIconFor('REPORT.PDF')).toBe('📕');
  });

  it('null/undefined safe', () => {
    expect(fileIconFor(null)).toBe('📎');
    expect(fileIconFor(undefined)).toBe('📎');
  });
});

describe('fmtSize', () => {
  it('null/0 → 빈', () => {
    expect(fmtSize(0)).toBe('');
    expect(fmtSize(null)).toBe('');
    expect(fmtSize(undefined)).toBe('');
  });

  it('1KB 미만 → B', () => {
    expect(fmtSize(500)).toBe('500B');
  });

  it('1MB 미만 → KB', () => {
    expect(fmtSize(2048)).toBe('2.0KB');
  });

  it('1MB 이상 → MB', () => {
    expect(fmtSize(2 * 1024 * 1024)).toBe('2.0MB');
  });

  it('1.5MB 소수점', () => {
    expect(fmtSize(Math.round(1.5 * 1024 * 1024))).toBe('1.5MB');
  });
});
