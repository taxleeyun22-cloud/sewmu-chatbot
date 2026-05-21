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
import { S2PickerModal, type S2Item as S2ItemType } from '@/components/billing/S2PickerModal';
import { S3PickerModal, type S3Item as S3ItemType } from '@/components/billing/S3PickerModal';
import { InvoicePreview } from '@/components/billing/InvoicePreview';
import { BusinessCombobox } from '@/components/billing/BusinessCombobox';

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

interface CatalogItem {
  code: string;
  name: string;
  billable?: boolean;
  rule?: 'flat_5' | 'progressive_u' | 'none';
  category?: string;
}

interface TemplateData {
  greeting?: string;
  bank_info?: string;
  office_address?: string;
  office_phone?: string;
  signature_text?: string;
  firm_name?: string;
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
  const [s2ModalOpen, setS2ModalOpen] = useState(false);
  const [s3ModalOpen, setS3ModalOpen] = useState(false);
  const [note, setNote] = useState<string>('');

  /* 사업장 단건 fetch (URL ?business_id=N 또는 picker 선택 후) */
  const bizQuery = useQuery<{ businesses: BusinessRow[] }>({
    queryKey: ['businesses.list', { limit: 1000 }],
    queryFn: () => trpcCall('businesses.list', { limit: 1000, status: 'active' }),
  });
  const allBiz = bizQuery.data?.businesses ?? [];
  const selectedBiz = allBiz.find((b) => b.id === bizId) || null;

  /* 양식 (Template) — 인삿말 / 계좌 / 사무실 / 서명 미리보기 prefill */
  const templateQuery = useQuery<{ template: TemplateData | null }>({
    queryKey: ['billing.templateGet'],
    queryFn: () => trpcCall('billing.templateGet'),
  });
  const template = templateQuery.data?.template || null;

  /* 카탈로그 fetch — billable filter 용 (검토표 자동 prefill 시 신고서 본문 자연발생 자동 제외) */
  const catalogQuery = useQuery<CatalogItem[]>({
    queryKey: ['filing-tax-credit-catalog'],
    queryFn: async () => {
      const r = await fetch('/filing-tax-credit-catalog.json', { cache: 'force-cache' });
      if (!r.ok) return [];
      const j = (await r.json()) as CatalogItem[] | { items?: CatalogItem[]; catalog?: CatalogItem[] };
      if (Array.isArray(j)) return j;
      return j.items || j.catalog || [];
    },
    staleTime: 60 * 60 * 1000,
  });
  const catalog = catalogQuery.data || [];

  /* taxType 자동 결정 (사업장 form 기반) */
  useEffect(() => {
    if (!selectedBiz) return;
    const form = selectedBiz.company_form;
    const isCorp = form === '법인' || form === 'corp' || /\(주\)|㈜|주식회사/.test(selectedBiz.company_name || '');
    setTaxType(isCorp ? '법인세' : '종소세');
    setBasicType(isCorp ? '법인장부대행 및 법인조정' : '개인장부대행 및 개인조정');
  }, [selectedBiz]);

  /* 검토표 자동 prefill — Business owner_type 우선, 없으면 Person fallback (개인사업자 종소세).
   * 사장님 명령 (2026-05-21): "자동으로 검토표 연동안되노?"
   * → billing-preview.js 의 prefillFromFiling 패턴 그대로 (Business → Person 폴백). */
  const filingBizQuery = useQuery<{ filings: Array<{ id: number; type: string; fiscal_year: number; auto_fields: string | null }> }>({
    queryKey: ['filings.list', { owner_type: 'Business', owner_id: bizId }],
    queryFn: () =>
      trpcCall('filings.list', { owner_type: 'Business', owner_id: bizId, limit: 50 }),
    enabled: bizId > 0,
  });
  /* Person fallback — userId 있고 종소세일 때만 시도 (개인사업자 패턴) */
  const filingPersonQuery = useQuery<{ filings: Array<{ id: number; type: string; fiscal_year: number; auto_fields: string | null }> }>({
    queryKey: ['filings.list', { owner_type: 'Person', owner_id: userId }],
    queryFn: () =>
      trpcCall('filings.list', { owner_type: 'Person', owner_id: userId, limit: 50 }),
    enabled: userId > 0 && taxType === '종소세',
  });

