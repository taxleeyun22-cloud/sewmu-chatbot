/**
 * src/lib/paste-drop.ts — 공통 클립보드 붙여넣기(Ctrl+V) + 드래그&드롭 첨부 헬퍼.
 *
 * Phase B-1 (2026-05-17): classic `paste-drop.js` (IIFE) → ESM/TS leaf 모듈 전환.
 *   - 사장님 결정 "점진 (인프라+leaf 1개부터)" — 가장 의존 적은 leaf 부터 strangler 마이그레이션.
 *   - classic 소비자(admin-memos.js / business.js / admin-rooms-msg.js / memo-window) 는
 *     `window.attachPasteDrop` 호출 → 본 모듈이 self-register 하여 무파괴 호환.
 *   - main 번들(src/main.ts)에 import → 3개 HTML 모두 <script type=module src=main.js> 로 로드.
 *
 * 원 동작 (paste-drop.js 와 동일):
 *   - paste: clipboardData 의 file → onFiles
 *   - dragover: 입력창 파란 점선 outline
 *   - drop: dataTransfer.files → onFiles
 *   - 중복 바인딩 방지 (_pdBound)
 *   - D-3 공통 크기/빈파일 가드 (opts.maxSizeMB 기본 25MB)
 *   - 타입 필터는 각 소비자 책임 (예: 상담방 image-only 자체 필터)
 */

export interface PasteDropOpts {
  /** 개별 파일 최대 크기 (MB). 기본 25. 초과분 제외 + 1회 알림. */
  maxSizeMB?: number;
}

export type PasteDropTarget = HTMLElement & { _pdBound?: boolean };

export function attachPasteDrop(
  el: PasteDropTarget | null | undefined,
  onFiles: (files: File[]) => void,
  opts?: PasteDropOpts,
): void {
  if (!el || el._pdBound || typeof onFiles !== 'function') return;
  el._pdBound = true;
  const maxBytes = ((opts && opts.maxSizeMB) || 25) * 1024 * 1024;

  /* D-3: 공통 크기/빈파일 가드. 초과·빈 파일 제외 + 1회 알림. */
  function guard(files: File[]): File[] {
    const ok: File[] = [];
    const rejected: string[] = [];
    for (const f of files) {
      if (!f) continue;
      if (!f.size) { rejected.push((f.name || '파일') + ' (빈 파일)'); continue; }
      if (f.size > maxBytes) {
        rejected.push((f.name || '파일') + ' (' + (f.size / 1048576).toFixed(1) + 'MB > ' + (maxBytes / 1048576) + 'MB)');
        continue;
      }
      ok.push(f);
    }
    if (rejected.length) {
      try { alert('첨부 제외 ' + rejected.length + '개:\n· ' + rejected.join('\n· ')); } catch { /* noop */ }
    }
    return ok;
  }
  function deliver(files: File[]): void {
    const g = guard(files);
    if (!g.length) return;
    try { onFiles(g); } catch (e) { console.warn('[paste-drop] onFiles err:', e); }
  }

  el.addEventListener('paste', (ev: ClipboardEvent) => {
    const cd = ev.clipboardData || (window as unknown as { clipboardData?: DataTransfer }).clipboardData;
    if (!cd) return;
    const items = cd.items || ([] as unknown as DataTransferItemList);
    let files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it && it.kind === 'file') {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    /* clipboardData.files fallback (일부 브라우저) */
    if (!files.length && cd.files && cd.files.length) {
      files = Array.prototype.slice.call(cd.files);
    }
    if (files.length) {
      ev.preventDefault();
      deliver(files);
    }
  });

  /* B-1 개선: 옛 코드는 `outline !== '2px dashed #3182f6'` 문자열 비교로 활성여부 판단 →
   * 브라우저별 CSS 직렬화 순서 차이(예: '#3182f6 dashed 2px')로 매 dragover 마다 prevOutline
   * 재캡처 → dragleave 복원 실패 잠재버그. 불리언 플래그로 1회만 캡처/복원. */
  let dragActive = false;
  let prevOutline = '';
  let prevOutlineOffset = '';
  el.addEventListener('dragover', (ev: DragEvent) => {
    ev.preventDefault();
    if (!dragActive) {
      dragActive = true;
      prevOutline = el.style.outline;
      prevOutlineOffset = el.style.outlineOffset;
      el.style.outline = '2px dashed #3182f6';
      el.style.outlineOffset = '2px';
    }
  });
  const clearOutline = (): void => {
    if (!dragActive) return;
    dragActive = false;
    el.style.outline = prevOutline || '';
    el.style.outlineOffset = prevOutlineOffset || '';
  };
  el.addEventListener('dragleave', clearOutline);
  el.addEventListener('drop', (ev: DragEvent) => {
    ev.preventDefault();
    clearOutline();
    const dt = ev.dataTransfer;
    if (!dt) return;
    const files: File[] = Array.prototype.slice.call(dt.files || []).filter((f: File) => f);
    if (files.length) deliver(files);
  });
}

/* classic script 호환 — 기존 5곳 소비자가 window.attachPasteDrop 호출.
 * B 마이그레이션 진행하며 소비자들이 ESM import 로 전환되면 이 bridge 제거. */
declare global {
  interface Window {
    attachPasteDrop?: typeof attachPasteDrop;
  }
}
window.attachPasteDrop = attachPasteDrop;
