/* admin-filing-review.js — 신고 검토표 시스템 frontend (사장님 명세 2026-05-07)
 *
 * 함수:
 * - openFilingNew(ownerType, ownerId, ownerName) — 새 Case 모달
 * - submitFilingNew() — 생성 → openFilingDetail 자동
 * - openFilingDetail(filingId) — 상세 모달 (입력 폼 + 비교 + 결재)
 * - closeFilingDetail()
 * - filingPrint() — A4 가로 인쇄 (window.print)
 * - filingSetStatus(status) — 결재 상태 변경
 *
 * 의존:
 * - KEY (admin.js global) — 또는 _filGetKey() fallback (business.html 처럼 admin.js 미로드 페이지)
 * - $g / e / escAttr (admin.js)
 * - admin-customer-dash.js / admin-business-tab.js 가 호출
 */

/* 사장님 보고 fix (2026-05-07): business.html 에서 "불러오는 중..." 안 사라지던 거.
 * 원인: business.html 은 admin.js 안 로드 → KEY 글로벌 미정의 → ReferenceError.
 * 해결: KEY → _filGetKey() 로 통합 — admin.js 의 KEY / window.KEY / URL ?key= 순으로 fallback.
 * 화면용 헬퍼 + escape 도 admin.js 미로드 케이스 fallback. */