  /* 통합 filings — Business 우선, 없거나 종소세인데 비었으면 Person 추가 */
  const allFilings = useMemo(() => {
    const biz = filingBizQuery.data?.filings || [];
    const per = filingPersonQuery.data?.filings || [];
    /* 중복 제거 (id 기준) */
    const seen = new Set<number>();
    return [...biz, ...per].filter((f) => {
      if (seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
  }, [filingBizQuery.data, filingPersonQuery.data]);

  useEffect(() => {
    if (!allFilings.length) return;
    const matched = allFilings
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
    /* deductions → s3_items — 카탈로그 매칭해서 billable=true 만 자동 추가 (신고서 본문 자연발생 자동 제외) */
    const dedList = (af.deductions || af.공제감면) as Array<{ code?: string; name?: string; amount?: number; 금액?: number }> | undefined;
    if (Array.isArray(dedList)) {
      const items: S3Item[] = dedList
        .filter((d) => d.code)
        .filter((d) => {
          if (!catalog.length) return true; // 카탈로그 미로딩 시 일단 통과 — 사장님 수기 삭제 가능
          const cat = catalog.find((c) => c.code === d.code);
          /* billable=false (신고서 본문 자연발생) 자동 제외. billable 미정의면 true 로 fallback */
          return cat ? cat.billable !== false : true;
        })
        .map((d) => {
          const cat = catalog.find((c) => c.code === d.code);
          const rule = cat?.rule || (d.code === '112' || d.code === 'JTL_7' ? 'flat_5' : 'progressive_u');
          return {
            code: d.code!,
            name: d.name || cat?.name || d.code!,
            amt: Number(d.amount || d.금액 || 0),
            rule,
          };
        });
      setS3Items(items);
    }
  }, [allFilings, taxType, catalog]);

  /* 검토표 prefill 상태 메시지 */
  const filingPrefillActive = allFilings.some((f) => f.type === taxType);

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
        {/* 사업장 선택 — 사장님 명령 (2026-05-21): "글로좀 치는거도 나와야지" — typeahead 검색 */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            🏢 사업장 선택
            <span className="ml-2 text-xs text-gray-400 font-normal">
              ({allBiz.length}개 — 회사명·사업자번호·대표자 검색)
            </span>
          </label>
          <BusinessCombobox
            businesses={allBiz}
            selectedId={bizId}
            onChange={setBizId}
            isLoading={bizQuery.isLoading}
          />
        </div>

        {/* 발행 입력 */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold text-gray-900">💰 발행 입력</span>
            {filingPrefillActive ? (
              <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">
                ✅ 검토표 자동 prefill
              </span>
            ) : bizId > 0 ? (
              <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                🔍 {taxType} 검토표 없음 — 수기 입력
              </span>
            ) : null}
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
          onAdd={() => setS2ModalOpen(true)}
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
          onAdd={() => setS3ModalOpen(true)}
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

      {/* 우측 — A4 청구서 미리보기 (billing-preview.html 톤) */}
      <section className="lg:sticky lg:top-20 lg:self-start space-y-3">
        <InvoicePreview
          companyName={selectedBiz?.company_name}
          ceoName={selectedBiz?.ceo_name}
          year={year}
          taxType={taxType}
          bizType={bizType}
          revenue={revenue}
          baseFee={calc.base + calc.ket + calc.cst}
          s2Total={calc.s2Tot}
          s3Total={calc.s3Tot}
          discount={calc.disc}
          total={calc.total}
          s2Items={s2Items}
          s3Items={s3Items}
          template={template}
        />
      </section>

      {/* S2/S3 Picker 모달 — Phase D4-4 (2026-05-21) */}
      <S2PickerModal
        open={s2ModalOpen}
        onClose={() => setS2ModalOpen(false)}
        onAdd={(item: S2ItemType) => setS2Items([...s2Items, item])}
        form={taxType === '법인세' ? 'corp' : 'indv'}
        base={calc.base}
      />
      <S3PickerModal
        open={s3ModalOpen}
        onClose={() => setS3ModalOpen(false)}
        onAdd={(item: S3ItemType) => setS3Items([...s3Items, { ...item, rule: item.rule === 'none' ? 'progressive_u' : item.rule }])}
      />
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
