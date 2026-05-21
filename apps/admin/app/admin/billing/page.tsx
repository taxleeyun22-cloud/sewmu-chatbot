/**
 * Phase D4-1 (2026-05-21): /admin/billing — 청구서 모아보기 (담당자 그룹).
 *
 * 사장님 명령: "담당자별로 자동으로 분류". 미수 합계 빨강 강조.
 * tRPC: billing.list query (status / year / staff_id 필터).
 * status: 'pending'(미수) / 'sent'(발송) / 'paid'(수금) → statusOf helper 로 빨/노/초 chip.
 */
'use client';
export const runtime = 'edge';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { trpcCall } from '@/lib/trpc';

/* billing helper (src/lib/billing-calc.ts 와 동일 — 후속에 packages 분리 후 import) */
type InvoiceStatus = 'pending' | 'sent' | 'paid';
function formatWon(n: number | null | undefined): string {
  return (n || 0).toLocaleString('ko-KR');
}

interface InvoiceRow {
  id: number;
  business_id: number | null;
  user_id: number | null;
  filing_id: number | null;
  year: number | null;
  tax_type: string | null;
  total_fee: number | null;
  staff_user_id: number | null;
  status: string | null;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string | null;
  business_name: string | null;
  user_real_name: string | null;
  user_name: string | null;
}

interface ListResponse {
  invoices: InvoiceRow[];
}

type StatusFilter = '' | 'pending' | 'sent' | 'paid';

export default function BillingListPage() {
  const [status, setStatus] = useState<StatusFilter>('');
  const [year, setYear] = useState<string>('');
  const [search, setSearch] = useState('');

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['billing.list', { status, year }],
    queryFn: () =>
      trpcCall<ListResponse>('billing.list', {
        ...(status ? { status } : {}),
        ...(year ? { year: Number(year) } : {}),
        limit: 500,
      }),
  });

  /* 검색 client-side filter (이름) */
  const filtered = useMemo(() => {
    const list = data?.invoices ?? [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter((i) => {
      const nm = (i.business_name || i.user_real_name || i.user_name || '').toLowerCase();
      return nm.includes(q);
    });
  }, [data, search]);

  /* 담당자별 그룹 (사장님 의도: "담당자별로 자동 분류") */
  const grouped = useMemo(() => {
    const map = new Map<string, InvoiceRow[]>();
    for (const inv of filtered) {
      const key = inv.staff_user_id ? `담당자 #${inv.staff_user_id}` : '담당자 미지정';
      const arr = map.get(key) ?? [];
      arr.push(inv);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  /* 미수 통계 */
  const overdue = useMemo(() => {
    return filtered.filter((i) => i.status === 'sent' || i.status === 'pending');
  }, [filtered]);
  const overdueTotal = overdue.reduce((a, i) => a + (i.total_fee || 0), 0);

  return (
    <div className="space-y-4">
      {/* 미수 알림 */}
      {overdue.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-3">
          <span className="text-red-600 font-bold">🔴 미수·미발행</span>
          <span className="text-red-700 font-semibold">{overdue.length}건</span>
          <span className="text-red-900 font-bold ml-auto">합계 {formatWon(overdueTotal)}원</span>
        </div>
      )}

      {/* 필터 */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-2 flex-wrap">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
        >
          <option value="">전체 상태</option>
          <option value="pending">미수</option>
          <option value="sent">발송</option>
          <option value="paid">수금</option>
        </select>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
        >
          <option value="">전체 연도</option>
          <option value="2026">2026</option>
          <option value="2025">2025</option>
          <option value="2024">2024</option>
          <option value="2023">2023</option>
        </select>
        <input
          type="text"
          placeholder="🔍 거래처/업체 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1 min-w-[200px]"
        />
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50"
        >
          ↻ 새로고침
        </button>
        <span className="ml-auto text-sm text-gray-500">
          전체 <b className="text-gray-900">{filtered.length}</b>건
        </span>
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-500">
          로드 중…
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">
          ⚠️ 로드 실패: {(error as Error).message}
        </div>
      )}

      {/* 담당자 그룹 */}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-500">
          해당 조건의 청구서 없음.
          <div className="mt-2">
            <Link
              href="/admin/billing/new"
              className="text-blue-600 hover:underline"
            >
              + 새 청구서 발행
            </Link>
          </div>
        </div>
      )}

      {grouped.map(([staffKey, invs]) => {
        const sum = invs.reduce((a, i) => a + (i.total_fee || 0), 0);
        const misN = invs.filter((i) => i.status === 'sent' || i.status === 'pending').length;
        return (
          <section
            key={staffKey}
            className="bg-white border border-gray-200 rounded-lg overflow-hidden"
          >
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center text-sm">
              <span className="font-bold text-gray-900">👤 {staffKey}</span>
              <span className="text-gray-500 ml-2">
                ({invs.length}건{misN ? ` · 미수 ${misN}` : ''})
              </span>
              <span className="ml-auto text-gray-700 font-semibold">
                합계 {formatWon(sum)}원
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-gray-600 text-xs">
                  <th className="px-4 py-2 font-medium">거래처/업체</th>
                  <th className="px-4 py-2 font-medium w-20">세금</th>
                  <th className="px-4 py-2 font-medium w-20">연도</th>
                  <th className="px-4 py-2 font-medium w-32 text-right">금액</th>
                  <th className="px-4 py-2 font-medium w-24">상태</th>
                  <th className="px-4 py-2 font-medium w-24">발송일</th>
                  <th className="px-4 py-2 font-medium w-24">수금일</th>
                  <th className="px-4 py-2 font-medium w-12"></th>
                </tr>
              </thead>
              <tbody>
                {invs.map((inv) => {
                  const name =
                    inv.business_name || inv.user_real_name || inv.user_name || '(이름없음)';
                  const isPaid = inv.status === 'paid';
                  const isSent = inv.status === 'sent';
                  const isPending = !isPaid && !isSent;
                  return (
                    <tr
                      key={inv.id}
                      className="border-t border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-4 py-2 font-semibold text-gray-900">{name}</td>
                      <td className="px-4 py-2">
                        <TaxChip type={inv.tax_type} />
                      </td>
                      <td className="px-4 py-2 text-gray-600">{inv.year}</td>
                      <td className="px-4 py-2 text-right font-bold text-gray-900">
                        {formatWon(inv.total_fee || 0)}원
                      </td>
                      <td className="px-4 py-2">
                        <StatusChip status={inv.status as InvoiceStatus} />
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs">
                        {inv.sent_at ? inv.sent_at.slice(0, 10) : '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs">
                        {inv.paid_at ? inv.paid_at.slice(0, 10) : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <Link
                          href={`/admin/billing/${inv.id}`}
                          className="text-blue-600 hover:underline text-xs"
                        >
                          상세
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function TaxChip({ type }: { type: string | null }) {
  const cls =
    type === '법인세'
      ? 'bg-amber-100 text-amber-800'
      : type === '종소세'
      ? 'bg-blue-100 text-blue-800'
      : type === '부가세'
      ? 'bg-purple-100 text-purple-800'
      : 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {type || '—'}
    </span>
  );
}

function StatusChip({ status }: { status: InvoiceStatus | null }) {
  if (status === 'paid')
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">
        🟢 수금
      </span>
    );
  if (status === 'sent')
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">
        🟡 발송
      </span>
    );
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">
      🔴 미수
    </span>
  );
}
