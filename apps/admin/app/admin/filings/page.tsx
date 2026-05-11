/** Phase Next-Day28 (2026-05-11): /admin/filings React Query. */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { toast } from '@/components/ui/toast';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardList, Plus, ChevronRight } from 'lucide-react';

interface Filing {
  id: number; fiscal_year: number; type: string;
  review_status: string | null; owner_type: string; owner_id: number;
  updated_at: string | null;
}

const ST_VARIANT: Record<string, 'default' | 'warning' | 'success'> = { 작성중: 'default', 결재대기: 'warning', 보관완료: 'success' };
const STATUS_TABS = [{ key: 'all', label: '전체' }, { key: '작성중', label: '작성중' }, { key: '결재대기', label: '결재대기' }, { key: '보관완료', label: '보관완료' }];

export default function FilingsPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['filings.list'],
    queryFn: () => trpcCall<{ filings: Filing[] }>('filings.list', { limit: 100 }),
  });

  const filings = data?.filings || [];
  const visible = statusFilter === 'all' ? filings : filings.filter((f) => (f.review_status || '작성중') === statusFilter);

  return (
    <div className="p-4 space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList size={18} strokeWidth={2} className="text-brand-primary" />신고 검토표
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">종소세 · 법인세 결재 검토</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={12} strokeWidth={2} className="mr-1" />새 Case
        </Button>
      </header>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>{STATUS_TABS.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}</TabsList>
      </Tabs>

      <Card>
        <CardContent className="px-0">
          {isLoading && Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-3 py-2"><Skeleton className="h-10 w-full" /></div>
          ))}
          {!isLoading && visible.length === 0 && (
            <EmptyState icon={<ClipboardList size={32} strokeWidth={1.5} />} title="신고 Case 없음" description="+ 새 Case 로 시작하세요" />
          )}
          {!isLoading && visible.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {visible.map((f) => (
                <li key={f.id}>
                  <Link href={`/admin/filings/${f.id}`} className="block px-3 py-2 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium flex items-center gap-1.5">
                          <span>[{f.fiscal_year}귀속] {f.type}</span>
                          <Badge variant={ST_VARIANT[f.review_status || '작성중'] || 'default'}>{f.review_status || '작성중'}</Badge>
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{f.owner_type} #{f.owner_id}{f.updated_at && ` · ${f.updated_at.slice(0, 10)}`}</p>
                      </div>
                      <ChevronRight size={14} className="text-brand-primary" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {showCreate && <CreateFilingModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['filings.list'] }); }} />}
    </div>
  );
}

function CreateFilingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [type, setType] = useState<'종소세' | '법인세'>('종소세');
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear() - 1);
  const [ownerType, setOwnerType] = useState<'Person' | 'Business'>('Person');
  const [ownerId, setOwnerId] = useState('');

  const createM = useMutation({
    mutationFn: () => trpcCall('filings.create', { type, fiscal_year: fiscalYear, owner_type: ownerType, owner_id: Number(ownerId) }),
    onSuccess: () => { toast.success('생성됨'); onCreated(); },
    onError: (e) => toast.error((e as Error).message),
  });

  // ESC 닫기 (카톡 UX)
  if (typeof window !== 'undefined') {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    setTimeout(() => document.addEventListener('keydown', onEsc, { once: true }), 0);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-md p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold mb-3">+ 새 신고 Case</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">유형</label>
            <select value={type} onChange={(e) => setType(e.target.value as '종소세' | '법인세')}
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs">
              <option value="종소세">종합소득세 (Person)</option>
              <option value="법인세">법인세 (Business)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">귀속연도</label>
            <Input type="number" value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Owner</label>
            <div className="flex gap-1.5">
              <select value={ownerType} onChange={(e) => setOwnerType(e.target.value as 'Person' | 'Business')}
                className="px-2.5 py-1.5 border border-gray-300 rounded-md text-xs">
                <option value="Person">Person</option><option value="Business">Business</option>
              </select>
              <Input type="number" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} placeholder="ID" className="flex-1" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={onClose} className="flex-1">취소</Button>
          <Button onClick={() => { if (!Number(ownerId)) { toast.error('Owner ID 필요'); return; } createM.mutate(); }} disabled={createM.isPending || !ownerId} className="flex-1">
            {createM.isPending ? '생성 중...' : '생성'}
          </Button>
        </div>
      </div>
    </div>
  );
}
