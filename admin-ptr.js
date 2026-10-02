/* 📱 폰 당겨서 새로고침 (2026-10-02 사장님: "폰에서 아래로 스크롤하면 새로고침? 이런게 안되네 홈에서")
 *
 * admin 은 body 가 overflow:hidden 이고 #mainView 가 안에서 스크롤한다 (office.css). 그래서 브라우저가
 * 주는 당겨서 새로고침이 절대 안 뜬다 — 문서 자체는 스크롤이 0 에서 안 움직이니까. 홈 화면에 추가한
 * PWA(standalone) 에서는 브라우저가 그 기능을 아예 끈다. 둘 다 여기서 직접 만든다.
 *
 * 동작: #mainView 가 맨 위(scrollTop 0)일 때 손가락을 아래로 THRESHOLD px 넘게 끌고 놓으면 새로고침.
 *   - 끌 때: 위에 작은 알약이 따라 내려오며 "당겨서 새로고침" → 넘기면 "놓으면 새로고침"
 *   - 놓을 때: "새로고침 중…" 띄우고 location.reload() (현재 탭 #tab=… 해시는 reload 가 유지한다)
 *   - 모달·시트·다이얼로그 안에서 시작한 터치는 무시 (그 안의 스크롤·드래그를 건드리지 않는다)
 *   - 마우스(PC) 는 touch 이벤트가 없으니 자연히 비활성
 *
 * classic script — admin.js 뒤에 로드. 테스트는 src/admin/ptr.test.ts (reload 를 주입해서 돈다).
 */
(function () {
  'use strict';
  var THRESHOLD = 90;      // 이만큼 끌어야 새로고침 (px, 손가락 이동 기준)
  var MAX_PULL = 130;      // 알약이 내려오는 최대 거리
  var IGNORE = '.modal, .modal-overlay, .sheet-bg, .sheet, [role="dialog"], [aria-modal="true"], .ptr-ignore, textarea, input, select';

  /* 2026-10-02 사고: admin 모달(.modal-overlay, position:fixed)들이 #mainView 안에 들어 있다 (admin.html 모달 슬롯).
   * 근태 모달 안에서 위로 당겨 스크롤하면 #mainView 는 scrollTop 0 이라 여기가 가로채 페이지를 새로고침해 버렸다
   * ("스크롤도 안 된다"). 터치 시작점에서 #mainView 까지 올라가며 고정 레이어·자체 스크롤 영역이 있으면 무시한다. */
  function insideOwnScroller(target, el) {
    var win = (el.ownerDocument || document).defaultView || window;
    for (var n = target; n && n !== el; n = n.parentElement) {
      if (n.nodeType !== 1) continue;
      if (n.matches && n.matches(IGNORE)) return true;
      var cs;
      try { cs = win.getComputedStyle(n); } catch (e) { cs = null; }
      if (!cs) continue;
      if (cs.position === 'fixed') return true;
      if (/(auto|scroll)/.test(cs.overflowY || '') && n.scrollHeight > n.clientHeight + 1) return true;
    }
    return false;
  }

  function pt(e) {
    var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
    return typeof t.clientY === 'number' ? t.clientY : null;
  }

  function makePill(doc) {
    var el = doc.createElement('div');
    el.className = 'ptr-pill';
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = 'position:fixed;top:10px;left:50%;z-index:58;transform:translate(-50%,-70px);'
      + 'background:#fff;color:#4e5968;border:1px solid #e5e8eb;border-radius:999px;padding:7px 14px;font-size:12.5px;'
      + 'box-shadow:0 4px 14px rgba(0,0,0,.12);pointer-events:none;opacity:0;white-space:nowrap;'
      + 'transition:transform .12s,opacity .12s;font-family:inherit';
    doc.body.appendChild(el);
    return el;
  }

  /**
   * el: 스크롤 컨테이너 (#mainView). opts.reload: 새로고침 함수 (기본 location.reload)
   * 반환: { destroy, state } — 테스트·재초기화용
   */
  function init(el, opts) {
    opts = opts || {};
    var doc = el.ownerDocument || document;
    var reload = opts.reload || function () { (doc.defaultView || window).location.reload(); };
    var threshold = opts.threshold || THRESHOLD;
    var pill = opts.pill || makePill(doc);
    var st = { startY: null, dy: 0, armed: false, busy: false };

    function show(dy) {
      var d = Math.min(dy, MAX_PULL);
      pill.style.opacity = d > 8 ? '1' : '0';
      pill.style.transform = 'translate(-50%,' + (d * 0.55 - 70) + 'px)';
      pill.textContent = dy >= threshold ? '놓으면 새로고침' : '당겨서 새로고침';
    }
    function hide() {
      pill.style.opacity = '0';
      pill.style.transform = 'translate(-50%,-70px)';
    }
    function onStart(e) {
      if (st.busy) return;
      var y = pt(e);
      if (y == null) return;
      if (el.scrollTop > 0) { st.startY = null; return; }
      var tg = e.target;
      if (tg && insideOwnScroller(tg, el)) { st.startY = null; return; }
      st.startY = y; st.dy = 0; st.armed = false;
    }
    function onMove(e) {
      if (st.startY == null || st.busy) return;
      var y = pt(e);
      if (y == null) return;
      var dy = y - st.startY;
      /* 끌다가 다시 올리거나, 컨테이너가 스크롤되기 시작하면 취소 */
      if (dy <= 0 || el.scrollTop > 0) { st.dy = 0; st.armed = false; hide(); return; }
      st.dy = dy; st.armed = dy >= threshold;
      show(dy);
    }
    function onEnd() {
      if (st.startY == null || st.busy) return;
      var fire = st.armed && el.scrollTop <= 0;
      st.startY = null;
      if (!fire) { st.dy = 0; st.armed = false; hide(); return; }
      st.busy = true;
      pill.textContent = '새로고침 중…';
      pill.style.opacity = '1';
      pill.style.transform = 'translate(-50%,0)';
      setTimeout(function () { reload(); }, 60);
    }
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return {
      state: st,
      destroy: function () {
        el.removeEventListener('touchstart', onStart);
        el.removeEventListener('touchmove', onMove);
        el.removeEventListener('touchend', onEnd);
        el.removeEventListener('touchcancel', onEnd);
        if (pill && pill.parentNode && !opts.pill) pill.parentNode.removeChild(pill);
      },
    };
  }

  function boot() {
    try {
      if (!('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) return;   // PC: 터치 없음
      var el = document.getElementById('mainView');
      if (!el || el.dataset.ptr) return;
      el.dataset.ptr = '1';
      init(el);
    } catch (e) { /* 새로고침 보조 기능 — 실패해도 admin 은 그대로 */ }
  }

  if (typeof window !== 'undefined') {
    window._ptrInit = init;
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
      else boot();
    }
  }
})();
