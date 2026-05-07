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
 * - KEY (admin.js global)
 * - $g / e / escAttr (admin.js)
 * - admin-customer-dash.js / admin-business-tab.js 가 호출
 */

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
function _filDiff(prev, curr) {
  if (prev === null || prev === undefined || curr === null || curr === undefined) return '';
  const p = Number(prev), c = Number(curr);
  if (!p || isNaN(p)) return '';
  const pct = ((c - p) / p) * 100;
  const sign = pct >= 0 ? '+' : '';
  return sign + pct.toFixed(1) + '%';
}
function _filEffRate(decisive, revenue) {
  if (!revenue || revenue === 0) return '0.00%';
  return ((Number(decisive || 0) / Number(revenue)) * 100).toFixed(2) + '%';
}
function _filTrimLines(s, n) {
  if (!s) return '';
  const lines = String(s).split('\n');
  if (lines.length <= n) return s;
  return lines.slice(0, n).join('\n') + '\n... (별첨 P.2 참조)';
}

/* ==================== 새 Case 모달 ==================== */
var _filNewOwnerType = null;
var _filNewOwnerId = null;
var _filNewOwnerName = '';

async function openFilingNew(ownerType, ownerId, ownerName) {
  _filNewOwnerType = ownerType;
  _filNewOwnerId = ownerId;
  _filNewOwnerName = ownerName || '';
  const m = $g('filingNewModal');
  if (!m) return;
  $g('filingNewOwnerInfo').innerHTML = (ownerType === 'Person' ? '👤 ' : '🏢 ') + e(ownerName) + ' (#' + ownerId + ')';

  /* 종소세 default = Person, 법인세 default = Business */
  const typeSel = $g('filingNewType');
  if (typeSel) typeSel.value = (ownerType === 'Business') ? '법인세' : '종소세';

  /* 귀속연도 default = 작년 */
  const yearInp = $g('filingNewYear');
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
  const m = $g('filingNewModal');
  if (m) m.style.display = 'none';
  document.body.style.overflow = '';
  _filNewOwnerType = null;
  _filNewOwnerId = null;
}
async function _filNewToggleBizList() {
  const type = $g('filingNewType')?.value;
  const area = $g('filingNewBizArea');
  const list = $g('filingNewBizList');
  if (!area || !list) return;
  /* 종소세 + Person 일 때만 사업체 다중 선택 */
  if (type === '종소세' && _filNewOwnerType === 'Person') {
    area.style.display = 'block';
    list.innerHTML = '<div style="color:#9ca3af;padding:8px;font-size:.78em">불러오는 중...</div>';
    try {
      const r = await fetch('/api/admin-businesses?key=' + encodeURIComponent(KEY) + '&user_id=' + _filNewOwnerId);
      const d = await r.json();
      const bizList = (d.businesses || []).filter(b => b.status !== 'closed' && (!b.deleted_at || b.deleted_at === ''));
      if (!bizList.length) {
        list.innerHTML = '<div style="color:#9ca3af;padding:8px;font-size:.78em">매핑된 사업체 없음</div>';
        return;
      }
      list.innerHTML = bizList.map(b =>
        '<label style="display:flex;align-items:center;gap:6px;padding:5px 6px;cursor:pointer;font-size:.84em;border-bottom:1px solid #f2f4f6">'
        + '<input type="checkbox" class="fil-new-biz" value="' + b.id + '" checked> '
        + '🏢 <b>' + e(b.company_name || '#' + b.id) + '</b>'
        + (b.business_number ? ' <span style="color:#6b7280;font-size:.92em">' + e(b.business_number) + '</span>' : '')
        + '</label>'
      ).join('');
    } catch (err) {
      list.innerHTML = '<div style="color:#f04452;padding:8px;font-size:.78em">오류: ' + e(err.message) + '</div>';
    }
  } else {
    area.style.display = 'none';
  }
}

