/**
 * Phase #1 적용 (2-3, 2026-05-06): admin-modals.html lazy loader — ES module.
 *
 * 이전 (admin.html 안 inline script):
 *   <script>(function loadAdminModals(){ fetch + insertAdjacentHTML })();</script>
 *
 * 지금 (이 ES module):
 *   - main.ts 가 import 후 loadAdminModals() 호출
 *   - 또는 window.__loadAdminModals() 통해 admin.html 호출
 *   - 응답 형식 검증 (text 길이 0 → 에러)
 *   - 로딩 완료 broadcast (CustomEvent 'adminModalsLoaded')
 *
 * 점진 ES module 화 시범 — admin.html 안 inline JS 를 .ts 모듈로 옮기는 패턴.
 *
 * 사용:
 *   - main.ts 자동: 호출됨 (이 파일이 main.ts 가 import 시 즉시 실행 X — start() 함수만 export)
 *   - admin.html: <script>window.__loadAdminModals?.();</script> 1줄로 호출
 */

const MODAL_VERSION = 'v=15';

export interface ModalLoadResult {
  ok: boolean;
  bytes: number;
  durationMs: number;
  error?: string;
}

/**
 * admin-modals.html lazy load + #adminModalsSlot 안 inject.
 * @returns 로딩 결과 (시간·바이트·에러)
 */
export async function loadAdminModals(slotId = 'adminModalsSlot'): Promise<ModalLoadResult> {
  const t0 = performance.now();
  try {
    const r = await fetch(`/admin-modals.html?${MODAL_VERSION}`, { cache: 'no-cache' });
    if (!r.ok) {
      return { ok: false, bytes: 0, durationMs: performance.now() - t0, error: `HTTP ${r.status}` };
    }
    const html = await r.text();
    if (html.length === 0) {
      return { ok: false, bytes: 0, durationMs: performance.now() - t0, error: 'empty body' };
    }
    const slot = document.getElementById(slotId);
    if (!slot) {
      return { ok: false, bytes: html.length, durationMs: performance.now() - t0, error: 'slot missing' };
    }
    slot.insertAdjacentHTML('beforeend', html);
    /* 다른 모듈 (admin.js / admin-memos.js) 이 listen 가능 — 모달 DOM 준비됨 */
    try {
      document.dispatchEvent(new CustomEvent('adminModalsLoaded', {
        detail: { bytes: html.length, durationMs: performance.now() - t0 },
      }));
    } catch (_) { /* CustomEvent 실패 무시 */ }
    return { ok: true, bytes: html.length, durationMs: performance.now() - t0 };
  } catch (e) {
    return {
      ok: false,
      bytes: 0,
      durationMs: performance.now() - t0,
      error: (e as Error).message,
    };
  }
}

/**
 * DOMContentLoaded 시점 또는 즉시 — admin.html 진입 자동 호출.
 * window.__loadAdminModals 도 노출 — 외부 호출 가능.
 */
export function startModalLoader() {
  function go() {
    void loadAdminModals().then((r) => {
      if (!r.ok) {
        console.error('[admin-modals] fetch fail:', r.error);
      } else {
        /* console.debug 로만 (사장님 매일 디버그 X) */
        if (typeof console !== 'undefined' && console.debug) {
          console.debug(`[admin-modals] loaded ${r.bytes} bytes in ${Math.round(r.durationMs)}ms`);
        }
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', go);
  } else {
    go();
  }
}
