/**
 * 영업 타겟 (사장님 명령 2026-06-04): 검토표 기반 영업 명단 추출.
 *
 * - 연금 탭: 종소세·산출세액>0·연금공제 없음 → 연금저축/IRP 절세 권유 (산출세액 desc)
 * - 보험 탭: 검토표 직원코멘트에 접대비·지출결의서 등 키워드 → 보험 권유
 * - 법인전환 탭: 개인 종소세 과세표준 상위(한계세율↑) → 법인전환 컨설팅 (과세표준 desc + 등급)
 * - 연도 드롭다운(기본 최신) + CSV 다운로드(엑셀 BOM)
 *
 * 데이터: tRPC salesTargets.{years,pension,expense,incorporation} (읽기 전용).
 */
'use client';
export const runtime = 'edge';

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { toast } from '@/components/ui/toast';
import { SkeletonList } from '@/components/ui/skeleton';

type Tab = 'pension' | 'expense' | 'incorporation' | 'income';

interface PensionTarget {
  filing_id: number;
  user_id: number;
  name: string;
  phone: string | null;
  calculated_tax: number;
}
interface PensionResult {
  year: number;
  scanned: number;
  withTax: number;
  excludedPension: number;
  count: number;
  targets: PensionTarget[];
}
interface ExpenseTarget {
  filing_id: number;
  owner_type: string;
  owner_id: number;
  tax_type: string;
  name: string;
  phone: string | null;
  keywords: string[];
  note: string;
}
interface ExpenseResult {
  year: number;
  scanned: number;
  withNote: number;
  count: number;
  keywords: string[];
  targets: ExpenseTarget[];
}
interface IncorpTarget {
  filing_id: number;
  user_id: number;
  name: string;
  phone: string | null;
  tax_base: number;
  calculated_tax: number;
  revenue: number;
  marginal_rate: number;
  grade: 'S' | 'A' | 'B' | 'C';
}
interface IncorpResult {
  year: number;
  scanned: number;
  withTaxBase: number;
  threshold: number;
  count: number;
  targets: IncorpTarget[];
}

interface IncomeTarget {
  filing_id: number;
  user_id: number;
  name: string;
  phone: string | null;
  revenue: number;
  total_income: number;
  rate: number;
  calculated_tax: number;
}
interface IncomeResult {
  year: number;
  scanned: number;
  withBoth: number;
  minRate: number;
  count: number;
  targets: IncomeTarget[];
}

/* 연락 진행 상태 (사장님 2026-07-06 "내가 연락 넣고 있다 이런 거 확인") */
interface ContactRow {
  owner_type: string;
  owner_id: number;
  status: string;
  note: string | null;
  updated_by_name: string | null;
  updated_at: string | null;
}
const CONTACT_OPTS = [
  { v: 'none', label: '미접촉', cls: 'bg-gray-100 text-gray-500' },
  { v: 'contacted', label: '연락중', cls: 'bg-blue-100 text-blue-700' },
  { v: 'consult', label: '상담예약', cls: 'bg-amber-100 text-amber-800' },
  { v: 'won', label: '성사', cls: 'bg-green-100 text-green-700' },
  { v: 'hold', label: '보류', cls: 'bg-red-100 text-red-600' },
] as const;

function won(n: number): string {
  return (n || 0).toLocaleString('ko-KR');
}

/* 억/만 단위 축약 (과세표준 가독성) — 예: 200000000 → "2억" */
function wonShort(n: number): string {
  const v = Number(n) || 0;
  if (v >= 100_000_000) {
    const eok = v / 100_000_000;
    return `${Number.isInteger(eok) ? eok : eok.toFixed(1)}억`;
  }
  if (v >= 10_000) return `${Math.round(v / 10_000).toLocaleString('ko-KR')}만`;
  return v.toLocaleString('ko-KR');
}

const GRADE_CLS: Record<string, string> = {
  S: 'bg-red-100 text-red-700',
  A: 'bg-orange-100 text-orange-800',
  B: 'bg-blue-100 text-blue-800',
  C: 'bg-gray-100 text-gray-600',
};

