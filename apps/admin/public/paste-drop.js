/* ═══════════════════════════════════════════════════════════════════════════
 * paste-drop.js — 공통 클립보드 붙여넣기(Ctrl+V) + 드래그&드롭 이미지 첨부 헬퍼.
 *
 * 사장님 명령 (2026-05-17): "캡쳐된거나 복사된 사진 컨트롤브이하면 클로드처럼
 * 사진올리고 말할수있게 / 드래그해서 올리기 / 모든 채팅 공통 — 상담방·메모·챗봇 5곳".
 *
 * 사용:
 *   attachPasteDrop(inputEl, function(files){ ... 각 영역 업로드 로직 ... });
 *   - inputEl: textarea/input 등 입력 element
 *   - files: File[] (이미지/파일). 각 영역이 자기 업로드 endpoint 로 처리.
 *
 * 동작:
 *   - paste: clipboardData 의 file 잡으면 preventDefault + onFiles(files)
 *   - dragover: 입력창 파란 점선 outline (시각 단서)
 *   - drop: dataTransfer.files → onFiles(files)
 *   - 중복 바인딩 방지 (el._pdBound)
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function attachPasteDrop(el, onFiles) {
    if (!el || el._pdBound || typeof onFiles !== 'function') return;
    el._pdBound = true;

    el.addEventListener('paste', function (ev) {
      var cd = ev.clipboardData || window.clipboardData;
      if (!cd) return;
      var items = cd.items || [];
      var files = [];
      for (var i = 0; i < items.length; i++) {
        if (items[i] && items[i].kind === 'file') {
          var f = items[i].getAsFile();
          if (f) files.push(f);
        }
      }
      /* clipboardData.files fallback (일부 브라우저) */
      if (!files.length && cd.files && cd.files.length) {
        files = Array.prototype.slice.call(cd.files);
      }
      if (files.length) {
        ev.preventDefault();
        try { onFiles(files); } catch (e) { console.warn('[paste-drop] onFiles err:', e); }
      }
    });

    var prevOutline = '';
    el.addEventListener('dragover', function (ev) {
      ev.preventDefault();
      if (el.style.outline !== '2px dashed #3182f6') {
        prevOutline = el.style.outline;
        el.style.outline = '2px dashed #3182f6';
        el.style.outlineOffset = '2px';
      }
    });
    function clearOutline() { el.style.outline = prevOutline || ''; el.style.outlineOffset = ''; }
    el.addEventListener('dragleave', clearOutline);
    el.addEventListener('drop', function (ev) {
      ev.preventDefault();
      clearOutline();
      var dt = ev.dataTransfer;
      if (!dt) return;
      var files = Array.prototype.slice.call(dt.files || []).filter(function (f) { return f; });
      if (files.length) {
        try { onFiles(files); } catch (e) { console.warn('[paste-drop] drop onFiles err:', e); }
      }
    });
  }
  /* 전역 노출 — classic script 5곳 (business.js / admin-memos.js / admin-rooms-msg.js
   * / memo-window / index.js) 가 window.attachPasteDrop 호출. */
  window.attachPasteDrop = attachPasteDrop;
})();
