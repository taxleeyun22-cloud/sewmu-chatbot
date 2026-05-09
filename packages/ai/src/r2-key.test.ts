/**
 * Phase Next-Day25 (2026-05-09): R2 key 보안 utilities 테스트.
 *
 * CLAUDE.md 보안 룰 — path traversal / control chars / 화이트리스트 외 거부.
 */
import { describe, it, expect } from 'vitest';
import { makeR2Key, extractSafeExtension, isSafeR2Key } from './r2-key';

describe('extractSafeExtension', () => {
  it('extracts allowed extensions', () => {
    expect(extractSafeExtension('receipt.jpg')).toBe('jpg');
    expect(extractSafeExtension('doc.pdf')).toBe('pdf');
    expect(extractSafeExtension('archive.hwp')).toBe('hwp');
    expect(extractSafeExtension('photo.HEIC')).toBe('heic');
  });

  it('rejects disallowed → bin', () => {
    expect(extractSafeExtension('shell.sh')).toBe('bin');
    expect(extractSafeExtension('virus.exe')).toBe('bin');
    expect(extractSafeExtension('script.js')).toBe('bin');
    expect(extractSafeExtension('payload.html')).toBe('bin');
  });

  it('strips path traversal — uses only basename', () => {
    expect(extractSafeExtension('../../etc/passwd.jpg')).toBe('jpg');
    expect(extractSafeExtension('foo\\bar\\receipt.pdf')).toBe('pdf');
  });

  it('rejects control characters in extension', () => {
    expect(extractSafeExtension('a.j\0pg')).toBe('bin');
    expect(extractSafeExtension('a.jp g')).toBe('bin');
  });

  it('handles missing extension', () => {
    expect(extractSafeExtension('noext')).toBe('bin');
    expect(extractSafeExtension('trailing.')).toBe('bin');
    expect(extractSafeExtension('')).toBe('bin');
  });

  it('rejects very long extensions', () => {
    expect(extractSafeExtension('a.' + 'x'.repeat(20))).toBe('bin');
  });

  it('handles non-string input', () => {
    expect(extractSafeExtension(null as unknown as string)).toBe('bin');
    expect(extractSafeExtension(undefined as unknown as string)).toBe('bin');
  });
});

describe('makeR2Key', () => {
  it('generates safe key with category/user/timestamp/uuid/ext', () => {
    const key = makeR2Key({ userId: 7, fileName: 'receipt.jpg' });
    expect(key).toMatch(
      /^documents\/7\/\d{13}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/,
    );
  });

  it('respects category option', () => {
    const key = makeR2Key({ userId: 1, fileName: 'avatar.png', category: 'avatars' });
    expect(key).toMatch(/^avatars\/1\//);
  });

  it('rejects invalid userId', () => {
    expect(() => makeR2Key({ userId: 0, fileName: 'a.jpg' })).toThrow();
    expect(() => makeR2Key({ userId: -1, fileName: 'a.jpg' })).toThrow();
    expect(() => makeR2Key({ userId: 1.5, fileName: 'a.jpg' })).toThrow();
  });

  it('rejects malicious category', () => {
    expect(() =>
      makeR2Key({ userId: 1, fileName: 'a.jpg', category: '../etc' }),
    ).toThrow();
    expect(() =>
      makeR2Key({ userId: 1, fileName: 'a.jpg', category: 'has space' }),
    ).toThrow();
    expect(() =>
      makeR2Key({ userId: 1, fileName: 'a.jpg', category: '' }),
    ).toThrow();
  });

  it('uses bin for disallowed extension', () => {
    const key = makeR2Key({ userId: 7, fileName: 'malware.exe' });
    expect(key).toMatch(/\.bin$/);
  });

  it('keys generated are unique (CSPRNG)', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      keys.add(makeR2Key({ userId: 1, fileName: 'a.jpg' }));
    }
    expect(keys.size).toBe(100); // no collisions
  });

  it('uses timestamp prefix for sortability', () => {
    const key1 = makeR2Key({ userId: 1, fileName: 'a.jpg' });
    /* setTimeout 대안 — 타임스탬프 비교 */
    const t = Number(key1.match(/\/(\d{13})_/)![1]);
    expect(t).toBeGreaterThan(Date.now() - 1000);
    expect(t).toBeLessThanOrEqual(Date.now());
  });
});

describe('isSafeR2Key', () => {
  it('accepts well-formed keys', () => {
    expect(isSafeR2Key('documents/7/1234_uuid.jpg')).toBe(true);
    expect(isSafeR2Key('avatars/1/abc.png')).toBe(true);
  });

  it('rejects path traversal', () => {
    expect(isSafeR2Key('documents/../etc/passwd')).toBe(false);
    expect(isSafeR2Key('../escape')).toBe(false);
  });

  it('rejects leading slash', () => {
    expect(isSafeR2Key('/absolute/path.jpg')).toBe(false);
  });

  it('rejects null byte', () => {
    expect(isSafeR2Key('docs/file\0.jpg')).toBe(false);
  });

  it('rejects control characters', () => {
    expect(isSafeR2Key('docs/file\x01.jpg')).toBe(false);
    expect(isSafeR2Key('docs/file\n.jpg')).toBe(false);
  });

  it('rejects unsafe characters', () => {
    expect(isSafeR2Key('docs/file<script>.jpg')).toBe(false);
    expect(isSafeR2Key('docs/file?query=evil')).toBe(false);
    expect(isSafeR2Key('docs/file with space.jpg')).toBe(false);
  });

  it('rejects empty / non-string', () => {
    expect(isSafeR2Key('')).toBe(false);
    expect(isSafeR2Key(null as unknown as string)).toBe(false);
  });

  it('rejects extremely long keys (DoS guard)', () => {
    expect(isSafeR2Key('docs/' + 'x'.repeat(1000))).toBe(false);
  });
});