/* CSV 다운로드 — 엑셀 한글 깨짐 방지 BOM(﻿) */
function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function SalesTargetsPage() {
  const [tab, setTab] = useState<Tab>('pension');
  const [year, setYear] = useState<number>(0);
  /* 경비 키워드 자유 검색 (사장님 2026-06-18): 비우면 서버 기본 5종, 입력 시 그 키워드로.
   * kwInput = 입력창 텍스트, appliedKw = 실제 적용된 배열(쿼리 키). */
  const [kwInput, setKwInput] = useState('');
  const [appliedKw, setAppliedKw] = useState<string[]>([]);

  function parseKw(s: string): string[] {
    return Array.from(
      new Set(
        s.split(/[,，]/).map((t) => t.trim()).filter((t) => t.length > 0 && t.length <= 40),
      ),
    ).slice(0, 20);
  }
  function applyKw() {
    setAppliedKw(parseKw(kwInput));
  }
  function resetKw() {
    setKwInput('');
    setAppliedKw([]);
  }
  function addChip(k: string) {
    const cur = parseKw(kwInput);
    if (cur.includes(k)) return;
    const next = [...cur, k];
    setKwInput(next.join(','));
    setAppliedKw(next);
  }

  /* 법인전환 컷오프 과세표준 (기본 8,800만=35% 구간) */
  const [incorpThreshold, setIncorpThreshold] = useState<number>(88_000_000);

  const yearsQ = useQuery<{ years: number[]; defaultYear: number }>({
    queryKey: ['salesTargets.years'],
    queryFn: () => trpcCall('salesTargets.years'),
  });

  /* 연도 기본값 = 검토표 가장 많은 연도(서버 defaultYear) — 최신연도가 비어있어도 안전 */
  useEffect(() => {
    if (!year && yearsQ.data?.defaultYear) setYear(yearsQ.data.defaultYear);
  }, [yearsQ.data, year]);

  const pensionQ = useQuery<PensionResult>({
    queryKey: ['salesTargets.pension', { year }],
    queryFn: () => trpcCall('salesTargets.pension', { year }),
    enabled: tab === 'pension' && year > 0,
  });
  const expenseQ = useQuery<ExpenseResult>({
    queryKey: ['salesTargets.expense', { year, kw: appliedKw }],
    queryFn: () =>
      trpcCall('salesTargets.expense', {
        year,
        ...(appliedKw.length ? { keywords: appliedKw } : {}),
      }),
    enabled: tab === 'expense' && year > 0,
  });
  const incorporationQ = useQuery<IncorpResult>({
    queryKey: ['salesTargets.incorporation', { year, minTaxBase: incorpThreshold }],
    queryFn: () => trpcCall('salesTargets.incorporation', { year, minTaxBase: incorpThreshold }),
    enabled: tab === 'incorporation' && year > 0,
  });
  /* 소득률 컷오프 (기본 30%) */
  const [minIncomeRate, setMinIncomeRate] = useState<number>(30);
  const incomeQ = useQuery<IncomeResult>({
    queryKey: ['salesTargets.income', { year, minRate: minIncomeRate }],
    queryFn: () => trpcCall('salesTargets.income', { year, minRate: minIncomeRate }),
    enabled: tab === 'income' && year > 0,
  });

  /* 연락 진행 상태 — 탭별 별도 저장(sales_target_contacts), 행 select 로 즉시 변경 */
  const contactsQ = useQuery<{ contacts: ContactRow[] }>({
    queryKey: ['salesTargets.contacts', tab],
    queryFn: () => trpcCall('salesTargets.contacts', { target_type: tab }),
  });
  const contactMap = useMemo(() => {
    const m = new Map<string, ContactRow>();
    (contactsQ.data?.contacts || []).forEach((c) => m.set(`${c.owner_type}:${c.owner_id}`, c));
    return m;
  }, [contactsQ.data]);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function setContact(ownerType: string, ownerId: number, status: string) {
    const key = `${ownerType}:${ownerId}`;
    setSavingKey(key);
    try {
      await trpcCall('salesTargets.setContact', {
        target_type: tab, owner_type: ownerType, owner_id: ownerId, status,
      });
      await contactsQ.refetch();
      const lbl = CONTACT_OPTS.find((o) => o.v === status)?.label || status;
      toast.success(`연락 상태 → ${lbl}`);
    } catch {
      toast.error('상태 저장 실패 — 다시 시도해주세요');
    }
    setSavingKey(null);
  }

  /* 행 안의 상태 select — 색 pill, 클릭이 행 클릭(대시보드 열기)으로 번지지 않게 stopPropagation */
  function ContactCell({ ownerType, ownerId }: { ownerType: string; ownerId: number }) {
    const key = `${ownerType}:${ownerId}`;
    const c = contactMap.get(key);
    const cur = c?.status || 'none';
    const opt = CONTACT_OPTS.find((o) => o.v === cur) || CONTACT_OPTS[0];
    return (
      <select
        value={cur}
        disabled={savingKey === key}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          void setContact(ownerType, ownerId, e.target.value);
        }}
        title={c?.updated_at ? `${c.updated_by_name || '누군가'} · ${String(c.updated_at).slice(0, 10)}` : '연락 상태 기록'}
        className={`rounded-full px-2 py-1 text-xs font-bold border-0 cursor-pointer appearance-none ${opt.cls}`}
      >
        {CONTACT_OPTS.map((o) => (
          <option key={o.v} value={o.v}>{o.label}</option>
        ))}
      </select>
    );
  }

  /* 상단바 상태 요약 칩 — 이 탭 타겟 중 상태 기록된 것만 (미접촉 제외) */
  function ContactSummary({ keys }: { keys: string[] }) {
    const cc: Record<string, number> = {};
    keys.forEach((k) => {
      const s = contactMap.get(k)?.status;
      if (s && s !== 'none') cc[s] = (cc[s] || 0) + 1;
    });
    const parts = CONTACT_OPTS.filter((o) => cc[o.v]);
    if (!parts.length) return null;
    return (
      <span className="flex items-center gap-1">
        {parts.map((o) => (
          <span key={o.v} className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${o.cls}`}>
            {o.label} {cc[o.v]}
          </span>
        ))}
      </span>
    );
  }

  const loading =
    tab === 'pension'
      ? pensionQ.isLoading
      : tab === 'expense'
        ? expenseQ.isLoading
        : tab === 'incorporation'
          ? incorporationQ.isLoading
          : incomeQ.isLoading;
  const pension = pensionQ.data;
  const expense = expenseQ.data;
  const incorporation = incorporationQ.data;
  const income = incomeQ.data;

  const expenseKwLabel = useMemo(
    () => (expense?.keywords?.length ? expense.keywords.join(' · ') : '접대비 · 지출결의 · 경비내역 · 가경비 · 판촉비'),
    [expense],
  );

  /* 법인전환 등급 분포 (우선순위 한눈에) */
  const incorpGradeCounts = useMemo(() => {
    const c: Record<'S' | 'A' | 'B' | 'C', number> = { S: 0, A: 0, B: 0, C: 0 };
    (incorporation?.targets || []).forEach((t) => {
      c[t.grade] = (c[t.grade] || 0) + 1;
    });
    return c;
  }, [incorporation]);

  /* 행 클릭 → 거래처 대시보드 (구 admin) 새 탭. 사장님 명령 (2026-06-04).
   * 개인(Person)=거래처 종합 대시보드(#tab=users&cust=N, 첫 로드 자동 open),
   * 업체(Business)=업체 대시보드(business.html?id=N). */
  function openClient(ownerType: string, id: number | null | undefined) {
    if (!id) return;
    const url =
      ownerType === 'Business'
        ? `https://sewmu-chatbot.pages.dev/business.html?id=${id}`
        : `https://sewmu-chatbot.pages.dev/admin.html#tab=users&cust=${id}`;
    window.open(url, '_blank', 'noopener');
  }

  function exportPension() {
    if (!pension?.targets.length) return;
    downloadCsv(
      `연금절세타겟_${pension.year}.csv`,
      ['이름', '전화', '산출세액'],
      pension.targets.map((t) => [t.name, t.phone || '', t.calculated_tax]),
    );
    toast.success(`연금 타겟 ${pension.targets.length}명 CSV 저장`);
  }
  function exportExpense() {
    if (!expense?.targets.length) return;
    downloadCsv(
      `보험타겟_${expense.year}.csv`,
      ['이름', '유형', '매칭키워드', '전화', '직원코멘트'],
      expense.targets.map((t) => [t.name, t.tax_type, t.keywords.join('·'), t.phone || '', t.note]),
    );
    toast.success(`보험 타겟 ${expense.targets.length}명 CSV 저장`);
  }
  function exportIncome() {
    if (!income?.targets.length) return;
    downloadCsv(
      `소득률타겟_${income.year}.csv`,
      ['이름', '전화', '수입금액', '종합소득금액', '소득률(%)', '산출세액'],
      income.targets.map((t) => [t.name, t.phone || '', t.revenue, t.total_income, t.rate, t.calculated_tax]),
    );
    toast.success(`소득률 타겟 ${income.targets.length}명 CSV 저장`);
  }
  function exportIncorporation() {
    if (!incorporation?.targets.length) return;
    downloadCsv(
      `법인전환타겟_${incorporation.year}.csv`,
      ['이름', '전화', '과세표준', '한계세율', '등급', '산출세액', '수입금액'],
      incorporation.targets.map((t) => [
        t.name, t.phone || '', t.tax_base, `${t.marginal_rate}%`, t.grade, t.calculated_tax, t.revenue,
      ]),
    );
    toast.success(`법인전환 타겟 ${incorporation.targets.length}명 CSV 저장`);
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center flex-wrap gap-3">
        <span className="font-bold text-gray-900 text-lg">🎯 영업 타겟</span>
        <span className="text-xs text-gray-400">검토표 데이터 기반 영업 명단 추출</span>
        <span className="ml-auto flex items-center gap-2">
          <label className="text-sm text-gray-600">귀속연도</label>
          <select
            value={year || ''}
            onChange={(e) => setYear(Number(e.target.value) || 0)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
          >
            {(yearsQ.data?.years || []).map((y) => (
              <option key={y} value={y}>
                {y}년 귀속
              </option>
            ))}
          </select>
        </span>
      </div>

      {/* 탭 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('pension')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
            tab === 'pension' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          💰 연금 절세
        </button>
        <button
          type="button"
          onClick={() => setTab('expense')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
            tab === 'expense' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          🛡️ 보험 (경비 키워드)
        </button>
        <button
          type="button"
          onClick={() => setTab('incorporation')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
            tab === 'incorporation' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          🏢 법인전환
        </button>
        <button
          type="button"
          onClick={() => setTab('income')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
            tab === 'income' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          📈 소득률
        </button>
      </div>

      {/* 경비 키워드 자유 검색 (보험 탭) */}
      {tab === 'expense' && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={kwInput}
              onChange={(e) => setKwInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyKw();
              }}
              placeholder="키워드·이름·업체명 검색 — 쉼표로 여러 개 (예: 접대비,차량,어나드,박승호)"
              className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1 min-w-[240px]"
            />
            <button
              type="button"
              onClick={applyKw}
              className="bg-[#0B1F3A] text-white px-3 py-1.5 rounded text-sm font-semibold hover:opacity-90"
            >
              🔍 검색
            </button>
            <button
              type="button"
              onClick={resetKw}
              className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
              title="기본 키워드(접대비·지출결의·경비내역·가경비·판촉비)로"
            >
              기본값
            </button>
            <span className="text-xs text-gray-400">
              현재: {appliedKw.length ? appliedKw.join(' · ') : '기본 5종'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-gray-400">빠른 추가:</span>
            {['차량', '리스', '법인전환', '가지급금', '임대', '세무조사', '컨설팅'].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => addChip(c)}
                className="text-[11px] border border-gray-200 text-gray-600 rounded-full px-2 py-0.5 hover:bg-amber-50 hover:border-amber-300"
              >
                + {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && <SkeletonList rows={6} />}

      {/* 연금 탭 */}
      {tab === 'pension' && !loading && pension && (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>종소세 검토표 <b>{pension.scanned}</b>건</span>
            <span>· 산출세액 입력 <b>{pension.withTax}</b></span>
            <span>· 연금공제 있어 제외 <b>{pension.excludedPension}</b></span>
            <span className="text-blue-700 font-bold">→ 타겟 {pension.count}명</span>
            <ContactSummary keys={pension.targets.map((t) => `Person:${t.user_id}`)} />
            <button
              type="button"
              onClick={exportPension}
              disabled={!pension.count}
              className="ml-auto bg-brand-primary text-white px-3 py-1.5 rounded text-xs font-bold disabled:bg-gray-300"
            >
              ⬇ CSV 다운로드 ({pension.count})
            </button>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left w-12">#</th>
                  <th className="px-3 py-2 text-left">이름</th>
                  <th className="px-3 py-2 text-left">전화</th>
                  <th className="px-3 py-2 text-left w-28">연락</th>
                  <th className="px-3 py-2 text-right">산출세액</th>
                </tr>
              </thead>
              <tbody>
                {pension.targets.map((t, i) => (
                  <tr
                    key={t.filing_id}
                    className="border-t border-gray-100 hover:bg-blue-50 cursor-pointer"
                    onClick={() => openClient('Person', t.user_id)}
                    title="거래처 대시보드 열기 ↗"
                  >
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-blue-700 hover:underline">{t.name} ↗</td>
                    <td className="px-3 py-2 text-gray-600">{t.phone || '—'}</td>
                    <td className="px-3 py-2"><ContactCell ownerType="Person" ownerId={t.user_id} /></td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{won(t.calculated_tax)}원</td>
                  </tr>
                ))}
                {!pension.count && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                      조건에 맞는 거래처가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">
            ※ 산출세액 큰 순 = 절세 여력 큰 순. 연금계좌세액공제(연금저축·IRP·퇴직연금·ISA)가 없는 종소세 거래처만.
          </p>
        </>
      )}

      {/* 보험 탭 */}
      {tab === 'expense' && !loading && expense && (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>검토표 <b>{expense.scanned}</b>건</span>
            <span>· 직원코멘트 있음 <b>{expense.withNote}</b></span>
            <span className="text-amber-800 font-bold">→ 키워드 매칭 {expense.count}명</span>
            <ContactSummary keys={expense.targets.map((t) => `${t.owner_type}:${t.owner_id}`)} />
            <button
              type="button"
              onClick={exportExpense}
              disabled={!expense.count}
              className="ml-auto bg-brand-primary text-white px-3 py-1.5 rounded text-xs font-bold disabled:bg-gray-300"
            >
              ⬇ CSV 다운로드 ({expense.count})
            </button>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left w-12">#</th>
                  <th className="px-3 py-2 text-left">이름</th>
                  <th className="px-3 py-2 text-left">유형</th>
                  <th className="px-3 py-2 text-left">키워드</th>
                  <th className="px-3 py-2 text-left">전화</th>
                  <th className="px-3 py-2 text-left w-28">연락</th>
                  <th className="px-3 py-2 text-left">직원코멘트</th>
                </tr>
              </thead>
              <tbody>
                {expense.targets.map((t, i) => (
                  <tr
                    key={t.filing_id}
                    className="border-t border-gray-100 hover:bg-blue-50 cursor-pointer align-top"
                    onClick={() => openClient(t.owner_type, t.owner_id)}
                    title="거래처 대시보드 열기 ↗"
                  >
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-blue-700 hover:underline whitespace-nowrap">{t.name} ↗</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{t.tax_type}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {t.keywords.map((k) => (
                        <span key={k} className="inline-block bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 text-xs mr-1 mb-1">
                          {k}
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{t.phone || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><ContactCell ownerType={t.owner_type} ownerId={t.owner_id} /></td>
                    <td className="px-3 py-2 text-gray-500 text-xs max-w-md">{t.note}</td>
                  </tr>
                ))}
                {!expense.count && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                      키워드에 맞는 거래처가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">
            ※ 직원코멘트(SECTION 05) + 이름·업체명(대표자 포함)에서 검색: {expenseKwLabel}
          </p>
        </>
      )}

      {/* 법인전환 컷오프 (법인전환 탭) */}
      {tab === 'incorporation' && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600">과세표준 컷오프</span>
          <select
            value={incorpThreshold}
            onChange={(e) => setIncorpThreshold(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
          >
            <option value={88_000_000}>8,800만 이상 (35%~)</option>
            <option value={150_000_000}>1.5억 이상 (38%~, 핵심)</option>
            <option value={300_000_000}>3억 이상 (40%~, 최우선)</option>
          </select>
          <span className="text-xs text-gray-400">개인 종소세 과세표준 ≥ 컷오프 → 법인전환 실익 큰 순</span>
        </div>
      )}

      {/* 법인전환 탭 */}
      {tab === 'incorporation' && !loading && incorporation && (
        <>
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-900 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>종소세 검토표 <b>{incorporation.scanned}</b>건</span>
            <span>· 과세표준 입력 <b>{incorporation.withTaxBase}</b></span>
            <span className="text-indigo-700 font-bold">→ 타겟 {incorporation.count}명</span>
            <ContactSummary keys={incorporation.targets.map((t) => `Person:${t.user_id}`)} />
            {incorporation.count > 0 && (
              <span className="flex items-center gap-1">
                {(['S', 'A', 'B', 'C'] as const)
                  .filter((g) => incorpGradeCounts[g] > 0)
                  .map((g) => (
                    <span key={g} className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${GRADE_CLS[g]}`}>
                      {g} {incorpGradeCounts[g]}
                    </span>
                  ))}
              </span>
            )}
            <button
              type="button"
              onClick={exportIncorporation}
              disabled={!incorporation.count}
              className="ml-auto bg-brand-primary text-white px-3 py-1.5 rounded text-xs font-bold disabled:bg-gray-300"
            >
              ⬇ CSV 다운로드 ({incorporation.count})
            </button>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left w-12">#</th>
                  <th className="px-3 py-2 text-left">이름</th>
                  <th className="px-3 py-2 text-right">과세표준</th>
                  <th className="px-3 py-2 text-center">한계세율</th>
                  <th className="px-3 py-2 text-center w-16">등급</th>
                  <th className="px-3 py-2 text-right">산출세액</th>
                  <th className="px-3 py-2 text-right">수입금액</th>
                  <th className="px-3 py-2 text-left">전화</th>
                  <th className="px-3 py-2 text-left w-28">연락</th>
                </tr>
              </thead>
              <tbody>
                {incorporation.targets.map((t, i) => (
                  <tr
                    key={t.filing_id}
                    className="border-t border-gray-100 hover:bg-blue-50 cursor-pointer"
                    onClick={() => openClient('Person', t.user_id)}
                    title="거래처 대시보드 열기 ↗"
                  >
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-blue-700 hover:underline whitespace-nowrap">{t.name} ↗</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900" title={`${won(t.tax_base)}원`}>
                      {wonShort(t.tax_base)}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-700">
                      {t.marginal_rate}% <span className="text-gray-400 text-xs">→ 법인 9~19%</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${GRADE_CLS[t.grade] || GRADE_CLS.C}`}>
                        {t.grade}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">{won(t.calculated_tax)}원</td>
                    <td className="px-3 py-2 text-right text-gray-500">{wonShort(t.revenue)}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{t.phone || '—'}</td>
                    <td className="px-3 py-2"><ContactCell ownerType="Person" ownerId={t.user_id} /></td>
                  </tr>
                ))}
                {!incorporation.count && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-gray-400">
                      컷오프 이상 과세표준 거래처가 없습니다. (컷오프를 낮춰보세요)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">
            ※ 과세표준 한계세율 기준 <b>1차 영업명단</b>입니다. 실제 법인전환은 성실신고확인·4대보험·가지급금·청산·취득세
            등 종합검토가 필요해요. (법인세율: 과세표준 2억↓ 9% · 초과 19% — 소득세법 제55조 / 법인세법 제55조)
          </p>
        </>
      )}

      {/* 소득률 컷오프 (소득률 탭) */}
      {tab === 'income' && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600">소득률 컷오프</span>
          <select
            value={minIncomeRate}
            onChange={(e) => setMinIncomeRate(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
          >
            <option value={20}>20% 이상</option>
            <option value={30}>30% 이상 (기본)</option>
            <option value={40}>40% 이상 (핵심)</option>
            <option value={50}>50% 이상 (최우선)</option>
          </select>
          <span className="text-xs text-gray-400">소득률 = 종합소득금액 ÷ 수입금액 (검토표 기준) — 높을수록 경비·공제 못 쓰는 중</span>
        </div>
      )}

      {/* 소득률 탭 */}
      {tab === 'income' && !loading && income && (
        <>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>종소세 검토표 <b>{income.scanned}</b>건</span>
            <span>· 수입·소득 둘 다 입력 <b>{income.withBoth}</b></span>
            <span className="text-emerald-700 font-bold">→ 소득률 {income.minRate}%↑ {income.count}명</span>
            <ContactSummary keys={income.targets.map((t) => `Person:${t.user_id}`)} />
            <button
              type="button"
              onClick={exportIncome}
              disabled={!income.count}
              className="ml-auto bg-brand-primary text-white px-3 py-1.5 rounded text-xs font-bold disabled:bg-gray-300"
            >
              ⬇ CSV 다운로드 ({income.count})
            </button>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left w-12">#</th>
                  <th className="px-3 py-2 text-left">이름</th>
                  <th className="px-3 py-2 text-right">수입금액</th>
                  <th className="px-3 py-2 text-right">종합소득금액</th>
                  <th className="px-3 py-2 text-center">소득률</th>
                  <th className="px-3 py-2 text-right">산출세액</th>
                  <th className="px-3 py-2 text-left">전화</th>
                  <th className="px-3 py-2 text-left w-28">연락</th>
                </tr>
              </thead>
              <tbody>
                {income.targets.map((t, i) => (
                  <tr
                    key={t.filing_id}
                    className="border-t border-gray-100 hover:bg-blue-50 cursor-pointer"
                    onClick={() => openClient('Person', t.user_id)}
                    title="거래처 대시보드 열기 ↗"
                  >
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-blue-700 hover:underline whitespace-nowrap">{t.name} ↗</td>
                    <td className="px-3 py-2 text-right text-gray-600" title={`${won(t.revenue)}원`}>{wonShort(t.revenue)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900" title={`${won(t.total_income)}원`}>{wonShort(t.total_income)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                        t.rate >= 50 ? 'bg-red-100 text-red-700' : t.rate >= 40 ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {t.rate}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">{won(t.calculated_tax)}원</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{t.phone || '—'}</td>
                    <td className="px-3 py-2"><ContactCell ownerType="Person" ownerId={t.user_id} /></td>
                  </tr>
                ))}
                {!income.count && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
                      컷오프 이상 소득률 거래처가 없습니다. (컷오프를 낮춰보세요)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">
            ※ 소득률 = 검토표의 <b>종합소득금액 ÷ 수입금액</b>. 소득률이 높다 = 경비·공제 여력을 못 쓰고 있다 →
            노란우산공제·연금계좌·비용 증빙 보강 등 <b>절세 컨설팅 1차 명단</b>입니다. (업종별 적정률은 별도 판단)
          </p>
        </>
      )}
    </div>
  );
}