function _filGetKey() {
  try { if (typeof KEY !== 'undefined' && KEY) return KEY; } catch (_) {}
  try { if (typeof window !== 'undefined' && window.KEY) return window.KEY; } catch (_) {}
  try {
    const url = new URL(location.href);
    return url.searchParams.get('key') || '';
  } catch { return ''; }
}
function _filGet(id) {
  /* 자체 getElementById — admin.js 의 $g() 와 무관 (business.html 호환) */
  return document.getElementById(id);
}
function _filEsc(s) {
  /* 자체 escape — admin.js 의 e() 와 무관하게 동작 (business.html 등 e() 미정의 페이지 호환) */
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function _filEscAttr(s) {
  try { if (typeof escAttr === 'function') return escAttr(s); } catch (_) {}
  return _filEsc(s).replace(/'/g, '&#39;');
}

/* ==================== 유틸 ==================== */
function _filFormatNum(n) {
  if (n === null || n === undefined || n === '') return '';
  const num = Number(String(n).replace(/[^\d.-]/g, ''));
  if (isNaN(num)) return '';
  return num.toLocaleString('ko-KR');
}
function _filParseNum(s) {
  if (s === null || s === undefined || s === '') return null;
  const num = Number(String(s).replace(/[^\d.-]/g, ''));
  return isNaN(num) ? null : num;
}
function _filEffRate(decisive, revenue) {
  if (!revenue || revenue === 0) return '0.00%';
  return ((Number(decisive || 0) / Number(revenue)) * 100).toFixed(2) + '%';
}

/* ==================== 새 Case 모달 ==================== */
var _filNewOwnerType = null;
var _filNewOwnerId = null;
var _filNewOwnerName = '';

async function openFilingNew(ownerType, ownerId, ownerName, presetType) {
  _filNewOwnerType = ownerType;
  _filNewOwnerId = ownerId;
  _filNewOwnerName = ownerName || '';
  const m = _filGet('filingNewModal');
  if (!m) return;
  _filGet('filingNewOwnerInfo').innerHTML = (ownerType === 'Person' ? '👤 ' : '🏢 ') + _filEsc(ownerName) + ' (#' + ownerId + ')';

  /* 종소세 default = Person, 법인세/부가세 default = Business.
   * Phase 16 (2026-05-17): presetType 인자 — '+ 부가세 Case' 버튼에서 '부가세' 전달. */
  const typeSel = _filGet('filingNewType');
  if (typeSel) typeSel.value = presetType || ((ownerType === 'Business') ? '법인세' : '종소세');

  /* 귀속연도 default = 작년 */
  const yearInp = _filGet('filingNewYear');
  if (yearInp) yearInp.value = new Date().getFullYear() - 1;

  /* 종소세 + Person owner = 포함 사업체 list 자동 fetch */
  await _filNewToggleBizList();
  if (typeSel) typeSel.onchange = _filNewToggleBizList;

  m.style.display = 'flex';
  m.style.alignItems = 'center';
  m.style.justifyContent = 'center';
  document.body.style.overflow = 'hidden';
}
function closeFilingNew() {
  const m = _filGet('filingNewModal');
  if (m) m.style.display = 'none';
  document.body.style.overflow = '';
  _filNewOwnerType = null;
  _filNewOwnerId = null;
}
async function _filNewToggleBizList() {
  const type = _filGet('filingNewType')?.value;
  const area = _filGet('filingNewBizArea');
  const list = _filGet('filingNewBizList');
  if (!area || !list) return;
  /* 종소세 + Person 일 때만 사업체 다중 선택 */
  if (type === '종소세' && _filNewOwnerType === 'Person') {
    area.style.display = 'block';
    list.innerHTML = '<div style="color:#9ca3af;padding:8px;font-size:.78em">불러오는 중...</div>';
    try {
      const r = await fetch('/api/admin-businesses?key=' + encodeURIComponent(_filGetKey()) + '&user_id=' + _filNewOwnerId);
      const d = await r.json();
      /* 사장님 명령 (2026-05-08): "전체적으로 연관된거 다 체크".
       * 신규 Case 사업체 후보 list — closed 도 표시 (사장님이 결정). soft delete 만 제외. */
      const bizList = (d.businesses || []).filter(b => !b.deleted_at || b.deleted_at === '');
      if (!bizList.length) {
        list.innerHTML = '<div style="color:#9ca3af;padding:8px;font-size:.78em">매핑된 사업체 없음</div>';
        return;
      }
      list.innerHTML = bizList.map(b =>
        '<label style="display:flex;align-items:center;gap:6px;padding:5px 6px;cursor:pointer;font-size:.84em;border-bottom:1px solid #f2f4f6">'
        + '<input type="checkbox" class="fil-new-biz" value="' + b.id + '" checked> '
        + '🏢 <b>' + _filEsc(b.company_name || '#' + b.id) + '</b>'
        + (b.business_number ? ' <span style="color:#6b7280;font-size:.92em">' + _filEsc(b.business_number) + '</span>' : '')
        + '</label>'
      ).join('');
    } catch (err) {
      list.innerHTML = '<div style="color:#f04452;padding:8px;font-size:.78em">오류: ' + _filEsc(err.message) + '</div>';
    }
  } else {
    area.style.display = 'none';
  }
}

async function submitFilingNew() {
  if (!_filNewOwnerType || !_filNewOwnerId) { alert('owner 없음'); return; }
  const type = _filGet('filingNewType')?.value;
  const fiscalYear = Number(_filGet('filingNewYear')?.value || 0);
  if (!fiscalYear || fiscalYear < 2000 || fiscalYear > 2100) { alert('귀속연도 입력'); return; }
  const includedBizIds = [];
  if (type === '종소세' && _filNewOwnerType === 'Person') {
    document.querySelectorAll('.fil-new-biz:checked').forEach(c => { includedBizIds.push(Number(c.value)); });
  }
  const btn = _filGet('filingNewSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = '생성 중...'; btn.style.opacity = '.6'; }
  try {
    const r = await fetch('/api/admin-filings?key=' + encodeURIComponent(_filGetKey()), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: type,
        fiscal_year: fiscalYear,
        owner_type: _filNewOwnerType,
        owner_id: _filNewOwnerId,
        included_business_ids: includedBizIds,
      }),
    });
    const d = await r.json();
    if (!d.ok) { alert('생성 실패: ' + (d.error || 'unknown')); return; }
    closeFilingNew();
    /* dashboard 새로고침 */
    if (typeof _filReloadList === 'function') _filReloadList(_filNewOwnerType, _filNewOwnerId);
    /* 상세 모달 자동 진입 */
    openFilingDetail(d.id);
  } catch (err) {
    alert('오류: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '+ 생성'; btn.style.opacity = ''; }
  }
}

/* ==================== 상세 모달 ==================== */
var _filCurrent = null;
var _filPrev = null;
var _filSaveTimer = null;

async function openFilingDetail(filingId) {
  const m = _filGet('filingDetailModal');
  if (!m) return;
  m.style.display = 'flex';
  m.style.alignItems = 'flex-start';
  m.style.justifyContent = 'center';
  document.body.style.overflow = 'hidden';
  _filGet('filingBody').innerHTML = '<div style="text-align:center;color:#8b95a1;padding:40px 0">불러오는 중...</div>';
  try {
    const r = await fetch('/api/admin-filings?key=' + encodeURIComponent(_filGetKey()) + '&id=' + filingId);
    const d = await r.json();
    if (!d.ok || !d.filing) { _filGet('filingBody').innerHTML = '<div style="color:#f04452;padding:20px">오류: ' + _filEsc(d.error || 'unknown') + '</div>'; return; }
    _filCurrent = d.filing;
    _filPrev = d.previous || null;
    /* 사장님 보고 fix (2026-05-07): "불러오는 중..." 안 사라지던 거.
     * 원인: _filRenderOwnerInfo 가 setTimeout async fetch — _filRender 후 fill.
     *       인쇄 시점엔 fetch 미완료 → "불러오는 중..." 그대로 인쇄됨.
     * 해결: openFilingDetail 에서 owner data pre-fetch → _filCurrent 에 stash → 동기 render. */
    await _filFetchOwnerData(_filCurrent);
    _filRender();
  } catch (err) {
    _filGet('filingBody').innerHTML = '<div style="color:#f04452;padding:20px">오류: ' + _filEsc(err.message) + '</div>';
  }
}

/* 사장님 보고 fix (2026-05-07): owner 정보 동기 fetch 후 _filCurrent stash. */
async function _filFetchOwnerData(f) {
  f._businesses = [];
  f._ownerName = '';
  f._ownerBirth = '';
  if (f.owner_type === 'Person') {
    try {
      const u = await fetch('/api/admin-approve?key=' + encodeURIComponent(_filGetKey()) + '&status=all').then(r => r.json());
      const me = (u.users || []).find(x => x.id === f.owner_id);
      f._ownerName = me?.real_name || me?.name || '#' + f.owner_id;
      f._ownerBirth = me?.birth_date || '';
    } catch {}
    try {
      const bizR = await fetch('/api/admin-businesses?key=' + encodeURIComponent(_filGetKey()) + '&user_id=' + f.owner_id);
      const bizD = await bizR.json();
      /* deleted_at 만 제외 (closed 도 표시 — 폐업 정보도 사장님이 봐야 함). */
      let filtered = (bizD.businesses || []).filter(b => !b.deleted_at || b.deleted_at === '');
      /* 사장님 명령 (2026-05-07): "종소세 검토표에는 법인사업자는 빼야된다".
       * 종소세 = 개인사업자 신고 → 법인사업자 자동 제외. */
      if (f.type === '종소세') {
        filtered = filtered.filter(b => !/법인/.test(b.company_form || ''));
      }
      /* 사장님 명령 (2026-05-08): 연도별 매칭 — 사업체 운영기간(개업일~폐업일) 과
       * fiscal_year(YYYY-01-01 ~ YYYY-12-31) 가 하루라도 겹치면 표시.
       * 예: '24-12-02 개업, '25-03 폐업 → 24년·25년 검토표 표시, 26년 X.
       * - 개업일 없음/빈값 → fiscal_year 통과 가정 (의문 시 표시)
       * - 폐업일 없음 → 운영 중 (개업일만 통과 OK) */
      if (f.fiscal_year) {
        const yearStart = String(f.fiscal_year) + '-01-01';
        const yearEnd = String(f.fiscal_year) + '-12-31';
        filtered = filtered.filter(b => {
          const open = (b.establishment_date || '').slice(0, 10);
          const close = (b.closed_date || '').slice(0, 10);
          if (open && open > yearEnd) return false;       /* 개업이 fiscal_year 이후 */
          if (close && close < yearStart) return false;    /* 폐업이 fiscal_year 이전 */
          return true;
        });
      }
      f._businesses = filtered;
      /* 참고용 — 어느 사업체가 included_business_ids 에 있는지 (★ 표시 등 활용 가능) */
      try { f._includedBizIds = JSON.parse(f.included_business_ids || '[]'); } catch { f._includedBizIds = []; }
    } catch {}
  } else if (f.owner_type === 'Business') {
    try {
      const r = await fetch('/api/admin-businesses?key=' + encodeURIComponent(_filGetKey()) + '&id=' + f.owner_id);
      const d = await r.json();
      if (d.business) f._businesses = [d.business];
    } catch {}
  }
}
function closeFilingDetail() {
  const m = _filGet('filingDetailModal');
  if (m) m.style.display = 'none';
  document.body.style.overflow = '';
  if (_filSaveTimer) { clearTimeout(_filSaveTimer); _filSaveTimer = null; }
  _filCurrent = null;
  _filPrev = null;
}

function _filRender() {
  if (!_filCurrent) return;
  const f = _filCurrent;
  const prev = _filPrev;
  const af = (function () { try { return JSON.parse(f.auto_fields || '{}'); } catch { return {}; } })();
  const pf = (function () { try { return JSON.parse(prev?.auto_fields || '{}'); } catch { return {}; } })();
  const isJongSo = f.type === '종소세';
  const readonly = f.review_status === '보관완료' && !(typeof IS_OWNER !== 'undefined' && IS_OWNER);

  /* 헤더 */
  _filGet('filingTitle').innerHTML = f.fiscal_year + '년귀속 <span style="background:' + (isJongSo ? '#dbeafe' : '#fef3c7') + ';color:' + (isJongSo ? '#1e40af' : '#92400e') + ';padding:2px 8px;border-radius:6px;font-size:.7em;font-weight:700;margin:0 4px">' + _filEsc(f.type) + '</span> 신고검토표';

  /* 결재 상태 배지 */
  const stColor = { '작성중': '#9ca3af', '결재대기': 'var(--of-primary)', '보관완료': 'var(--of-success)' }[f.review_status] || '#9ca3af';
  const stBadge = _filGet('filingStatusBadge');
  stBadge.textContent = f.review_status;
  stBadge.style.background = stColor;
  stBadge.style.color = '#fff';

  /* 본문 렌더 — Phase 16 (2026-05-17): 부가세는 별도 렌더 (5열 블록 + 부가율 + 소계/합계 + 멘트4분할) */
  const body = _filGet('filingBody');
  if (f.type === '부가세') {
    body.innerHTML = _filRenderVatBody(f, prev, af, pf, readonly);
  } else {
    body.innerHTML = _filRenderBody(f, prev, af, pf, isJongSo, readonly);
  }

  /* 자동 저장 핸들러 바인딩 */
  document.querySelectorAll('[data-fil-field]').forEach(el => {
    el.addEventListener('input', _filOnFieldChange);
    el.addEventListener('blur', _filSaveNow);
  });
  document.querySelectorAll('[data-fil-text-field]').forEach(el => {
    el.addEventListener('input', _filOnFieldChange);
    el.addEventListener('blur', _filSaveNow);
  });
}

function _filRenderBody(f, prev, af, pf, isJongSo, readonly) {
  const ro = readonly ? 'readonly disabled' : '';
  const revenueLabel = isJongSo ? '총수입금액' : '매출액';

  /* 사장님 명령 (2026-05-13): 종소세 / 법인세 입력 항목 분리.
   * 명세서 `신고검토표_시스템_명세.md` 4.1 / 4.2 원래 spec 복원 + 2026-05-07 익금/손금 유지 (법인세 만).
   *
   * 종소세 (isJongSo=true) — Person 단위, 소득세 흐름:
   *   수입금액 → 종합소득금액 → 종합소득공제 → 과세표준 → 산출세액 →
   *   공제감면세액 → 가산세액 → 결정세액 → 기납부세액 → 납부할세액
   *   실효세율 = 결정세액 ÷ 수입금액
   *
   * 법인세 (isJongSo=false) — Business 단위, 법인세 흐름:
   *   매출액 → 결산서당기순이익 → 익금산입(+) → 손금산입(−) →
   *   각사업연도소득금액 → 과세표준 → 산출세액 →
   *   공제감면세액 → 가산세액 → 결정세액 → 기납부세액 → 감면분추가납부세액 → 납부할세액
   *   실효세율 = 결정세액 ÷ 매출액
   */
  /* 사장님 명령 (2026-05-21): "검토표에 농특세 납부도 집어넣자".
   * 농어촌특별세 = 조세특례제한법 감면세액의 일정 % (보통 20%) 별도 납부.
   * 종소세 / 법인세 양쪽 검토표에 추가.
   * 사장님 명령 (2026-05-23): 위치 변경 — 납부할세액 바로 아래 (맨 끝). 개인·법인 동일. */
  const fields = isJongSo
    ? [
        { key: 'revenue', label: '수입금액' },
        { key: 'total_income', label: '종합소득금액' },
        { key: 'income_deduction', label: '종합소득공제' },
        { key: 'tax_base', label: '과세표준' },
        { key: 'calculated_tax', label: '산출세액' },
        { key: 'deduction_total', label: '세액공제·감면', autoSum: 'deductions' },
        { key: 'penalty_total', label: '가산세', autoSum: 'penalties' },
        { key: 'decisive_tax', label: '결정세액', bold: true },
        { key: 'prepaid_tax', label: '기납부세액' },
        { key: 'payable_tax', label: '납부할세액', bold: true },
        { key: 'farmland_tax', label: '농특세 납부' },
      ]
    : [
        { key: 'revenue', label: '매출액' },
        { key: 'net_income', label: '결산서당기순이익' },
        { key: 'adj_inclusion', label: '익금산입 (+)' },
        { key: 'adj_exclusion', label: '손금산입 (−)' },
        { key: 'business_income', label: '각사업연도소득금액' },
        { key: 'tax_base', label: '과세표준' },
        { key: 'calculated_tax', label: '산출세액' },
        { key: 'deduction_total', label: '공제·감면', autoSum: 'deductions' },
        { key: 'penalty_total', label: '가산세', autoSum: 'penalties' },
        { key: 'decisive_tax', label: '결정세액', bold: true },
        { key: 'prepaid_tax', label: '기납부세액' },
        { key: 'additional_tax', label: '감면분추가납부세액' },
        { key: 'payable_tax', label: '납부할세액', bold: true },
        { key: 'farmland_tax', label: '농특세 납부' },
      ];

  /* 사장님 명령 (2026-05-07): 결재란은 헤더 우상단 (admin-modals.html) 으로 이동.
   * 본문 stamp4 영역 제거 — CHECKLIST 도 사장님 명령 "검토사항 업애자" 로 제거. */

  /* Phase 16 (2026-05-13) 사장님 명령 "한 장 출력": @media print CSS 인라인 박음.
   * 화면 = 세로 1열 (직원 작업 편함). 인쇄만 2 column grid + 글자 압축 + A4 1장 fit. */
  let html = '<style>'
    /* 인쇄 전용 inline span (별도 class — admin-modals.html .print-only block !important 우회) */
    + '.biz-print-inline { display: none; }'
    + '@media print {'
    + '  @page { size: A4; margin: 8mm 8mm; }'
    + '  body { font-size: 9.2pt; }'
    + '  .filing-print-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; align-items: start; }'
    + '  .filing-print-2col > * { margin-bottom: 0 !important; break-inside: avoid; }'
    + '  .filing-section-header { font-size: 8pt; margin-bottom: 1px; margin-top: 4mm; }'
    + '  .filing-section-title { font-size: 10pt; margin-bottom: 3mm; padding-bottom: 1mm; }'
    + '  .filing-comparison-section, .keep-together { margin-bottom: 4mm !important; }'
    + '  table { font-size: 9pt; }'
    + '  table td, table th { padding: 2px 6px !important; }'
    + '  .filing-text-input, .filing-num-input, textarea { font-size: 9pt !important; padding: 4px 6px !important; }'
    + '  /* 사업체 카드 압축: 한 줄 1업체 (회사명·사업자·대표·주소·장부) + 여백 압축 */'
    + '  #filingOwnerInfoBody { font-size: 9pt; line-height: 1.35; }'
    + '  .filing-biz-card { padding: 0.5mm 0 !important; margin: 0 !important; }'
    + '  .filing-biz-card > div { margin: 0 !important; }'
    + '  /* 인쇄 시: 회사명 줄 끝에 주소·장부 inline (auto wrap) — 별도 줄 안 만듦 */'
    + '  .biz-print-inline { display: inline !important; color: #374151 !important; }'
    + '  .biz-print-inline.book { color: #1d4ed8 !important; font-weight: 600 !important; }'
    + '  /* 화면용 주소 div / 장부 wrapper 인쇄 시 hide */'
    + '  .biz-addr-screen { display: none !important; }'
    + '  /* SECTION 04+05 코멘트 박스 컴팩트 */'
    + '  .print-only { font-size: 8.8pt !important; line-height: 1.4 !important; min-height: 18mm !important; padding: 2mm 3mm !important; }'
    + '}'
    + '</style>';

  /* SECTION 01: 기본 정보 — 사장님 명령 (2026-05-07): 주업체 회사정보.
   * 회사명 / 사업자번호 / 개업일자 / 사업장주소. 사업체 여러개면 모두 나열.
   * 사장님 보고 fix: "불러오는 중..." 안 사라지던 거 — 동기 렌더로 변경 (openFilingDetail 에서 pre-fetch 후 stash). */
  html += '<div class="keep-together" style="margin-bottom:14px">';
  html += '<div class="filing-section-header">SECTION 01 · BASIC INFO</div>';
  html += '<div class="filing-section-title">기본정보</div>';
  html += '<div id="filingOwnerInfoBody" style="font-size:.88em;color:#374151;line-height:1.6">' + _filRenderOwnerInfoSync(f) + '</div>';
  html += '</div>';

  /* Phase 16 (2026-05-13): SECTION 02 + 03 = 2-column grid (인쇄 시만, 화면은 풀폭) */
  html += '<div class="filing-print-2col">';

  /* SECTION 02: 작년 vs 올해 비교표 — 길어서 자동 분할 허용 (코멘트 박스 보호 위해 keep-together 빼고 별도 클래스) */
  html += '<div class="filing-comparison-section" style="margin-bottom:14px">';
  html += '<div class="filing-section-header">SECTION 02 · COMPARISON</div>';
  html += '<div class="filing-section-title">작년 vs 올해 비교</div>';
  /* Phase 16 (2026-05-13) 사장님 명령: SECTION 02 의 표 헤더가 SECTION 03 의 "○ 적용 공제·감면"
   * 라벨 다음 표 헤더와 같은 y 에 위치하도록 — 매칭 라벨 추가. */
  html += '<div style="font-size:.86em;margin-bottom:6px"><b>○ 비교 항목 (작년 vs 올해)</b></div>';
  if (!prev) {
    html += '<div style="background:#fef3c7;border-left:3px solid #f59e0b;padding:10px 14px;border-radius:6px;font-size:.86em;color:#92400e">📌 작년 Case 없음 — 첫 도입 신고건. 내년부터 자동 비교됩니다.</div>';
  }
  html += '<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:.88em">';
  html += '<thead><tr style="background:#f9fafb;border-top:2px solid #191f28;border-bottom:1px solid #191f28">'
       + '<th style="padding:8px 10px;text-align:left;font-weight:700;color:#191f28;width:40%">항목</th>'
       + '<th style="padding:8px 10px;text-align:right;font-weight:700;color:#6b7280;width:30%">' + (prev ? (prev.fiscal_year + '귀속') : '작년') + '</th>'
       + '<th style="padding:8px 10px;text-align:right;font-weight:700;color:#191f28;width:30%">' + f.fiscal_year + '귀속</th>'
       + '</tr></thead><tbody>';
  /* 기본 비교 row 들 — 사장님 명령 (2026-05-07): 항목 확장 + 자동 합계 + 비율 */
  const calcAutoSum = (obj, key) => {
    if (key === 'deductions') {
      const list = obj.공제감면 || obj.deductions || [];
      return list.reduce((s, d) => s + (Number(d.amount || d.금액) || 0), 0);
    }
    if (key === 'penalties') {
      const list = obj.가산세 || obj.penalties || [];
      return list.reduce((s, d) => s + (Number(d.amount || d.금액) || 0), 0);
    }
    return null;
  };
  const fmtVal = (val, fl) => {
    if (val === undefined || val === null || val === '') return '—';
    if (fl.percent) return Number(val).toFixed(2) + '%';
    return _filFormatNum(val);
  };
  fields.forEach(fl => {
    let prevVal = pf[fl.key];
    let currVal = af[fl.key];
    if (fl.autoSum) {
      prevVal = calcAutoSum(pf, fl.autoSum);
      currVal = calcAutoSum(af, fl.autoSum);
    }
    /* 소득률 표시 (income / revenue %) */
    let rateBadge = '';
    if (fl.showRate && currVal && af[fl.showRate]) {
      const rate = (Number(currVal) / Number(af[fl.showRate]) * 100).toFixed(2);
      rateBadge = ' <span style="color:#3182f6;font-weight:700;font-size:.92em">[' + rate + '%]</span>';
    }
    let prevRateBadge = '';
    if (fl.showRate && prevVal && pf[fl.showRate]) {
      const rate = (Number(prevVal) / Number(pf[fl.showRate]) * 100).toFixed(2);
      prevRateBadge = ' <span style="color:#9ca3af;font-size:.92em">[' + rate + '%]</span>';
    }
    const rowBg = fl.highlight ? 'background:#fef3c7' : (fl.bold ? 'background:#fafbfc' : '');
    const fontWeight = fl.bold ? 'font-weight:700' : '';
    html += '<tr style="border-bottom:1px solid #f2f4f6;' + rowBg + '">'
         + '<td style="padding:6px 10px;' + fontWeight + '">' + _filEsc(fl.label) + '</td>'
         + '<td style="padding:6px 10px;text-align:right;color:#6b7280">' + fmtVal(prevVal, fl) + prevRateBadge + '</td>'
         + '<td style="padding:6px 10px;text-align:right;' + fontWeight + '">' + fmtVal(currVal, fl) + rateBadge + '</td>'
         + '</tr>';
  });
  /* 실효세율 (자동 계산) */
  const revKey = 'revenue';
  const decKey = 'decisive_tax';
  const prevEff = (pf[revKey] && pf[decKey]) ? _filEffRate(pf[decKey], pf[revKey]) : '';
  const currEff = (af[revKey] && af[decKey]) ? _filEffRate(af[decKey], af[revKey]) : '';
  html += '<tr style="border-bottom:1px solid #f2f4f6;background:#f9fafb">'
       + '<td style="padding:6px 10px;font-weight:600">실효세율 (결정세액 ÷ ' + revenueLabel + ')</td>'
       + '<td style="padding:6px 10px;text-align:right;color:#6b7280">' + (prevEff || '—') + '</td>'
       + '<td style="padding:6px 10px;text-align:right;font-weight:600">' + (currEff || '—') + '</td>'
       + '</tr>';
  html += '</tbody></table></div>';

  /* 공제감면 — 사장님 명령 (2026-05-07): "위 비교표랑 같은 칸 느낌으로 좌우 비교".
   * SECTION 02 비교표 패턴 — 4열 (항목 / 작년 / 올해 / 증감) + 소계 행. */
  const prevDeductions = pf.공제감면 || pf.deductions || [];
  const currDeductions = af.공제감면 || af.deductions || [];

  /* 공제·감면 항목 union — Phase 16 (2026-05-13): code 기반 정규화 매칭.
   * code 동일하면 작년/올해 같은 줄 (글자 미세하게 달라도 OK). code 없으면 name 매칭 fallback. */
  const dedRows = [];
  const dedSeenKeys = new Set();
  const _filDedKey = (d) => (d.code ? 'C:' + d.code : 'N:' + (d.name || d.종류 || '').trim());
  currDeductions.forEach(d => {
    const nm = (d.name || d.종류 || '').trim();
    if (!nm) return;
    const key = _filDedKey(d);
    if (dedSeenKeys.has(key)) return;
    dedSeenKeys.add(key);
    /* 작년 매칭: code 우선, 없으면 name fallback */
    const prevD = prevDeductions.find(p => {
      if (d.code && p.code) return p.code === d.code;
      return (p.name || p.종류 || '').trim() === nm;
    });
    dedRows.push({
      name: nm,
      code: d.code || null,
      curr: Number(d.amount || d.금액 || 0),
      prev: prevD ? Number(prevD.amount || prevD.금액 || 0) : null,
    });
  });
  prevDeductions.forEach(d => {
    const nm = (d.name || d.종류 || '').trim();
    if (!nm) return;
    const key = _filDedKey(d);
    if (dedSeenKeys.has(key)) return;
    dedSeenKeys.add(key);
    dedRows.push({
      name: nm,
      code: d.code || null,
      curr: null,
      prev: Number(d.amount || d.금액 || 0),
    });
  });

  /* SECTION 03: 공제감면 / 가산세 — 비교표 형식 */
  html += '<div class="keep-together" style="margin-bottom:18px">';
  html += '<div class="filing-section-header">SECTION 03 · DEDUCTIONS &amp; PENALTIES</div>';
  html += '<div class="filing-section-title">공제·감면 / 가산세 명세</div>';

  /* 공제·감면 비교표 (인쇄용) — 사장님 명령 (2026-05-07): "증감은 빼도되고" */
  html += '<div class="print-only" style="display:none;margin-bottom:10px"><div style="font-weight:700;margin-bottom:4px;font-size:.92em">○ 적용 공제·감면</div>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:.86em">';
  html += '<thead><tr style="background:#f9fafb;border-top:1.5px solid #191f28;border-bottom:1px solid #191f28">'
       + '<th style="padding:5px 8px;text-align:left;font-weight:700;width:48%">항목</th>'
       + '<th style="padding:5px 8px;text-align:right;font-weight:700;color:#6b7280;width:26%">' + (prev ? prev.fiscal_year + '귀속' : '작년') + '</th>'
       + '<th style="padding:5px 8px;text-align:right;font-weight:700;width:26%">' + f.fiscal_year + '귀속</th>'
       + '</tr></thead><tbody>';
  if (!dedRows.length) {
    html += '<tr><td colspan="3" style="padding:8px;color:#9ca3af;text-align:center">없음</td></tr>';
  } else {
    dedRows.forEach(row => {
      html += '<tr style="border-bottom:1px solid #f2f4f6">'
           + '<td style="padding:5px 8px">' + _filEsc(row.name) + '</td>'
           + '<td style="padding:5px 8px;text-align:right;color:#6b7280">' + (row.prev ? _filFormatNum(row.prev) + '원' : '—') + '</td>'
           + '<td style="padding:5px 8px;text-align:right">' + (row.curr ? _filFormatNum(row.curr) + '원' : '—') + '</td>'
           + '</tr>';
    });
    /* 소계 */
    const prevTot = prevDeductions.reduce((s, d) => s + Number(d.amount || d.금액 || 0), 0);
    const currTot = currDeductions.reduce((s, d) => s + Number(d.amount || d.금액 || 0), 0);
    html += '<tr style="border-top:1.5px solid #191f28;background:#fafbfc;font-weight:700">'
         + '<td style="padding:5px 8px">소계</td>'
         + '<td style="padding:5px 8px;text-align:right;color:#6b7280">' + (prevTot ? _filFormatNum(prevTot) + '원' : '—') + '</td>'
         + '<td style="padding:5px 8px;text-align:right">' + (currTot ? _filFormatNum(currTot) + '원' : '—') + '</td>'
         + '</tr>';
  }
  html += '</tbody></table></div>';
  /* 화면 list (편집 모드 — 입력 폼만 표시, 비교는 print 에서) */
  html += '<div class="no-print" style="font-size:.86em;margin-bottom:10px"><b>○ 적용 공제·감면</b></div>';
  html += '<div id="filDeductionRows" class="no-print" style="margin-top:6px">';
  if (currDeductions.length === 0) html += _filRenderDeductionRow({ name: '', amount: '' }, 0, readonly);
  else currDeductions.forEach((d, i) => { html += _filRenderDeductionRow(d, i, readonly); });
  html += '</div>';
  if (!readonly) html += '<button onclick="_filAddDeductionRow()" class="no-print" style="background:#fff;color:#3182f6;border:1px dashed #3182f6;padding:4px 10px;border-radius:6px;font-size:.74em;cursor:pointer;font-family:inherit;margin-top:6px;margin-bottom:10px">+ 공제감면 추가</button>';
  /* 공제 wrapper close 제거 — wrapper 자체가 없음 (no-print div 별도 닫음) */

  /* 가산세 — SECTION 02 같은 4열 비교표 (사장님 명령 2026-05-07) */
  const currPenalties_2 = af.가산세 || af.penalties || [];
  const prevPenalties = pf.가산세 || pf.penalties || [];
  const penRows = [];
  const penSeen = new Set();
  currPenalties_2.forEach(p => {
    const nm = (p.name || p.종류 || '').trim();
    if (!nm || penSeen.has(nm)) return;
    penSeen.add(nm);
    const prevP = prevPenalties.find(x => (x.name || x.종류 || '').trim() === nm);
    penRows.push({
      name: nm,
      curr: Number(p.amount || p.금액 || 0),
      prev: prevP ? Number(prevP.amount || prevP.금액 || 0) : null,
    });
  });
  prevPenalties.forEach(p => {
    const nm = (p.name || p.종류 || '').trim();
    if (!nm || penSeen.has(nm)) return;
    penSeen.add(nm);
    penRows.push({ name: nm, curr: null, prev: Number(p.amount || p.금액 || 0) });
  });

  /* 가산세 비교표 (인쇄용) — 증감 열 제거 (사장님 명령 2026-05-07) */
  html += '<div class="print-only" style="display:none;margin-bottom:8px"><div style="font-weight:700;margin-bottom:4px;font-size:.92em">○ 가산세</div>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:.86em">';
  html += '<thead><tr style="background:#f9fafb;border-top:1.5px solid #191f28;border-bottom:1px solid #191f28">'
       + '<th style="padding:5px 8px;text-align:left;font-weight:700;width:48%">항목</th>'
       + '<th style="padding:5px 8px;text-align:right;font-weight:700;color:#6b7280;width:26%">' + (prev ? prev.fiscal_year + '귀속' : '작년') + '</th>'
       + '<th style="padding:5px 8px;text-align:right;font-weight:700;width:26%">' + f.fiscal_year + '귀속</th>'
       + '</tr></thead><tbody>';
  if (!penRows.length) {
    html += '<tr><td colspan="3" style="padding:8px;color:#9ca3af;text-align:center">없음</td></tr>';
  } else {
    penRows.forEach(row => {
      html += '<tr style="border-bottom:1px solid #f2f4f6">'
           + '<td style="padding:5px 8px">' + _filEsc(row.name) + '</td>'
           + '<td style="padding:5px 8px;text-align:right;color:#6b7280">' + (row.prev ? _filFormatNum(row.prev) + '원' : '—') + '</td>'
           + '<td style="padding:5px 8px;text-align:right">' + (row.curr ? _filFormatNum(row.curr) + '원' : '—') + '</td>'
           + '</tr>';
    });
    const prevTot = prevPenalties.reduce((s, p) => s + Number(p.amount || p.금액 || 0), 0);
    const currTot = currPenalties_2.reduce((s, p) => s + Number(p.amount || p.금액 || 0), 0);
    html += '<tr style="border-top:1.5px solid #191f28;background:#fafbfc;font-weight:700">'
         + '<td style="padding:5px 8px">소계</td>'
         + '<td style="padding:5px 8px;text-align:right;color:#6b7280">' + (prevTot ? _filFormatNum(prevTot) + '원' : '—') + '</td>'
         + '<td style="padding:5px 8px;text-align:right">' + (currTot ? _filFormatNum(currTot) + '원' : '—') + '</td>'
         + '</tr>';
  }
  html += '</tbody></table></div>';
  /* 화면 list (편집 모드 — 입력 폼만 표시, 비교는 print 에서) */
  html += '<div class="no-print" style="font-size:.86em;margin-bottom:8px"><b>○ 가산세</b></div>';
  html += '<div id="filPenaltyRows" class="no-print" style="margin-top:6px">';
  if (currPenalties_2.length === 0) html += _filRenderPenaltyRow({ name: '', amount: '' }, 0, readonly);
  else currPenalties_2.forEach((p, i) => { html += _filRenderPenaltyRow(p, i, readonly); });
  html += '</div>';
  if (!readonly) html += '<button onclick="_filAddPenaltyRow()" class="no-print" style="background:#fff;color:#dc2626;border:1px dashed #dc2626;padding:4px 10px;border-radius:6px;font-size:.74em;cursor:pointer;font-family:inherit;margin-top:6px">+ 가산세 추가</button>';
  /* 가산세 wrapper close 제거 — wrapper 자체가 없음 */
  html += '</div>'; /* SECTION 03 keep-together close */
  html += '</div>'; /* Phase 16: filing-print-2col (SECTION 02 + 03) close */

  /* Phase 16 (2026-05-13) 사장님 명령: "작년리뷰랑 올해 직원 코멘트는 양옆말고 세로로".
   * SECTION 04 + 05 풀폭 (세로 배치) — 2-column wrap 제거. */

  /* SECTION 04: 작년 리뷰 (참조용 — 직원 + 결재자 코멘트, 작년 있을 때만).
   * 사장님 명령: 2장 fit 컴팩트. */
  const prevEmpNote = pf.employee_note || '';
  if (prev && (prevEmpNote || prev.reviewer_comment)) {
    html += '<div class="keep-together" style="margin-bottom:10px;padding:6px 10px;background:#f9fafb;border-left:3px solid #6b7280;border-radius:6px">';
    html += '<div class="filing-section-header" style="margin-top:0">SECTION 04 · LAST YEAR REVIEW</div>';
    html += '<div class="filing-section-title" style="font-size:.9em;margin-bottom:5px">📜 작년 (' + prev.fiscal_year + ') 리뷰 — 참조용</div>';
    if (prevEmpNote) {
      html += '<div style="margin-bottom:4px"><div style="font-weight:700;font-size:.82em;margin-bottom:2px;color:#374151">○ 작년 직원 코멘트 (특이사항·이슈)</div>';
      html += '<div style="font-size:.82em;color:#374151;white-space:pre-wrap;line-height:1.5;background:#fff7ed;padding:5px 8px;border-radius:4px;border-left:2px solid #f59e0b">' + _filEsc(prevEmpNote) + '</div></div>';
    }
    if (prev.reviewer_comment) {
      html += '<div><div style="font-weight:700;font-size:.82em;margin-bottom:2px;color:#374151">○ 작년 결재자 코멘트</div>';
      html += '<div style="font-size:.82em;color:#374151;white-space:pre-wrap;line-height:1.5;background:#fff;padding:5px 8px;border-radius:4px;border-left:2px solid #6b7280">' + _filEsc(prev.reviewer_comment) + '</div></div>';
    }
    html += '</div>';
  }

  /* SECTION 05: 직원 코멘트 (특이사항·이슈) — 매년 누적, 다음 해 작년 리뷰에 표시.
   * 사장님 명령 (2026-05-07): "두장에 다담아야한다" — 박스 컴팩트화. */
  html += '<div class="keep-together" style="margin-bottom:10px">';
  html += '<div class="filing-section-header">SECTION 05 · EMPLOYEE NOTE</div>';
  html += '<div class="filing-section-title">📝 직원 코멘트 <span style="font-size:.74em;color:#6b7280;font-weight:500">(특이사항·이슈 — 다음 해 작년 리뷰에 자동 표시)</span></div>';
  /* 인쇄용 — 컴팩트 (35mm) */
  html += '<div class="print-only" style="display:none;border:1.5px solid #191f28;border-radius:4px;padding:4mm;min-height:35mm;font-size:9.5pt;line-height:1.6;white-space:pre-wrap;background:#fff7ed">';
  html += _filEsc(af.employee_note || '');
  html += '</div>';
  /* 편집용 textarea */
  html += '<textarea class="no-print" data-fil-text-field="employee_note" rows="5" ' + ro + ' placeholder="이번 신고의 특이사항·이슈 — 직원이 작성. 매년 누적되어 다음 해 검토표에 자동 표시.\n예) 카페 신규 오픈으로 매출 급증 / 사업용계좌 12월 매출 누락 가능성 / 청년창업감면 신청 가능 — 재확인 필요" style="width:100%;padding:10px 12px;border:1px solid #f59e0b;border-radius:6px;font-size:.92em;font-family:inherit;box-sizing:border-box;resize:vertical;line-height:1.6;background:#fff7ed">' + _filEsc(af.employee_note || '') + '</textarea>';
  html += '</div>';

  /* SECTION 07 (결재자 코멘트) — Phase 16 (2026-05-13) 사장님 명령 "없애버려도 될거같아":
   * UI 통째 제거. 1장 출력 배치 + 결재란 (헤더 우상단) 으로 결재 의도 충족.
   * DB reviewer_comment 컬럼은 옛 데이터 보존 위해 유지 (조회만, 신규 입력 X). */

  /* 좌우 2단 폐기 — placeholder div 닫기 */
  html += '</div>'; /* end placeholder */

  /* SECTION 08 CHECKLIST 폐기 — 사장님 명령 (2026-05-07): "검토사항 업애자".
   * 결재란도 헤더 우상단 (admin-modals.html) 으로 이동 → stamp4 사용처 0. */

  /* SECTION 07: 입력 폼 (직원 작성용, 화면 전용) — 사장님 명령 (2026-05-07): 폼은 1번 위치 (위) */
  html += '<div class="keep-together no-print" style="margin-bottom:18px;padding:14px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e8eb">';
  html += '<div class="filing-section-header">SECTION 07 · INPUT (직원 입력)</div>';
  html += '<div class="filing-section-title">자동 필드 수기 입력</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">';
  fields.forEach(fl => {
    if (fl.autoSum) {
      /* 공제감면/가산세 합계 — readonly 자동 계산 */
      const sum = calcAutoSum(af, fl.autoSum);
      html += '<div><label style="font-size:.78em;color:#6b7280;display:block;margin-bottom:3px">' + _filEsc(fl.label) + ' <span style="color:#9ca3af">(자동)</span></label>';
      html += '<input type="text" id="fil_sum_' + fl.autoSum + '" readonly value="' + _filFormatNum(sum) + '" class="filing-num-input" style="background:#f3f4f6;color:#374151"></div>';
      return;
    }
    const v = af[fl.key];
    const suffix = fl.percent ? ' <span style="color:#9ca3af">(%)</span>' : ' <span style="color:#9ca3af">(원)</span>';
    html += '<div>';
    html += '<label style="font-size:.78em;color:#6b7280;display:block;margin-bottom:3px">' + _filEsc(fl.label) + suffix + '</label>';
    if (fl.percent) {
      html += '<input type="text" data-fil-field="' + fl.key + '" ' + ro + ' value="' + (v !== undefined && v !== null ? Number(v).toFixed(2) : '') + '" placeholder="0.00" class="filing-num-input">';
    } else {
      html += '<input type="text" data-fil-field="' + fl.key + '" ' + ro + ' value="' + (v !== undefined && v !== null ? _filFormatNum(v) : '') + '" placeholder="0" oninput="_filFormatOnInput(this)" class="filing-num-input">';
    }
    html += '</div>';
  });
  html += '</div>';
  html += '<div id="filSaveStatus" style="font-size:.74em;color:#9ca3af;margin-top:10px">자동 저장됨</div>';
  html += '</div>';

  /* SECTION 06: 결재 버튼 — Phase 16 (2026-05-17) 전수검토 #1·#9: 공통 함수 추출 (DRY).
   * 종소세/법인세(_filRenderBody) + 부가세(_filRenderVatBody) 공유. */
  html += _filApprovalButtonsHtml(f);

  /* 헤더 owner 요약 (타이틀 아래) — 동기 set */
  if (_filGet('filingOwnerInfo')) {
    const summary = (f._businesses && f._businesses.length)
      ? '🏢 ' + _filEsc(f._businesses[0].company_name || '') + (f._businesses.length > 1 ? ' 외 ' + (f._businesses.length - 1) + '개' : '')
      : '';
    _filGet('filingOwnerInfo').innerHTML = summary;
  }

  return html;
}

/* 사장님 보고 fix (2026-05-07): owner info 동기 렌더 — _filCurrent._businesses 사용.
 * 인쇄 시 "불러오는 중..." 안 사라지던 사고 해결. */
function _filRenderOwnerInfoSync(f) {
  /* Phase 16 (2026-05-13) 사장님 명령: 사업체 카드 인쇄 시 회사명 줄에 장부 라벨 인라인.
   * 별도 줄 X — 여백 압축. */
  const af0 = (function() { try { return JSON.parse(f.auto_fields || '{}'); } catch { return {}; } })();
  const bookMap0 = af0.book_keeping_types || {};
  const fmtBizRow = (b, isPrimary) => {
    const form = b.company_form || '';
    const formShort = /법인/.test(form) ? '법인' : (/개인/.test(form) ? '개인' : (/간이/.test(form) ? '간이' : ''));
    const bn = b.business_number || '';
    const bnFmt = bn && bn.length === 10 ? bn.slice(0,3)+'-'+bn.slice(3,5)+'-'+bn.slice(5) : bn;
    /* Phase 16 (2026-05-13) 사장님 명령: 인쇄 시 한 줄에 회사명·사업자·대표·주소·장부 통합 (auto wrap).
     * 화면용 주소 별도 div + 화면용 장부 segmented button 그대로 (직원 작업 편함). */
    const currentBook = bookMap0[b.id] || '';
    const printAddr = b.address
      ? '<span class="biz-print-inline"> · ' + _filEsc(b.address) + '</span>'
      : '';
    const printBook = '<span class="biz-print-inline book"> · 📚 ' + (currentBook ? currentBook + '장부' : '미선택') + '</span>';
    /* 사장님 지적 (2026-05-07): "폐업한지 안한지 니가 어떻게 아는데?".
     * status='closed' 만 보고 "폐업" 단정 X — 거래 종료 / 매핑 해제 등 다른 사유 가능.
     * 모든 사업체 동일 표시 (회색·(폐업) 라벨 폐기). */
    return (isPrimary ? '★ ' : '  ') + '🏢 <b>' + _filEsc(b.company_name || '#' + b.id) + '</b>'
      + (formShort ? ' <span style="color:#6b7280">(' + formShort + ')</span>' : '')
      + (bnFmt ? ' · 사업자 ' + _filEsc(bnFmt) : '')
      + (b.ceo_name ? ' · 대표 ' + _filEsc(b.ceo_name) : '')
      + (b.establishment_date ? ' · 개업 ' + _filEsc(b.establishment_date.slice(0, 10)) : '')
      + (b.closed_date ? ' · 폐업 ' + _filEsc(b.closed_date.slice(0, 10)) : '')
      + printAddr
      + printBook
      + (b.address ? '<div class="biz-addr-screen" style="margin-left:18px;color:#6b7280;font-size:.92em">' + _filEsc(b.address) + '</div>' : '');
  };
  let html = '';
  if (f.owner_type === 'Person' && f._ownerName) {
    html += '<div style="margin-bottom:4px">👤 대표 · 사람: <b>' + _filEsc(f._ownerName) + '</b>' + (f._ownerBirth ? ' · 생년월일 ' + _filEsc(f._ownerBirth) : '') + '</div>';
  }
  const businesses = f._businesses || [];
  /* Phase 16 (2026-05-13) 사장님 명령: 사업체별 장부 구분 segmented button (옵션 C).
   * auto_fields.book_keeping_types = { bizId: '복식'|'간편'|'기준'|'단순' } */
  const af = (function() { try { return JSON.parse(f.auto_fields || '{}'); } catch { return {}; } })();
  const bookMap = af.book_keeping_types || {};
  /* Phase 16 (2026-05-17) 전수검토 #4 fix: f.status 는 존재 안 하는 컬럼 (DB = review_status).
   * 옛 코드는 항상 readonly=false → 보관완료 검토표에도 장부/✕해제/+사업장 버튼 노출.
   * _filRenderBody:277 와 동일 패턴으로 통일. */
  const readonly = f.review_status === '보관완료' && !(typeof IS_OWNER !== 'undefined' && IS_OWNER);
  const _filBookHtml = (bizId) => {
    const types = ['복식', '간편', '기준', '단순'];
    const current = bookMap[bizId] || '';
    const btns = types.map(t => {
      const active = current === t;
      const bg = active ? '#3182f6' : '#fff';
      const color = active ? '#fff' : '#6b7280';
      const border = active ? '#3182f6' : '#e5e8eb';
      const onclick = readonly ? '' : 'onclick="_filSetBookKeeping(' + bizId + ',\'' + t + '\')"';
      return '<button ' + onclick + ' class="no-print" style="background:' + bg + ';color:' + color + ';border:1px solid ' + border + ';padding:3px 12px;font-size:.78em;cursor:' + (readonly ? 'default' : 'pointer') + ';font-family:inherit;font-weight:' + (active ? '700' : '500') + ';margin:0;border-radius:0" type="button" data-fil-book-biz="' + bizId + '" data-fil-book-type="' + t + '">' + t + '</button>';
    }).join('');
    /* Phase 16 (2026-05-13) 사장님 명령: 실수 시 ✕ 로 선택 해제 */
    const clearBtn = (!readonly && current)
      ? '<button onclick="_filSetBookKeeping(' + bizId + ',\'\')" class="no-print" type="button" title="장부 선택 해제" style="background:none;border:none;color:#9ca3af;cursor:pointer;font-size:.82em;padding:2px 6px;margin-left:2px;font-family:inherit">✕ 해제</button>'
      : '';
    /* Phase 16 (2026-05-13) 사장님 명령: 인쇄 시 장부 라벨은 fmtBizRow 안 회사명 줄에 inline.
     * _filBookHtml 은 화면용 segmented button 만 (인쇄 시 wrapper 통째 no-print 으로 hide).
     * 결과: 인쇄 시 사업체 카드 = 2줄 (회사명+장부 / 주소). 여백 압축. */
    return '<div class="no-print" style="margin-left:18px;margin-top:4px;font-size:.84em;display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
      + '<span style="color:#6b7280">📚 장부:</span>'
      + '<div style="display:inline-flex;border-radius:6px;overflow:hidden;border:1px solid #e5e8eb">' + btns + '</div>'
      + clearBtn
      + '</div>';
  };
  /* Phase 16 (2026-05-13) 사장님 명령: 검토표 안 "+ 사업장 추가" 버튼.
   * 시나리오: 25년 신고 작성 중 프리랜서 소득 (3.3% 원천징수) 늦게 발견 → 사업장 추가.
   * Person owner type 만 (Business owner type 은 사업체 1개 고정).
   * 클릭 → admin-customer-dash.js 의 openAddBizForUser 호출 (기존 모달 재사용). */
  /* Phase 16 (2026-05-13) 사장님 보고: 버튼 안 보임.
   * 진짜 원인: f._ownerId stash 안 됨 (라인 213-220 _ownerName/_ownerBirth 만 stash).
   * Fix: DB 컬럼 owner_id 직접 사용. */
  const ownerId = Number(f.owner_id || 0);
  const isPerson = f.owner_type === 'Person' && ownerId > 0;
  const addBizBtn = (isPerson && !readonly)
    ? '<button class="no-print" onclick="_filAddBizForFiling(' + ownerId + ',\'' + _filEsc(f._ownerName || '').replace(/\'/g,'') + '\',\'\')" style="background:#3182f6;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:.74em;font-weight:600;cursor:pointer;font-family:inherit;margin-left:8px" title="프리랜서 소득 등 사업장 늦게 발견 시 추가">+ 사업장 추가</button>'
    : '';
  if (businesses.length) {
    html += '<div style="font-weight:700;margin-top:2px;margin-bottom:3px;color:#191f28;display:flex;align-items:center;flex-wrap:wrap">📋 사업체 (' + businesses.length + '개)' + addBizBtn + '</div>';
    businesses.forEach((b, i) => {
      /* Phase 16 (2026-05-13) 사장님 명령: 마지막 사업체 카드의 dashed 점선 제거 →
       * SECTION 01 wrapper 끝에 굵은 단선 (아래) 으로 대체. */
      const isLast = i === businesses.length - 1;
      const sep = isLast ? '' : 'border-bottom:1px dashed #e5e8eb;';
      html += '<div class="filing-biz-card" style="margin:2px 0;padding:4px 0;' + sep + '">'
        + fmtBizRow(b, i === 0)
        + _filBookHtml(b.id)
        + '</div>';
    });
  } else {
    html += '<div style="color:#9ca3af;display:flex;align-items:center">매핑된 사업체 없음' + addBizBtn + '</div>';
  }
  /* Phase 16 (2026-05-13) 사장님 명령: SECTION 01 끝에 굵은 검정 단선
   * (사장님 mockup 3번째 사진 — SECTION 02·03 시작 전 명확한 구분). */
  html += '<div style="border-bottom:2px solid #191f28;margin-top:8px"></div>';
  return html;
}

/* Phase 16 (2026-05-13) 사장님 명령: 검토표 안 사업장 추가 핸들러.
 * 1) admin-customer-dash.js 의 openAddBizForUser 호출 (기존 사업장 추가 모달)
 * 2) 모달 닫힌 후 검토표 자동 새로고침 (사업체 list 재 fetch).
 *
 * @param {number} userId
 * @param {string} userName
 * @param {string} userPhone
 */
function _filAddBizForFiling(userId, userName, userPhone) {
  if (!userId) { alert('사용자 ID 없음'); return; }
  if (typeof window.openAddBizForUser !== 'function') {
    alert('사업장 추가 기능 로드 안 됨 — 거래처 dashboard 에서 추가 후 검토표 새로고침 부탁드립니다.');
    return;
  }
  /* 검토표 새로고침 callback — 사업장 추가 후 자동 호출. */
  window._filReopenAfterBizAdd = function() {
    try {
      if (_filCurrent && _filCurrent.id && typeof openFilingDetail === 'function') {
        openFilingDetail(_filCurrent.id);
      }
    } catch (_) {}
    delete window._filReopenAfterBizAdd;
  };
  /* 사업장 추가 모달 — 신규 사업장 만들면 business_members 자동 매핑 */
  try {
    window.openAddBizForUser(userId, userName || '', userPhone || '');
    /* fix (2026-05-17 사장님 보고 "사업장 추가 눌러도 아무것도 안뜸"):
     * manualClientModal(z-index:11400) 과 filingDetailModal(z-index:11400) 동률 →
     * DOM 뒤쪽 filingDetailModal 이 위 덮어 사업장추가 모달이 가려짐.
     * 검토표에서 띄울 때만 manualClientModal 을 검토표 위로 (11600).
     * closeManualClientModal 에서 11400 복원. */
    setTimeout(function () {
      var mc = document.getElementById('manualClientModal');
      if (mc) mc.style.zIndex = '11600';
    }, 90);
  } catch (e) {
    alert('사업장 추가 모달 열기 실패: ' + e.message);
  }
}
window._filAddBizForFiling = _filAddBizForFiling;

/* Phase 16 (2026-05-13) 사장님 명령 옵션 C: 장부 구분 segmented button 클릭 핸들러.
 * - auto_fields.book_keeping_types 에 즉시 저장 (1.5초 디바운스).
 * - businesses 테이블에 book_keeping_type 컬럼 동기 (자동 기억 — 다음 검토표 default). */
function _filSetBookKeeping(bizId, type) {
  if (!_filCurrent) return;
  const af = (function() { try { return JSON.parse(_filCurrent.auto_fields || '{}'); } catch { return {}; } })();
  af.book_keeping_types = af.book_keeping_types || {};
  /* Phase 16 (2026-05-13):
   * - 빈 type ('') = ✕ 해제 버튼 → 무조건 삭제
   * - 같은 type 다시 클릭 → 토글 해제
   * - 다른 type → 변경 */
  if (!type || af.book_keeping_types[bizId] === type) {
    delete af.book_keeping_types[bizId];
  } else {
    af.book_keeping_types[bizId] = type;
  }
  _filCurrent.auto_fields = JSON.stringify(af);
  /* Phase 16 (2026-05-13) 사장님 보고: 헤더 SECTION 00 에 사업체 정보 중복 표시되는 버그.
   * 원인: 옛 코드가 'filingOwnerInfo' (헤더 요약) 에 _filRenderOwnerInfoSync 풀 정보 박음.
   * 정답: 'filingOwnerInfoBody' (SECTION 01 본문) 에 박아야. */
  const ownerEl = _filGet('filingOwnerInfoBody');
  if (ownerEl && typeof _filRenderOwnerInfoSync === 'function') {
    ownerEl.innerHTML = _filRenderOwnerInfoSync(_filCurrent);
  }
  /* 자동 저장 트리거 (1.5초 디바운스) */
  if (typeof _filOnFieldChange === 'function') _filOnFieldChange();
}
window._filSetBookKeeping = _filSetBookKeeping;

/* Phase 16 (2026-05-13) 사장님 명령 "공제·감면 자동완성":
 * - public/filing-tax-credit-catalog.json 에 종소세 세액공제/감면 ~100개 항목.
 * - 입력 시 매칭 dropdown 표시 → 클릭 → name 자동 채움 + code 저장 + 금액 focus.
 * - 저장 시 code 도 함께 → 작년 vs 올해 비교 시 글자 다르더라도 같은 줄 (code 정규화). */
let _filDeductionCatalog = null;
async function _filLoadDeductionCatalog() {
  if (_filDeductionCatalog) return _filDeductionCatalog;
  try {
    const r = await fetch('/filing-tax-credit-catalog.json', { credentials: 'same-origin' });
    if (!r.ok) return null;
    _filDeductionCatalog = await r.json();
    return _filDeductionCatalog;
  } catch { return null; }
}
/* 첫 모달 열림 시 1회 fetch (모든 row 가 공유) */
_filLoadDeductionCatalog();

function _filRenderDeductionRow(d, idx, readonly) {
  const ro = readonly ? 'readonly disabled' : '';
  const remBtn = readonly ? '' : '<button onclick="_filRemoveDeductionRow(' + idx + ')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:1.1em;padding:0 4px;font-family:inherit">×</button>';
  const codeAttr = d.code ? ' data-code="' + _filEsc(d.code) + '"' : '';
  /* Phase 16 (2026-05-13) 사장님 명령 "드롭다운 있는거처럼 보이게":
   * - 🔍 좌측 검색 아이콘 + ▼ 우측 화살표 → select 처럼 시각적 단서
   * - 클릭 시 dropdown 자동 표시 (focus 이벤트)
   * - input background 살짝 옅은 회색 → 일반 input 과 구별 */
  return '<div class="fil-deduction-row" data-idx="' + idx + '"' + codeAttr + ' style="display:grid;grid-template-columns:1.5fr 1fr auto;gap:6px;margin-bottom:4px;position:relative">'
    + '<div style="position:relative" onclick="this.querySelector(\'input.fil-ded-name\').focus()">'
    +   '<span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:#6b7280;font-size:.86em;z-index:1">🔍</span>'
    +   '<input type="text" ' + ro + ' value="' + _filEsc(d.name || d.종류 || '') + '" placeholder="클릭해서 검색 (중특, 자녀세액공제, 통합고용...)" oninput="_filDedNameInput(this,' + idx + ')" onfocus="_filDedNameInput(this,' + idx + ')" onblur="setTimeout(function(){_filDedHideDropdown(' + idx + ')},200)" onkeydown="_filDedKeydown(event,this,' + idx + ')" class="filing-text-input fil-ded-name" autocomplete="off" style="padding-left:32px;padding-right:32px;background:#f9fafb;cursor:pointer">'
    +   '<span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:#6b7280;font-size:.72em;z-index:1">▼</span>'
    +   '<div class="fil-ded-dropdown" data-row-idx="' + idx + '" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #3182f6;border-radius:6px;box-shadow:0 6px 20px rgba(49,130,246,.15);max-height:280px;overflow-y:auto;z-index:1000;margin-top:4px"></div>'
    + '</div>'
    + '<input type="text" ' + ro + ' value="' + (d.amount || d.금액 ? _filFormatNum(d.amount || d.금액) : '') + '" placeholder="금액 (원)" oninput="_filFormatOnInput(this);_filDeductionChanged()" class="filing-num-input fil-ded-amount">'
    + remBtn
    + '</div>';
}

/* Phase 16 (2026-05-13): 키보드 단축키 — Esc 닫기 / Enter 첫 매칭 선택 */
function _filDedKeydown(e, inputEl, idx) {
  if (e.key === 'Escape') {
    _filDedHideDropdown(idx);
    return;
  }
  if (e.key === 'Enter') {
    /* 첫 dropdown 항목 클릭 */
    e.preventDefault();
    const dd = document.querySelector('.fil-ded-dropdown[data-row-idx="' + idx + '"]');
    const firstItem = dd ? dd.querySelector('div[onmousedown]') : null;
    if (firstItem) firstItem.dispatchEvent(new MouseEvent('mousedown'));
  }
}
window._filDedKeydown = _filDedKeydown;

/* dropdown 검색 + 표시 */
function _filDedNameInput(inputEl, idx) {
  const q = String(inputEl.value || '').trim().toLowerCase();
  const dd = document.querySelector('.fil-ded-dropdown[data-row-idx="' + idx + '"]');
  if (!dd) return;
  /* 카탈로그 미로드 → 비동기 로드 후 재시도 */
  if (!_filDeductionCatalog) {
    _filLoadDeductionCatalog().then(() => _filDedNameInput(inputEl, idx));
    return;
  }
  const items = _filDeductionCatalog.items || [];
  /* 검색: name + alias + code 부분일치 (대소문자 무관) */
  let matched;
  if (q === '') {
    matched = items.slice(0, 30); /* 빈 검색 시 상위 30개 */
  } else {
    matched = items.filter(it => {
      if (it.name && it.name.toLowerCase().includes(q)) return true;
      if (it.code && it.code.toLowerCase().includes(q)) return true;
      if (Array.isArray(it.alias) && it.alias.some(a => a.toLowerCase().includes(q))) return true;
      return false;
    }).slice(0, 30);
  }
  /* row 갱신: 정확히 한 항목 자동완성과 일치하면 code 저장 */
  const row = document.querySelector('.fil-deduction-row[data-idx="' + idx + '"]');
  if (row) {
    const exact = items.find(it => it.name === inputEl.value);
    if (exact) row.dataset.code = exact.code;
    else delete row.dataset.code;
  }
  /* dropdown 렌더 */
  if (matched.length === 0) {
    dd.innerHTML = '<div style="padding:8px 10px;font-size:.78em;color:#9ca3af">매칭 항목 없음 — 직접 입력 가능</div>';
  } else {
    dd.innerHTML = matched.map(it => {
      const safeName = _filEsc(it.name).replace(/'/g, "\\'");
      const law = it.law ? ' <span style="color:#9ca3af;font-size:.72em">· ' + _filEsc(it.law) + '</span>' : '';
      return '<div onmousedown="_filDedPickItem(' + idx + ',\'' + it.code + '\',\'' + safeName + '\')" style="padding:6px 10px;cursor:pointer;font-size:.82em;border-bottom:1px solid #f3f4f6" onmouseenter="this.style.background=\'#f9fafb\'" onmouseleave="this.style.background=\'\'">'
        + _filEsc(it.name) + law + '</div>';
    }).join('');
  }
  dd.style.display = 'block';
  _filDeductionChanged();
}
function _filDedHideDropdown(idx) {
  const dd = document.querySelector('.fil-ded-dropdown[data-row-idx="' + idx + '"]');
  if (dd) dd.style.display = 'none';
}
function _filDedPickItem(idx, code, name) {
  const row = document.querySelector('.fil-deduction-row[data-idx="' + idx + '"]');
  if (!row) return;
  const nameInput = row.querySelector('.fil-ded-name');
  const amtInput = row.querySelector('.fil-ded-amount');
  if (nameInput) nameInput.value = name;
  if (row) row.dataset.code = code;
  _filDedHideDropdown(idx);
  /* 금액 input 으로 자동 focus */
  if (amtInput && !amtInput.readOnly && !amtInput.disabled) {
    setTimeout(() => { try { amtInput.focus(); amtInput.select(); } catch {} }, 50);
  }
  _filDeductionChanged();
}
function _filRenderPenaltyRow(p, idx, readonly) {
  const ro = readonly ? 'readonly disabled' : '';
  const remBtn = readonly ? '' : '<button onclick="_filRemovePenaltyRow(' + idx + ')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:1.1em;padding:0 4px;font-family:inherit">×</button>';
  return '<div class="fil-penalty-row" data-idx="' + idx + '" style="display:grid;grid-template-columns:1.5fr 1fr auto;gap:6px;margin-bottom:4px">'
    + '<input type="text" ' + ro + ' value="' + _filEsc(p.name || p.종류 || '') + '" placeholder="가산세 종류 (예: 무신고)" oninput="_filPenaltyChanged()" class="filing-text-input fil-pen-name">'
    + '<input type="text" ' + ro + ' value="' + (p.amount || p.금액 ? _filFormatNum(p.amount || p.금액) : '') + '" placeholder="금액" oninput="_filFormatOnInput(this);_filPenaltyChanged()" class="filing-num-input fil-pen-amount">'
    + remBtn
    + '</div>';
}
function _filAddDeductionRow() {
  const box = _filGet('filDeductionRows');
  if (!box) return;
  const idx = document.querySelectorAll('.fil-deduction-row').length;
  box.insertAdjacentHTML('beforeend', _filRenderDeductionRow({ name: '', amount: '' }, idx, false));
  _filDeductionChanged();
}
function _filRemoveDeductionRow(idx) {
  const row = document.querySelector('.fil-deduction-row[data-idx="' + idx + '"]');
  if (row) row.remove();
  _filDeductionChanged();
}
function _filAddPenaltyRow() {
  const box = _filGet('filPenaltyRows');
  if (!box) return;
  const idx = document.querySelectorAll('.fil-penalty-row').length;
  box.insertAdjacentHTML('beforeend', _filRenderPenaltyRow({ name: '', amount: '' }, idx, false));
  _filPenaltyChanged();
}
function _filRemovePenaltyRow(idx) {
  const row = document.querySelector('.fil-penalty-row[data-idx="' + idx + '"]');
  if (row) row.remove();
  _filPenaltyChanged();
}
function _filDeductionChanged() { _filOnFieldChange(); }
function _filPenaltyChanged() { _filOnFieldChange(); }

function _filFormatOnInput(el) {
  const cursor = el.selectionStart;
  const before = el.value;
  const num = _filParseNum(before);
  el.value = num !== null ? _filFormatNum(num) : '';
  /* cursor 복원 (간단 — 끝으로) */
  try { el.setSelectionRange(el.value.length, el.value.length); } catch {}
}

function _filOnFieldChange() {
  /* 자동 저장 — 1.5초 후 */
  if (_filSaveTimer) clearTimeout(_filSaveTimer);
  const st = _filGet('filSaveStatus');
  if (st) { st.textContent = '입력 중...'; st.style.color = '#f59e0b'; }
  _filSaveTimer = setTimeout(_filSaveNow, 1500);
  /* 공제·감면 / 가산세 합계 자동 갱신 */
  const sumDed = (function() {
    let s = 0;
    document.querySelectorAll('.fil-deduction-row').forEach(row => {
      const v = _filParseNum(row.querySelector('.fil-ded-amount')?.value || '');
      if (v) s += v;
    });
    return s;
  })();
  const sumPen = (function() {
    let s = 0;
    document.querySelectorAll('.fil-penalty-row').forEach(row => {
      const v = _filParseNum(row.querySelector('.fil-pen-amount')?.value || '');
      if (v) s += v;
    });
    return s;
  })();
  const dedSumEl = _filGet('fil_sum_deductions');
  if (dedSumEl) dedSumEl.value = _filFormatNum(sumDed);
  const penSumEl = _filGet('fil_sum_penalties');
  if (penSumEl) penSumEl.value = _filFormatNum(sumPen);
}

async function _filSaveNow() {
  if (!_filCurrent) return;
  if (_filSaveTimer) { clearTimeout(_filSaveTimer); _filSaveTimer = null; }
  const af = (function () { try { return JSON.parse(_filCurrent.auto_fields || '{}'); } catch { return {}; } })();
  /* 모든 data-fil-field 모음 (숫자 필드) */
  document.querySelectorAll('[data-fil-field]').forEach(el => {
    const k = el.dataset.filField;
    if (k === 'reviewer_comment') return; /* reviewer_comment 는 별도 컬럼 */
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      af[k] = el.value === '' ? null : _filParseNum(el.value);
    }
  });
  /* text field (employee_note, issue_note) */
  document.querySelectorAll('[data-fil-text-field]').forEach(el => {
    const k = el.dataset.filTextField;
    af[k] = el.value || null;
  });
  /* Phase 16 (2026-05-17): 부가세 vat 데이터 수집 (data-fil-vat="key.fld" + data-fil-vat-memo) */
  if (_filCurrent && _filCurrent.type === '부가세') {
    const v = af.vat || {};
    document.querySelectorAll('[data-fil-vat]').forEach(el => {
      const parts = String(el.dataset.filVat || '').split('.');
      if (parts.length !== 2) return;
      const key = parts[0], fld = parts[1];
      if (!v[key]) v[key] = {};
      const n = _filParseNum(el.value);
      v[key][fld] = (n == null) ? null : n;
    });
    v.memo = v.memo || {};
    document.querySelectorAll('[data-fil-vat-memo]').forEach(el => {
      v.memo[el.dataset.filVatMemo] = el.value || '';
    });
    af.vat = v;
  }
  /* 공제감면 — Phase 16 (2026-05-13): code 도 함께 저장 (작년 vs 올해 비교 정규화) */
  af.공제감면 = [];
  document.querySelectorAll('.fil-deduction-row').forEach(row => {
    const name = row.querySelector('.fil-ded-name')?.value.trim() || '';
    const amt = _filParseNum(row.querySelector('.fil-ded-amount')?.value || '');
    const code = row.dataset.code || null;
    if (name || amt !== null) af.공제감면.push({ name, amount: amt, code });
  });
  /* 가산세 */
  af.가산세 = [];
  document.querySelectorAll('.fil-penalty-row').forEach(row => {
    const name = row.querySelector('.fil-pen-name')?.value.trim() || '';
    const amt = _filParseNum(row.querySelector('.fil-pen-amount')?.value || '');
    if (name || amt !== null) af.가산세.push({ name, amount: amt });
  });
  /* Phase 16 (2026-05-13): SECTION 07 textarea 제거됨. reviewer_comment 옛 값 보존 위해
   * PATCH body 에서 제외 — DB 컬럼 그대로, 옛 데이터 살아있음 (작년 리뷰 SECTION 04 참조 표시). */
  const st = _filGet('filSaveStatus');
  if (st) { st.textContent = '저장 중...'; st.style.color = '#f59e0b'; }
  try {
    const r = await fetch('/api/admin-filings?key=' + encodeURIComponent(_filGetKey()) + '&id=' + _filCurrent.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_fields: af }),
    });
    const d = await r.json();
    if (d.ok) {
      _filCurrent.auto_fields = JSON.stringify(af);
      if (st) { st.textContent = '✓ 자동 저장됨'; st.style.color = '#10b981'; }
    } else {
      if (st) { st.textContent = '저장 실패: ' + (d.error || ''); st.style.color = '#dc2626'; }
    }
  } catch (err) {
    if (st) { st.textContent = '오류: ' + err.message; st.style.color = '#dc2626'; }
  }
}

