/**
 * Phase Next-Day8 (2026-05-09): /admin/docs (tRPC + 단순 list).
 * AG-Grid 대신 단순 table — TanStack Table 추가는 후속.
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';

interface Doc {
  id: number;
  doc_type: string | null;
  status: string | null;
  vendor: string | null;
  amount: number | null;
  receipt_date: string | null;
  category: string | null;
  created_at: string | null;
}

const STATUS_TABS = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '대기' },
  { key: 'approved', label: '승인' },
  { key: 'rejected', label: '반려' },
];

export default function DocsPage() {
  const [status, setStatus] = useState('all');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    trpcCall<{ documents: Doc[] }>('documents.list', {
      status: status as 'pending' | 'approved' | 'rejected' | 'all',
      limit: 200,
    })
      .then((d) => {
        if (!cancelled) setDocs(d.documents || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">문서</h1>

      <div className="flex gap-2 mb-6">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              status === t.key
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl overflow-hidden">
        {loading && <p className="text-center text-gray-400 py-12 text-sm">불러오는 중...</p>}
        {!loading && docs.length === 0 && (
          <p className="text-center text-gray-400 py-12 text-sm">문서 없음</p>
        )}
        {!loading && docs.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left">상태</th>
                <th className="px-4 py-3 text-left">유형</th>
                <th className="px-4 py-3 text-left">매입처</th>
                <th className="px-4 py-3 text-right">금액</th>
                <th className="px-4 py-3 text-left">날짜</th>
                <th className="px-4 py-3 text-left">계정</th>
                <th className="px-4 py-3 text-left">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {d.status === 'approved' && '✅'}
                    {d.status === 'rejected' && '❌'}
                    {d.status === 'pending' && '⏳'}
                  </td>
                  <td className="px-4 py-3">{d.doc_type || '-'}</td>
                  <td className="px-4 py-3">{d.vendor || '-'}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {d.amount ? `${d.amount.toLocaleString()}원` : '-'}
                  </td>
                  <td className="px-4 py-3">{d.receipt_date || '-'}</td>
                  <td className="px-4 py-3">{d.category || '-'}</td>
                  <td className="px-4 py-3">
                    {d.status === 'pending' && (
                      <DocActions doc={d} status={status} onChanged={setDocs} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function DocActions({
  doc,
  status,
  onChanged,
}: {
  doc: Doc;
  status: string;
  onChanged: (docs: Doc[]) => void;
}) {
  async function refetch() {
    const data = await trpcCall<{ documents: Doc[] }>('documents.list', {
      status: status as 'pending' | 'approved' | 'rejected' | 'all',
      limit: 200,
    });
    onChanged(data.documents || []);
  }
  return (
    <div className="flex gap-1">
      <button
        onClick={async () => {
          await trpcCall('documents.approve', {
            id: doc.id,
            vendor: doc.vendor || undefined,
            amount: doc.amount || undefined,
            receipt_date: doc.receipt_date || undefined,
            category: doc.category || undefined,
          });
          refetch();
        }}
        className="text-xs bg-green-500 text-white px-2 py-1 rounded"
      >
        ✅ 승인
      </button>
      <button
        onClick={async () => {
          const reason = prompt('반려 사유:');
          if (!reason) return;
          await trpcCall('documents.reject', { id: doc.id, reason });
          refetch();
        }}
        className="text-xs bg-red-500 text-white px-2 py-1 rounded"
      >
        ❌ 반려
      </button>
    </div>
  );
}
