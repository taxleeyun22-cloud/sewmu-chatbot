/**
 * Phase B-1 (2026-05-17): paste-drop ESM leaf 전환 — 단위 테스트.
 * classic IIFE → src/lib/paste-drop.ts 마이그레이션 회귀 방지.
 * 실행: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { attachPasteDrop, type PasteDropTarget } from './paste-drop';

function mkFile(name: string, size: number, type = 'image/png'): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('attachPasteDrop', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('window.attachPasteDrop 로 self-register (classic 소비자 호환)', () => {
    expect(typeof window.attachPasteDrop).toBe('function');
    expect(window.attachPasteDrop).toBe(attachPasteDrop);
  });

  it('el / onFiles 미존재 시 안전하게 no-op', () => {
    expect(() => attachPasteDrop(null, () => {})).not.toThrow();
    const el = document.createElement('div') as PasteDropTarget;
    // @ts-expect-error 잘못된 onFiles 도 throw 안 함
    expect(() => attachPasteDrop(el, 'nope')).not.toThrow();
    expect(el._pdBound).toBeUndefined();
  });

  it('중복 바인딩 방지 (_pdBound)', () => {
    const el = document.createElement('textarea') as PasteDropTarget;
    const add = vi.spyOn(el, 'addEventListener');
    attachPasteDrop(el, () => {});
    const firstCount = add.mock.calls.length;
    expect(el._pdBound).toBe(true);
    attachPasteDrop(el, () => {}); // 두 번째 — 무시돼야
    expect(add.mock.calls.length).toBe(firstCount);
  });

  it('drop: dataTransfer.files 전달 + 빈/초과 파일 가드', () => {
    const el = document.createElement('textarea') as PasteDropTarget;
    const onFiles = vi.fn();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    attachPasteDrop(el, onFiles, { maxSizeMB: 1 });

    const good = mkFile('ok.png', 500 * 1024);
    const tooBig = mkFile('big.png', 2 * 1024 * 1024);
    const empty = mkFile('empty.png', 0);

    const ev = new Event('drop', { bubbles: true, cancelable: true }) as Event & {
      dataTransfer?: { files: File[] };
    };
    ev.dataTransfer = { files: [good, tooBig, empty] };
    el.dispatchEvent(ev);

    expect(onFiles).toHaveBeenCalledTimes(1);
    const delivered = onFiles.mock.calls[0][0] as File[];
    expect(delivered.map((f) => f.name)).toEqual(['ok.png']); // 초과·빈 제외
    expect(alertSpy).toHaveBeenCalled(); // 제외 알림 1회
  });

  it('drop: 통과 파일 0개면 onFiles 미호출', () => {
    const el = document.createElement('textarea') as PasteDropTarget;
    const onFiles = vi.fn();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    attachPasteDrop(el, onFiles, { maxSizeMB: 1 });
    const ev = new Event('drop', { bubbles: true, cancelable: true }) as Event & {
      dataTransfer?: { files: File[] };
    };
    ev.dataTransfer = { files: [mkFile('big.png', 5 * 1024 * 1024)] };
    el.dispatchEvent(ev);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('dragover: 파란 점선 outline, dragleave 복원', () => {
    const el = document.createElement('textarea') as PasteDropTarget;
    el.style.outline = '1px solid red';
    const original = el.style.outline; // 실제 직렬화된 초기값 캡처
    attachPasteDrop(el, () => {});
    el.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    // happy-dom/브라우저별 CSS 직렬화 순서 차이 → 토큰 포함 여부로 단언
    expect(el.style.outline).toContain('dashed');
    expect(el.style.outline).toContain('#3182f6');
    el.dispatchEvent(new Event('dragleave', { bubbles: true }));
    expect(el.style.outline).toBe(original); // 캡처한 원래값으로 복원 (불리언 플래그 1회)
  });
});
