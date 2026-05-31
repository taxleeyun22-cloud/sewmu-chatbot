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
import { toast } from '@/components/ui/toast';
import { confirm } from '@/components/ui/confirm-dialog';
import { SkeletonCard } from '@/components/ui/skeleton';
import { InvoicePreview } from '@/components/billing/InvoicePreview';

interface InvoiceDetail {
  id: number;
  business_id: number | null;
  user_id: number | null;
  business_name: string | null;
  user_name: string | null;
  year: number | null;
  tax_type: string | null;
  issue_date: string | null;
  due_date: string | null;
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
    /* 사장님 UX 개선 #3 (2026-05-31): 발송/수금/미수 후 토스트 (patch.status 로 문구 분기) */
    onSuccess: (_d, patch) => {
      const st = (patch as { status?: string }).status;
      toast.success(st === 'sent' ? '발송 처리했어요' : st === 'paid' ? '수금 처리했어요' : st === 'pending' ? '미수로 되돌렸어요' : '변경했어요');
      refetch();
    },
    onError: () => toast.error('처리 실패 — 잠시 후 다시 시도해주세요'),
  });

  const removeMut = useMutation({
    mutationFn: () => trpcCall<{ ok: boolean }>('billing.remove', { id }),
    onSuccess: () => {
      toast.success('청구서를 휴지통으로 옮겼어요');
      router.push('/admin/billing');
    },
    onError: () => toast.error('삭제 실패 — 잠시 후 다시 시도해주세요'),
  });

  /* 양식 (Template) fetch — 미리보기 인삿말 / 계좌 / 사인. 모든 hook 은 early return 위. */
  const templateQuery = useQuery<{ template: Record<string, string> | null }>({
    queryKey: ['billing.templateGet'],
    queryFn: () => trpcCall('billing.templateGet'),
  });
  const template = templateQuery.data?.template || null;

  if (isLoading) {
    /* 사장님 UX 개선 #5 (2026-05-31): 텍스트 → 스켈레톤 */
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <SkeletonCard />
        <SkeletonCard />
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

  return (
    /* print:space-y-0 — 사장님 보고 (2026-05-26): 인쇄 시 space-y-4 가 16px margin-top
     * 부여 → .page 297mm 합산 313px → 브라우저가 2 물리페이지로 split. 인쇄엔 0. */
    <div className="space-y-4 print:space-y-0">
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
          {/* 사장님 명령 (2026-05-27): "조정료청구서 수정이 안된다" — 새 발행 폼 ?edit=N 재활용 */}
          <Link
            href={`/admin/billing/new?edit=${inv.id}`}
            className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded font-semibold hover:bg-blue-100"
          >
            ✏️ 수정
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="text-xs border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50"
          >
            🖨️ 인쇄
          </button>
          <button
            type="button"
            onClick={async () => {
              const ok = await confirm({
                title: `청구서 #${inv.id} 삭제`,
                description: '휴지통으로 이동합니다. 휴지통에서 다시 복구할 수 있어요.',
                confirmText: '삭제',
                cancelText: '취소',
                variant: 'destructive',
              });
              if (ok) removeMut.mutate();
            }}
            className="text-xs bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded hover:bg-red-100"
          >
            🗑️ 삭제
          </button>
        </span>
      </div>

      {/* 청구서 본체 — A4 1장+2장 (billing-preview.html 톤). 인쇄 시 A4 전폭. */}
      <div className="max-w-3xl mx-auto print:max-w-none print:mx-0">
        <InvoicePreview
          companyName={inv.business_name || inv.user_name}
          year={inv.year || new Date().getFullYear()}
          taxType={(inv.tax_type as '법인세' | '종소세' | '부가세') || '법인세'}
          bizType={inv.biz_type}
          revenue={inv.revenue || 0}
          baseFee={inv.base_fee || 0}
          s2Total={inv.s2_addition || 0}
          s3Total={inv.s3_addition || 0}
          discount={inv.discount || 0}
          total={inv.total_fee || 0}
          issueDate={inv.issue_date || inv.created_at}
          dueDate={inv.due_date || undefined}
          s2Items={inv.s2_items_parsed || []}
          s3Items={(inv.s3_items_parsed || []).map((it) => ({
            code: it.code,
            name: it.name,
            amt: it.amt,
            rule: (it.rule as 'flat_5' | 'progressive_u' | 'none') || 'progressive_u',
          }))}
          template={template}
        />
      </div>

      {/* 메타 정보 (인쇄 시 hidden) */}
      <section className="bg-gray-50 border border-gray-200 rounded p-3 text-xs space-y-1 print:hidden max-w-3xl mx-auto">
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
