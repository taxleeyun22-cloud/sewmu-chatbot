/**
 * Phase D4-2 (2026-05-21): /admin/billing/new — 새 청구서 발행 page.
 *
 * URL 파라미터 자동 진입:
 *   ?business_id=N — 그 사업장 자동 선택
 *   ?user_id=N — 그 거래처 자동 선택 (매핑 사업장 picker)
 *   ?filing_id=N — 검토표 데이터 자동 prefill
 *
 * 흐름:
 *   1. 사업장/사람 선택 (URL 또는 picker)
 *   2. 최신 검토표 자동 fetch → 수입금액·s3 자동 채움
 *   3. 사장님이 S2 (활증업무) / 할인액 수기 입력
 *   4. 미리보기 갱신
 *   5. "💾 발행" → POST /api/trpc/billing.create → D1 저장 → /admin/billing 로 이동
 *
 * 사장님 룰: 할인액 절대 자동 X — 수기만.
 */
'use client';
export const runtime = 'edge';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';

/* ─── Helper (billing-calc 와 동일 — 후속 packages 분리) ─────────────────── */
function formatWon(n: number | null | undefined): string {
  return (n || 0).toLocaleString('ko-KR');
}
type FeeRuleRow = [number, number, number];
function calcBase(amount: number, tariff: FeeRuleRow[]): number {
  if (!tariff || tariff.length === 0) return 0;
  let row: FeeRuleRow = tariff[0];
  for (let i = 0; i < tariff.length; i++) {
    if (amount >= tariff[i][0]) row = tariff[i];
    else break;
  }
  return Math.floor((row[1] + (amount - row[0]) * ((row[2] || 0) / 100)) / 1000) * 1000;
}
function calcGain(amt: number, rule: 'flat_5' | 'progressive_u' | 'none'): number {
  if (amt <= 0) return 0;
  if (rule === 'flat_5') return Math.floor(amt * 0.05);
  if (rule === 'progressive_u') {
    let g = 0;
    if (amt <= 5_000_000) g = amt * 0.2;
    else if (amt <= 10_000_000) g = amt * 0.1;
    else g = amt * 0.2;
    return Math.floor(g);
  }
  return 0;
}

/* 기본 누진표 (Template 미저장 시 fallback) */
const DEFAULT_CORP: FeeRuleRow[] = [
  [0, 300_000, 0],
  [500_000_000, 500_000, 0.05],
  [1_000_000_000, 800_000, 0.1],
];
const DEFAULT_INDV: FeeRuleRow[] = [
  [0, 200_000, 0],
  [300_000_000, 400_000, 0.05],
];

interface S2Item {
  name: string;
  val: number;
  qty: number;
}
interface S3Item {
  code: string;
  name: string;
  amt: number;
  rule: 'flat_5' | 'progressive_u' | 'none';
}

interface BusinessRow {
  id: number;
  company_name: string | null;
  company_form: string | null;
  tax_type: string | null;
  ceo_name: string | null;
  business_number: string | null;
}

