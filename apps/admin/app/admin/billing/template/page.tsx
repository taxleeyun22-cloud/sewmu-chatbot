/**
 * Phase D4-3 (2026-05-21): /admin/billing/template — 청구서 양식 (Template SSoT).
 *
 * 단일 row (id=1) — 모든 청구서가 이 양식 참조.
 * 사장님 명령: "처음에 설정하면 전체 세팅, 개개인 인보이스는 거기서 삭제 가능".
 *
 * 필드:
 *   - 인삿말 / 계좌 정보 / 사무실 주소·전화 / 서명
 *   - 누진표 (개인 / 법인) — [임계, 기본보수, 가산률%] rows
 */
'use client';
export const runtime = 'edge';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { InvoicePreview } from '@/components/billing/InvoicePreview';

/* 누진표 계산 (preview 용) — new/page.tsx 의 calcBase 와 동일 */
function calcBase(amount: number, tariff: TariffRow[]): number {
  if (!tariff || tariff.length === 0) return 0;
  let row: TariffRow = tariff[0];
  for (let i = 0; i < tariff.length; i++) {
    if (amount >= tariff[i][0]) row = tariff[i];
    else break;
  }
  return Math.floor((row[1] + (amount - row[0]) * ((row[2] || 0) / 100)) / 1000) * 1000;
}

/* sample 미리보기 데이터 — billing-preview.html "SAMPLE" 와 동일 톤 */
const SAMPLE_REV_CORP = 500_000_000; // 5억
const SAMPLE_REV_INDV = 300_000_000; // 3억

type TariffRow = [number, number, number];

interface S2Option {
  name: string;
  type: 'unit' | 'rate' | 'direct';
  val: number;
  desc?: string;
}

interface FeeRule {
  tariff: TariffRow[];
  s2_options?: S2Option[];
}

interface TemplateData {
  greeting?: string;
  bank_info?: string;
  office_address?: string;
  office_phone?: string;
  signature_text?: string;
  fee_rule_indv?: FeeRule;
  fee_rule_corp?: FeeRule;
}

const DEFAULT_CORP: TariffRow[] = [
  [0, 300_000, 0],
  [500_000_000, 500_000, 0.05],
  [1_000_000_000, 800_000, 0.1],
];
const DEFAULT_INDV: TariffRow[] = [
  [0, 200_000, 0],
  [300_000_000, 400_000, 0.05],
];

/* 사장님 명령 (2026-05-21): "개인은 근로소득 합산 추가" — default 활증업무 옵션. */
const DEFAULT_S2_CORP: S2Option[] = [
  { name: '신용카드 내역 검토', type: 'direct', val: 0, desc: '직접 입력' },
  { name: '4대보험 취득·상실', type: 'unit', val: 10_000, desc: '건당' },
  { name: '연말정산', type: 'unit', val: 20_000, desc: '인당' },
  { name: '부가세 수정신고', type: 'unit', val: 50_000, desc: '건당' },
];
const DEFAULT_S2_INDV: S2Option[] = [
  { name: '근로소득 합산', type: 'direct', val: 0, desc: '근로소득 합산 신고 시' },
  { name: '신용카드 내역 검토', type: 'direct', val: 0, desc: '직접 입력' },
  { name: '4대보험 (자영업자)', type: 'unit', val: 10_000, desc: '건당' },
  { name: '프리랜서 인적용역', type: 'unit', val: 30_000, desc: '건당' },
];

