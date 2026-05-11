/**
 * Phase Next-Day15 (2026-05-09): /admin/faq — FAQ 본체 (Q1~Q71+).
 * RAG 임베딩 자동 재생성 (update 시).
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { trpcCall } from '@/lib/trpc';

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

const VERIFY_TABS: { key: 'all' | 'unchecked' | 'verified' | 'wrong' | 'suspicious'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'unchecked', label: '⏳ 미검증' },
  { key: 'verified', label: '✓ 검증됨' },
  { key: 'wrong', label: '❌ 틀림' },
  { key: 'suspicious', label: '⚠️ 의심' },
];

const VERIFY_COLOR: Record<string, string> = {
  verified: 'bg-green-100 text-green-700',
  wrong: 'bg-red-100 text-red-700',
  suspicious: 'bg-yellow-100 text-yellow-700',
  unchecked: 'bg-gray-100 text-gray-700',
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

  /* 검색은 debounce */
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
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-base font-bold text-gray-900">📚 FAQ</h1>
        <div className="text-[11px] text-gray-500">
          {stats.total}건 · 검증 {stats.verified} · 임베딩 {stats.withEmb}
        </div>
      </div>

      {/* 검색 + 카테고리 */}
      <div className="bg-white rounded-lg border border-gray-200 px-2 py-1.5 mb-2">
        <div className="flex gap-1.5 mb-1.5">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 질문·답변·법령 검색"
            className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-brand-primary"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-brand-primary"
          >
            <option value="all">전체 카테고리</option>
            {categories.map((c) => (
              <option key={c.category || ''} value={c.category || ''}>
                {c.category || '미분류'} ({c.n})
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-1 flex-wrap">
          {VERIFY_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setVerifyFilter(t.key)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                verifyFilter === t.key
                  ? 'bg-brand-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* FAQ 카드 — 컴팩트 */}
      <div className="space-y-1">
        {loading && (
          <p className="text-center text-gray-400 py-6 text-xs">불러오는 중...</p>
        )}
        {!loading && faqs.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-400 text-xs">
            FAQ 가 없습니다.
          </div>
        )}
        {faqs.map((f) => (
          <div key={f.id} className="bg-white rounded-lg border border-gray-200 px-2 py-1.5">
            <div className="flex items-start justify-between gap-1.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap text-[10px]">
                  {f.q_number != null && (
                    <span className="font-bold text-brand-primary">Q{f.q_number}</span>
                  )}
                  {f.category && (
                    <span className="bg-blue-50 text-blue-600 px-1 py-0 rounded">
                      {f.category}
                    </span>
                  )}
                  {f.verified_status && (
                    <span
                      className={`px-1 py-0 rounded ${
                        VERIFY_COLOR[f.verified_status] || 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {f.verified_status}
                    </span>
                  )}
                  {f.has_embedding ? (
                    <span className="text-green-600">🧠</span>
                  ) : (
                    <span className="text-red-500">⚠️ 임베딩 없음</span>
                  )}
                  {f.active === 0 && (
                    <span className="bg-gray-200 text-gray-500 px-1 py-0 rounded">
                      비활성
                    </span>
                  )}
                </div>
                <p className="font-medium text-xs text-gray-900 leading-tight">{f.question}</p>
                <p className="text-[11px] text-gray-600 line-clamp-2 whitespace-pre-wrap leading-snug">
                  {f.answer}
                </p>
                {f.law_refs && (
                  <p className="text-[10px] text-gray-500">📖 {f.law_refs}</p>
                )}
              </div>
              <button
                onClick={() => setEditing(f)}
                className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-200 flex-shrink-0"
              >
                ✏️수정
              </button>
            </div>
          </div>
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
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">
            {faq.q_number != null ? `Q${faq.q_number}` : 'FAQ'} 수정
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">질문</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-primary"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">답변</label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-brand-primary"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">법령 근거</label>
            <input
              type="text"
              value={lawRefs}
              onChange={(e) => setLawRefs(e.target.value)}
              placeholder="소득세법 제○조 / 부가세법 시행령 제○조 등"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">카테고리</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="부가세 / 종소세 / 법인세 / etc"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">검증 상태</label>
              <select
                value={verifiedStatus}
                onChange={(e) => setVerifiedStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-primary"
              >
                <option value="unchecked">⏳ 미검증</option>
                <option value="verified">✓ 검증됨</option>
                <option value="wrong">❌ 틀림</option>
                <option value="suspicious">⚠️ 의심</option>
              </select>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            💡 질문/답변 수정 시 OpenAI 임베딩 자동 재생성 (RAG 적용)
          </p>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={save}
            disabled={saving || !question.trim() || !answer.trim()}
            className="flex-1 py-2 bg-brand-primary text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '💾 저장 + 임베딩 재생성'}
          </button>
        </div>
      </div>
    </div>
  );
}
