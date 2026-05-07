/**
 * Phase #3 Phase 3-3: role-ui 단위 테스트.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  applyOwnerOnlyVisibility,
  applyManagerPlusVisibility,
  applyOwnerOnlyDisable,
  requireOwnerOrAlert,
  requireManagerPlusOrAlert,
} from './role-ui';

beforeEach(() => {
  document.body.innerHTML = '';
  delete (globalThis as Record<string, unknown>).IS_OWNER;
  delete (globalThis as Record<string, unknown>).IS_MANAGER;
  delete (globalThis as Record<string, unknown>).IS_STAFF;
  delete (globalThis as Record<string, unknown>).KEY;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('applyOwnerOnlyVisibility', () => {
  it('Owner — 표시', () => {
    document.body.innerHTML = '<button id="btn1">X</button>';
    (globalThis as Record<string, unknown>).IS_OWNER = true;
    (globalThis as Record<string, unknown>).KEY = 'K';
    applyOwnerOnlyVisibility('btn1');
    expect((document.getElementById('btn1') as HTMLElement).style.display).toBe('inline-block');
  });

  it('Owner 아님 — hide', () => {
    document.body.innerHTML = '<button id="btn2">X</button>';
    applyOwnerOnlyVisibility('btn2');
    expect((document.getElementById('btn2') as HTMLElement).style.display).toBe('none');
  });

  it('displayOnShow 지정', () => {
    document.body.innerHTML = '<div id="d1">X</div>';
    (globalThis as Record<string, unknown>).IS_OWNER = true;
    (globalThis as Record<string, unknown>).KEY = 'K';
    applyOwnerOnlyVisibility('d1', 'flex');
    expect((document.getElementById('d1') as HTMLElement).style.display).toBe('flex');
  });

  it('element 없으면 no-op', () => {
    expect(() => applyOwnerOnlyVisibility('nonexistent')).not.toThrow();
  });
});

describe('applyManagerPlusVisibility', () => {
  it('Owner → 표시', () => {
    document.body.innerHTML = '<div id="m1">X</div>';
    (globalThis as Record<string, unknown>).IS_OWNER = true;
    (globalThis as Record<string, unknown>).KEY = 'K';
    applyManagerPlusVisibility('m1');
    expect((document.getElementById('m1') as HTMLElement).style.display).toBe('inline-block');
  });

  it('Manager → 표시', () => {
    document.body.innerHTML = '<div id="m2">X</div>';
    (globalThis as Record<string, unknown>).IS_MANAGER = true;
    (globalThis as Record<string, unknown>).KEY = 'K';
    applyManagerPlusVisibility('m2');
    expect((document.getElementById('m2') as HTMLElement).style.display).toBe('inline-block');
  });

  it('Staff 만 → hide', () => {
    document.body.innerHTML = '<div id="m3">X</div>';
    (globalThis as Record<string, unknown>).IS_STAFF = true;
    (globalThis as Record<string, unknown>).KEY = 'K';
    applyManagerPlusVisibility('m3');
    expect((document.getElementById('m3') as HTMLElement).style.display).toBe('none');
  });
});

describe('applyOwnerOnlyDisable', () => {
  it('Owner → enable', () => {
    document.body.innerHTML = '<button id="b1">X</button>';
    (globalThis as Record<string, unknown>).IS_OWNER = true;
    (globalThis as Record<string, unknown>).KEY = 'K';
    applyOwnerOnlyDisable('b1');
    const el = document.getElementById('b1') as HTMLButtonElement;
    expect(el.disabled).toBe(false);
  });

  it('Non-owner → disable + 안내', () => {
    document.body.innerHTML = '<button id="b2">X</button>';
    applyOwnerOnlyDisable('b2');
    const el = document.getElementById('b2') as HTMLButtonElement;
    expect(el.disabled).toBe(true);
    expect(el.style.opacity).toBe('0.5');
    expect(el.title).toBe('owner 권한 필요');
  });
});

describe('requireOwnerOrAlert / requireManagerPlusOrAlert', () => {
  it('requireOwner — Owner true', () => {
    (globalThis as Record<string, unknown>).IS_OWNER = true;
    (globalThis as Record<string, unknown>).KEY = 'K';
    expect(requireOwnerOrAlert()).toBe(true);
  });

  it('requireOwner — non-owner false (alert 호출)', () => {
    const alertSpy = vi.fn();
    (globalThis as Record<string, unknown>).alert = alertSpy;
    expect(requireOwnerOrAlert()).toBe(false);
    expect(alertSpy).toHaveBeenCalled();
  });

  it('requireManagerPlus — Manager true', () => {
    (globalThis as Record<string, unknown>).IS_MANAGER = true;
    (globalThis as Record<string, unknown>).KEY = 'K';
    expect(requireManagerPlusOrAlert()).toBe(true);
  });

  it('requireManagerPlus — Staff false', () => {
    const alertSpy = vi.fn();
    (globalThis as Record<string, unknown>).alert = alertSpy;
    (globalThis as Record<string, unknown>).IS_STAFF = true;
    (globalThis as Record<string, unknown>).KEY = 'K';
    expect(requireManagerPlusOrAlert()).toBe(false);
    expect(alertSpy).toHaveBeenCalled();
  });
});
