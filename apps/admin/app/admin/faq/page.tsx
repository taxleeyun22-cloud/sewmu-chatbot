/** Phase Next-Day28 (2026-05-11): /admin/faq React Query + lucide. */
'use client';

import { useState, useMemo } from 'react';
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
import { BookOpen, Search, Pencil, Brain } from 'lucide-react';

interface Faq {
  id: number; q_number: number | null; category: string | null;
  question: string; answer: string; law_refs: string | null;
  active: number | null; verified_status: string | null;
  has_embedding: boolean; updated_at: string | null;
}

const VERIFY_TABS = [
  { key: 'all' as const, label: '전체' },
  { key: 'unchecked' as const, label: '미검증' },
  { key: 'verified' as const, label: '검증됨' },
  { key: 'wrong' as const, label: '틀림' },
  { key: 'suspicious' as const, label: '의심' },
];
const VERIFY_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'default'> = {
  verified: 'success', wrong: 'danger', suspicious: 'warning', unchecked: 'default',
};

export default function FaqPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [verifyFilter, setVerifyFilter] = useState<typeof VERIFY_TABS[number]['key']>('all');
  const [editing, setEditing] = useState<Faq | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['faq.list', search, category, verifyFilter],
    queryFn: () => trpcCall<{ faqs: Faq[]; categories: { category: string | null; n: number }[] }>('faq.list', {
      search: search || undefined,
      category: category === 'all' ? undefined : category,
      verified: verifyFilter,
      limit: 500,
    }),
  });

  const faqs = data?.faqs || [];
  const categories = data?.categories || [];

  const stats = useMemo(() => ({
    total: faqs.length,
    verified: faqs.filter((f) => f.verified_status === 'verified').length,
    withEmb: faqs.filter((f) => f.has_embedding).length,
  }), [faqs]);

  return (
    <div className="p-4 space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <BookOpen size={18} strokeWidth={2} className="text-brand-primary" />FAQ
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">RAG 임베딩 · 자동 재임베딩 (update 시)</p>
        </div>
        <div className="flex gap-1.5">
          <Badge variant="default">{stats.total}건</Badge>
          <Badge variant="success">검증 {stats.verified}</Badge>
          <Badge variant="primary"><Brain size={10} strokeWidth={2} className="mr-0.5" />{stats.withEmb}</Badge>
        </div>
      </header>

      <Card>
        <CardContent className="space-y-2 py-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <Input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="질문·답변·법령 검색" className="pl-8" />
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="px-2.5 py-1 border border-gray-300 rounded-md text-xs">
              <option value="all">전체 카테고리</option>
              {categories.map((c) => <option key={c.category || ''} value={c.category || ''}>{c.category || '미분류'} ({c.n})</option>)}
            </select>
          </div>
          <Tabs value={verifyFilter} onValueChange={(v) => setVerifyFilter(v as typeof verifyFilter)}>
            <TabsList>{VERIFY_TABS.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}</TabsList>
          </Tabs>
        </CardContent>
      </Card>

      <div className="space-y-1.5">
        {isLoading && Array.from({ length: 3 }).map((_, i) => <Card key={i}><CardContent className="py-2"><Skeleton className="h-16 w-full" /></CardContent></Card>)}
        {!isLoading && faqs.length === 0 && <Card><CardContent className="py-6"><EmptyState icon={<BookOpen size={32} strokeWidth={1.5} />} title="FAQ 가 없습니다" /></CardContent></Card>}
        {!isLoading && faqs.map((f) => (
          <Card key={f.id}>
            <CardContent className="py-2 px-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                    {f.q_number != null && <Badge variant="primary">Q{f.q_number}</Badge>}
                    {f.category && <Badge variant="default">{f.category}</Badge>}
                    {f.verified_status && <Badge variant={VERIFY_VARIANT[f.verified_status] || 'default'}>{f.verified_status}</Badge>}
                    {f.has_embedding ? <span className="text-green-600 flex items-center gap-0.5"><Brain size={10} strokeWidth={2} /> 임베딩</span> : <span className="text-red-500">⚠️ 임베딩 없음</span>}
                    {f.active === 0 && <Badge variant="default">비활성</Badge>}
                  </div>
                  <p className="font-medium text-xs text-gray-900 leading-tight mt-1">{f.question}</p>
                  <p className="text-[11px] text-gray-600 line-clamp-2 whitespace-pre-wrap leading-snug mt-0.5">{f.answer}</p>
                  {f.law_refs && <p className="text-[10px] text-gray-500 mt-0.5">📖 {f.law_refs}</p>}
                </div>
                <Button size="xs" variant="secondary" onClick={() => setEditing(f)}>
                  <Pencil size={10} strokeWidth={2} className="mr-0.5" />수정
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editing && <FaqEditModal faq={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function FaqEditModal({ faq, onClose }: { faq: Faq; onClose: () => void }) {
  const qc = useQueryClient();
  const [question, setQuestion] = useState(faq.question);
  const [answer, setAnswer] = useState(faq.answer);
  const [lawRefs, setLawRefs] = useState(faq.law_refs || '');
  const [category, setCategory] = useState(faq.category || '');
  const [verifiedStatus, setVerifiedStatus] = useState(faq.verified_status || 'unchecked');

  const saveM = useMutation({
    mutationFn: async () => {
      await trpcCall('faq.update', { id: faq.id, question, answer, law_refs: lawRefs, category });
      if (verifiedStatus !== faq.verified_status) {
        await trpcCall('faq.setVerified', { id: faq.id, status: verifiedStatus as 'unchecked' | 'verified' | 'wrong' | 'suspicious' });
      }
    },
    onSuccess: () => { toast.success('저장 + 임베딩 재생성'); qc.invalidateQueries({ queryKey: ['faq.list'] }); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-auto p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold">{faq.q_number != null ? `Q${faq.q_number}` : 'FAQ'} 수정</h2>
          <Button size="icon" variant="ghost" onClick={onClose}>✕</Button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">질문</label>
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2}
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">답변</label>
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={7}
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-mono" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">법령 근거</label>
            <Input type="text" value={lawRefs} onChange={(e) => setLawRefs(e.target.value)} placeholder="소득세법 제○조" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">카테고리</label>
              <Input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="부가세 / 종소세 / 법인세" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">검증 상태</label>
              <select value={verifiedStatus} onChange={(e) => setVerifiedStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs">
                <option value="unchecked">⏳ 미검증</option><option value="verified">✓ 검증됨</option>
                <option value="wrong">❌ 틀림</option><option value="suspicious">⚠️ 의심</option>
              </select>
            </div>
          </div>
          <p className="text-[10px] text-gray-500">💡 질문/답변 수정 시 OpenAI 임베딩 자동 재생성</p>
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={onClose} className="flex-1">취소</Button>
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending || !question.trim() || !answer.trim()} className="flex-1">
            {saveM.isPending ? '저장 중...' : '💾 저장 + 임베딩 재생성'}
          </Button>
        </div>
      </div>
    </div>
  );
}
