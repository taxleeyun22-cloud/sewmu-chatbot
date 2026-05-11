/**
 * Phase Next-Day28 (2026-05-11): /admin/faq — shadcn/ui.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { trpcCall } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Faq {
  id: number;
  q_number: number | null;
  category: string | null;
  question: string;
  answer: string;
  law_refs: string | null;
  active: number | null;
  verified_status: string | null;
  verified_note: string | null;
  has_embedding: boolean;
  updated_at: string | null;
}

interface CatCount {
  category: string | null;
  n: number;
}

const VERIFY_TABS = [
  { key: 'all' as const, label: '전체', emoji: '📚' },
  { key: 'unchecked' as const, label: '미검증', emoji: '⏳' },
  { key: 'verified' as const, label: '검증됨', emoji: '✓' },
  { key: 'wrong' as const, label: '틀림', emoji: '❌' },
  { key: 'suspicious' as const, label: '의심', emoji: '⚠️' },
];

const VERIFY_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'default'> = {
  verified: 'success',
  wrong: 'danger',
  suspicious: 'warning',
  unchecked: 'default',
};

export default function FaqPage() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [categories, setCategories] = useState<CatCount[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [verifyFilter, setVerifyFilter] = useState<
    'all' | 'unchecked' | 'verified' | 'wrong' | 'suspicious'
  >('all');
  const [editing, setEditing] = useState<Faq | null>(null);

  function refetch() {
    setLoading(true);
    trpcCall<{ faqs: Faq[]; categories: CatCount[] }>('faq.list', {
      search: search || undefined,
      category: category === 'all' ? undefined : category,
      verified: verifyFilter,
      limit: 500,
    })
      .then((d) => {
        setFaqs(d.faqs || []);
        setCategories(d.categories || []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyFilter, category]);

  useEffect(() => {
    const t = setTimeout(refetch, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const stats = useMemo(() => {
    const total = faqs.length;
    const verified = faqs.filter((f) => f.verified_status === 'verified').length;
    const withEmb = faqs.filter((f) => f.has_embedding).length;
    return { total, verified, withEmb };
  }, [faqs]);

  return (
    <div className="p-4 space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">📚 FAQ</h1>
          <p className="text-xs text-gray-500 mt-0.5">RAG 임베딩 · 자동 재임베딩 (update 시)</p>
        </div>
        <div className="flex gap-1.5">
          <Badge variant="default">{stats.total}건</Badge>
          <Badge variant="success">검증 {stats.verified}</Badge>
          <Badge variant="primary">🧠 {stats.withEmb}</Badge>
        </div>
      </header>

      <Card>
        <CardContent className="space-y-2 py-2">
          <div className="flex gap-2">
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 질문·답변·법령 검색"
              className="flex-1"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-2.5 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary"
            >
              <option value="all">전체 카테고리</option>
              {categories.map((c) => (
                <option key={c.category || ''} value={c.category || ''}>
                  {c.category || '미분류'} ({c.n})
                </option>
              ))}
            </select>
          </div>

          <Tabs value={verifyFilter} onValueChange={(v) => setVerifyFilter(v as typeof verifyFilter)}>
            <TabsList>
              {VERIFY_TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  <span className="mr-1">{t.emoji}</span>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      <div className="space-y-1.5">
        {loading && (
          <Card>
            <CardContent className="py-6 text-center text-gray-400 text-xs">
              불러오는 중...
            </CardContent>
          </Card>
        )}
        {!loading && faqs.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-gray-400 text-xs">
              FAQ 가 없습니다.
            </CardContent>
          </Card>
        )}
        {faqs.map((f) => (
          <Card key={f.id}>
            <CardContent className="py-2 px-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {f.q_number != null && (
                      <Badge variant="primary">Q{f.q_number}</Badge>
                    )}
                    {f.category && <Badge variant="default">{f.category}</Badge>}
                    {f.verified_status && (
                      <Badge variant={VERIFY_VARIANT[f.verified_status] || 'default'}>
                        {f.verified_status}
                      </Badge>
                    )}
                    {f.has_embedding ? (
                      <span className="text-[10px] text-green-600">🧠 임베딩 OK</span>
                    ) : (
                      <span className="text-[10px] text-red-500">⚠️ 임베딩 없음</span>
                    )}
                    {f.active === 0 && (
                      <Badge variant="default">비활성</Badge>
                    )}
                  </div>
                  <p className="font-medium text-xs text-gray-900 leading-tight mt-1">
                    {f.question}
                  </p>
                  <p className="text-[11px] text-gray-600 line-clamp-2 whitespace-pre-wrap leading-snug mt-0.5">
                    {f.answer}
                  </p>
                  {f.law_refs && (
                    <p className="text-[10px] text-gray-500 mt-0.5">📖 {f.law_refs}</p>
                  )}
                </div>
                <Button size="xs" variant="secondary" onClick={() => setEditing(f)}>
                  ✏️ 수정
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editing && (
        <FaqEditModal
          faq={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function FaqEditModal({
  faq,
  onClose,
  onSaved,
}: {
  faq: Faq;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [question, setQuestion] = useState(faq.question);
  const [answer, setAnswer] = useState(faq.answer);
  const [lawRefs, setLawRefs] = useState(faq.law_refs || '');
  const [category, setCategory] = useState(faq.category || '');
  const [verifiedStatus, setVerifiedStatus] = useState(faq.verified_status || 'unchecked');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await trpcCall('faq.update', {
        id: faq.id,
        question,
        answer,
        law_refs: lawRefs,
        category,
      });
      if (verifiedStatus !== faq.verified_status) {
        await trpcCall('faq.setVerified', {
          id: faq.id,
          status: verifiedStatus as 'unchecked' | 'verified' | 'wrong' | 'suspicious',
        });
      }
      onSaved();
    } catch (e) {
      alert(`저장 실패: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-auto p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold">
            {faq.q_number != null ? `Q${faq.q_number}` : 'FAQ'} 수정
          </h2>
          <Button size="icon" variant="ghost" onClick={onClose}>
            ✕
          </Button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">질문</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">답변</label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={7}
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-mono focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">법령 근거</label>
            <Input
              type="text"
              value={lawRefs}
              onChange={(e) => setLawRefs(e.target.value)}
              placeholder="소득세법 제○조 / 부가세법 시행령 제○조"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">카테고리</label>
              <Input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="부가세 / 종소세 / 법인세"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">검증 상태</label>
              <select
                value={verifiedStatus}
                onChange={(e) => setVerifiedStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary"
              >
                <option value="unchecked">⏳ 미검증</option>
                <option value="verified">✓ 검증됨</option>
                <option value="wrong">❌ 틀림</option>
                <option value="suspicious">⚠️ 의심</option>
              </select>
            </div>
          </div>
          <p className="text-[10px] text-gray-500">
            💡 질문/답변 수정 시 OpenAI 임베딩 자동 재생성 (RAG 적용)
          </p>
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={onClose} className="flex-1">
            취소
          </Button>
          <Button
            onClick={save}
            disabled={saving || !question.trim() || !answer.trim()}
            className="flex-1"
          >
            {saving ? '저장 중...' : '💾 저장 + 임베딩 재생성'}
          </Button>
        </div>
      </div>
    </div>
  );
}
