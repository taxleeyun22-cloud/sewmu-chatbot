/**
 * Phase D4-3 (2026-05-21): /admin/billing/[id] — 청구서 상세.
 *
 * 흐름:
 *   - billing.byId 로 fetch
 *   - 청구서 정보 표시 (수입금액·s2·s3·할인·합계·상태·담당자)
 *   - 액션: 발송 / 수금 / 미수 되돌리기 / 삭제 (soft)
 *   - 인쇄 (window.print)
 */
'use client';
export const runtime = 'edge';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';

function formatWon(n: number | null | undefined): string {
  return (n || 0).toLocaleString('ko-KR');
}

interface InvoiceDetail {
  id: number;
  business_id: number | null;
  user_id: number | null;
  business_name: string | null;
  user_name: string | null;
  year: number | null;
  tax_type: string | null;
  revenue: number | null;
  asset: number | null;
  biz_type: string | null;
  basic_type: string | null;
  base_fee: number | null;
  s2_addition: number | null;
  s3_addition: number | null;
  discount: number | null;
  total_fee: number | null;
  status: string | null;
  sent_at: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  staff_user_id: number | null;
  staff_override: number | null;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
  s2_items_parsed: Array<{ name: string; val: number; qty: number }>;
  s3_items_parsed: Array<{ code: string; name: string; amt: number; rule: string; gain?: number }>;
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params?.id || 0);

  const { data, isLoading, error, refetch } = useQuery<{ invoice: InvoiceDetail | null }>({
    queryKey: ['billing.byId', { id }],
    queryFn: () => trpcCall('billing.byId', { id }),
    enabled: id > 0,
  });

  const updateMut = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      trpcCall<{ ok: boolean }>('billing.update', { id, data: patch }),
    onSuccess: () => refetch(),
  });

  const removeMut = useMutation({
    mutationFn: () => trpcCall<{ ok: boolean }>('billing.remove', { id }),
    onSuccess: () => router.push('/admin/billing'),
  });

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-500">
        로드 중…
      </div>
    );
  }
  if (error || !data?.invoice) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">
        ⚠️ 청구서를 찾을 수 없습니다.
        <div className="mt-2">
          <Link href="/admin/billing" className="text-blue-600 hover:underline">
            ← 모아보기로
          </Link>
        </div>
      </div>
    );
  }

  const inv = data.invoice;
  const customer = inv.business_name || inv.user_name || '(이름없음)';

  return (
    <div className="space-y-4">
      {/* 상단 액션 바 */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center flex-wrap gap-2 print:hidden">
        <Link
          href="/admin/billing"
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← 모아보기
        </Link>
        <span className="text-sm font-semibold text-gray-900">청구서 #{inv.id}</span>
        <span className="ml-auto flex items-center gap-2">
          <StatusChip status={inv.status} />
          {inv.status !== 'sent' && inv.status !== 'paid' && (
            <button
              type="button"
              onClick={() => updateMut.mutate({ status: 'sent' })}
              className="text-xs bg-yellow-100 text-yellow-900 px-3 py-1.5 rounded font-semibold hover:bg-yellow-200"
            >
              📤 발송 처리
            </button>
          )}
          {inv.status !== 'paid' && (
            <button
              type="button"
              onClick={() => updateMut.mutate({ status: 'paid' })}
              className="text-xs bg-green-100 text-green-900 px-3 py-1.5 rounded font-semibold hover:bg-green-200"
            >
              ✓ 수금 처리
            </button>
          )}
          {inv.status === 'paid' && (
            <button
              type="button"
              onClick={() => updateMut.mutate({ status: 'sent', paid_at: '' })}
              className="text-xs border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50"
            >
              ↶ 미수로
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="text-xs border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50"
          >
            🖨️ 인쇄
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm(`청구서 #${inv.id} 삭제? (휴지통으로 이동, 복구 가능)`)) {
                removeMut.mutate();
              }
            }}
            className="text-xs bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded hover:bg-red-100"
          >
            🗑️ 삭제
          </button>
        </span>
      </div>

      {/* 청구서 본체 — 인쇄 시 보임 */}
      <article className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 max-w-3xl mx-auto print:shadow-none print:border-none">
        <header className="border-b-2 border-gray-900 pb-3 mb-6 flex items-end">
          <div>
            <div className="text-2xl font-bold text-gray-900">세무회계 이윤</div>
            <div className="text-xs text-gray-500 tracking-widest">TAX STRATEGY &amp; ADVISORY</div>
          </div>
          <div className="ml-auto text-right text-sm">
            <div className="text-gray-500">발행일자</div>
            <div className="font-semibold">
              {inv.created_at ? inv.created_at.slice(0, 10).replace(/-/g, '. ') : '—'}
            </div>
          </div>
        </header>

        <table className="w-full text-sm mb-6">
          <tbody>
            <tr className="border-b border-gray-200">
              <th className="bg-gray-50 px-3 py-2 text-left w-20 font-semibold">수신</th>
              <td className="px-3 py-2 font-semibold">{customer} 대표이사 귀하</td>
              <th className="bg-gray-50 px-3 py-2 text-left w-16 font-semibold">귀속</th>
              <td className="px-3 py-2 w-24">{inv.year}년</td>
            </tr>
            <tr className="border-b border-gray-200">
              <th className="bg-gray-50 px-3 py-2 text-left font-semibold">제목</th>
              <td className="px-3 py-2 font-bold" colSpan={3}>
                {inv.year}년 귀속 {inv.tax_type} 신고 및 세무조정 수수료 청구의 건
              </td>
            </tr>
          </tbody>
        </table>

        {/* 금액 카드 */}
        <div className="space-y-2 mb-6">
          <Row label="산출기준 수입금액" value={`${formatWon(inv.revenue || 0)}원`} />
          <Row label="기본 세무조정료" value={`${formatWon(inv.base_fee || 0)}원`} />
          {(inv.s2_addition || 0) > 0 && (
            <Row label="활증업무 (Section 2)" value={`${formatWon(inv.s2_addition || 0)}원`} />
          )}
          {(inv.s3_addition || 0) > 0 && (
            <Row label="세액공제·감면 가산 (Section 3)" value={`${formatWon(inv.s3_addition || 0)}원`} />
          )}
          {(inv.discount || 0) > 0 && (
            <Row label="▼ 할인액" value={`▼ ${formatWon(inv.discount || 0)}원`} muted />
          )}
          <div className="flex items-center justify-between border-t-2 border-gray-900 pt-3 font-bold text-lg">
            <span>최종 청구 (VAT 포함)</span>
            <span className="text-blue-700">{formatWon(inv.total_fee || 0)}원</span>
          </div>
        </div>

        {/* Section 3 산출근거 */}
        {inv.s3_items_parsed.length > 0 && (
          <section className="mb-6">
            <h3 className="text-sm font-bold text-gray-900 mb-2">📋 Section 3 산출근거</h3>
            <table className="w-full text-xs border border-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">항목</th>
                  <th className="px-2 py-1.5 text-right font-medium">감면액</th>
                  <th className="px-2 py-1.5 text-left font-medium">룰</th>
                  <th className="px-2 py-1.5 text-right font-medium">가산액</th>
                </tr>
              </thead>
              <tbody>
                {inv.s3_items_parsed.map((it, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2 py-1.5">{it.name}</td>
                    <td className="px-2 py-1.5 text-right">{formatWon(it.amt)}원</td>
                    <td className="px-2 py-1.5 text-gray-500">
                      {it.rule === 'flat_5' ? '5%' : 'U자'}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold">
                      {formatWon(it.gain || 0)}원
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Section 2 산출근거 */}
        {inv.s2_items_parsed.length > 0 && (
          <section className="mb-6">
            <h3 className="text-sm font-bold text-gray-900 mb-2">📋 Section 2 산출근거</h3>
            <table className="w-full text-xs border border-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">항목</th>
                  <th className="px-2 py-1.5 text-right font-medium">단가</th>
                  <th className="px-2 py-1.5 text-right font-medium">건수</th>
                  <th className="px-2 py-1.5 text-right font-medium">가산액</th>
                </tr>
              </thead>
              <tbody>
                {inv.s2_items_parsed.map((it, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2 py-1.5">{it.name}</td>
                    <td className="px-2 py-1.5 text-right">{formatWon(it.val)}원</td>
                    <td className="px-2 py-1.5 text-right">{it.qty}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">
                      {formatWon(it.val * it.qty)}원
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* 메타 정보 (인쇄 시 hidden) */}
        <section className="bg-gray-50 border border-gray-200 rounded p-3 text-xs space-y-1 print:hidden">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-gray-500">생성:</span>{' '}
              <span className="font-semibold">{inv.created_at || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">발송:</span>{' '}
              <span className="font-semibold">{inv.sent_at || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">수금:</span>{' '}
              <span className="font-semibold">{inv.paid_at || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">업종:</span>{' '}
              <span className="font-semibold">{inv.biz_type || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">업무구분:</span>{' '}
              <span className="font-semibold">{inv.basic_type || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">담당자:</span>{' '}
              <span className="font-semibold">
                {inv.staff_user_id ? `#${inv.staff_user_id}` : '미지정'}
                {inv.staff_override ? ' (override)' : ''}
              </span>
            </div>
          </div>
          {inv.note && (
            <div className="border-t border-gray-200 pt-2 mt-2">
              <div className="text-gray-500">비고:</div>
              <div className="font-semibold">{inv.note}</div>
            </div>
          )}
        </section>
      </article>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between text-sm ${muted ? 'text-gray-500' : 'text-gray-700'}`}
    >
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function StatusChip({ status }: { status: string | null }) {
  if (status === 'paid')
    return (
      <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-semibold">
        🟢 수금
      </span>
    );
  if (status === 'sent')
    return (
      <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs font-semibold">
        🟡 발송
      </span>
    );
  return (
    <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs font-semibold">
      🔴 미수
    </span>
  );
}