export default function TemplatePage() {
  const { data, isLoading, refetch } = useQuery<{ template: TemplateData | null }>({
    queryKey: ['billing.templateGet'],
    queryFn: () => trpcCall('billing.templateGet'),
  });

  const [greeting, setGreeting] = useState('');
  const [bankInfo, setBankInfo] = useState('');
  const [officeAddress, setOfficeAddress] = useState('');
  const [officePhone, setOfficePhone] = useState('');
  const [signatureText, setSignatureText] = useState('세무사 이재윤');
  const [tariffCorp, setTariffCorp] = useState<TariffRow[]>(DEFAULT_CORP);
  const [tariffIndv, setTariffIndv] = useState<TariffRow[]>(DEFAULT_INDV);
  const [s2OptionsCorp, setS2OptionsCorp] = useState<S2Option[]>(DEFAULT_S2_CORP);
  const [s2OptionsIndv, setS2OptionsIndv] = useState<S2Option[]>(DEFAULT_S2_INDV);
  const [activeTab, setActiveTab] = useState<'corp' | 'indv'>('corp');

  /* 양식 fetch → state 채움 */
  useEffect(() => {
    if (!data?.template) return;
    const t = data.template;
    setGreeting(t.greeting || '');
    setBankInfo(t.bank_info || '');
    setOfficeAddress(t.office_address || '');
    setOfficePhone(t.office_phone || '');
    setSignatureText(t.signature_text || '세무사 이재윤');
    if (t.fee_rule_corp?.tariff) setTariffCorp(t.fee_rule_corp.tariff);
    if (t.fee_rule_indv?.tariff) setTariffIndv(t.fee_rule_indv.tariff);
    if (t.fee_rule_corp?.s2_options) setS2OptionsCorp(t.fee_rule_corp.s2_options);
    if (t.fee_rule_indv?.s2_options) setS2OptionsIndv(t.fee_rule_indv.s2_options);
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () =>
      trpcCall<{ ok: boolean }>('billing.templateSave', {
        greeting,
        bank_info: bankInfo,
        office_address: officeAddress,
        office_phone: officePhone,
        signature_text: signatureText,
        fee_rule_corp: { tariff: tariffCorp, s2_options: s2OptionsCorp },
        fee_rule_indv: { tariff: tariffIndv, s2_options: s2OptionsIndv },
      }),
    onSuccess: () => refetch(),
  });

  const tariff = activeTab === 'corp' ? tariffCorp : tariffIndv;
  const setTariff = activeTab === 'corp' ? setTariffCorp : setTariffIndv;
  const s2Options = activeTab === 'corp' ? s2OptionsCorp : s2OptionsIndv;
  const setS2Options = activeTab === 'corp' ? setS2OptionsCorp : setS2OptionsIndv;

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-500">
        양식 로드 중…
      </div>
    );
  }

  /* sample 미리보기 계산 — 현재 form 의 누진표·인삿말·계좌·서명 즉시 반영 */
  const previewTaxType = activeTab === 'corp' ? '법인세' : '종소세';
  const sampleRev = activeTab === 'corp' ? SAMPLE_REV_CORP : SAMPLE_REV_INDV;
  const sampleBase = calcBase(sampleRev, tariff);
  const sampleKet = Math.floor((sampleBase * 0.2) / 1000) * 1000; // 결산 20%
  const sampleCst = sampleBase > 0 ? Math.floor(((sampleBase + sampleKet) * 0.1) / 1000) * 1000 : 0; // 원가 10%
  const sampleBaseFee = sampleBase + sampleKet + sampleCst;
  const sampleTotal = Math.round(sampleBaseFee * 1.1); // VAT 10%

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
        💡 청구서 양식 = 모든 청구서의 기본 룰. 인삿말·계좌·누진표는 여기서 한 번 설정 →
        전체 청구서 자동 반영. 개별 청구서에서 거래처별 입력 (수입금액·할인·메모 등) 만 다르게.
      </div>

      {/* 사장님 명령 (2026-05-21): "프리뷰랑 왤케 다른건데" — billing-preview.html 처럼
          좌측 form + 우측 A4 sample 미리보기 split. 실시간 반영. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 좌측 — 입력 폼 */}
        <div className="space-y-4">

      {/* 기본 정보 */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-900">📋 기본 정보</h2>
        <Field label="인삿말 (청구서 본문 위)">
          <textarea
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            placeholder="예: 평소 깊은 신뢰를 보내주시는 OO대표님께 진심으로 감사드립니다..."
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="계좌 정보">
            <input
              value={bankInfo}
              onChange={(e) => setBankInfo(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              placeholder="예: 하나은행 010-5531-7625 (예금주 세무사 이채윤 사무소)"
            />
          </Field>
          <Field label="서명">
            <input
              value={signatureText}
              onChange={(e) => setSignatureText(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              placeholder="세무사 이재윤"
            />
          </Field>
          <Field label="사무실 주소">
            <input
              value={officeAddress}
              onChange={(e) => setOfficeAddress(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              placeholder="예: 42633 대구광역시 달서구 학산로 221 4층"
            />
          </Field>
          <Field label="사무실 전화">
            <input
              value={officePhone}
              onChange={(e) => setOfficePhone(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              placeholder="예: TEL (053) 269-1213"
            />
          </Field>
        </div>
      </section>

      {/* 누진표 */}
      <section className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center mb-3">
          <h2 className="text-sm font-bold text-gray-900">💰 누진표 (세무조정 기본보수)</h2>
          <div className="ml-auto flex gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('corp')}
              className={`px-3 py-1 rounded text-xs font-semibold ${
                activeTab === 'corp' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
              }`}
            >
              🏢 법인
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('indv')}
              className={`px-3 py-1 rounded text-xs font-semibold ${
                activeTab === 'indv' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
              }`}
            >
              👤 개인
            </button>
          </div>
        </div>
        <div className="text-xs text-gray-500 mb-2">
          수입금액 임계 이상 시 → 기본보수 + (초과 × 가산률%) 적용. 1,000원 단위 절사.
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-xs text-gray-600">
              <th className="px-2 py-1.5 text-left font-medium">수입금액 임계 (백만원)</th>
              <th className="px-2 py-1.5 text-left font-medium">기본보수 (원)</th>
              <th className="px-2 py-1.5 text-left font-medium">가산률 (%)</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {tariff.map((row, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    value={row[0] / 1_000_000}
                    onChange={(e) => {
                      const v = Number(e.target.value) * 1_000_000;
                      const newTariff = [...tariff];
                      newTariff[i] = [v, row[1], row[2]];
                      setTariff(newTariff);
                    }}
                    className="w-32 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    value={row[1]}
                    onChange={(e) => {
                      const newTariff = [...tariff];
                      newTariff[i] = [row[0], Number(e.target.value), row[2]];
                      setTariff(newTariff);
                    }}
                    className="w-32 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    value={row[2]}
                    onChange={(e) => {
                      const newTariff = [...tariff];
                      newTariff[i] = [row[0], row[1], Number(e.target.value)];
                      setTariff(newTariff);
                    }}
                    className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => setTariff(tariff.filter((_, idx) => idx !== i))}
                    className="text-red-600 hover:bg-red-50 px-1 rounded text-xs"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          onClick={() => setTariff([...tariff, [0, 0, 0]])}
          className="mt-2 text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
        >
          + 구간 추가
        </button>
      </section>

      {/* 활증업무 옵션 — 사장님 명령 (2026-05-21) */}
      <section className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center mb-3">
          <h2 className="text-sm font-bold text-gray-900">
            📞 활증업무 옵션 ({activeTab === 'corp' ? '법인' : '개인'})
          </h2>
          <span className="ml-2 text-xs text-gray-500">— 청구서 발행 시 빠른 선택</span>
        </div>
        <div className="text-xs text-gray-500 mb-2">
          예: 개인은 "근로소득 합산" / "프리랜서 인적용역" 등 자주 쓰는 항목 등록 →
          /admin/billing/new 의 S2 Picker 에서 빠른 선택 + 단가 자동 prefill.
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-xs text-gray-600">
              <th className="px-2 py-1.5 text-left font-medium">항목명</th>
              <th className="px-2 py-1.5 text-left font-medium w-24">기준</th>
              <th className="px-2 py-1.5 text-left font-medium w-32">값 (원/%)</th>
              <th className="px-2 py-1.5 text-left font-medium">설명</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {s2Options.map((opt, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-2 py-1.5">
                  <input
                    value={opt.name}
                    onChange={(e) => {
                      const newOpts = [...s2Options];
                      newOpts[i] = { ...opt, name: e.target.value };
                      setS2Options(newOpts);
                    }}
                    placeholder="예: 근로소득 합산"
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <select
                    value={opt.type}
                    onChange={(e) => {
                      const newOpts = [...s2Options];
                      newOpts[i] = { ...opt, type: e.target.value as 'unit' | 'rate' | 'direct' };
                      setS2Options(newOpts);
                    }}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                  >
                    <option value="unit">건당</option>
                    <option value="rate">기본보수 × %</option>
                    <option value="direct">직접 입력</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    step={opt.type === 'rate' ? '0.01' : '1'}
                    value={opt.val}
                    onChange={(e) => {
                      const newOpts = [...s2Options];
                      newOpts[i] = { ...opt, val: Number(e.target.value) };
                      setS2Options(newOpts);
                    }}
                    placeholder={opt.type === 'rate' ? '예: 20 (%)' : '예: 10000'}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={opt.desc || ''}
                    onChange={(e) => {
                      const newOpts = [...s2Options];
                      newOpts[i] = { ...opt, desc: e.target.value };
                      setS2Options(newOpts);
                    }}
                    placeholder="설명 (옵션)"
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => setS2Options(s2Options.filter((_, idx) => idx !== i))}
                    className="text-red-600 hover:bg-red-50 px-1 rounded text-xs"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          onClick={() =>
            setS2Options([
              ...s2Options,
              { name: '', type: 'unit', val: 0, desc: '' },
            ])
          }
          className="mt-2 text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
        >
          + 활증업무 항목 추가
        </button>
      </section>

      {/* 저장 버튼 */}
      <div className="flex items-center gap-3 sticky bottom-4 bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
        <span className="text-xs text-gray-500">
          ⚠️ 변경 시 새 청구서부터 즉시 반영 (기존 청구서는 그대로).
        </span>
        <button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="ml-auto bg-blue-600 text-white px-6 py-2 rounded font-bold text-sm hover:bg-blue-700 disabled:bg-gray-300"
        >
          {saveMut.isPending ? '저장 중…' : saveMut.isSuccess ? '✅ 저장됨' : '💾 양식 저장'}
        </button>
      </div>
      {saveMut.isError && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
          ⚠️ 저장 실패: {(saveMut.error as Error).message}
        </div>
      )}

        </div>
        {/* 우측 — A4 sample 미리보기 (sticky) */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900 mb-3">
            📄 <b>SAMPLE 미리보기</b> — 양식이 어떻게 보일지. 거래처 데이터는 발행 시 결정.
            <span className="ml-2 text-amber-700">(수입 {(sampleRev / 100_000_000).toFixed(1)}억 기준 — {activeTab === 'corp' ? '법인' : '개인'})</span>
          </div>
          <InvoicePreview
            companyName="(샘플 거래처)"
            ceoName="홍 길 동"
            year={new Date().getFullYear()}
            taxType={previewTaxType}
            bizType="제조"
            revenue={sampleRev}
            baseFee={sampleBaseFee}
            s2Total={0}
            s3Total={0}
            discount={0}
            total={sampleTotal}
            s2Items={[]}
            s3Items={[]}
            template={{
              greeting,
              bank_info: bankInfo,
              office_address: officeAddress,
              office_phone: officePhone,
              signature_text: signatureText,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
