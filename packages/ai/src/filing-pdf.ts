/**
 * Phase Next-Day24 (2026-05-09): 신고 검토표 → HTML/PDF.
 *
 * Cloudflare Workers 환경: Puppeteer 미사용 (Chromium binary 무거움).
 * 대신 HTML 생성 → 사장님 브라우저 print → PDF.
 * (또는 추후 Cloudflare Browser Rendering API 통합).
 *
 * 단위 테스트 가능 — 순수 함수 (DB / fetch 의존성 X).
 */

export interface FilingPdfData {
  filing: {
    type: string;
    fiscal_year: number;
    owner_type: string;
    owner_id: number;
    review_status: string | null;
    auto_fields?: Record<string, string> | string | null;
    reviewer_comment?: string | null;
    created_at?: string | null;
  };
  previous?: {
    fiscal_year: number;
    auto_fields?: Record<string, string> | string | null;
  } | null;
  ownerName?: string;
  reviewerName?: string;
}

const FIELD_GROUPS: { title: string; fields: { key: string; label: string }[] }[] = [
  {
    title: '🧾 매출·매입',
    fields: [
      { key: 'sales_total', label: '매출 합계' },
      { key: 'purchase_total', label: '매입 합계' },
      { key: 'vat_payable', label: '부가세 납부세액' },
      { key: 'taxable_income', label: '과세표준' },
    ],
  },
  {
    title: '💼 인건비',
    fields: [
      { key: 'payroll_total', label: '인건비 합계' },
      { key: 'withholding_total', label: '원천세 합계' },
    ],
  },
  {
    title: '📊 산출세액',
    fields: [
      { key: 'computed_tax', label: '산출세액' },
      { key: 'final_tax', label: '결정세액' },
      { key: 'paid_tax', label: '기납부세액' },
    ],
  },
];

/** auto_fields 가 string (JSON) 또는 object — 둘 다 지원. */
function parseFields(
  v: Record<string, string> | string | null | undefined,
): Record<string, string> {
  if (!v) return {};
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return v;
}

function fmt(v: string | undefined): string {
  if (!v) return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString();
}

function diff(curr: string | undefined, prev: string | undefined): string {
  const c = Number(curr || 0);
  const p = Number(prev || 0);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return '-';
  const pct = ((c - p) / Math.abs(p)) * 100;
  if (Math.abs(pct) < 0.01) return '0%';
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 신고 검토표 HTML 생성 — 브라우저 print 또는 PDF 변환용. */
export function renderFilingHtml(data: FilingPdfData): string {
  const { filing, previous, ownerName, reviewerName } = data;
  const cur = parseFields(filing.auto_fields);
  const prev = parseFields(previous?.auto_fields);

  const fieldRows = FIELD_GROUPS.map((g) => {
    const rows = g.fields
      .map((f) => {
        return `
        <tr>
          <td>${escapeHtml(f.label)}</td>
          <td class="num">${fmt(prev[f.key])}</td>
          <td class="num">${fmt(cur[f.key])}</td>
          <td class="num">${diff(cur[f.key], prev[f.key])}</td>
        </tr>`;
      })
      .join('');

    return `
    <h3>${escapeHtml(g.title)}</h3>
    <table>
      <thead>
        <tr>
          <th>항목</th>
          <th class="num">작년 (${(previous?.fiscal_year ?? filing.fiscal_year - 1)})</th>
          <th class="num">올해 (${filing.fiscal_year})</th>
          <th class="num">증감</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  }).join('\n');

  const header = `
    <header>
      <h1>${escapeHtml(filing.type)} 신고 검토표 [${filing.fiscal_year}귀속]</h1>
      <div class="meta">
        <span>대상: ${escapeHtml(filing.owner_type)} #${filing.owner_id}${
    ownerName ? ` (${escapeHtml(ownerName)})` : ''
  }</span>
        <span>상태: ${escapeHtml(filing.review_status || '작성중')}</span>
        ${reviewerName ? `<span>결재자: ${escapeHtml(reviewerName)}</span>` : ''}
      </div>
    </header>`;

  const reviewer = filing.reviewer_comment
    ? `<section class="comment">
        <h3>💬 결재자 코멘트</h3>
        <p>${escapeHtml(filing.reviewer_comment)}</p>
      </section>`
    : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(filing.type)} 검토표 — ${filing.fiscal_year}귀속</title>
<style>
  body { font-family: 'Noto Sans KR', sans-serif; max-width: 900px; margin: 30px auto; padding: 0 20px; color: #1f2937; }
  header { border-bottom: 3px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px; }
  header h1 { font-size: 22px; margin: 0 0 8px 0; }
  .meta { display: flex; gap: 16px; font-size: 13px; color: #6b7280; flex-wrap: wrap; }
  h3 { font-size: 16px; margin-top: 24px; margin-bottom: 8px; color: #1e40af; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
  th { background: #f3f4f6; font-weight: 600; }
  .num { text-align: right; font-family: 'Roboto Mono', monospace; }
  .comment { margin-top: 32px; background: #fef3c7; padding: 16px; border-radius: 8px; }
  .comment p { margin: 4px 0 0 0; white-space: pre-wrap; font-size: 13px; }
  footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
  @media print { body { margin: 0; } @page { size: A4; margin: 1.5cm; } }
</style>
</head>
<body>
  ${header}
  ${fieldRows}
  ${reviewer}
  <footer>세무회계 이윤 — 대표세무사 이재윤 · 대구 달서구 · 053-269-1213</footer>
</body>
</html>`;
}
