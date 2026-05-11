/**
 * Phase Next-Day28 (2026-05-11): /admin/docs 컴팩트.
 * 사장님 명령: "새 어드민 컴팩트하게 변동 ㄱㄱ"
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
    <div className="p-3">
      <h1 className="text-base font-bold text-gray-900 mb-2">문서</h1>

      <div className="flex gap-1 mb-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-2.5 py-0.5 rounded text-xs font-medium ${
              status === t.key
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading && <p className="text-center text-gray-400 py-6 text-xs">불러오는 중...</p>}
        {!loading && docs.length === 0 && (
          <p className="text-center text-gray-400 py-6 text-xs">문서 없음</p>
        )}
        {!loading && docs.length > 0 && (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-[11px] text-gray-600">
              <tr>
                <th className="px-2 py-1.5 text-left w-12">상태</th>
                <th className="px-2 py-1.5 text-left w-16">유형</th>
                <th className="px-2 py-1.5 text-left">매입처</th>
                <th className="px-2 py-1.5 text-right w-24">금액</th>
                <th className="px-2 py-1.5 text-left w-24">날짜</th>
                <th className="px-2 py-1.5 text-left w-20">계정</th>
                <th className="px-2 py-1.5 text-left w-44">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-2 py-1">
                    {d.status === 'approved' && (
                      <span className="text-[10px] bg-green-100 text-green-700 px-1 py-0 rounded">
                        ✓ 승인
                      </span>
                    )}
                    {d.status === 'rejected' && (
                      <span className="text-[10px] bg-red-100 text-red-700 px-1 py-0 rounded">
                        ✕ 반려
                      </span>
                    )}
                    {d.status === 'pending' && (
                      <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1 py-0 rounded">
                        ⏳ 대기
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1">{d.doc_type || '-'}</td>
                  <td className="px-2 py-1 truncate max-w-[160px]">{d.vendor || '-'}</td>
                  <td className="px-2 py-1 text-right font-mono">
                    {d.amount ? `${d.amount.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-2 py-1 font-mono text-gray-600">{d.receipt_date || '-'}</td>
                  <td className="px-2 py-1 text-gray-700">{d.category || '-'}</td>
                  <td className="px-2 py-1">
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

      {!loading && docs.length > 0 && (
        <p className="text-[11px] text-gray-400 mt-1.5 text-right">총 {docs.length} 건</p>
      )}
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
  const [ocrLoading, setOcrLoading] = useState(false);

  async function refetch() {
    const data = await trpcCall<{ documents: Doc[] }>('documents.list', {
      status: status as 'pending' | 'approved' | 'rejected' | 'all',
      limit: 200,
    });
    onChanged(data.documents || []);
  }

  async function runOcr() {
    setOcrLoading(true);
    try {
      const r = await fetch('/api/ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': prompt('ADMIN_KEY:') || '',
        },
        body: JSON.stringify({ document_id: doc.id }),
      });
      const data = (await r.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        parsed?: { vendor?: string; amount?: number };
      };
      if (!r.ok) {
        alert(`OCR 실패: ${data.error || data.message}`);
      } else {
        alert(
          `OCR 완료\n매입처: ${data.parsed?.vendor || '-'}\n금액: ${
            data.parsed?.amount?.toLocaleString() || '-'
          }원`,
        );
        refetch();
      }
    } finally {
      setOcrLoading(false);
    }
  }

  return (
    <div className="flex gap-0.5">
      <button
        onClick={runOcr}
        disabled={ocrLoading}
        className="text-[10px] bg-purple-500 text-white px-1.5 py-0.5 rounded disabled:opacity-50"
        title="OpenAI gpt-4o-mini Vision"
      >
        {ocrLoading ? '...' : '🤖 OCR'}
      </button>
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
        className="text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded"
      >
        ✓승인
      </button>
      <button
        onClick={async () => {
          const reason = prompt('반려 사유:');
          if (!reason) return;
          await trpcCall('documents.reject', { id: doc.id, reason });
          refetch();
        }}
        className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded"
      >
        ✕반려
      </button>
    </div>
  );
}
