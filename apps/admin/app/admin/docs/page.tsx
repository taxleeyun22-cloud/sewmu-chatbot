/**
 * Phase Next-Day28 (2026-05-11): /admin/docs — React Query + lucide.
 */
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { toast } from '@/components/ui/toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Sparkles, Check, X, Clock } from 'lucide-react';

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

  const { data, isLoading } = useQuery({
    queryKey: ['documents.list', status],
    queryFn: () =>
      trpcCall<{ documents: Doc[] }>('documents.list', {
        status: status as 'pending' | 'approved' | 'rejected' | 'all',
        limit: 1000,
      }),
  });

  const docs = data?.documents || [];

  return (
    <div className="p-4 space-y-3">
      <header>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <FileText size={18} strokeWidth={2} className="text-brand-primary" />
          문서
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">영수증 + OCR (gpt-4o-mini Vision)</p>
      </header>

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="px-0">
          {isLoading && <DocsTableSkeleton />}
          {!isLoading && docs.length === 0 && (
            <EmptyState icon={<FileText size={32} strokeWidth={1.5} />} title="문서 없음" />
          )}
          {!isLoading && docs.length > 0 && (
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
                {docs.map((d) => <DocRow key={d.id} doc={d} status={status} />)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!isLoading && docs.length > 0 && (
        <p className="text-[11px] text-gray-400 text-right">총 {docs.length} 건</p>
      )}
    </div>
  );
}

function DocRow({ doc, status }: { doc: Doc; status: string }) {
  const qc = useQueryClient();
  const [ocrLoading, setOcrLoading] = useState(false);

  const approve = useMutation({
    mutationFn: () =>
      trpcCall('documents.approve', {
        id: doc.id,
        vendor: doc.vendor || undefined,
        amount: doc.amount || undefined,
        receipt_date: doc.receipt_date || undefined,
        category: doc.category || undefined,
      }),
    onSuccess: () => {
      toast.success(`승인: ${doc.vendor || `#${doc.id}`}`);
      qc.invalidateQueries({ queryKey: ['documents.list'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const reject = useMutation({
    mutationFn: (reason: string) => trpcCall('documents.reject', { id: doc.id, reason }),
    onSuccess: () => {
      toast.info(`반려: ${doc.vendor || `#${doc.id}`}`);
      qc.invalidateQueries({ queryKey: ['documents.list'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  async function runOcr() {
    setOcrLoading(true);
    try {
      const r = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': prompt('ADMIN_KEY:') || '' },
        body: JSON.stringify({ document_id: doc.id }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string; parsed?: { vendor?: string; amount?: number } };
      if (!r.ok) {
        toast.error(`OCR 실패: ${d.error}`);
      } else {
        toast.success(`OCR: ${d.parsed?.vendor || '-'} · ${d.parsed?.amount?.toLocaleString() || '-'}원`);
        qc.invalidateQueries({ queryKey: ['documents.list'] });
      }
    } finally {
      setOcrLoading(false);
    }
  }

  return (
    <TableRow>
      <TableCell>
        {doc.status === 'approved' && <Badge variant="success"><Check size={9} strokeWidth={2} className="mr-0.5" />승인</Badge>}
        {doc.status === 'rejected' && <Badge variant="danger"><X size={9} strokeWidth={2} className="mr-0.5" />반려</Badge>}
        {doc.status === 'pending' && <Badge variant="warning"><Clock size={9} strokeWidth={2} className="mr-0.5" />대기</Badge>}
      </TableCell>
      <TableCell>{doc.doc_type || '-'}</TableCell>
      <TableCell className="truncate max-w-[160px]">{doc.vendor || '-'}</TableCell>
      <TableCell className="text-right font-mono">{doc.amount ? doc.amount.toLocaleString() : '-'}</TableCell>
      <TableCell className="font-mono text-gray-600">{doc.receipt_date || '-'}</TableCell>
      <TableCell className="text-gray-700">{doc.category || '-'}</TableCell>
      <TableCell>
        {doc.status === 'pending' && (
          <div className="flex gap-1">
            <Button size="xs" variant="secondary" onClick={runOcr} disabled={ocrLoading}>
              <Sparkles size={10} strokeWidth={2} className="mr-0.5" />
              {ocrLoading ? '...' : 'OCR'}
            </Button>
            <Button size="xs" variant="success" onClick={() => approve.mutate()} disabled={approve.isPending}>
              <Check size={10} strokeWidth={2} className="mr-0.5" />승인
            </Button>
            <Button size="xs" variant="destructive" onClick={() => { const r = prompt('반려 사유:'); if (r) reject.mutate(r); }} disabled={reject.isPending}>
              <X size={10} strokeWidth={2} className="mr-0.5" />반려
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

function DocsTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead className="w-16">상태</TableHead><TableHead className="w-16">유형</TableHead><TableHead>매입처</TableHead><TableHead className="text-right w-24">금액</TableHead><TableHead className="w-24">날짜</TableHead><TableHead className="w-20">계정</TableHead><TableHead className="w-44">액션</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-12 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-3 w-10" /></TableCell>
            <TableCell><Skeleton className="h-3 w-32" /></TableCell>
            <TableCell><Skeleton className="h-3 w-16 ml-auto" /></TableCell>
            <TableCell><Skeleton className="h-3 w-20" /></TableCell>
            <TableCell><Skeleton className="h-3 w-14" /></TableCell>
            <TableCell><Skeleton className="h-5 w-32" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
