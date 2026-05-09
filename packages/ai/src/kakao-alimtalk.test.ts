/**
 * Phase Next-Day24 (2026-05-09): Kakao 알림톡 단위 테스트.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  normalizePhone,
  renderTemplate,
  isWithinSendHours,
  sendAlimtalk,
  sendAlimtalkBulk,
} from './kakao-alimtalk';

describe('normalizePhone', () => {
  it('normalizes hyphenated 010 number', () => {
    expect(normalizePhone('010-1234-5678')).toBe('01012345678');
  });

  it('accepts already-normalized', () => {
    expect(normalizePhone('01012345678')).toBe('01012345678');
  });

  it('handles +82 country code', () => {
    expect(normalizePhone('+82 10-1234-5678')).toBe('01012345678');
    expect(normalizePhone('821012345678')).toBe('01012345678');
  });

  it('rejects non-mobile', () => {
    expect(normalizePhone('053-269-1213')).toBeNull(); // landline
    expect(normalizePhone('1234')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });

  it('rejects malformed', () => {
    expect(normalizePhone('010-XXXX-1234')).toBeNull();
    expect(normalizePhone('010-1-2')).toBeNull();
  });
});

describe('renderTemplate', () => {
  it('replaces #{var} placeholders', () => {
    expect(renderTemplate('안녕하세요 #{이름}님', { 이름: '박승호' })).toBe('안녕하세요 박승호님');
  });

  it('multiple variables', () => {
    expect(
      renderTemplate('#{이름}님, #{날짜} 마감입니다.', {
        이름: '박승호',
        날짜: '5월 31일',
      }),
    ).toBe('박승호님, 5월 31일 마감입니다.');
  });

  it('missing variables → empty string', () => {
    expect(renderTemplate('#{없는변수}', {})).toBe('');
  });

  it('handles whitespace inside braces', () => {
    expect(renderTemplate('#{ name }', { name: 'A' })).toBe('A');
  });

  it('non-template text passes through', () => {
    expect(renderTemplate('plain', {})).toBe('plain');
  });
});

describe('isWithinSendHours (KST 08:00~21:00)', () => {
  it('blocks 02:00 KST (deep night)', () => {
    // KST 02:00 = UTC 17:00 prev day
    const d = new Date('2026-05-08T17:00:00Z');
    expect(isWithinSendHours(d)).toBe(false);
  });

  it('allows 10:00 KST (mid-morning)', () => {
    // KST 10:00 = UTC 01:00 same day
    const d = new Date('2026-05-09T01:00:00Z');
    expect(isWithinSendHours(d)).toBe(true);
  });

  it('allows 20:59 KST (last allowed)', () => {
    const d = new Date('2026-05-09T11:59:00Z');
    expect(isWithinSendHours(d)).toBe(true);
  });

  it('blocks 21:00 KST sharp', () => {
    const d = new Date('2026-05-09T12:00:00Z');
    expect(isWithinSendHours(d)).toBe(false);
  });

  it('blocks 07:59 KST', () => {
    const d = new Date('2026-05-08T22:59:00Z');
    expect(isWithinSendHours(d)).toBe(false);
  });
});

describe('sendAlimtalk', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('blocks send outside allowed hours when allowAfterHours=false', async () => {
    /* mock isWithinSendHours via current time — at midnight UTC = 09:00 KST (allowed).
     * To reliably test BLOCKED case, use allowAfterHours:false + override Date.now */
    const realDate = global.Date;
    // 02:00 KST = 17:00 UTC prev day
    const fakeNow = new Date('2026-05-08T17:00:00Z').getTime();
    // @ts-expect-error mock Date
    global.Date = class extends realDate {
      constructor(...args: unknown[]) {
        super(...(args as []));
      }
      static now() {
        return fakeNow;
      }
    };
    Object.assign(global.Date, realDate);
    global.Date.now = () => fakeNow;

    const r = await sendAlimtalk(
      {
        to: '010-1234-5678',
        message: 'x',
        template_code: 'T1',
      },
      { apiKey: 'k', pfId: 'pf' },
    );
    expect(r.ok).toBe(false);
    expect(r.blocked).toBeTruthy();

    global.Date = realDate;
  });

  it('rejects invalid phone', async () => {
    const r = await sendAlimtalk(
      {
        to: 'invalid',
        message: 'x',
        template_code: 'T1',
      },
      { apiKey: 'k', pfId: 'pf', allowAfterHours: true },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('phone');
  });

  it('successful send returns ok + message_id', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, message: 'success', mid: 'mid-1234' }),
    } as Response);

    const r = await sendAlimtalk(
      {
        to: '010-1234-5678',
        message: '안녕하세요',
        template_code: 'T1',
      },
      { apiKey: 'k', pfId: 'pf', allowAfterHours: true },
    );
    expect(r.ok).toBe(true);
    expect(r.message_id).toBe('mid-1234');
  });

  it('vendor error response → ok=false', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: -101, message: 'invalid template' }),
    } as Response);

    const r = await sendAlimtalk(
      {
        to: '010-1234-5678',
        message: 'x',
        template_code: 'BAD',
      },
      { apiKey: 'k', pfId: 'pf', allowAfterHours: true },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('template');
  });

  it('network error → ok=false with message', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ENETUNREACH'));

    const r = await sendAlimtalk(
      {
        to: '010-1234-5678',
        message: 'x',
        template_code: 'T1',
      },
      { apiKey: 'k', pfId: 'pf', allowAfterHours: true },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toBe('ENETUNREACH');
  });

  it('uses custom endpoint when provided', async () => {
    let calledUrl: string | undefined;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      calledUrl = url;
      return {
        ok: true,
        json: async () => ({ code: 0, mid: 'm' }),
      } as Response;
    });

    await sendAlimtalk(
      {
        to: '010-1234-5678',
        message: 'x',
        template_code: 'T',
      },
      {
        apiKey: 'k',
        pfId: 'pf',
        endpoint: 'https://custom.example.com/send',
        allowAfterHours: true,
      },
    );
    expect(calledUrl).toBe('https://custom.example.com/send');
  });
});

describe('sendAlimtalkBulk', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('sends N messages in parallel', async () => {
    let count = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      count++;
      return {
        ok: true,
        json: async () => ({ code: 0, mid: `m${count}` }),
      } as Response;
    });

    const results = await sendAlimtalkBulk(
      [
        { to: '010-1111-1111', message: 'a', template_code: 'T' },
        { to: '010-2222-2222', message: 'b', template_code: 'T' },
        { to: '010-3333-3333', message: 'c', template_code: 'T' },
      ],
      { apiKey: 'k', pfId: 'pf', allowAfterHours: true },
    );

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(count).toBe(3);
  });

  it('partial failure — some messages fail (invalid phone)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, mid: 'm' }),
    } as Response);

    const results = await sendAlimtalkBulk(
      [
        { to: '010-1234-5678', message: 'ok', template_code: 'T' },
        { to: 'invalid', message: 'bad', template_code: 'T' },
      ],
      { apiKey: 'k', pfId: 'pf', allowAfterHours: true },
    );

    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(false);
  });
});