async function submitFilingNew() {
  if (!_filNewOwnerType || !_filNewOwnerId) { alert('owner 없음'); return; }
  const type = $g('filingNewType')?.value;
  const fiscalYear = Number($g('filingNewYear')?.value || 0);
  if (!fiscalYear || fiscalYear < 2000 || fiscalYear > 2100) { alert('귀속연도 입력'); return; }
  const includedBizIds = [];
  if (type === '종소세' && _filNewOwnerType === 'Person') {
    document.querySelectorAll('.fil-new-biz:checked').forEach(c => { includedBizIds.push(Number(c.value)); });
  }
  const btn = $g('filingNewSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = '생성 중...'; btn.style.opacity = '.6'; }
  try {
    const r = await fetch('/api/admin-filings?key=' + encodeURIComponent(KEY), {
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
  const m = $g('filingDetailModal');
  if (!m) return;
  m.style.display = 'flex';
  m.style.alignItems = 'flex-start';
  m.style.justifyContent = 'center';
  document.body.style.overflow = 'hidden';
  $g('filingBody').innerHTML = '<div style="text-align:center;color:#8b95a1;padding:40px 0">불러오는 중...</div>';
  try {
    const r = await fetch('/api/admin-filings?key=' + encodeURIComponent(KEY) + '&id=' + filingId);
    const d = await r.json();
    if (!d.ok || !d.filing) { $g('filingBody').innerHTML = '<div style="color:#f04452;padding:20px">오류: ' + e(d.error || 'unknown') + '</div>'; return; }
    _filCurrent = d.filing;
    _filPrev = d.previous || null;
    _filRender();
  } catch (err) {
    $g('filingBody').innerHTML = '<div style="color:#f04452;padding:20px">오류: ' + e(err.message) + '</div>';
  }
}
function closeFilingDetail() {
  const m = $g('filingDetailModal');
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
  $g('filingTitle').innerHTML = f.fiscal_year + '년귀속 <span style="background:' + (isJongSo ? '#dbeafe' : '#fef3c7') + ';color:' + (isJongSo ? '#1e40af' : '#92400e') + ';padding:2px 8px;border-radius:6px;font-size:.7em;font-weight:700;margin:0 4px">' + e(f.type) + '</span> 신고검토표';

  /* 결재 상태 배지 */
  const stColor = { '작성중': '#9ca3af', '결재대기': '#f59e0b', '보관완료': '#10b981' }[f.review_status] || '#9ca3af';
  const stBadge = $g('filingStatusBadge');
  stBadge.textContent = f.review_status;
  stBadge.style.background = stColor;
  stBadge.style.color = '#fff';

  /* 본문 렌더 */
  const body = $g('filingBody');
  body.innerHTML = _filRenderBody(f, prev, af, pf, isJongSo, readonly);

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

  /* 사장님 명령 (2026-05-07): 사장님 PDF (3번째 사진) 항목 따라.
   * 종소세 / 법인세 항목 확장 — 부가세과세표준, 세무조정 익금/손금, 소득률, 세율, 추가납부세액, 농특세 등 */
  const fields = isJongSo
    ? [
        { key: 'vat_tax_base', label: '부가세과세표준' },
        { key: 'adj_inclusion', label: '세무조정 익금산입 (+)' },
        { key: 'adj_exclusion', label: '세무조정 손금산입 (−)' },
        { key: 'revenue', label: '총수입금액', bold: true },
        { key: 'income', label: '소득금액', showRate: 'revenue' },
        { key: 'comprehensive_deduction', label: '소득공제' },
        { key: 'tax_base', label: '과세표준' },
        { key: 'tax_rate', label: '세율 (%)', percent: true },
        { key: 'calculated_tax', label: '산출세액' },
        { key: 'deduction_total', label: '공제·감면 (합계)', autoSum: 'deductions' },
        { key: 'decisive_tax', label: '결정세액', bold: true },
        { key: 'penalty_total', label: '가산세 (합계)', autoSum: 'penalties' },
        { key: 'additional_tax', label: '추가납부세액' },
        { key: 'prepaid_tax', label: '기납부세액' },
        { key: 'nong_teuk', label: '농특세 납부' },
        { key: 'payable_tax', label: '납부할세액', bold: true, highlight: true },
      ]
    : [
        { key: 'vat_tax_base', label: '부가세과세표준' },
        { key: 'adj_inclusion', label: '세무조정 익금산입 (+)' },
        { key: 'adj_exclusion', label: '세무조정 손금산입 (−)' },
        { key: 'revenue', label: '매출액', bold: true },
        { key: 'net_income', label: '결산서 당기순이익' },
        { key: 'business_income', label: '각사업연도소득금액', showRate: 'revenue' },
        { key: 'tax_base', label: '과세표준' },
        { key: 'tax_rate', label: '세율 (%)', percent: true },
        { key: 'calculated_tax', label: '산출세액' },
        { key: 'deduction_total', label: '공제·감면 (합계)', autoSum: 'deductions' },
        { key: 'decisive_tax', label: '결정세액', bold: true },
        { key: 'penalty_total', label: '가산세 (합계)', autoSum: 'penalties' },
        { key: 'additional_tax', label: '추가납부세액' },
        { key: 'prepaid_tax', label: '기납부세액 (중간예납 등)' },
        { key: 'nong_teuk', label: '농특세 납부' },
        { key: 'payable_tax', label: '납부할세액', bold: true, highlight: true },
      ];

  /* 사장님 명령 (2026-05-07): 결재란 — 직사각형 4칸 / 위 라벨 / 아래 도장 자리 */
  const stamp4 = '<div class="filing-stamp-area print-only" style="display:none;margin-top:8px">'
    + '<table style="border-collapse:collapse;width:100%;font-size:8pt;font-weight:700">'
    + '<tr>'
    + '<td style="border:1.5px solid #191f28;width:25%;height:5mm;text-align:center;padding:1mm;background:#f3f4f6">담당자</td>'
    + '<td style="border:1.5px solid #191f28;width:25%;height:5mm;text-align:center;padding:1mm;background:#f3f4f6">사무장</td>'
    + '<td style="border:1.5px solid #191f28;width:25%;height:5mm;text-align:center;padding:1mm;background:#f3f4f6">세무사</td>'
    + '<td style="border:1.5px solid #191f28;width:25%;height:5mm;text-align:center;padding:1mm;background:#f3f4f6">대표</td>'
    + '</tr>'
    + '<tr>'
    + '<td style="border:1.5px solid #191f28;border-top:none;width:25%;height:18mm;text-align:center"></td>'
    + '<td style="border:1.5px solid #191f28;border-top:none;width:25%;height:18mm;text-align:center"></td>'
    + '<td style="border:1.5px solid #191f28;border-top:none;width:25%;height:18mm;text-align:center"></td>'
    + '<td style="border:1.5px solid #191f28;border-top:none;width:25%;height:18mm;text-align:center"></td>'
    + '</tr>'
    + '</table></div>';

  /* SECTION 01: 기본 정보 — 사장님 명령 (2026-05-07): 주업체 회사정보로 변경.
   * 회사명 / 사업자번호 / 개업일자 / 사업장주소. 사업체 여러개면 모두 나열. */
  let html = '<div class="keep-together" style="margin-bottom:18px">';
  html += '<div class="filing-section-header">SECTION 01 · BASIC INFO</div>';
  html += '<div class="filing-section-title">기본정보</div>';
  html += '<div id="filingOwnerInfoBody" style="font-size:.88em;color:#374151;line-height:1.7"><div style="color:#9ca3af">불러오는 중...</div></div>';
  html += '</div>';

  /* SECTION 02: 작년 vs 올해 비교표 */
  html += '<div class="keep-together" style="margin-bottom:18px">';
  html += '<div class="filing-section-header">SECTION 02 · COMPARISON</div>';
  html += '<div class="filing-section-title">작년 vs 올해 비교</div>';
  if (!prev) {
    html += '<div style="background:#fef3c7;border-left:3px solid #f59e0b;padding:10px 14px;border-radius:6px;font-size:.86em;color:#92400e">📌 작년 Case 없음 — 첫 도입 신고건. 내년부터 자동 비교됩니다.</div>';
  }
  html += '<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:.88em">';
  html += '<thead><tr style="background:#f9fafb;border-top:2px solid #191f28;border-bottom:1px solid #191f28">'
       + '<th style="padding:8px 10px;text-align:left;font-weight:700;color:#191f28;width:34%">항목</th>'
       + '<th style="padding:8px 10px;text-align:right;font-weight:700;color:#6b7280;width:22%">' + (prev ? (prev.fiscal_year + '귀속') : '작년') + '</th>'
       + '<th style="padding:8px 10px;text-align:right;font-weight:700;color:#191f28;width:22%">' + f.fiscal_year + '귀속</th>'
       + '<th style="padding:8px 10px;text-align:right;font-weight:700;color:#6b7280;width:22%">증감</th>'
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
    const diff = (prevVal && currVal && !fl.percent) ? _filDiff(prevVal, currVal) : '';
    const diffColor = diff.startsWith('+') ? '#dc2626' : diff.startsWith('-') ? '#10b981' : '#6b7280';
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
         + '<td style="padding:6px 10px;' + fontWeight + '">' + e(fl.label) + '</td>'
         + '<td style="padding:6px 10px;text-align:right;color:#6b7280">' + fmtVal(prevVal, fl) + prevRateBadge + '</td>'
         + '<td style="padding:6px 10px;text-align:right;' + fontWeight + '">' + fmtVal(currVal, fl) + rateBadge + '</td>'
         + '<td style="padding:6px 10px;text-align:right;color:' + diffColor + ';font-weight:600">' + diff + '</td>'
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
       + '<td style="padding:6px 10px;text-align:right;color:#6b7280">—</td>'
       + '</tr>';
  html += '</tbody></table></div>';

  /* 공제감면 비교 (작년 vs 올해 매칭 — 신규/유지/삭제 자동) */
  const prevDeductions = pf.공제감면 || pf.deductions || [];
  const currDeductions = af.공제감면 || af.deductions || [];
  const prevDedNames = new Set(prevDeductions.map(d => (d.name || d.종류 || '').trim()).filter(Boolean));
  const currDedNames = new Set(currDeductions.map(d => (d.name || d.종류 || '').trim()).filter(Boolean));
  const dedNew = [...currDedNames].filter(n => !prevDedNames.has(n));     /* 올해 신규 */
  const dedKept = [...currDedNames].filter(n => prevDedNames.has(n));      /* 유지 */
  const dedRemoved = [...prevDedNames].filter(n => !currDedNames.has(n));  /* 작년 only — 삭제됨 */

  /* SECTION 03: 공제감면 / 가산세 — 단일 컬럼 (사장님 명령 2026-05-07: A4 세로) */
  html += '<div class="keep-together" style="margin-bottom:18px">';
  html += '<div class="filing-section-header">SECTION 03 · DEDUCTIONS &amp; PENALTIES</div>';
  html += '<div class="filing-section-title">공제·감면 / 가산세 명세</div>';

  /* 공제감면 입력 + 인쇄 list */
  html += '<div style="font-size:.86em;margin-bottom:10px"><b>○ 적용 공제·감면</b>';
  html += '<ul class="print-only" style="display:none;margin:4px 0 0 18px;padding:0">';
  if (!currDeductions.length) html += '<li style="color:#9ca3af">없음</li>';
  else currDeductions.forEach(d => {
    const nm = (d.name || d.종류 || '').trim();
    const isNew = dedNew.indexOf(nm) >= 0;
    const tag = (prev && isNew) ? ' <span style="color:#dc2626;font-weight:700">[신규]</span>' : (prev ? ' <span style="color:#10b981;font-weight:700">[유지]</span>' : '');
    html += '<li>' + e(nm) + ' ' + _filFormatNum(d.amount || d.금액 || 0) + '원' + tag + '</li>';
  });
  if (prev && dedRemoved.length) {
    dedRemoved.forEach(nm => {
      const prevD = prevDeductions.find(d => (d.name || d.종류 || '').trim() === nm);
      html += '<li style="color:#dc2626;text-decoration:line-through">' + e(nm) + ' ' + _filFormatNum(prevD?.amount || prevD?.금액 || 0) + '원 <span style="font-weight:700">[작년 → 올해 삭제]</span></li>';
    });
  }
  html += '</ul>';
  html += '<div id="filDeductionRows" class="no-print" style="margin-top:6px">';
  if (currDeductions.length === 0) html += _filRenderDeductionRow({ name: '', amount: '' }, 0, readonly);
  else currDeductions.forEach((d, i) => { html += _filRenderDeductionRow(d, i, readonly); });
  html += '</div>';
  if (!readonly) html += '<button onclick="_filAddDeductionRow()" class="no-print" style="background:#fff;color:#3182f6;border:1px dashed #3182f6;padding:4px 10px;border-radius:6px;font-size:.74em;cursor:pointer;font-family:inherit;margin-top:6px">+ 공제감면 추가</button>';
  html += '</div>';

  /* 가산세 */
  const currPenalties_2 = af.가산세 || af.penalties || [];
  html += '<div style="font-size:.86em;margin-bottom:10px"><b>○ 가산세</b>';
  html += '<ul class="print-only" style="display:none;margin:4px 0 0 18px;padding:0">';
  if (!currPenalties_2.length) html += '<li style="color:#9ca3af">없음</li>';
  else currPenalties_2.forEach(p => {
    html += '<li>' + e(p.name || p.종류 || '') + ' ' + _filFormatNum(p.amount || p.금액 || 0) + '원</li>';
  });
  html += '</ul>';
  html += '<div id="filPenaltyRows" class="no-print" style="margin-top:6px">';
  if (currPenalties_2.length === 0) html += _filRenderPenaltyRow({ name: '', amount: '' }, 0, readonly);
  else currPenalties_2.forEach((p, i) => { html += _filRenderPenaltyRow(p, i, readonly); });
  html += '</div>';
  if (!readonly) html += '<button onclick="_filAddPenaltyRow()" class="no-print" style="background:#fff;color:#dc2626;border:1px dashed #dc2626;padding:4px 10px;border-radius:6px;font-size:.74em;cursor:pointer;font-family:inherit;margin-top:6px">+ 가산세 추가</button>';
  html += '</div>';
  html += '</div>';

  /* SECTION 04: 작년 코멘트 (참조용) — 단일 컬럼 (작년 있을 때만) */
  if (prev && prev.reviewer_comment) {
    html += '<div class="keep-together" style="margin-bottom:14px;padding:10px 14px;background:#f9fafb;border-left:3px solid #6b7280;border-radius:6px">';
    html += '<div class="filing-section-header" style="margin-top:0">SECTION 04 · LAST YEAR COMMENT</div>';
    html += '<div style="font-weight:700;font-size:.86em;margin-bottom:4px;color:#374151">📜 작년 (' + prev.fiscal_year + ') 결재자 코멘트</div>';
    html += '<div style="font-size:.84em;color:#374151;white-space:pre-wrap;line-height:1.6">' + e(prev.reviewer_comment) + '</div>';
    html += '</div>';
  }

  /* SECTION 05: 결재자 코멘트 (특이사항·이슈 통합) — 큰 영역 */
  html += '<div class="keep-together" style="margin-bottom:18px">';
  html += '<div class="filing-section-header">SECTION 05 · REVIEWER COMMENT</div>';
  html += '<div class="filing-section-title">결재자 코멘트 <span style="font-size:.74em;color:#6b7280;font-weight:500">(특이사항·이슈 포함)</span></div>';
  /* 인쇄용 — 큰 박스 (손글씨 자리 또는 입력 내용 전체) */
  html += '<div class="print-only" style="display:none;border:1.5px solid #191f28;border-radius:4px;padding:8mm;min-height:60mm;font-size:10pt;line-height:1.7;white-space:pre-wrap">';
  html += e(f.reviewer_comment || '');
  html += '</div>';
  /* 편집용 textarea — 크게 */
  html += '<textarea class="no-print" data-fil-field="reviewer_comment" rows="8" ' + ro + ' placeholder="결재자 코멘트 + 특이사항 + 이슈 (다음 해 작년 리뷰에 검색 가능)\n예) 카페 매출 분리 OK / 청년창업감면 신청 가능 / 사업용계좌 12월 매출 누락 가능성 — 재확인" style="width:100%;padding:10px 12px;border:1px solid #e5e8eb;border-radius:6px;font-size:.92em;font-family:inherit;box-sizing:border-box;resize:vertical;line-height:1.6">' + e(f.reviewer_comment || '') + '</textarea>';
  html += '</div>';

  /* 좌우 2단 폐기 — placeholder div 닫기 */
  html += '</div>'; /* end placeholder */

  /* SECTION 06 (인쇄 전용): 필수 검토 체크박스 + 결재란 — Page 1 하단 */
  html += '<div class="print-only keep-together" style="display:none;margin-top:14px;border-top:2px solid #191f28;padding-top:10px">';
  html += '<div class="filing-section-header">SECTION 06 · CHECKLIST</div>';
  html += '<div class="filing-section-title">필수 검토 사항</div>';
  /* 큰 체크박스 (사장님 펜으로 체크) */
  html += '<table style="border-collapse:collapse;width:100%;margin-bottom:8px;font-size:9pt">';
  const chkItems = [
    '수입금액 누락 점검', '가산세 점검', '사업용계좌 사용 확인', '적격증빙 검토',
    '세무조정 사항 확인', '공제·감면 신청 검토', '기납부세액 확인', '신고서 최종 점검'
  ];
  for (let i = 0; i < chkItems.length; i += 2) {
    html += '<tr>';
    html += '<td style="border:1px solid #d1d5db;padding:5mm 4mm;width:50%;font-weight:600">'
      + '<span style="display:inline-block;width:5mm;height:5mm;border:1.5px solid #191f28;margin-right:3mm;vertical-align:middle"></span>'
      + e(chkItems[i]) + '</td>';
    html += '<td style="border:1px solid #d1d5db;padding:5mm 4mm;width:50%;font-weight:600">'
      + '<span style="display:inline-block;width:5mm;height:5mm;border:1.5px solid #191f28;margin-right:3mm;vertical-align:middle"></span>'
      + e(chkItems[i + 1] || '') + '</td>';
    html += '</tr>';
  }
  html += '</table>';
  /* 결재란 — 4칸 직사각형 */
  html += '<div style="margin-top:6mm">' + stamp4 + '</div>';
  html += '</div>';

  /* SECTION 07: 입력 폼 (직원 작성용, 화면 전용) — 사장님 명령 (2026-05-07): 폼은 1번 위치 (위) */
  html += '<div class="keep-together no-print" style="margin-bottom:18px;padding:14px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e8eb">';
  html += '<div class="filing-section-header">SECTION 07 · INPUT (직원 입력)</div>';
  html += '<div class="filing-section-title">자동 필드 수기 입력</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">';
  fields.forEach(fl => {
    if (fl.autoSum) {
      /* 공제감면/가산세 합계 — readonly 자동 계산 */
      const sum = calcAutoSum(af, fl.autoSum);
      html += '<div><label style="font-size:.78em;color:#6b7280;display:block;margin-bottom:3px">' + e(fl.label) + ' <span style="color:#9ca3af">(자동)</span></label>';
      html += '<input type="text" id="fil_sum_' + fl.autoSum + '" readonly value="' + _filFormatNum(sum) + '" class="filing-num-input" style="background:#f3f4f6;color:#374151"></div>';
      return;
    }
    const v = af[fl.key];
    const suffix = fl.percent ? ' <span style="color:#9ca3af">(%)</span>' : ' <span style="color:#9ca3af">(원)</span>';
    html += '<div>';
    html += '<label style="font-size:.78em;color:#6b7280;display:block;margin-bottom:3px">' + e(fl.label) + suffix + '</label>';
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

  /* SECTION 06: 결재 버튼 */
  html += '<div class="keep-together no-print" style="display:flex;gap:8px;justify-content:flex-end;padding:14px 0;border-top:1px solid #e5e8eb;margin-top:8px">';
  if (f.review_status === '작성중') {
    html += '<button onclick="filingSetStatus(\'결재대기\')" style="background:#f59e0b;color:#fff;border:none;padding:9px 18px;border-radius:8px;font-size:.85em;font-weight:700;cursor:pointer;font-family:inherit">📋 결재 요청 (→ 결재대기)</button>';
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

  /* owner info 섹션 채우기 (별도 div) */
  setTimeout(() => _filRenderOwnerInfo(f), 10);

  return html;
}

async function _filRenderOwnerInfo(f) {
  const target = $g('filingOwnerInfoBody');
  if (!target) return;
  /* 주업체 정보 + 사업체 list 자동 표시 (사장님 명령 2026-05-07) */
  const fmtBizRow = (b, isPrimary) => {
    const form = b.company_form || '';
    const formShort = /법인/.test(form) ? '법인' : (/개인/.test(form) ? '개인' : (/간이/.test(form) ? '간이' : ''));
    const bn = b.business_number || '';
    const bnFmt = bn && bn.length === 10 ? bn.slice(0,3)+'-'+bn.slice(3,5)+'-'+bn.slice(5) : bn;
    return (isPrimary ? '★ ' : '  ') + '🏢 <b>' + e(b.company_name || '#' + b.id) + '</b>'
      + (formShort ? ' <span style="color:#6b7280">(' + formShort + ')</span>' : '')
      + (bnFmt ? ' · 사업자 ' + e(bnFmt) : '')
      + (b.ceo_name ? ' · 대표 ' + e(b.ceo_name) : '')
      + (b.establishment_date ? ' · 개업 ' + e(b.establishment_date.slice(0, 10)) : '')
      + (b.address ? '<div style="margin-left:18px;color:#6b7280;font-size:.92em">' + e(b.address) + '</div>' : '');
  };

  let html = '';
  let businesses = [];
  if (f.owner_type === 'Person') {
    /* 종소세 = Person + 포함 사업체 */
    try {
      const u = await fetch('/api/admin-approve?key=' + encodeURIComponent(KEY) + '&status=all').then(r => r.json());
      const me = (u.users || []).find(x => x.id === f.owner_id);
      const meName = me?.real_name || me?.name || '#' + f.owner_id;
      const meBirth = me?.birth_date || '';
      html += '<div style="margin-bottom:6px">👤 대표 · 사람: <b>' + e(meName) + '</b>' + (meBirth ? ' · 생년월일 ' + e(meBirth) : '') + '</div>';
    } catch {}
    /* 매핑 사업체 모두 fetch */
    try {
      const bizR = await fetch('/api/admin-businesses?key=' + encodeURIComponent(KEY) + '&user_id=' + f.owner_id);
      const bizD = await bizR.json();
      let allBiz = (bizD.businesses || []).filter(b => b.status !== 'closed');
      /* included_business_ids 가 있으면 그 list 우선 표시 */
      let includedIds = [];
      if (f.included_business_ids) {
        try { includedIds = JSON.parse(f.included_business_ids) || []; } catch {}
      }
      if (includedIds.length) {
        const inSet = new Set(includedIds);
        allBiz = allBiz.filter(b => inSet.has(b.id));
      }
      businesses = allBiz;
    } catch {}
  } else if (f.owner_type === 'Business') {
    /* 법인세 = 단일 업체 */
    try {
      const r = await fetch('/api/admin-businesses?key=' + encodeURIComponent(KEY) + '&id=' + f.owner_id);
      const d = await r.json();
      if (d.business) businesses = [d.business];
    } catch {}
  }

  if (businesses.length) {
    html += '<div style="font-weight:700;margin-top:4px;margin-bottom:4px;color:#191f28">📋 사업체 (' + businesses.length + '개)</div>';
    businesses.forEach((b, i) => {
      html += '<div style="margin:3px 0;padding:6px 0;border-bottom:1px dashed #e5e8eb">' + fmtBizRow(b, i === 0) + '</div>';
    });
  } else {
    html += '<div style="color:#9ca3af">매핑된 사업체 없음</div>';
  }

  target.innerHTML = html;
  /* 헤더 owner 정보 (타이틀 아래 — 짧은 요약) */
  if ($g('filingOwnerInfo')) {
    const summary = businesses.length
      ? '🏢 ' + e(businesses[0].company_name || '') + (businesses.length > 1 ? ' 외 ' + (businesses.length - 1) + '개' : '')
      : '';
    $g('filingOwnerInfo').innerHTML = summary;
  }
}

function _filRenderDeductionRow(d, idx, readonly) {
  const ro = readonly ? 'readonly disabled' : '';
  const remBtn = readonly ? '' : '<button onclick="_filRemoveDeductionRow(' + idx + ')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:1.1em;padding:0 4px;font-family:inherit">×</button>';
  return '<div class="fil-deduction-row" data-idx="' + idx + '" style="display:grid;grid-template-columns:1.5fr 1fr auto;gap:6px;margin-bottom:4px">'
    + '<input type="text" ' + ro + ' value="' + e(d.name || d.종류 || '') + '" placeholder="항목 (예: 자녀세액공제)" oninput="_filDeductionChanged()" class="filing-text-input fil-ded-name">'
    + '<input type="text" ' + ro + ' value="' + (d.amount || d.금액 ? _filFormatNum(d.amount || d.금액) : '') + '" placeholder="금액" oninput="_filFormatOnInput(this);_filDeductionChanged()" class="filing-num-input fil-ded-amount">'
    + remBtn
    + '</div>';
}
function _filRenderPenaltyRow(p, idx, readonly) {
  const ro = readonly ? 'readonly disabled' : '';
  const remBtn = readonly ? '' : '<button onclick="_filRemovePenaltyRow(' + idx + ')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:1.1em;padding:0 4px;font-family:inherit">×</button>';
  return '<div class="fil-penalty-row" data-idx="' + idx + '" style="display:grid;grid-template-columns:1.5fr 1fr auto;gap:6px;margin-bottom:4px">'
    + '<input type="text" ' + ro + ' value="' + e(p.name || p.종류 || '') + '" placeholder="가산세 종류 (예: 무신고)" oninput="_filPenaltyChanged()" class="filing-text-input fil-pen-name">'
    + '<input type="text" ' + ro + ' value="' + (p.amount || p.금액 ? _filFormatNum(p.amount || p.금액) : '') + '" placeholder="금액" oninput="_filFormatOnInput(this);_filPenaltyChanged()" class="filing-num-input fil-pen-amount">'
    + remBtn
    + '</div>';
}
function _filAddDeductionRow() {
  const box = $g('filDeductionRows');
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
  const box = $g('filPenaltyRows');
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
  const st = $g('filSaveStatus');
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
  const dedSumEl = $g('fil_sum_deductions');
  if (dedSumEl) dedSumEl.value = _filFormatNum(sumDed);
  const penSumEl = $g('fil_sum_penalties');
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
  /* 공제감면 */
  af.공제감면 = [];
  document.querySelectorAll('.fil-deduction-row').forEach(row => {
    const name = row.querySelector('.fil-ded-name')?.value.trim() || '';
    const amt = _filParseNum(row.querySelector('.fil-ded-amount')?.value || '');
    if (name || amt !== null) af.공제감면.push({ name, amount: amt });
  });
  /* 가산세 */
  af.가산세 = [];
  document.querySelectorAll('.fil-penalty-row').forEach(row => {
    const name = row.querySelector('.fil-pen-name')?.value.trim() || '';
    const amt = _filParseNum(row.querySelector('.fil-pen-amount')?.value || '');
    if (name || amt !== null) af.가산세.push({ name, amount: amt });
  });
  const reviewerComment = (document.querySelector('[data-fil-field="reviewer_comment"]')?.value || '').trim();

  const st = $g('filSaveStatus');
  if (st) { st.textContent = '저장 중...'; st.style.color = '#f59e0b'; }
  try {
    const r = await fetch('/api/admin-filings?key=' + encodeURIComponent(KEY) + '&id=' + _filCurrent.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_fields: af, reviewer_comment: reviewerComment }),
    });
    const d = await r.json();
    if (d.ok) {
      _filCurrent.auto_fields = JSON.stringify(af);
      _filCurrent.reviewer_comment = reviewerComment;
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
    const r = await fetch('/api/admin-filings?action=set_status&id=' + _filCurrent.id + '&key=' + encodeURIComponent(KEY), {
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
async function _filRenderListInto(containerEl, ownerType, ownerId, ownerName) {
  if (!containerEl) return;
  containerEl.innerHTML = '<div style="color:#9ca3af;padding:10px 0;font-size:.85em">불러오는 중...</div>';
  try {
    const r = await fetch('/api/admin-filings?key=' + encodeURIComponent(KEY) + '&owner_type=' + ownerType + '&owner_id=' + ownerId);
    const d = await r.json();
    const list = d.filings || [];
    let html = '';
    /* 신규 버튼 */
    html += '<button onclick="openFilingNew(\'' + ownerType + '\',' + ownerId + ',\'' + e(ownerName).replace(/\'/g, '') + '\')" style="background:#3182f6;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:.82em;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:10px">+ 새 ' + (ownerType === 'Person' ? '종소세' : '법인세') + ' Case</button>';
    /* list */
    if (!list.length) {
      html += '<div style="color:#9ca3af;padding:8px 0;font-size:.85em">신고 Case 가 없습니다.</div>';
    } else {
      html += list.map(f => {
        const af = (function () { try { return JSON.parse(f.auto_fields || '{}'); } catch { return {}; } })();
        const stColor = { '작성중': '#9ca3af', '결재대기': '#f59e0b', '보관완료': '#10b981' }[f.review_status] || '#9ca3af';
        const rev = af.revenue || 0;
        const dec = af.decisive_tax || 0;
        const eff = rev ? _filEffRate(dec, rev) : '—';
        return '<div onclick="openFilingDetail(' + f.id + ')" style="padding:10px 12px;background:#fff;border:1px solid #e5e8eb;border-radius:8px;margin-bottom:6px;cursor:pointer;display:flex;align-items:center;justify-content:space-between" onmouseenter="this.style.background=\'#f0f9ff\'" onmouseleave="this.style.background=\'#fff\'">'
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-size:.86em;font-weight:600">[' + f.fiscal_year + '귀속] <span style="background:' + stColor + ';color:#fff;font-size:.74em;padding:2px 8px;border-radius:99px;font-weight:700;margin-left:4px">' + e(f.review_status) + '</span></div>'
          + '<div style="font-size:.74em;color:#6b7280;margin-top:3px">' + e(f.type) + ' · 수입 ' + (rev ? _filFormatNum(rev) + '원' : '—') + ' · 결정세액 ' + (dec ? _filFormatNum(dec) + '원' : '—') + ' · 실효세율 ' + eff + '</div>'
          + '</div>'
          + '<span style="color:#3182f6;font-size:1.2em">›</span>'
          + '</div>';
      }).join('');
    }
    containerEl.innerHTML = html;
  } catch (err) {
    containerEl.innerHTML = '<div style="color:#f04452;padding:8px;font-size:.82em">오류: ' + e(err.message) + '</div>';
  }
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
    const el = $g(c.id);
    if (el && c.type === _filLastListContext.ownerType) {
      const nameEl = c.type === 'Person' ? $g('cdName') : $g('bdName');
      const name = nameEl ? nameEl.textContent : '';
      _filRenderListInto(el, _filLastListContext.ownerType, _filLastListContext.ownerId, name);
    }
  });
}
