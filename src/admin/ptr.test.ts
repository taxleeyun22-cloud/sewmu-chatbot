/**
 * 📱 폰 당겨서 새로고침 (admin-ptr.js) — 2026-10-02 사장님: "폰에서 아래로 스크롤하면 새로고침? 이런게 안되네 홈에서"
 *
 * admin 은 #mainView 안쪽 스크롤 + PWA 라 브라우저 기본 당겨서 새로고침이 안 뜬다. 직접 만든 것이 지키는 것:
 *  1. 맨 위에서 THRESHOLD 넘게 끌고 놓으면 새로고침, 덜 끌면 안 한다
 *  2. 스크롤이 내려가 있으면 아무리 끌어도 안 한다
 *  3. 모달·입력칸 안에서 시작한 터치는 무시
 *  4. 끌다가 다시 올리면 취소, 알약 문구는 "당겨서" → "놓으면" → "새로고침 중…"
 *  5. 한 번 발동하면 reload 전까지 다시 안 잡힌다 (연타 방지)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

type Ptr = { state: { startY: number | null; dy: number; armed: boolean; busy: boolean }; destroy: () => void };
type Init = (el: HTMLElement, opts: { reload: () => void; pill?: HTMLElement; threshold?: number }) => Ptr;

const src = readFileSync('admin-ptr.js', 'utf8');

function touch(el: Element, type: string, y: number, target?: Element) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [{ clientY: y }] });
  Object.defineProperty(e, 'changedTouches', { value: [{ clientY: y }] });
  (target || el).dispatchEvent(e);
}

let main: HTMLElement; let pill: HTMLElement; let reload: ReturnType<typeof vi.fn>; let ptr: Ptr; let init: Init;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<main><div id="mainView" style="overflow-y:auto;height:300px"><div style="height:2000px">'
    + '<input id="inp"><div class="modal on"><p id="inModal">x</p></div><p id="plain">본문</p></div></div></main>';
  main = document.getElementById('mainView') as HTMLElement;
  pill = document.createElement('div');
  reload = vi.fn();
  /* classic script 를 happy-dom window 에 붙여 돌린다. boot() 는 터치 없는 환경이라 스스로 빠진다 */
  new Function('window', 'document', 'navigator', src)(window, document, navigator);
  init = (window as unknown as { _ptrInit: Init })._ptrInit;
  ptr = init(main, { reload, pill, threshold: 90 });
});
afterEach(() => { ptr.destroy(); vi.useRealTimers(); });

describe('당겨서 새로고침', () => {
  it('맨 위에서 90px 넘게 끌고 놓으면 새로고침 — 알약 문구가 단계별로 바뀐다', () => {
    const p = document.getElementById('plain')!;
    touch(main, 'touchstart', 100, p);
    touch(main, 'touchmove', 140, p);
    expect(pill.textContent).toBe('당겨서 새로고침');
    expect(ptr.state.armed).toBe(false);
    touch(main, 'touchmove', 200, p);
    expect(pill.textContent).toBe('놓으면 새로고침');
    expect(ptr.state.armed).toBe(true);
    touch(main, 'touchend', 200, p);
    expect(pill.textContent).toBe('새로고침 중…');
    expect(reload).not.toHaveBeenCalled();           // 알약 먼저 보이고
    vi.advanceTimersByTime(80);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('덜 끌고 놓으면 안 한다, 알약은 숨는다', () => {
    touch(main, 'touchstart', 100);
    touch(main, 'touchmove', 160);
    touch(main, 'touchend', 160);
    vi.advanceTimersByTime(100);
    expect(reload).not.toHaveBeenCalled();
    expect(pill.style.opacity).toBe('0');
  });

  it('스크롤이 내려가 있으면 아무리 끌어도 안 한다', () => {
    main.scrollTop = 120;
    touch(main, 'touchstart', 100);
    touch(main, 'touchmove', 400);
    touch(main, 'touchend', 400);
    vi.advanceTimersByTime(100);
    expect(reload).not.toHaveBeenCalled();
    expect(ptr.state.startY).toBeNull();
  });

  it('모달·입력칸 안에서 시작한 터치는 무시', () => {
    for (const id of ['inModal', 'inp']) {
      const t = document.getElementById(id)!;
      touch(main, 'touchstart', 100, t);
      touch(main, 'touchmove', 400, t);
      touch(main, 'touchend', 400, t);
    }
    vi.advanceTimersByTime(100);
    expect(reload).not.toHaveBeenCalled();
  });

  it('끌다가 다시 올리면 취소', () => {
    touch(main, 'touchstart', 100);
    touch(main, 'touchmove', 250);
    expect(ptr.state.armed).toBe(true);
    touch(main, 'touchmove', 90);
    expect(ptr.state.armed).toBe(false);
    touch(main, 'touchend', 90);
    vi.advanceTimersByTime(100);
    expect(reload).not.toHaveBeenCalled();
  });

  it('한 번 발동하면 reload 전까지 다시 안 잡힌다', () => {
    touch(main, 'touchstart', 100);
    touch(main, 'touchmove', 250);
    touch(main, 'touchend', 250);
    touch(main, 'touchstart', 100);
    touch(main, 'touchmove', 250);
    touch(main, 'touchend', 250);
    vi.advanceTimersByTime(200);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('admin.html 이 admin.js 다음에 로드하고, 미러 목록에도 있다', () => {
    const html = readFileSync('admin.html', 'utf8');
    expect(html.indexOf('/admin-ptr.js?v=')).toBeGreaterThan(html.indexOf('/admin.js?v='));
    expect(readFileSync('scripts/sync-mirror.mjs', 'utf8')).toContain("'admin-ptr.js'");
  });
});
