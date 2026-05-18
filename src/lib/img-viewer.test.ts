/**
 * 모듈화 #2 (2026-05-18): img-viewer ESM leaf 전환 — 단위 테스트.
 * classic admin-docs.js → src/lib/img-viewer.ts 마이그레이션 회귀 방지.
 * 실행: npm test
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { openImgViewer, closeImgViewer, imgViewerNav, collectImagesNear } from './img-viewer';

function setupViewerDom(): void {
  document.body.innerHTML =
    '<div id="imgViewer"><img id="ivImg"><div id="ivCounter"></div></div>';
}

describe('img-viewer', () => {
  beforeEach(() => {
    setupViewerDom();
    document.body.style.overflow = '';
  });

  it('window self-register (classic onclick 호환)', () => {
    expect(typeof window.openImgViewer).toBe('function');
    expect(typeof window.closeImgViewer).toBe('function');
    expect(typeof window.imgViewerNav).toBe('function');
    expect(typeof window.saveImgViewer).toBe('function');
    expect(typeof window.collectImagesNear).toBe('function');
    expect(window.openImgViewer).toBe(openImgViewer);
  });

  it('openImgViewer: open 클래스 + ivImg src + 카운터', () => {
    openImgViewer('a.jpg', ['a.jpg', 'b.jpg', 'c.jpg']);
    const v = document.getElementById('imgViewer')!;
    expect(v.classList.contains('open')).toBe(true);
    expect(v.classList.contains('has-multiple')).toBe(true);
    expect((document.getElementById('ivImg') as HTMLImageElement).getAttribute('src')).toContain('a.jpg');
    expect(document.getElementById('ivCounter')!.textContent).toBe('1 / 3');
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('단일 이미지: has-multiple 없음, srcs 미지정 시 [src]', () => {
    openImgViewer('only.jpg');
    const v = document.getElementById('imgViewer')!;
    expect(v.classList.contains('open')).toBe(true);
    expect(v.classList.contains('has-multiple')).toBe(false);
    expect(document.getElementById('ivCounter')!.textContent).toBe('1 / 1');
  });

  it('imgViewerNav: 다음/이전 + 경계 클램프', () => {
    openImgViewer('a.jpg', ['a.jpg', 'b.jpg', 'c.jpg']);
    imgViewerNav(1);
    expect(document.getElementById('ivCounter')!.textContent).toBe('2 / 3');
    imgViewerNav(1);
    expect(document.getElementById('ivCounter')!.textContent).toBe('3 / 3');
    imgViewerNav(1); // 경계 — 변화 없음
    expect(document.getElementById('ivCounter')!.textContent).toBe('3 / 3');
    imgViewerNav(-1);
    expect(document.getElementById('ivCounter')!.textContent).toBe('2 / 3');
  });

  it('imgViewerNav: 1장이면 무동작', () => {
    openImgViewer('x.jpg', ['x.jpg']);
    imgViewerNav(1);
    expect(document.getElementById('ivCounter')!.textContent).toBe('1 / 1');
  });

  it('closeImgViewer: open 해제 + overflow 복원', () => {
    openImgViewer('a.jpg', ['a.jpg']);
    expect(document.getElementById('imgViewer')!.classList.contains('open')).toBe(true);
    closeImgViewer();
    expect(document.getElementById('imgViewer')!.classList.contains('open')).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('closeImgViewer: 안 열린 상태에서 안전 (no-op)', () => {
    expect(() => closeImgViewer()).not.toThrow();
  });

  it('openImgViewer: #imgViewer 없으면 안전 (no-op)', () => {
    document.body.innerHTML = '';
    expect(() => openImgViewer('a.jpg', ['a.jpg'])).not.toThrow();
  });

  it('collectImagesNear: 주변 이미지 수집, 없으면 [el.src]', () => {
    document.body.innerHTML =
      '<div class="rmsgs">' +
      '<img class="rc-img-msg" src="http://x/1.jpg">' +
      '<img class="rc-img-msg" src="http://x/2.jpg">' +
      '</div>';
    const first = document.querySelector('img') as HTMLImageElement;
    const got = collectImagesNear(first);
    expect(got.length).toBe(2);
    expect(got[0]).toContain('1.jpg');

    document.body.innerHTML = '<img id="lone" src="http://x/lone.jpg">';
    const lone = document.getElementById('lone') as HTMLImageElement;
    const g2 = collectImagesNear(lone);
    expect(g2.length).toBe(1);
    expect(g2[0]).toContain('lone.jpg');
  });
});