async function filingSetStatus(status) {
  if (!_filCurrent) return;
  if (status === '보관완료') {
    if (!confirm('결재 완료(보관) 처리할까요?\n\n• 종이 결재 도장 다 받은 후 클릭\n• 이후 read-only (owner 만 수정 가능)'))return;
  }
  /* 저장 먼저 */
  await _filSaveNow();
  try {
    const r = await fetch('/api/admin-filings?action=set_status&id=' + _filCurrent.id + '&key=' + encodeURIComponent(_filGetKey()), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const d = await r.json();
    if (!d.ok) { alert('상태 변경 실패: ' + (d.error || 'unknown')); return; }
    /* 다시 로드 */
    openFilingDetail(_filCurrent.id);
    /* dashboard list 도 새로고침 */
    if (typeof _filReloadList === 'function' && _filCurrent) _filReloadList(_filCurrent.owner_type, _filCurrent.owner_id);
  } catch (err) { alert('오류: ' + err.message); }
}

function filingPrint() {
  /* 저장 먼저 */
  _filSaveNow().then(() => {
    /* 비교표·요약 갱신 위해 _filRender 다시 호출 (인쇄 직전 마지막 액션이라 폼 reset OK) */
    if (typeof _filRender === 'function' && _filCurrent) {
      try { _filRender(); } catch(_){}
    }
    /* fix (사장님 보고 2026-05-07): filingDetailModal 부모 chain 에 mainAppView (display:none).
     * 인쇄 시 body 직속으로 임시 이동 → window.print() → 원위치. */
    const m = document.getElementById('filingDetailModal');
    if (!m) { window.print(); return; }
    const origParent = m.parentElement;
    const origNext = m.nextSibling;
    /* 임시 placeholder + body 첫 자식으로 이동 */
    const placeholder = document.createComment('filingDetailModal_placeholder');
    if (origParent) origParent.insertBefore(placeholder, m);
    document.body.appendChild(m);
    /* 인쇄 후 원위치 (afterprint 이벤트 + fallback timer) */
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      try {
        if (placeholder.parentElement) placeholder.parentElement.replaceChild(m, placeholder);
        else if (origParent) origParent.appendChild(m);
      } catch (e) { console.warn('filing print restore fail:', e); }
    };
    window.addEventListener('afterprint', restore, { once: true });
    setTimeout(() => { window.print(); }, 300);
    setTimeout(restore, 5000); /* fallback */
  });
}

