/**
 * src/lib/img-viewer.ts — 풀스크린 이미지 뷰어 (카톡 스타일).
 *
 * 모듈화 #2 (2026-05-18 사장님 "장기적으로 쪼개기 모듈화 12345 순서대로"):
 *   classic admin-docs.js 의 이미지 뷰어 블록(~147줄) → ESM/TS leaf 전환 (B-1 paste-drop 패턴).
 *
 * 겸 closeImgViewer 근본 fix:
 *   - 옛: openImgViewer/closeImgViewer 등이 admin-docs.js 에만 정의 → admin 만 로드.
 *     business.html 은 admin-modals.html(#imgViewer) 주입하나 admin-docs.js 미로드
 *     → ReferenceError (Sentry). business.html 에 self-contained shim 땜질했었음.
 *   - 신: src/lib/img-viewer.ts → main.js 번들 → admin · business.html 둘 다 자동 제공
 *     (window self-register). admin-docs.js 복사본 + business.html shim 동시 제거 = 단일 소스.
 *
 * 소비자(classic onclick): admin-modals.html #imgViewer 의 closeImgViewer()/imgViewerNav()/
 *   saveImgViewer(), 이미지 onclick="openImgViewer(this.src, collectImagesNear(this))".
 *   → window.* self-register 로 무수정 호환.
 *
 * DOM: admin-modals.html 이 #imgViewer / #ivImg / #ivCounter 주입 (fetch 후 비동기).
 */

interface IvState {
  srcs: string[];
  idx: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  touching: boolean;
  swiped: boolean;
  axis: 'x' | 'y' | null;
}

const ivState: IvState = {
  srcs: [], idx: 0, startX: 0, startY: 0, dx: 0, dy: 0,
  touching: false, swiped: false, axis: null,
};

export function collectImagesNear(el: HTMLImageElement): string[] {
  const c =
    el.closest('.rmsgs') ||
    el.closest('#msgs') ||
    el.closest('#roomChatMessages') ||
    el.closest('#riPhotoGrid') ||
    document.body;
  const nodes = c.querySelectorAll<HTMLImageElement>('img.rc-img-msg, img.ri-photo, .ri-photo img');
  const arr: string[] = [];
  nodes.forEach((n) => { if (n.src) arr.push(n.src); });
  return arr.length ? arr : [el.src];
}

export function openImgViewer(src: string, srcs?: string[]): void {
  if (!Array.isArray(srcs) || srcs.length === 0) srcs = [src];
  let i = srcs.indexOf(src);
  if (i < 0) i = 0;
  ivState.srcs = srcs;
  ivState.idx = i;
  const v = document.getElementById('imgViewer');
  if (!v) return;
  v.classList.add('open');
  v.classList.toggle('has-multiple', srcs.length > 1);
  document.body.style.overflow = 'hidden';
  renderIvImg();
  try { history.pushState({ iv: 1 }, '', location.href); } catch { /* noop */ }
}

export function closeImgViewer(): void {
  const v = document.getElementById('imgViewer');
  if (!v || !v.classList.contains('open')) return;
  v.classList.remove('open');
  document.body.style.overflow = '';
  try { if (history.state && history.state.iv) history.back(); } catch { /* noop */ }
}

function renderIvImg(): void {
  const img = document.getElementById('ivImg') as HTMLImageElement | null;
  if (!img) return;
  img.src = ivState.srcs[ivState.idx] || '';
  const c = document.getElementById('ivCounter');
  if (c) c.textContent = (ivState.idx + 1) + ' / ' + ivState.srcs.length;
}

export function imgViewerNav(d: number): void {
  if (ivState.srcs.length < 2) return;
  const next = ivState.idx + d;
  if (next < 0 || next >= ivState.srcs.length) return;
  ivState.idx = next;
  renderIvImg();
}

export async function saveImgViewer(): Promise<void> {
  const src = ivState.srcs[ivState.idx];
  if (!src) return;
  if (!confirm('사진을 저장하시겠습니까?')) return;
  try {
    const r = await fetch(src);
    if (!r.ok) throw new Error();
    let b = await r.blob();
    let nm = (src.split('/').pop() || 'image').split('?')[0] || 'image';
    let mime = b.type;
    if (!mime || mime === 'application/octet-stream') {
      const urlExt = ((nm.match(/\.(\w+)$/) || [, ''])[1] || '').toLowerCase();
      mime = urlExt === 'png' ? 'image/png' : urlExt === 'webp' ? 'image/webp'
        : urlExt === 'gif' ? 'image/gif' : urlExt === 'heic' ? 'image/heic' : 'image/jpeg';
      b = b.slice(0, b.size, mime);
    }
    const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    if (!/\.\w+$/.test(nm)) nm += '.' + ext;
    /* 모바일(iOS 사진앱·Android 갤러리)만 Web Share API 경유.
       PC 는 무조건 파일 다운로드 — 공유 시트로 빠지면 "저장" 의도와 다름 */
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    if (isMobile) {
      try {
        const navAny = navigator as Navigator & {
          canShare?: (d: { files: File[] }) => boolean;
          share?: (d: { files: File[] }) => Promise<void>;
        };
        if (typeof File === 'function' && navAny.canShare) {
          const file = new File([b], nm, { type: mime });
          if (navAny.canShare({ files: [file] })) {
            await navAny.share!({ files: [file] });
            return;
          }
        }
      } catch (se) {
        if (se && (se as Error).name === 'AbortError') return;
      }
    }
    /* PC · 공유 실패 폴백: 다운로드 링크 */
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url;
    a.download = nm;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 150);
  } catch {
    window.open(src, '_blank');
  }
}

