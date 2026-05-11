/**
 * Phase Next-Day28 (2026-05-11): /admin/docs — shadcn/ui + OCR.
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
    <div className="p-4 space-y-3">
      <header>
        <h1 className="text-lg font-bold text-gray-900">문서</h1>
        <p className="text-xs text-gray-500 mt-0.5">영수증 + OCR (gpt-4o-mini Vision)</p>
      </header>

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="px-0">
          {loading && <p className="text-center text-gray-400 py-6 text-xs">불러오는 중...</p>}
          {!loading && docs.length === 0 && (
            <p className="text-center text-gray-400 py-6 text-xs">문서 없음</p>
          )}
          {!loading && docs.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">상태</TableHead>
                  <TableHead className="w-16">유형</TableHead>
                  <TableHead>매입처</TableHead>
                  <TableHead className="text-right w-24">금액</TableHead>
                  <TableHead className="w-24">날짜</TableHead>
                  <TableHead className="w-20">계정</TableHead>
                  <TableHead className="w-44">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      {d.status === 'approved' && <Badge variant="success">✓ 승인</Badge>}
                      {d.status === 'rejected' && <Badge variant="danger">✕ 반려</Badge>}
                      {d.status === 'pending' && <Badge variant="warning">⏳ 대기</Badge>}
                    </TableCell>
                    <TableCell>{d.doc_type || '-'}</TableCell>
                    <TableCell className="truncate max-w-[160px]">{d.vendor || '-'}</TableCell>
                    <TableCell className="text-right font-mono">
                      {d.amount ? `${d.amount.toLocaleString()}` : '-'}
                    </TableCell>
                    <TableCell className="font-mono text-gray-600">
                      {d.receipt_date || '-'}
                    </TableCell>
                    <TableCell className="text-gray-700">{d.category || '-'}</TableCell>
                    <TableCell>
                      {d.status === 'pending' && (
                        <DocActions doc={d} status={status} onChanged={setDocs} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!loading && docs.length > 0 && (
        <p className="text-[11px] text-gray-400 text-right">총 {docs.length} 건</p>
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
    <div className="flex gap-1">
      <Button size="xs" variant="secondary" onClick={runOcr} disabled={ocrLoading} title="OCR">
        {ocrLoading ? '...' : '🤖 OCR'}
      </Button>
      <Button
        size="xs"
        variant="success"
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
      >
        ✓승인
      </Button>
      <Button
        size="xs"
        variant="destructive"
        onClick={async () => {
          const reason = prompt('반려 사유:');
          if (!reason) return;
          await trpcCall('documents.reject', { id: doc.id, reason });
          refetch();
        }}
      >
        ✕반려
      </Button>
    </div>
  );
}
