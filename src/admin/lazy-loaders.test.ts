/**
 * Phase #3 Phase 4-2: lazy-loaders 단위 테스트.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerLazyScript,
  forceLoad,
  getLazyScriptCount,
  isLazyScriptLoaded,
  _resetLazyScripts,
} from './lazy-loaders';

beforeEach(() => {
  _resetLazyScripts();
  document.head.innerHTML = '';
  delete (window as unknown as Record<string, unknown>).__onTabChange;
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('registerLazyScript', () => {
  it('등록 — count 증가', () => {
    expect(getLazyScriptCount()).toBe(0);
    registerLazyScript({ src: '/test1.js', triggerTabs: ['anal'] });
    expect(getLazyScriptCount()).toBe(1);
  });

  it('여러 개 등록', () => {
    registerLazyScript({ src: '/a.js', triggerTabs: ['a'] });
    registerLazyScript({ src: '/b.js', triggerTabs: ['b'] });
    registerLazyScript({ src: '/c.js', triggerTabs: ['c'] });
    expect(getLazyScriptCount()).toBe(3);
  });

  it('tab change listener 호출 시 로드', async () => {
    type TabCb = (tab: string) => void;
    let listener: TabCb | null = null;
    (window as unknown as Record<string, unknown>).__onTabChange = ((cb: TabCb) => {
      listener = cb;
    }) as unknown as Record<string, unknown>;
    registerLazyScript({ src: '/test2.js', triggerTabs: ['docs'] });
    expect(listener).not.toBeNull();
    (listener as unknown as TabCb)('docs');
    const scripts = document.head.querySelectorAll('script[src="/test2.js"]');
    expect(scripts.length).toBe(1);
  });

  it('non-matching tab → 로드 안 함', () => {
    type TabCb = (tab: string) => void;
    let listener: TabCb | null = null;
    (window as unknown as Record<string, unknown>).__onTabChange = ((cb: TabCb) => {
      listener = cb;
    }) as unknown as Record<string, unknown>;
    registerLazyScript({ src: '/test3.js', triggerTabs: ['anal'] });
    (listener as unknown as TabCb)('users');
    const scripts = document.head.querySelectorAll('script[src="/test3.js"]');
    expect(scripts.length).toBe(0);
  });
});

describe('forceLoad', () => {
  it('등록 안 된 src → false', () => {
    expect(forceLoad('/nonexistent.js')).toBe(false);
  });

  it('등록된 src → true + script 추가', () => {
    registerLazyScript({ src: '/forced.js', triggerTabs: ['x'] });
    expect(forceLoad('/forced.js')).toBe(true);
    const scripts = document.head.querySelectorAll('script[src="/forced.js"]');
    expect(scripts.length).toBe(1);
  });
});

describe('isLazyScriptLoaded', () => {
  it('등록 안 된 src → false', () => {
    expect(isLazyScriptLoaded('/x.js')).toBe(false);
  });

  it('등록만 됨 (로드 X) → false', () => {
    registerLazyScript({ src: '/y.js', triggerTabs: ['x'] });
    expect(isLazyScriptLoaded('/y.js')).toBe(false);
  });
});
