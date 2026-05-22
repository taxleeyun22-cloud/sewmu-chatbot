/**
 * InvoicePreview.tsx — A4 청구서 미리보기 (billing-preview.html cust-page + cust-page2 포팅).
 *
 * 사장님 명령 (2026-05-21): "아까 우리 프리뷰만든거랑 아에다른데?"
 * → billing-preview.html 의 깔쌈한 디자인 (header / itbl / greet / cards / pay / ft / dtbl)
 *    그대로 React 컴포넌트로 옮김.
 *
 * 사장님 룰:
 *   - 할인액 무조건 수기 — 빈 값이면 ccard 자체 숨김
 *   - Section 3 산출근거는 2장(cust-page2) 으로 분리 — A4 1+2 print 도 자동 분리
 *   - 중특(112/JTL_7) = flat 5% / 그 외 = U자
 */
'use client';

import './InvoicePreview.css';
/* 사장님 명령 (2026-05-21): 계산 단일 진실 — calcGain inline 제거, SSoT 사용 */
import { calcGain, formatWon as W } from '@/lib/billing-calc';

/* ─────────── Helpers ─────────── */
function fmtDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}. ${m}. ${day}`;
}

/* ─────────── Types ─────────── */
export interface InvoicePreviewS2 {
  name: string;
  val: number;
  qty: number;
}

export interface InvoicePreviewS3 {
  code?: string;
  name: string;
  amt: number;
  rule: 'flat_5' | 'progressive_u' | 'none';
}

export interface InvoicePreviewTemplate {
  greeting?: string;        // 4 paragraphs concat with \n\n or first para
  bank_info?: string;       // "하나은행 010-5531-7625 (예금주: 세무사 이재윤 사무소)"
  office_address?: string;  // "우 42633 대구광역시 달서구 와룡로 221 4층"
  office_phone?: string;    // "(053) 269-1213"
  signature_text?: string;  // "이재윤"
  firm_name?: string;       // "세무회계 이윤"
}

export interface InvoicePreviewProps {
  /* 거래처/사업장 */
  companyName?: string | null;
  ceoName?: string | null;

  /* 청구서 본체 */
  year: number;
  taxType: '법인세' | '종소세' | '부가세' | string;
  bizType?: string | null;
  revenue: number;
  baseFee: number;       // 기본 세무조정료 합 (base + ket + cst)
  s2Total: number;
  s3Total: number;
  discount: number;
  total: number;
  issueDate?: Date | string | null;
  dueDate?: Date | string | null;

  /* 산출근거 */
  s2Items: InvoicePreviewS2[];
  s3Items: InvoicePreviewS3[];

  /* 양식 (Template) */
  template?: InvoicePreviewTemplate | null;

  /* 옵션 — Section 3 산출근거 2장 표시 여부 (default: s3Items 있으면 자동 표시) */
  showBreakdownPage?: boolean;
}

/* 인삿말 default — billing-preview.html 와 동일 */
const DEFAULT_GREET_P1 = '귀 사의 무궁한 발전을 진심으로 기원합니다.';
const DEFAULT_GREET_P2 = '평소 저희 사무소에 보내주신 따뜻한 성원과 변함없는 신뢰에 진심으로 감사드립니다.';
const DEFAULT_GREET_P3 = '저희 세무회계 이윤은 귀사로부터 위임받은 세무대리인으로서, 귀사의 세무 리스크를 선제적으로 관리하고 합법적인 조세 혜택을 최대한 활용할 수 있도록 성실히 직무에 임하고 있습니다.';
const DEFAULT_GREET_END = '항상 최선을 다하는 세무회계 이윤이 되겠습니다. 감사합니다.';

const DEFAULT_BANK = '하나은행 010-5531-7625';
const DEFAULT_HOLDER = '세무사 이재윤 사무소';
const DEFAULT_ADDR = '우 42633 대구광역시 달서구 와룡로 221 4층';
const DEFAULT_TEL = '(053) 269-1213';
const DEFAULT_FAX = '(053) 267-1213';
const DEFAULT_SIGN = '이 재 윤';
const DEFAULT_FIRM = '세무회계 이윤';

/* ─────────── Component ─────────── */
export function InvoicePreview({
  companyName,
  ceoName,
  year,
  taxType,
  bizType,
  revenue,
  baseFee,
  s2Total,
  s3Total,
  discount,
  total,
  issueDate,
  dueDate,
  s2Items,
  s3Items,
  template,
  showBreakdownPage,
}: InvoicePreviewProps) {
  const t = template || {};

  /* 인삿말 — template.greeting 이 있으면 \n\n split, 없으면 default */
  const greetParas = (() => {
    if (t.greeting && t.greeting.trim()) {
      const parts = t.greeting.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
      while (parts.length < 4) parts.push('');
      return parts.slice(0, 4);
    }
    return [DEFAULT_GREET_P1, DEFAULT_GREET_P2, DEFAULT_GREET_P3, DEFAULT_GREET_END];
  })();

  const bankLine = t.bank_info || DEFAULT_BANK;
  const addr = t.office_address || DEFAULT_ADDR;
  const tel = t.office_phone || DEFAULT_TEL;
  const sign = t.signature_text || DEFAULT_SIGN;
  const firm = t.firm_name || DEFAULT_FIRM;

  const extra = s2Total + s3Total;
  /* 사장님 명령 (2026-05-21): "안적으면 2page 에서는 사라지게" — val/amt > 0 인 항목만 표시 */
  const s2Visible = (s2Items || []).filter((it) => (it.val || 0) > 0 && (it.qty || 0) > 0);
  const s3Visible = (s3Items || []).filter((it) => (it.amt || 0) > 0);
  const showBreakdown =
    (showBreakdownPage ?? false) || s2Visible.length > 0 || s3Visible.length > 0;

  const dispCompany = companyName || '(거래처명)';
  const dispCeo = ceoName || '대표';

  const issueStr = issueDate ? fmtDate(issueDate) : fmtDate(new Date());
  const dueStr = dueDate ? fmtDate(dueDate) : '';

  return (
    <div className="iyun-invoice-preview">
      <div className="preview-shell">
        <div className="preview-tools">
          <div>
            <b>📄 청구서 미리보기</b>
            <span style={{ color: '#94a3b8', marginLeft: '6px', fontSize: '11px' }}>
              {dispCompany} · {year}년 귀속 {taxType}
            </span>
          </div>
        </div>

        {/* ─── A4 1장 (cust-page) ─── */}
        <div className="page">
          <div className="hd">
            <div className="hd-logo">
              <div className="hd-mark" />

              <div>
                <div className="hd-name">{firm}</div>
                <div className="hd-sub">TAX STRATEGY &amp; ADVISORY</div>
              </div>
            </div>
            <div className="hd-meta">발행일자 : <span>{issueStr}</span></div>
          </div>

          <table className="itbl">
            <tbody>
              <tr>
                <th>수 신</th>
                <td className="b" style={{ width: '60%' }}>
                  {dispCompany}&nbsp;&nbsp;{dispCeo} 대표이사 귀하
                </td>
                <th>귀속</th>
                <td>{year}년</td>
              </tr>
              <tr>
                <th>제 목</th>
                <td colSpan={3} className="b">
                  {year}년 귀속 {taxType} 신고 및 세무조정 수수료 청구의 건
                </td>
              </tr>
            </tbody>
          </table>

          <div className="greet">
            {greetParas.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          <div className="cards">
            <div className="ccard">
              <span className="ccard-l">산출기준 수입금액</span>
              <span className="ccard-v">{revenue ? `${W(revenue)}원` : '—'}</span>
            </div>
            <div className="ccard">
              <span className="ccard-l">기본 세무조정료</span>
              <span className="ccard-v">{baseFee ? `${W(baseFee)}원` : '—'}</span>
            </div>
            <div className="ccard">
              <span className="ccard-l">추가 용역 소계</span>
              <span className="ccard-v">{extra ? `${W(extra)}원` : '—'}</span>
            </div>
            {/* 할인액 — 사장님 룰: 빈 값이면 ccard 자체 hide */}
            {discount > 0 && (
              <div className="ccard">
                <span className="ccard-l">할 인 액</span>
                <span className="ccard-v" style={{ color: '#dc2626' }}>▼ {W(discount)}원</span>
              </div>
            )}
            <div className="ccard final">
              <span className="ccard-l">최종 청구 (VAT 포함)</span>
              <span className="ccard-v">{W(total)}원</span>
            </div>
          </div>

          <div className="pay">
            <span className="pl">※ 수수료 입금 계좌</span>
            <div className="pa">{bankLine}</div>
            <div className="ph">(예금주 : {DEFAULT_HOLDER})</div>
            {dueStr && <div className="pd">납부기한 : {dueStr}까지</div>}
          </div>

          <div className="ft">
            <div>
              <div className="ft-addr">{addr}</div>
              <div className="ft-tel">
                <span>TEL {tel}</span>
                <span>FAX {DEFAULT_FAX}</span>
              </div>
            </div>
            <div className="ft-sign">
              대표세무사&nbsp;<span className="nm">{sign}</span>
            </div>
          </div>
        </div>

        {/* ─── A4 2장 (cust-page2) — Section 2 + Section 3 산출근거 ─── */}
        {showBreakdown && (
          <div className="page">
            <div className="hd">
              <div className="hd-logo">
                <div className="hd-mark" />
                <div>
                  <div className="hd-name">{firm}</div>
                  <div className="hd-sub">TAX STRATEGY &amp; ADVISORY · 산출근거</div>
                </div>
              </div>
              <div className="hd-meta">2장 / Section 2·3 산출근거</div>
            </div>

            <table className="itbl" style={{ marginBottom: '10px' }}>
              <tbody>
                <tr>
                  <th>상 호</th>
                  <td className="b">{dispCompany}</td>
                  <th>귀속</th>
                  <td>{year}년</td>
                </tr>
                <tr>
                  <th>기준 수입금액</th>
                  <td>{W(revenue)}원</td>
                  <th>업종</th>
                  <td>{bizType || '—'}</td>
                </tr>
              </tbody>
            </table>

            {/* 사장님 명령 (2026-05-21): 양식 옵션 자동 + 사장님이 단가 안 적은 (val=0) 행 자동 hide */}
            {s2Visible.length > 0 && (
              <>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
                  📞 Section 2 · 활증업무 산출근거
                </div>
                <table className="dtbl" style={{ marginBottom: '14px' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>항 목</th>
                      <th style={{ textAlign: 'left' }}>산출 내역</th>
                      <th>가산액 (원)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s2Visible.map((it, i) => (
                      <tr key={i}>
                        <td>{it.name}</td>
                        <td>
                          {W(it.val)}원 × {it.qty}건
                        </td>
                        <td>{W(it.val * it.qty)}</td>
                      </tr>
                    ))}
                    <tr className="sub">
                      <td colSpan={2}>Section 2 가산 소계</td>
                      <td>{W(s2Total)}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}

            {s3Visible.length > 0 && (
              <>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
                  📋 Section 3 · 세액공제·감면 가산 산출근거
                </div>
                <table className="dtbl">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>항 목</th>
                      <th style={{ textAlign: 'left' }}>산출 내역</th>
                      <th>가산액 (원)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s3Visible.map((it, i) => {
                      const gain = calcGain(it.amt, it.rule);
                      const ruleLbl =
                        it.rule === 'flat_5'
                          ? 'flat 5%'
                          : 'U자 (500↓20% · 500~1000:10% · 1000↑20%)';
                      return (
                        <tr key={i}>
                          <td>{it.name}</td>
                          <td>
                            {W(it.amt)}원 × {ruleLbl}
                          </td>
                          <td>{W(gain)}</td>
                        </tr>
                      );
                    })}
                    <tr className="sub">
                      <td colSpan={2}>Section 3 가산 소계</td>
                      <td>{W(s3Total)}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="dtbl-note">
                  ※ 가산율 룰: 중특(중소기업특별세액감면) = flat 5% / 그 외 세액공제·감면 = U자(500만↓ 20% · 500만~1000만 10% · 1000만↑ 20%)
                  <br />
                  ※ 자연발생 공제(배당·기장·근로·자녀·연금·의료비·교육비·기부금·표준 등 신고서 본문) = 청구 가산 대상 아님(이 청구서에서 자동 제외됨)
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
