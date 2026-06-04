/**
 * 영업 타겟 (사장님 명령 2026-06-04): 검토표 기반 영업 명단 추출.
 *
 * - 연금 탭: 종소세·산출세액>0·연금공제 없음 → 연금저축/IRP 절세 권유 (산출세액 desc)
 * - 보험 탭: 검토표 직원코멘트에 접대비·지출결의서 등 키워드 → 보험 권유
 * - 연도 드롭다운(기본 최신) + CSV 다운로드(엑셀 BOM)
 *
 * 데이터: tRPC salesTargets.{years,pension,expense} (읽기 전용).
 */
'use client';
export const runtime = 'edge';

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { toast } from '@/components/ui/toast';
import { SkeletonList } from '@/components/ui/skeleton';

type Tab = 'pension' | 'expense';

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

function won(n: number): string {
  return (n || 0).toLocaleString('ko-KR');
}

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

  const yearsQ = useQuery<{ years: number[] }>({
    queryKey: ['salesTargets.years'],
    queryFn: () => trpcCall('salesTargets.years'),
  });

  /* 연도 기본값 = 최신 (years 로드되면 1회 설정) */
  useEffect(() => {
    if (!year && yearsQ.data?.years?.length) setYear(yearsQ.data.years[0]);
  }, [yearsQ.data, year]);

  const pensionQ = useQuery<PensionResult>({
    queryKey: ['salesTargets.pension', { year }],
    queryFn: () => trpcCall('salesTargets.pension', { year }),
    enabled: tab === 'pension' && year > 0,
  });
  const expenseQ = useQuery<ExpenseResult>({
    queryKey: ['salesTargets.expense', { year }],
    queryFn: () => trpcCall('salesTargets.expense', { year }),
    enabled: tab === 'expense' && year > 0,
  });

  const loading = tab === 'pension' ? pensionQ.isLoading : expenseQ.isLoading;
  const pension = pensionQ.data;
  const expense = expenseQ.data;

  const expenseKwLabel = useMemo(
    () => (expense?.keywords?.length ? expense.keywords.join(' · ') : '접대비 · 지출결의 · 경비내역 · 가경비 · 판촉비'),
    [expense],
  );

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
            tab === 'pension' ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          💰 연금 절세
        </button>
        <button
          type="button"
          onClick={() => setTab('expense')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
            tab === 'expense' ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          🛡️ 보험 (경비 키워드)
        </button>
      </div>

      {loading && <SkeletonList rows={6} />}

      {/* 연금 탭 */}
      {tab === 'pension' && !loading && pension && (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>종소세 검토표 <b>{pension.scanned}</b>건</span>
            <span>· 산출세액 입력 <b>{pension.withTax}</b></span>
            <span>· 연금공제 있어 제외 <b>{pension.excludedPension}</b></span>
            <span className="text-blue-700 font-bold">→ 타겟 {pension.count}명</span>
            <button
              type="button"
              onClick={exportPension}
              disabled={!pension.count}
              className="ml-auto bg-[#0B1F3A] text-white px-3 py-1.5 rounded text-xs font-bold disabled:bg-gray-300"
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
                  <th className="px-3 py-2 text-right">산출세액</th>
                </tr>
              </thead>
              <tbody>
                {pension.targets.map((t, i) => (
                  <tr key={t.filing_id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{t.name}</td>
                    <td className="px-3 py-2 text-gray-600">{t.phone || '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{won(t.calculated_tax)}원</td>
                  </tr>
                ))}
                {!pension.count && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-gray-400">
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
            <button
              type="button"
              onClick={exportExpense}
              disabled={!expense.count}
              className="ml-auto bg-[#0B1F3A] text-white px-3 py-1.5 rounded text-xs font-bold disabled:bg-gray-300"
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
                  <th className="px-3 py-2 text-left">직원코멘트</th>
                </tr>
              </thead>
              <tbody>
                {expense.targets.map((t, i) => (
                  <tr key={t.filing_id} className="border-t border-gray-100 hover:bg-gray-50 align-top">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{t.name}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{t.tax_type}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {t.keywords.map((k) => (
                        <span key={k} className="inline-block bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 text-xs mr-1 mb-1">
                          {k}
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{t.phone || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs max-w-md">{t.note}</td>
                  </tr>
                ))}
                {!expense.count && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-gray-400">
                      키워드에 맞는 거래처가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">※ 검토표 직원코멘트(SECTION 05) 검색 키워드: {expenseKwLabel}</p>
        </>
      )}
    </div>
  );
}