/* dashboard 통합용 — Person/Business 페이지에서 호출.
 * 1. _filReloadList(ownerType, ownerId) — list refresh
 * 2. _filRenderListInto(containerEl, ownerType, ownerId, ownerName) — 그 영역 렌더 */
/* Phase 3.14 (2026-05-09): _buildFilingReviewListHtml — store 에서 읽어 HTML 빌드.
 * React FilingReviewList 가 store 변경 시 호출 → reactive update. */
function _buildFilingReviewListHtml() {
  if (!window.__filingReviewStore) return '';
  const s = window.__filingReviewStore.get();
  if (!s.ownerType || !s.ownerId) return '';
  const ownerType = s.ownerType;
  const ownerId = s.ownerId;
  const ownerName = s.ownerName || '';
  const list = s.filings || [];
  let html = '';
  /* 신규 버튼 — Phase 16 (2026-05-17): Business 는 법인세 + 부가세 둘 다, Person 은 종소세 */
  const _nm = _filEsc(ownerName).replace(/\'/g, '');
  if (ownerType === 'Person') {
    html += '<button onclick="openFilingNew(\'Person\',' + ownerId + ',\'' + _nm + '\')" style="background:#3182f6;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:.82em;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:10px">+ 새 종소세 Case</button>';
  } else {
    html += '<button onclick="openFilingNew(\'Business\',' + ownerId + ',\'' + _nm + '\',\'법인세\')" style="background:#3182f6;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:.82em;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:10px;margin-right:6px">+ 새 법인세 Case</button>';
    html += '<button onclick="openFilingNew(\'Business\',' + ownerId + ',\'' + _nm + '\',\'부가세\')" style="background:#1a3a5c;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:.82em;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:10px">+ 새 부가세 Case</button>';
  }
  if (!list.length) {
    html += '<div style="color:#9ca3af;padding:8px 0;font-size:.85em">신고 Case 가 없습니다.</div>';
  } else {
    html += list.map(f => {
      const af = (function () { try { return JSON.parse(f.auto_fields || '{}'); } catch { return {}; } })();
      const stColor = { '작성중': '#9ca3af', '결재대기': 'var(--of-primary)', '보관완료': 'var(--of-success)' }[f.review_status] || '#9ca3af';
      const rev = af.revenue || 0;
      const dec = af.decisive_tax || 0;
      const eff = rev ? _filEffRate(dec, rev) : '—';
      return '<div onclick="openFilingDetail(' + f.id + ')" style="padding:10px 12px;background:#fff;border:1px solid #e5e8eb;border-radius:8px;margin-bottom:6px;cursor:pointer;display:flex;align-items:center;justify-content:space-between" onmouseenter="this.style.background=\'#f0f9ff\'" onmouseleave="this.style.background=\'#fff\'">'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:.86em;font-weight:600">[' + f.fiscal_year + '귀속] <span style="background:' + stColor + ';color:#fff;font-size:.74em;padding:2px 8px;border-radius:99px;font-weight:700;margin-left:4px">' + _filEsc(f.review_status) + '</span></div>'
        + '<div style="font-size:.74em;color:#6b7280;margin-top:3px">' + _filEsc(f.type) + ' · 수입 ' + (rev ? _filFormatNum(rev) + '원' : '—') + ' · 결정세액 ' + (dec ? _filFormatNum(dec) + '원' : '—') + ' · 실효세율 ' + eff + '</div>'
        + '</div>'
        + '<span style="color:#3182f6;font-size:1.2em">›</span>'
        + '</div>';
    }).join('');
  }
  return html;
}
try { window.__buildFilingReviewListHtml = _buildFilingReviewListHtml; } catch(_){}

/* ═══════════════════════════════════════════════════════════════════════════
 * Phase 16 (2026-05-17) 사장님 명령: "신고검토표 부가세랑 법인세랑 두개 분리".
 * _filRenderTypeInto — type 별 별도 박스 렌더 (store 무관 — business.html 법인사업자가
 * 법인세 박스 / 부가세 박스 2개 분리 표시용). 기존 _filRenderListInto/store 회귀 0.
 * @param {string} elId      컨테이너 element id
 * @param {string} ownerType 'Business' | 'Person'
 * @param {number} ownerId
 * @param {string} ownerName
 * @param {string} filingType '법인세' | '부가세' | '종소세'
 * ═══════════════════════════════════════════════════════════════════════════ */
async function _filRenderTypeInto(elId, ownerType, ownerId, ownerName, filingType) {
  const box = document.getElementById(elId);
  if (!box) return;
  box.innerHTML = '<div style="color:#9ca3af;padding:8px 0;font-size:.85em">불러오는 중...</div>';
  const _nm = _filEsc(ownerName || '').replace(/\'/g, '');
  const btnColor = filingType === '부가세' ? '#1a3a5c' : '#3182f6';
  let html = '<button onclick="openFilingNew(\'' + ownerType + '\',' + ownerId + ',\'' + _nm + '\',\'' + filingType + '\')" style="background:' + btnColor + ';color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:.82em;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:10px">+ 새 ' + filingType + ' Case</button>';
  try {
    const r = await fetch('/api/admin-filings?key=' + encodeURIComponent(_filGetKey()) + '&owner_type=' + ownerType + '&owner_id=' + ownerId);
    const d = await r.json();
    const list = (d.filings || []).filter(f => f.type === filingType);
    if (!list.length) {
      html += '<div style="color:#9ca3af;padding:8px 0;font-size:.85em">' + filingType + ' Case 가 없습니다.</div>';
    } else {
      html += list.map(f => {
        const af = (function () { try { return JSON.parse(f.auto_fields || '{}'); } catch { return {}; } })();
        const stColor = { '작성중': '#9ca3af', '결재대기': 'var(--of-primary)', '보관완료': 'var(--of-success)' }[f.review_status] || '#9ca3af';
        const rev = af.revenue || 0;
        const dec = af.decisive_tax || 0;
        return '<div onclick="openFilingDetail(' + f.id + ')" style="padding:10px 12px;background:#fff;border:1px solid #e5e8eb;border-radius:8px;margin-bottom:6px;cursor:pointer;display:flex;align-items:center;justify-content:space-between" onmouseenter="this.style.background=\'#f0f9ff\'" onmouseleave="this.style.background=\'#fff\'">'
          + '<div style="flex:1;min-width:0"><div style="font-size:.86em;font-weight:600">[' + f.fiscal_year + '귀속] <span style="background:' + stColor + ';color:#fff;font-size:.74em;padding:2px 8px;border-radius:99px;font-weight:700;margin-left:4px">' + _filEsc(f.review_status) + '</span></div>'
          + '<div style="font-size:.74em;color:#6b7280;margin-top:3px">' + _filEsc(f.type) + (rev ? ' · 수입 ' + _filFormatNum(rev) + '원' : '') + (dec ? ' · 결정세액 ' + _filFormatNum(dec) + '원' : '') + '</div></div>'
          + '<span style="color:#3182f6;font-size:1.2em">›</span></div>';
      }).join('');
    }
    box.innerHTML = html;
  } catch (err) {
    box.innerHTML = '<div style="color:#f04452;padding:8px;font-size:.82em">오류: ' + _filEsc(err.message) + '</div>';
  }
}
try { window._filRenderTypeInto = _filRenderTypeInto; } catch(_){}

async function _filRenderListInto(containerEl, ownerType, ownerId, ownerName) {
  if (!containerEl) return;
  /* Phase 3.14 (2026-05-09): store loading 시작 */
  try { if (window.__filingReviewStore) window.__filingReviewStore.setLoading(ownerType, ownerId, ownerName); } catch(_){}
  if (!window.__filingReviewStore) {
    containerEl.innerHTML = '<div style="color:#9ca3af;padding:10px 0;font-size:.85em">불러오는 중...</div>';
  }
  try {
    const r = await fetch('/api/admin-filings?key=' + encodeURIComponent(_filGetKey()) + '&owner_type=' + ownerType + '&owner_id=' + ownerId);
    const d = await r.json();
    const list = d.filings || [];
    /* Phase 3.14: store 갱신 — React FilingReviewList 자동 reactive */
    try { if (window.__filingReviewStore) window.__filingReviewStore.setList(ownerType, ownerId, list, ownerName); } catch(_){}
    /* React 미작동 시 fallback */
    if (!window.__filingReviewStore) {
      containerEl.innerHTML = _buildFilingReviewListHtml() || '<div style="color:#9ca3af">데이터 없음</div>';
    }
  } catch (err) {
    try { if (window.__filingReviewStore) window.__filingReviewStore.setError(err.message || 'unknown'); } catch(_){}
    if (!window.__filingReviewStore) {
      containerEl.innerHTML = '<div style="color:#f04452;padding:8px;font-size:.82em">오류: ' + _filEsc(err.message) + '</div>';
    }
  }
}

/* Phase 7 (2026-05-07): ChatRoom 통합 — 그 방의 거래처/업체 신고 Case 읽기 전용 list */
async function openRoomFilings(roomId) {
  if (!roomId) { alert('상담방을 먼저 열어주세요'); return; }
  const m = _filGet('roomFilingsModal');
  if (!m) return;
  m.style.display = 'flex';
  m.style.alignItems = 'center';
  m.style.justifyContent = 'center';
  document.body.style.overflow = 'hidden';

  const body = _filGet('roomFilingsBody');
  const subtitle = _filGet('roomFilingsSubtitle');
  body.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:30px 0">불러오는 중...</div>';
  if (subtitle) subtitle.textContent = '';

  try {
    const r = await fetch('/api/admin-filings?key=' + encodeURIComponent(_filGetKey()) + '&room_id=' + encodeURIComponent(roomId));
    const d = await r.json();
    if (!d.ok) { body.innerHTML = '<div style="color:#f04452;padding:14px">오류: ' + _filEsc(d.error || 'unknown') + '</div>'; return; }
    const list = d.filings || [];
    const userIds = d.userIds || [];
    const bizIds = d.bizIds || [];

    if (subtitle) subtitle.textContent = '👤 ' + userIds.length + '명 · 🏢 ' + bizIds.length + '개 업체';

    if (!list.length) {
      body.innerHTML = '<div style="color:#9ca3af;padding:24px 0;text-align:center;font-size:.9em">'
        + '연결된 신고 Case 가 없습니다.<br>'
        + '<span style="font-size:.8em">거래처/업체 dashboard 에서 새 Case 를 만들 수 있습니다.</span>'
        + '</div>';
      return;
    }

    /* 그룹화: type 별 (종소세 / 법인세) */
    const byType = { '종소세': [], '법인세': [] };
    list.forEach(f => {
      if (!byType[f.type]) byType[f.type] = [];
      byType[f.type].push(f);
    });

    let html = '';
    Object.keys(byType).forEach(type => {
      if (!byType[type].length) return;
      html += '<div style="margin-bottom:14px">';
      html += '<div style="font-weight:700;font-size:.85em;color:#191f28;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #e5e8eb">'
        + (type === '종소세' ? '👤 ' : '🏢 ') + _filEsc(type)
        + ' <span style="color:#8b95a1;font-weight:400;font-size:.92em">' + byType[type].length + '건</span></div>';
      byType[type].forEach(f => {
        const af = (function () { try { return JSON.parse(f.auto_fields || '{}'); } catch { return {}; } })();
        const stColor = { '작성중': '#9ca3af', '결재대기': 'var(--of-primary)', '보관완료': 'var(--of-success)' }[f.review_status] || '#9ca3af';
        const dec = af.decisive_tax || 0;
        html += '<div onclick="closeRoomFilings();openFilingDetail(' + f.id + ')" '
          + 'style="padding:9px 12px;background:#fff;border:1px solid #e5e8eb;border-radius:8px;margin-bottom:5px;cursor:pointer;display:flex;align-items:center;justify-content:space-between" '
          + 'onmouseenter="this.style.background=\'#f0f9ff\'" onmouseleave="this.style.background=\'#fff\'">'
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-size:.86em;font-weight:600">[' + f.fiscal_year + '귀속] '
          + '<span style="background:' + stColor + ';color:#fff;font-size:.74em;padding:2px 8px;border-radius:99px;font-weight:700;margin-left:4px">' + _filEsc(f.review_status) + '</span></div>'
          + '<div style="font-size:.74em;color:#6b7280;margin-top:3px">결정세액 ' + (dec ? _filFormatNum(dec) + '원' : '—') + '</div>'
          + '</div>'
          + '<span style="color:#3182f6;font-size:1.2em">›</span>'
          + '</div>';
      });
      html += '</div>';
    });
    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = '<div style="color:#f04452;padding:14px">오류: ' + _filEsc(err.message) + '</div>';
  }
}
function closeRoomFilings() {
  const m = _filGet('roomFilingsModal');
  if (m) m.style.display = 'none';
  document.body.style.overflow = '';
}

var _filLastListContext = null;
function _filReloadList(ownerType, ownerId) {
  /* 마지막 컨텍스트 저장 → 모달 닫고 dashboard 갱신 시 재호출 */
  if (ownerType && ownerId) {
    _filLastListContext = { ownerType, ownerId };
  }
  if (!_filLastListContext) return;
  /* 알려진 container id: cdFilingsReview (Person) / bdFilingsReview (Business) */
  const containers = [
    { id: 'cdFilingsReview', type: 'Person' },
    { id: 'bdFilingsReview', type: 'Business' },
  ];
  containers.forEach(c => {
    const el = _filGet(c.id);
    if (el && c.type === _filLastListContext.ownerType) {
      const nameEl = c.type === 'Person' ? _filGet('cdName') : _filGet('bdName');
      const name = nameEl ? nameEl.textContent : '';
      _filRenderListInto(el, _filLastListContext.ownerType, _filLastListContext.ownerId, name);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Phase 16 (2026-05-17) 사장님 명령: 부가세 신고검토표 (mockup 1번 확정).
 * 전기전체 박스 + 1기/2기 블록 + 연합계 + 멘트4분할. 새로 톤 + A4 세로 1장.
 * 데이터: af.vat = { prev:{s,p,fa,t}, q1p,q1f,q2p,q2f, memo:{q1p,q1f,q2p,q2f} }
 *   s=매출과표 p=매입과표 fa=고정자산 t=납부세액. 부가율=(s-p)/s*100 자동.
 * ═══════════════════════════════════════════════════════════════════════════ */
/* Phase 16 (2026-05-17) 전수검토 #1·#9: 결재 버튼 공통 (종소세/법인세/부가세 공유 — DRY). */
function _filApprovalButtonsHtml(f) {
  let html = '<div class="keep-together no-print" style="display:flex;gap:8px;justify-content:flex-end;padding:14px 0;border-top:1px solid #e5e8eb;margin-top:8px">';
  if (f.review_status === '작성중') {
    html += '<button onclick="filingSetStatus(\'결재대기\')" style="background:var(--of-primary);color:#fff;border:none;padding:9px 18px;border-radius:12px;font-size:.85em;font-weight:800;cursor:pointer;font-family:inherit">📋 결재 요청 (→ 결재대기)</button>';
  } else if (f.review_status === '결재대기') {
    html += '<button onclick="filingSetStatus(\'작성중\')" style="background:#fff;color:#6b7280;border:1px solid #d1d5db;padding:9px 14px;border-radius:8px;font-size:.85em;cursor:pointer;font-family:inherit">← 작성중 으로</button>';
    if (typeof IS_OWNER !== 'undefined' && IS_OWNER) {
      html += '<button onclick="filingSetStatus(\'보관완료\')" style="background:#10b981;color:#fff;border:none;padding:9px 18px;border-radius:8px;font-size:.85em;font-weight:700;cursor:pointer;font-family:inherit">✅ 결재 완료 (보관)</button>';
    } else {
      html += '<span style="font-size:.78em;color:#8b95a1;align-self:center">결재 완료는 owner 만 가능</span>';
    }
  } else if (f.review_status === '보관완료') {
    html += '<span style="font-size:.78em;color:#10b981;align-self:center;font-weight:600">✅ 결재 완료 (보관) — read-only</span>';
    if (typeof IS_OWNER !== 'undefined' && IS_OWNER) {
      html += '<button onclick="filingSetStatus(\'결재대기\')" style="background:#fff;color:#dc2626;border:1px dashed #dc2626;padding:9px 14px;border-radius:8px;font-size:.85em;cursor:pointer;font-family:inherit">↩️ 결재 취소 (Owner)</button>';
    }
  }
  html += '</div>';
  return html;
}

function _filRenderVatBody(f, prev, af, pf, readonly) {
  const ro = readonly ? 'readonly disabled' : '';
  const vat = af.vat || {};
  const cell = (k) => (vat[k] || {});
  /* #6 fix (2026-05-17): 전기 전체 = 자동참조 default + 수기 override 보존.
   * 이전 버그: prev 레코드 존재 시 항상 pf 에서 재계산 → 저장된 수기보정(af.vat.prev) 덮어씀.
   *            + 전기칸 readonly span 이라 작년 빈껍데기여도 보정 불가.
   * 해결: 저장된 override(af.vat.prev) 있으면 그대로, 없을 때만 작년 신고서에서 자동 합산. */
  let prevTot = vat.prev || {};
  const _hasPrevOverride = prevTot && (prevTot.s != null || prevTot.p != null || prevTot.fa != null || prevTot.t != null);
  if (!_hasPrevOverride && prev && pf && pf.vat) {
    const pv = pf.vat;
    const sum4 = (fld) => ['q1p','q1f','q2p','q2f'].reduce((a,q)=>a+(Number((pv[q]||{})[fld])||0),0);
    prevTot = { s: sum4('s'), p: sum4('p'), fa: sum4('fa'), t: sum4('t') };
  }
  const N = (v) => (v==null||v===''||isNaN(Number(v))) ? null : Number(v);
  const FM = (v) => (v==null) ? '—' : _filFormatNum(v);
  const rate = (s,p) => { const sn=N(s); const pn=N(p); if(!sn) return '—'; return ((sn-(pn||0))/sn*100).toFixed(2)+'%'; };
  const inp = (key,fld,val) => '<input type="text" '+ro+' data-fil-vat="'+key+'.'+fld+'" value="'+(val!=null&&val!==''?_filFormatNum(val):'')+'" oninput="_filFmtVat(this);_filVatRecalc()" class="vat-inp" style="width:100%;padding:3px 6px;border:1px solid #d8dde5;border-radius:4px;font-size:.86em;text-align:right;font-family:inherit;box-sizing:border-box">';
  const block = (label, pKey, fKey, subId) => {
    const p = cell(pKey), q = cell(fKey);
    let h = '<div style="background:#1a3a5c;color:#fff;font-weight:700;font-size:.82em;padding:5px 10px;margin-top:8px;border-radius:5px 5px 0 0">▌'+label+'</div>';
    h += '<table style="width:100%;border-collapse:collapse;font-size:.84em;border:1px solid #d8dde5">';
    h += '<thead><tr style="background:#4a5568;color:#fff"><th style="padding:5px 8px;text-align:left;width:22%">구 분</th><th style="padding:5px 8px;text-align:right;width:26%">'+label+' 예정</th><th style="padding:5px 8px;text-align:right;width:26%">'+label+' 확정</th><th style="padding:5px 8px;text-align:right;width:26%">'+label+' 소계</th></tr></thead><tbody>';
    [['s','매출과표'],['p','매입과표'],['fa','고정자산'],['t','납부세액']].forEach((row,i)=>{
      const fld=row[0], nm=row[1], bg=i%2?'#f7f9fb':'#fff';
      h += '<tr style="background:'+bg+'"><td style="padding:3px 8px;font-weight:600">'+nm+'</td>'
        + '<td style="padding:3px 6px">'+inp(pKey,fld,p[fld])+'</td>'
        + '<td style="padding:3px 6px">'+inp(fKey,fld,q[fld])+'</td>'
        + '<td style="padding:3px 8px;text-align:right;font-weight:700" data-vat-sub="'+subId+'.'+fld+'">'+FM((N(p[fld])||0)+(N(q[fld])||0))+'</td></tr>';
    });
    h += '<tr style="background:#eef3f8"><td style="padding:3px 8px;font-weight:700;color:#1a3a5c">부가율</td>'
      + '<td style="padding:3px 8px;text-align:right;font-weight:700;color:#1a3a5c" data-vat-rate="'+pKey+'">'+rate(p.s,p.p)+'</td>'
      + '<td style="padding:3px 8px;text-align:right;font-weight:700;color:#1a3a5c" data-vat-rate="'+fKey+'">'+rate(q.s,q.p)+'</td>'
      + '<td style="padding:3px 8px;text-align:right;font-weight:700;color:#1a3a5c" data-vat-rate-sub="'+subId+'">'+rate((N(p.s)||0)+(N(q.s)||0),(N(p.p)||0)+(N(q.p)||0))+'</td></tr>';
    h += '</tbody></table>';
    return h;
  };
  const memo = vat.memo || {};
  const memoBox = (key,label) => '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:.78em;color:#1a3a5c;margin-bottom:3px">'+label+'</div>'
    + '<textarea '+ro+' data-fil-vat-memo="'+key+'" oninput="_filOnFieldChange()" placeholder="· '+label+' 검토 멘트" style="width:100%;min-height:46px;padding:5px 8px;border:1px solid #d8dde5;border-radius:4px;font-size:.82em;font-family:inherit;box-sizing:border-box;resize:vertical;background:#fffdf0;line-height:1.5">'+_filEsc(memo[key]||'')+'</textarea></div>';

  let html = '<style>@media print{@page{size:A4 portrait;margin:8mm 10mm}'
    + '.vat-inp{border:none!important;background:transparent!important;padding:1px 4px!important}'
    + '.vat-sheet table{font-size:8.6pt!important}.vat-sheet td,.vat-sheet th{padding:2px 6px!important}'
    + '.vat-sheet textarea{min-height:38px!important;font-size:8.4pt!important}}</style>';
  html += '<div class="vat-sheet">';
  /* Phase 16 (2026-05-17) 사장님 보고: "무슨업체인지 대표자가 누군지 업종뭔지 빠진거같다".
   * 부가세 = 사업장 단위 — f._businesses[0] 정보로 사업자 정보 줄 추가 (전기 전체 박스 위). */
  (function(){
    var b = (f._businesses && f._businesses[0]) || {};
    var form = b.company_form || '';
    var formShort = /법인/.test(form) ? '법인' : (/개인/.test(form) ? '개인' : (/간이/.test(form) ? '간이' : ''));
    var bn = b.business_number || '';
    var bnFmt = (bn && bn.length === 10) ? (bn.slice(0,3)+'-'+bn.slice(3,5)+'-'+bn.slice(5)) : bn;
    var parts = [];
    if (formShort) parts.push('<span style="color:#6b7280">('+formShort+')</span>');
    if (bnFmt) parts.push('사업자 '+_filEsc(bnFmt));
    if (b.ceo_name) parts.push('대표 '+_filEsc(b.ceo_name));
    if (b.industry) parts.push('업종 '+_filEsc(b.industry));
    else if (b.business_category) parts.push('업태 '+_filEsc(b.business_category));
    if (b.tax_type) parts.push(_filEsc(b.tax_type));
    html += '<div style="background:#f7f9fb;border:1px solid #d8dde5;border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:.88em;color:#374151">'
      + '🏢 <b style="font-size:1.05em">' + _filEsc(b.company_name || ('#'+f.owner_id)) + '</b>'
      + (parts.length ? ' · ' + parts.join(' · ') : '')
      + (b.address ? '<div style="margin-top:3px;color:#6b7280;font-size:.92em">' + _filEsc(b.address) + '</div>' : '')
      + '</div>';
  })();
  html += '<div style="margin:6px 0 10px;border:1.5px solid #1a3a5c;border-radius:6px;overflow:hidden">'
    + '<div style="background:#1a3a5c;color:#fff;font-weight:700;font-size:.84em;padding:5px 10px">▌전기 전체 ('+((f.fiscal_year||0)-1)+')'
    + (prev && !_hasPrevOverride ? '<span style="font-weight:500;font-size:.85em;opacity:.85"> · 작년 신고서 자동참조 (수정 가능)</span>' : (_hasPrevOverride ? '<span style="font-weight:500;font-size:.85em;opacity:.85"> · 수기 보정됨</span>' : ''))
    + '</div>'
    + '<table style="width:100%;border-collapse:collapse;font-size:.86em"><thead><tr style="background:#4a5568;color:#fff">'
    + '<th style="padding:5px 8px;text-align:right;width:25%">매출과표</th><th style="padding:5px 8px;text-align:right;width:25%">매입과표</th><th style="padding:5px 8px;text-align:right;width:25%">부가율</th><th style="padding:5px 8px;text-align:right;width:25%">고정자산</th></tr></thead><tbody><tr>'
    + '<td style="padding:5px 8px">'+inp('prev','s',prevTot.s)+'</td>'
    + '<td style="padding:5px 8px">'+inp('prev','p',prevTot.p)+'</td>'
    + '<td style="padding:5px 8px;text-align:right;font-weight:700;color:#1a3a5c" data-vat-rate="prev">'+rate(prevTot.s,prevTot.p)+'</td>'
    + '<td style="padding:5px 8px">'+inp('prev','fa',prevTot.fa)+'</td>'
    + '</tr></tbody></table></div>';
  html += block('1 기','q1p','q1f','sub1');
  html += block('2 기','q2p','q2f','sub2');
  html += '<div style="background:#1a3a5c;color:#fff;font-weight:700;font-size:.86em;padding:7px 12px;margin-top:8px;border-radius:5px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">'
    + '<span>▌'+(f.fiscal_year||'')+'년 연 합계</span>'
    + '<span data-vat-year="sum">매출 — · 매입 — · 부가율 —</span></div>';
  html += '<div style="background:#1a3a5c;color:#fff;font-weight:700;font-size:.8em;padding:5px 10px;margin-top:10px;border-radius:5px 5px 0 0">📝 검토 멘트</div>';
  html += '<div style="border:1px solid #d8dde5;border-top:none;padding:8px;border-radius:0 0 5px 5px">';
  html += '<div style="display:flex;gap:8px;margin-bottom:8px">'+memoBox('q1p','1기 예정')+memoBox('q1f','1기 확정')+'</div>';
  html += '<div style="display:flex;gap:8px">'+memoBox('q2p','2기 예정')+memoBox('q2f','2기 확정')+'</div>';
  html += '</div></div>';
  /* Phase 16 (2026-05-17) 전수검토 #1 fix: 부가세 검토표 결재 버튼 (종소세/법인세와 동일).
   * 이전엔 부가세에 결재 버튼 없어 영구 '작성중' — 결재대기/보관완료 전환 불가했음. */
  html += _filApprovalButtonsHtml(f);
  /* #5 fix: 초기 표시 전용 recalc — _filOnFieldChange(자동저장 타이머) 트리거 방지 위해
   * 별도 플래그. 사용자 입력 시에만 저장. */
  setTimeout(function(){ try{ _filVatRecalc(true); }catch(_){} }, 30);
  return html;
}

function _filFmtVat(el) {
  const n = _filParseNum(el.value);
  el.value = (n!=null) ? _filFormatNum(n) : '';
}

function _filVatRecalc(initial) {
  const get = (key,fld) => {
    const el = document.querySelector('[data-fil-vat="'+key+'.'+fld+'"]');
    return el ? (_filParseNum(el.value)||0) : 0;
  };
  const rate = (s,p) => { if(!s) return '—'; return ((s-p)/s*100).toFixed(2)+'%'; };
  const fmt = (v) => v ? _filFormatNum(v) : '—';
  ['q1p','q1f','q2p','q2f','prev'].forEach(k=>{
    const rEl = document.querySelector('[data-vat-rate="'+k+'"]');
    if(rEl) rEl.textContent = rate(get(k,'s'),get(k,'p'));
  });
  [['sub1','q1p','q1f'],['sub2','q2p','q2f']].forEach(arr=>{
    const sub=arr[0], a=arr[1], b=arr[2];
    ['s','p','fa','t'].forEach(fld=>{
      const c = document.querySelector('[data-vat-sub="'+sub+'.'+fld+'"]');
      if(c) c.textContent = fmt(get(a,fld)+get(b,fld));
    });
    const sr = document.querySelector('[data-vat-rate-sub="'+sub+'"]');
    if(sr) sr.textContent = rate(get(a,'s')+get(b,'s'), get(a,'p')+get(b,'p'));
  });
  const yS=get('q1p','s')+get('q1f','s')+get('q2p','s')+get('q2f','s');
  const yP=get('q1p','p')+get('q1f','p')+get('q2p','p')+get('q2f','p');
  const yel = document.querySelector('[data-vat-year="sum"]');
  if(yel) yel.textContent = '매출 '+fmt(yS)+' · 매입 '+fmt(yP)+' · 부가율 '+rate(yS,yP);
  /* #5 fix: 초기 표시 recalc (initial=true) 는 자동저장 타이머 트리거 X — 사용자 입력 시에만 */
  if(!initial && typeof _filOnFieldChange==='function') _filOnFieldChange();
}
window._filRenderVatBody = _filRenderVatBody;
window._filFmtVat = _filFmtVat;
window._filVatRecalc = _filVatRecalc;
