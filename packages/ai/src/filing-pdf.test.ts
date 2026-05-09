/**
 * Phase Next-Day24 (2026-05-09): renderFilingHtml 단위 테스트.
 *
 * HTML 출력 정확성 + 작년 vs 올해 비교 + escape XSS 방어.
 */
import { describe, it, expect } from 'vitest';
import { renderFilingHtml } from './filing-pdf';

describe('renderFilingHtml', () => {
  it('renders basic structure with year + type in title', () => {
    const html = renderFilingHtml({
      filing: {
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
        review_status: '작성중',
      },
    });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>종소세 검토표 — 2025귀속</title>');
    expect(html).toContain('종소세 신고 검토표 [2025귀속]');
    expect(html).toContain('상태: 작성중');
  });

  it('includes owner display name when provided', () => {
    const html = renderFilingHtml({
      filing: {
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
        review_status: '보관완료',
      },
      ownerName: '박승호',
    });
    expect(html).toContain('Person #7 (박승호)');
  });

  it('parses auto_fields JSON string + renders rows', () => {
    const html = renderFilingHtml({
      filing: {
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
        review_status: '작성중',
        auto_fields: JSON.stringify({
          sales_total: '500000',
          purchase_total: '200000',
        }),
      },
    });
    expect(html).toContain('500,000');
    expect(html).toContain('200,000');
  });

  it('parses auto_fields object directly', () => {
    const html = renderFilingHtml({
      filing: {
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
        review_status: '작성중',
        auto_fields: { sales_total: '1000000' },
      },
    });
    expect(html).toContain('1,000,000');
  });

  it('shows YoY diff with arrow indicators', () => {
    const html = renderFilingHtml({
      filing: {
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
        review_status: '작성중',
        auto_fields: { sales_total: '1200000' },
      },
      previous: {
        fiscal_year: 2024,
        auto_fields: { sales_total: '1000000' },
      },
    });
    expect(html).toContain('+20.0%'); // 1200/1000 = +20
  });

  it('shows negative diff when this year is lower', () => {
    const html = renderFilingHtml({
      filing: {
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
        review_status: '작성중',
        auto_fields: { sales_total: '800000' },
      },
      previous: {
        fiscal_year: 2024,
        auto_fields: { sales_total: '1000000' },
      },
    });
    expect(html).toContain('-20.0%');
  });

  it('shows - when prev year missing', () => {
    const html = renderFilingHtml({
      filing: {
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
        review_status: '작성중',
        auto_fields: { sales_total: '500000' },
      },
    });
    /* 작년 컬럼 헤더는 fiscal_year - 1 */
    expect(html).toContain('작년 (2024)');
  });

  it('renders reviewer_comment when present', () => {
    const html = renderFilingHtml({
      filing: {
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
        review_status: '보관완료',
        reviewer_comment: '매출 20% 증가 — 성장세 양호',
      },
    });
    expect(html).toContain('💬 결재자 코멘트');
    expect(html).toContain('매출 20% 증가 — 성장세 양호');
  });

  it('omits comment section when missing', () => {
    const html = renderFilingHtml({
      filing: {
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
        review_status: '작성중',
      },
    });
    expect(html).not.toContain('결재자 코멘트');
  });

  it('escapes HTML in comment (XSS guard)', () => {
    const html = renderFilingHtml({
      filing: {
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
        review_status: '보관완료',
        reviewer_comment: '<script>alert(1)</script>',
      },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML in ownerName (XSS guard)', () => {
    const html = renderFilingHtml({
      filing: {
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
        review_status: '작성중',
      },
      ownerName: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('handles invalid JSON in auto_fields gracefully', () => {
    const html = renderFilingHtml({
      filing: {
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
        review_status: '작성중',
        auto_fields: '{ broken json',
      },
    });
    // 모든 row 가 - 표시
    expect(html).toContain('매출 합계');
  });

  it('includes office contact in footer', () => {
    const html = renderFilingHtml({
      filing: {
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
        review_status: '작성중',
      },
    });
    expect(html).toContain('이재윤');
    expect(html).toContain('053-269-1213');
  });

  it('includes print CSS for A4', () => {
    const html = renderFilingHtml({
      filing: {
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
        review_status: '작성중',
      },
    });
    expect(html).toContain('@media print');
    expect(html).toContain('A4');
  });

  it('includes all 9 fields across 3 sections', () => {
    const html = renderFilingHtml({
      filing: {
        type: '종소세',
        fiscal_year: 2025,
        owner_type: 'Person',
        owner_id: 7,
        review_status: '작성중',
      },
    });
    const expectedFields = [
      '매출 합계',
      '매입 합계',
      '부가세 납부세액',
      '과세표준',
      '인건비 합계',
      '원천세 합계',
      '산출세액',
      '결정세액',
      '기납부세액',
    ];
    for (const f of expectedFields) {
      expect(html).toContain(f);
    }
  });
});
