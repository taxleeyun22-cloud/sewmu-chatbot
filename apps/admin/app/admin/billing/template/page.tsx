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

type TariffRow = [number, number, number];

interface TemplateData {
  greeting?: string;
  bank_info?: string;
  office_address?: string;
  office_phone?: string;
  signature_text?: string;
  fee_rule_indv?: { tariff: TariffRow[] };
  fee_rule_corp?: { tariff: TariffRow[] };
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
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () =>
      trpcCall<{ ok: boolean }>('billing.templateSave', {
        greeting,
        bank_info: bankInfo,
        office_address: officeAddress,
        office_phone: officePhone,
        signature_text: signatureText,
        fee_rule_corp: { tariff: tariffCorp },
        fee_rule_indv: { tariff: tariffIndv },
      }),
    onSuccess: () => refetch(),
  });

  const tariff = activeTab === 'corp' ? tariffCorp : tariffIndv;
  const setTariff = activeTab === 'corp' ? setTariffCorp : setTariffIndv;

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-500">
        양식 로드 중…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
        💡 청구서 양식 = 모든 청구서의 기본 룰. 인삿말·계좌·누진표는 여기서 한 번 설정 →
        전체 청구서 자동 반영. 개별 청구서에서 거래처별 입력 (수입금액·할인·메모 등) 만 다르게.
      </div>

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