export default function NewInvoicePage() {
  const router = useRouter();
  const sp = useSearchParams();
  const preBizId = Number(sp.get('business_id') || 0);
  const preUserId = Number(sp.get('user_id') || 0);
  const preFilingId = Number(sp.get('filing_id') || 0);

  /* Form state */
  const [bizId, setBizId] = useState<number>(preBizId);
  const [userId, setUserId] = useState<number>(preUserId);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [taxType, setTaxType] = useState<'법인세' | '종소세' | '부가세'>('법인세');
  const [basicType, setBasicType] = useState<string>('법인장부대행 및 법인조정');
  const [revenue, setRevenue] = useState<number>(0);
  const [asset, setAsset] = useState<number>(0);
  const [bizType, setBizType] = useState<string>('제조');
  const [discount, setDiscount] = useState<string>(''); // 빈 칸 default — 사장님 룰
  const [s2Items, setS2Items] = useState<S2Item[]>([]);
  const [s3Items, setS3Items] = useState<S3Item[]>([]);
  const [note, setNote] = useState<string>('');

  /* 사업장 단건 fetch (URL ?business_id=N 또는 picker 선택 후) */
  const bizQuery = useQuery<{ businesses: BusinessRow[] }>({
    queryKey: ['businesses.list', { limit: 1000 }],
    queryFn: () => trpcCall('businesses.list', { limit: 1000, status: 'active' }),
  });
  const allBiz = bizQuery.data?.businesses ?? [];
  const selectedBiz = allBiz.find((b) => b.id === bizId) || null;

  /* taxType 자동 결정 (사업장 form 기반) */
  useEffect(() => {
    if (!selectedBiz) return;
    const form = selectedBiz.company_form;
    const isCorp = form === '법인' || form === 'corp' || /\(주\)|㈜|주식회사/.test(selectedBiz.company_name || '');
    setTaxType(isCorp ? '법인세' : '종소세');
    setBasicType(isCorp ? '법인장부대행 및 법인조정' : '개인장부대행 및 개인조정');
  }, [selectedBiz]);

  /* 검토표 자동 prefill (사업장 선택 시 → 최신 filing) */
  const filingQuery = useQuery<{ filings: Array<{ id: number; type: string; fiscal_year: number; auto_fields: string | null }> }>({
    queryKey: ['filings.list', { owner_type: 'Business', owner_id: bizId }],
    queryFn: () =>
      trpcCall('filings.list', { owner_type: 'Business', owner_id: bizId, limit: 50 }),
    enabled: bizId > 0,
  });
  useEffect(() => {
    if (!filingQuery.data) return;
    const filings = filingQuery.data.filings || [];
    const matched = filings
      .filter((f) => f.type === taxType)
      .sort((a, b) => (b.fiscal_year || 0) - (a.fiscal_year || 0));
    if (!matched.length) return;
    const latest = matched[0];
    let af: Record<string, unknown> = {};
    try {
      af = JSON.parse(latest.auto_fields || '{}');
    } catch {}
    if (af.revenue) setRevenue(Number(af.revenue));
    if (af.asset) setAsset(Number(af.asset));
    if (latest.fiscal_year) setYear(latest.fiscal_year);
    if (af.업종 || af.industry) setBizType(String(af.업종 || af.industry));
    /* deductions → s3_items (billable filter 는 카탈로그 매칭 필요 — 후속 D4-3 에서 보강) */
    const dedList = (af.deductions || af.공제감면) as Array<{ code?: string; name?: string; amount?: number; 금액?: number }> | undefined;
    if (Array.isArray(dedList)) {
      const items: S3Item[] = dedList
        .filter((d) => d.code)
        .map((d) => ({
          code: d.code!,
          name: d.name || d.code!,
          amt: Number(d.amount || d.금액 || 0),
          rule: d.code === '112' || d.code === 'JTL_7' ? 'flat_5' : 'progressive_u',
        }));
      setS3Items(items);
    }
  }, [filingQuery.data, taxType]);

  /* 금액 계산 (실시간) */
  const calc = useMemo(() => {
    const tariff = taxType === '법인세' ? DEFAULT_CORP : DEFAULT_INDV;
    const baseRev = Math.max(revenue, asset);
    const base = calcBase(baseRev, tariff);
    const ket = basicType.includes('장부') ? Math.floor((base * 0.2) / 1000) * 1000 : 0;
    const cst = base > 0 ? Math.floor(((base + ket) * 0.1) / 1000) * 1000 : 0;
    const s2Tot = s2Items.reduce((a, it) => a + it.val * it.qty, 0);
    const s3Tot = s3Items.reduce((a, it) => a + calcGain(it.amt, it.rule), 0);
    const extra = s2Tot + s3Tot;
    const supply = base + ket + cst + extra;
    const disc = parseFloat(discount) || 0;
    const supplyDisc = Math.max(0, supply - disc);
    const vat = Math.round(supplyDisc * 0.1);
    const total = supplyDisc + vat;
    return { base, ket, cst, s2Tot, s3Tot, extra, supply, supplyDisc, vat, total, disc };
  }, [revenue, asset, taxType, basicType, s2Items, s3Items, discount]);

  /* Publish — POST tRPC billing.create */
  const publishMut = useMutation({
    mutationFn: () =>
      trpcCall<{ ok: boolean; id?: number }>('billing.create', {
        business_id: bizId || undefined,
        user_id: userId || undefined,
        filing_id: preFilingId || undefined,
        year,
        tax_type: taxType,
        revenue,
        asset,
        biz_type: bizType,
        basic_type: basicType,
        base_fee: calc.base,
        s2_addition: calc.s2Tot,
        s3_addition: calc.s3Tot,
        discount: calc.disc,
        total_fee: calc.total,
        s2_items: s2Items,
        s3_items: s3Items,
        staff_override: false,
        note: note || undefined,
      }),
    onSuccess: (d) => {
      if (d.ok) {
        router.push('/admin/billing');
      }
    },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 좌측 — 입력 폼 */}
      <section className="space-y-4">
        {/* 사업장 선택 */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            🏢 사업장 선택
          </label>
          <select
            value={bizId || ''}
            onChange={(e) => setBizId(Number(e.target.value) || 0)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white"
          >
            <option value="">— 선택 —</option>
            {allBiz.map((b) => (
              <option key={b.id} value={b.id}>
                {b.company_name} ({b.tax_type || (/\(주\)|㈜|주식회사/.test(b.company_name || '') ? '법인' : '개인')})
              </option>
            ))}
          </select>
          {selectedBiz && (
            <div className="mt-2 text-xs text-gray-500">
              {selectedBiz.ceo_name && `대표 ${selectedBiz.ceo_name}`}
              {selectedBiz.business_number && ` · 사업자번호 ${selectedBiz.business_number}`}
            </div>
          )}
        </div>

        {/* 발행 입력 */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold text-gray-900">💰 발행 입력</span>
            {filingQuery.data && filingQuery.data.filings.length > 0 && (
              <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">
                ✅ 검토표 자동 prefill
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="귀속연도">
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="세금구분">
              <select
                value={taxType}
                onChange={(e) => setTaxType(e.target.value as '법인세' | '종소세' | '부가세')}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
              >
                <option>법인세</option>
                <option>종소세</option>
                <option>부가세</option>
              </select>
            </Field>
            <Field label="업무구분">
              <select
                value={basicType}
                onChange={(e) => setBasicType(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
              >
                <option>법인장부대행 및 법인조정</option>
                <option>법인조정</option>
                <option>개인장부대행 및 개인조정</option>
                <option>개인조정</option>
              </select>
            </Field>
            <Field label="업종">
              <select
                value={bizType}
                onChange={(e) => setBizType(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
              >
                {['제조', '도소매업', '건설', '운수', '금융보험업', '부동산임대', '전문과학기술', '교육서비스', '보건의료', '개인서비스', '기타'].map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
            <Field label="수입금액 (원)">
              <input
                type="number"
                value={revenue}
                onChange={(e) => setRevenue(Number(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="자산총액 (원)">
              <input
                type="number"
                value={asset}
                onChange={(e) => setAsset(Number(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
            </Field>
          </div>
        </div>

        {/* Section 2 — 활증업무 */}
        <SectionEditor
          title="📞 Section 2 — 활증업무"
          items={s2Items}
          onAdd={() => {
            const name = window.prompt('항목명:');
            if (!name) return;
            const val = Number(window.prompt('단가 (원):') || '0');
            const qty = Number(window.prompt('건수:', '1') || '1');
            if (val <= 0) return;
            setS2Items([...s2Items, { name, val, qty }]);
          }}
          onRemove={(i) => setS2Items(s2Items.filter((_, idx) => idx !== i))}
          renderRow={(it, i) => (
            <>
              <td className="px-2 py-1.5 text-sm">{it.name}</td>
              <td className="px-2 py-1.5 text-sm text-right">{formatWon(it.val)}원</td>
              <td className="px-2 py-1.5 text-sm text-right">{it.qty}</td>
              <td className="px-2 py-1.5 text-sm text-right font-semibold">
                {formatWon(it.val * it.qty)}원
              </td>
            </>
          )}
          headers={['항목', '단가', '건수', '가산액']}
        />

        {/* Section 3 — 세액공제·감면 */}
        <SectionEditor
          title="💸 Section 3 — 세액공제·감면"
          items={s3Items}
          onAdd={() => {
            const code = window.prompt('카탈로그 code (예: 112 — 중특):');
            if (!code) return;
            const name = window.prompt('이름:') || code;
            const amt = Number(window.prompt('감면액 (원):') || '0');
            if (amt <= 0) return;
            const ruleInput = window.prompt('가산룰 (flat_5 또는 progressive_u):', 'progressive_u');
            const rule = (ruleInput === 'flat_5' ? 'flat_5' : 'progressive_u') as 'flat_5' | 'progressive_u';
            setS3Items([...s3Items, { code, name, amt, rule }]);
          }}
          onRemove={(i) => setS3Items(s3Items.filter((_, idx) => idx !== i))}
          renderRow={(it, i) => {
            const gain = calcGain(it.amt, it.rule);
            return (
              <>
                <td className="px-2 py-1.5 text-sm">{it.name}</td>
                <td className="px-2 py-1.5 text-sm text-right">{formatWon(it.amt)}원</td>
                <td className="px-2 py-1.5 text-xs">
                  {it.rule === 'flat_5' ? '5%' : 'U자'}
                </td>
                <td className="px-2 py-1.5 text-sm text-right font-semibold text-blue-700">
                  {formatWon(gain)}원
                </td>
              </>
            );
          }}
          headers={['항목', '감면액', '룰', '가산액']}
        />

        {/* 할인액 — 사장님 룰: 수기 */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <label className="block text-xs font-bold text-amber-900 mb-1.5">
            ✏️ 할인액 (수기 입력 — 자동화 절대 X)
          </label>
          <input
            type="number"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            placeholder="비워두면 청구서에 표시 X"
            className="w-full border border-amber-300 rounded px-2 py-1.5 text-sm bg-white"
          />
          <div className="text-xs text-amber-900 mt-1">
            📝 수입금액·공제감면은 검토표 자동 prefill, 할인액만 사장님 수기.
          </div>
        </div>

        {/* 비고 */}
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">📝 비고</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            placeholder="옵션 — 청구서 메모"
          />
        </div>

        {/* 발행 버튼 */}
        <div className="flex items-center gap-3 sticky bottom-4 bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
          <Link
            href="/admin/billing"
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            ← 취소
          </Link>
          <button
            type="button"
            onClick={() => publishMut.mutate()}
            disabled={!bizId || publishMut.isPending}
            className="ml-auto bg-blue-600 text-white px-6 py-2 rounded font-bold text-sm hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {publishMut.isPending ? '발행 중…' : `💾 발행 (${formatWon(calc.total)}원)`}
          </button>
        </div>
        {publishMut.isError && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
            ⚠️ 발행 실패: {(publishMut.error as Error).message}
          </div>
        )}
      </section>

      {/* 우측 — 청구서 미리보기 */}
      <section className="lg:sticky lg:top-20 lg:self-start space-y-3">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="border-b border-gray-200 px-4 py-2 text-xs text-gray-500 font-semibold">
            📄 청구서 미리보기
          </div>
          <div className="p-6 space-y-4">
            <div>
              <div className="text-lg font-bold text-gray-900">세무회계 이윤</div>
              <div className="text-xs text-gray-500">TAX STRATEGY & ADVISORY</div>
            </div>
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="py-1 text-gray-500 w-20">수신</td>
                  <td className="py-1 font-semibold">{selectedBiz?.company_name || '(거래처 미선택)'} 대표이사 귀하</td>
                </tr>
                <tr>
                  <td className="py-1 text-gray-500">귀속</td>
                  <td className="py-1">{year}년</td>
                </tr>
                <tr>
                  <td className="py-1 text-gray-500">제목</td>
                  <td className="py-1 font-semibold">
                    {year}년 귀속 {taxType} 신고 및 세무조정 수수료 청구의 건
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="space-y-2 border-t border-gray-200 pt-4">
              <Row label="산출기준 수입금액" value={revenue ? `${formatWon(revenue)}원` : '—'} />
              <Row label="기본 세무조정료" value={calc.base ? `${formatWon(calc.base + calc.ket + calc.cst)}원` : '—'} />
              <Row label="추가 용역 소계" value={calc.extra ? `${formatWon(calc.extra)}원` : '—'} />
              {calc.disc > 0 && (
                <Row label="▼ 할인액" value={`▼ ${formatWon(calc.disc)}원`} muted />
              )}
              <div className="flex items-center justify-between border-t border-gray-200 pt-3 font-bold">
                <span>최종 청구 (VAT 포함)</span>
                <span className="text-lg text-blue-700">{formatWon(calc.total)}원</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ─── 작은 컴포넌트 ─────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-sm ${muted ? 'text-gray-500' : ''}`}>
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function SectionEditor<T>({
  title,
  items,
  onAdd,
  onRemove,
  renderRow,
  headers,
}: {
  title: string;
  items: T[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  renderRow: (it: T, i: number) => React.ReactNode;
  headers: string[];
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex items-center mb-2">
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        <span className="ml-2 text-xs text-gray-500">({items.length})</span>
        <button
          type="button"
          onClick={onAdd}
          className="ml-auto text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
        >
          + 항목
        </button>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-3">
          + 항목으로 추가
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-xs text-gray-600">
              {headers.map((h, i) => (
                <th key={i} className="px-2 py-1.5 font-medium text-left">
                  {h}
                </th>
              ))}
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-t border-gray-100">
                {renderRow(it, i)}
                <td className="text-center">
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    className="text-red-600 hover:bg-red-50 px-1 rounded text-xs"
                    title="삭제"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
