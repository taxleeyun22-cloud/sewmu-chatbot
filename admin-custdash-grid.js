/* admin-custdash-grid.js — 거래처(사람) 대시보드 2컬럼 재배치
 *
 * 본적용 (2026-05-18 사장님 "왜 개인 사용자 기장거래처엔 안해놨노"):
 *   custDashModal 을 business.html 와 동일한 Hero + 2컬럼 시안으로.
 *   업체(business.html)는 standalone 페이지라 inline <script> bzGrid 가능했지만,
 *   custDashModal 은 admin-modals.html → insertAdjacentHTML 주입 (스크립트 미실행)
 *   이라 별도 classic JS 로 분리. admin.html 에서 admin.js 뒤에 로드.
 *
 * 방식: 라이브 노드 이동 (appendChild). 카드 wrapper 는 정적 마크업이라
 *   admin.js/admin-memos.js/admin-filing-review.js 의 렌더 타깃 ID·onclick·
 *   이벤트가 전부 그대로 보존됨 = 기능 회귀 0. business.html bzGrid 와 동일 패턴.
 */
(function(){
  function reflow(){
    var modal = document.getElementById('custDashModal');
    if (!modal || modal.__cdGridDone) return;
    /* #custDashModal > <style> + <div(line20 wrapper)> */
    var inner = modal.querySelector(':scope > div');
    if (!inner) return;
    var header = inner.children[0];   /* sticky 헤더 */
    var body   = inner.children[1];   /* padding:14px;max-width:1200px 본문 */
    if (!header || !body) return;
    var gridDiv = body.firstElementChild;  /* 기존 auto-fit 그리드 (주석 노드는 skip됨) */
    if (!gridDiv) return;
    var cards = Array.prototype.slice.call(gridDiv.children)
      .filter(function(el){ return el.nodeType === 1; });
    if (cards.length < 5) return;  /* 카드 wrapper 아직 주입 전 → 재시도 */

    modal.__cdGridDone = true;
    body.classList.add('cd-body');

    var grid = document.createElement('div'); grid.className = 'cd-grid';
    var main = document.createElement('div'); main.className = 'cd-main';
    var side = document.createElement('div'); side.className = 'cd-side';
    grid.appendChild(main); grid.appendChild(side);

    function titleOf(c){
      var t = c.querySelector('[style*="font-weight:700"]');
      return t ? (t.textContent || '') : '';
    }
    /* 메인(넓은 컬럼) = 신고 검토표·통합 메모·신고 Case·AI 요약·최근 상담 */
    cards.forEach(function(c){
      var t = titleOf(c);
      var isMain = /검토표|통합 메모|신고 Case|AI 요약|최근 상담/.test(t);
      (isMain ? main : side).appendChild(c);  /* 라이브 이동 — 핸들러 보존 */
    });

    body.appendChild(grid);
    if (gridDiv.parentNode === body && gridDiv !== grid) body.removeChild(gridDiv);
  }

  function boot(){
    var n = 0;
    var iv = setInterval(function(){
      reflow();
      var m = document.getElementById('custDashModal');
      if ((m && m.__cdGridDone) || n++ > 60) clearInterval(iv);
    }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