/* 터치 스와이프 + 키보드 + popstate — #imgViewer 존재 시 1회 바인딩.
 * #imgViewer 는 admin-modals.html 비동기 inject → init() 실패 시 재시도
 * (옛 코드는 DOMContentLoaded 1회만 — 모달 늦으면 미바인딩. B-1 처럼 견고화). */
(function bindImgViewerGestures() {
  let bound = false;
  function init(): boolean {
    if (bound) return true;
    const v = document.getElementById('imgViewer');
    if (!v) return false;
    bound = true;
    const img = (): HTMLImageElement | null => document.getElementById('ivImg') as HTMLImageElement | null;
    function resetTransform(animate: boolean): void {
      const i = img();
      if (!i) return;
      i.style.transition = animate ? 'transform .2s ease-out' : 'none';
      i.style.transform = '';
    }
    v.addEventListener('click', (e) => {
      if (ivState.swiped) { ivState.swiped = false; return; }
      if (e.target === v) closeImgViewer();
    });
    v.addEventListener('touchstart', (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      ivState.startX = e.touches[0].clientX;
      ivState.startY = e.touches[0].clientY;
      ivState.dx = 0; ivState.dy = 0; ivState.touching = true; ivState.axis = null;
      const i = img();
      if (i) i.style.transition = 'none';
    }, { passive: true });
    v.addEventListener('touchmove', (e: TouchEvent) => {
      if (!ivState.touching || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - ivState.startX;
      const dy = e.touches[0].clientY - ivState.startY;
      if (!ivState.axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        ivState.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      }
      ivState.dx = dx; ivState.dy = dy;
      if (e.cancelable) e.preventDefault();
      const i = img();
      if (!i) return;
      if (ivState.axis === 'x') {
        const edge = (ivState.idx === 0 && dx > 0) || (ivState.idx === ivState.srcs.length - 1 && dx < 0);
        const d = edge ? dx * 0.35 : dx;
        i.style.transform = 'translateX(' + d + 'px)';
      } else if (dy > 0) {
        i.style.transform = 'translateY(' + dy + 'px)';
      }
    }, { passive: false });
    v.addEventListener('touchend', () => {
      if (!ivState.touching) return;
      ivState.touching = false;
      const dx = ivState.dx, dy = ivState.dy, axis = ivState.axis;
      ivState.dx = 0; ivState.dy = 0; ivState.axis = null;
      if (axis === 'x' && Math.abs(dx) > 50) {
        imgViewerNav(dx > 0 ? -1 : 1);
        ivState.swiped = true;
        setTimeout(() => { ivState.swiped = false; }, 400);
        resetTransform(false);
      } else if (axis === 'y' && dy > 120) {
        closeImgViewer();
        resetTransform(false);
      } else {
        resetTransform(true);
      }
    }, { passive: true });
    v.addEventListener('touchcancel', () => {
      if (!ivState.touching) return;
      ivState.touching = false; ivState.dx = 0; ivState.dy = 0; ivState.axis = null;
      resetTransform(true);
    });
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!v.classList.contains('open')) return;
      if (e.key === 'Escape') closeImgViewer();
      else if (e.key === 'ArrowLeft') imgViewerNav(-1);
      else if (e.key === 'ArrowRight') imgViewerNav(1);
    });
    window.addEventListener('popstate', () => {
      if (v.classList.contains('open')) {
        v.classList.remove('open');
        document.body.style.overflow = '';
      }
    });
    return true;
  }
  if (!init()) {
    document.addEventListener('DOMContentLoaded', init);
    /* B-1 견고화: 모달이 DOMContentLoaded 후 비동기 inject 되는 케이스 — 재시도 루프 */
    let tries = 0;
    const iv = setInterval(() => {
      if (init() || tries++ > 40) clearInterval(iv);
    }, 250);
  }
})();

/* classic onclick 호환 — admin-modals.html #imgViewer 버튼 + 이미지 onclick.
 * 소비자가 ESM import 로 전환 완료되면 이 bridge 제거. */
declare global {
  interface Window {
    openImgViewer?: typeof openImgViewer;
    closeImgViewer?: typeof closeImgViewer;
    imgViewerNav?: typeof imgViewerNav;
    saveImgViewer?: typeof saveImgViewer;
    collectImagesNear?: typeof collectImagesNear;
  }
}
window.openImgViewer = openImgViewer;
window.closeImgViewer = closeImgViewer;
window.imgViewerNav = imgViewerNav;
window.saveImgViewer = saveImgViewer;
window.collectImagesNear = collectImagesNear;
