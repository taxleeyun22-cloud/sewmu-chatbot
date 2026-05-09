/**
 * Phase Next-Day15 (2026-05-09): /admin/filings/[id] — 신고 검토표 상세.
 * 사장님 명세 (2026-05-07): 종소세·법인세 결재 검토표.
 * - auto_fields 자동 저장 (입력 즉시)
 * - 작년 vs 올해 비교
 * - 결재 흐름 (작성중 → 결재대기 → 보관완료)
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { trpcCall } from '@/lib/trpc';

interface Filing {
  id: number;
  type: string;
  fiscal_year: number;
  owner_type: string;
  owner_id: number;
  included_business_ids: string | null;
  auto_fields: string | null;
  review_status: string | null;
  reviewer_comment: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const ST_COLOR: Record<string, string> = {
  작성중: 'bg-gray-200 text-gray-700',
  결재대기: 'bg-yellow-100 text-yellow-800',
  보관완료: 'bg-green-100 text-green-800',
};

const FIELD_GROUPS: { title: string; fields: { key: string; label: string; placeholder?: string }[] }[] = [
  {
    title: '🧾 매출·매입 (작년 vs 올해)',
    fields: [
      { key: 'sales_total', label: '매출 합계', placeholder: '원' },
      { key: 'purchase_total', label: '매입 합계', placeholder: '원' },
      { key: 'vat_payable', label: '부가세 납부세액', placeholder: '원' },
      { key: 'taxable_income', label: '과세표준', placeholder: '원' },
    ],
  },
  {
    title: '💼 인건비',
    fields: [
      { key: 'payroll_total', label: '인건비 합계', placeholder: '원' },
      { key: 'withholding_total', label: '원천세 합계', placeholder: '원' },
    ],
  },
  {
    title: '📊 산출세액',
    fields: [
      { key: 'computed_tax', label: '산출세액', placeholder: '원' },
      { key: 'final_tax', label: '결정세액', placeholder: '원' },
      { key: 'paid_tax', label: '기납부세액', placeholder: '원' },
    ],
  },
];

export default function FilingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Number(params.id);

  const [filing, setFiling] = useState<Filing | null>(null);
  const [previous, setPrevious] = useState<Filing | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoFields, setAutoFields] = useState<Record<string, string>>({});
  const [reviewerComment, setReviewerComment] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    trpcCall<{ filing: Filing | null; previous: Filing | null }>('filings.byId', { id })
      .then((d) => {
        setFiling(d.filing);
        setPrevious(d.previous);
        if (d.filing?.auto_fields) {
          try {
            setAutoFields(JSON.parse(d.filing.auto_fields));
          } catch {}
        }
        setReviewerComment(d.filing?.reviewer_comment || '');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const prevFields = useMemo(() => {
    if (!previous?.auto_fields) return {};
    try {
      return JSON.parse(previous.auto_fields) as Record<string, string>;
    } catch {
      return {};
    }
  }, [previous]);

  async function saveField(key: string, value: string) {
    const next = { ...autoFields, [key]: value };
    setAutoFields(next);
    setSaving(true);
    try {
      await trpcCall('filings.patchFields', { id, auto_fields: next });
    } finally {
      setSaving(false);
    }
  }

  async function saveComment() {
    setSaving(true);
    try {
      await trpcCall('filings.patchFields', { id, reviewer_comment: reviewerComment });
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: '작성중' | '결재대기' | '보관완료') {
    if (!confirm(`상태를 "${status}" 로 변경할까요?`)) return;
    await trpcCall('filings.setStatus', { id, status });
    setFiling((f) => (f ? { ...f, review_status: status } : f));
  }

  function formatNumber(v: string | undefined) {
    if (!v) return '-';
    const n = Number(v);
    if (!Number.isFinite(n)) return v;
    return n.toLocaleString();
  }

  function diff(curr: string | undefined, prev: string | undefined): string | null {
    const c = Number(curr || 0);
    const p = Number(prev || 0);
    if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
    const pct = ((c - p) / Math.abs(p)) * 100;
    if (Math.abs(pct) < 0.01) return null;
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <p className="text-center text-gray-400 py-12 text-sm">불러오는 중...</p>
      </div>
    );
  }

  if (!filing) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <button onClick={() => router.back()} className="text-sm text-brand-primary mb-4">
          ← 목록
        </button>
        <p className="text-center text-gray-400 py-12 text-sm">신고 Case 를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button onClick={() => router.back()} className="text-sm text-brand-primary mb-4">
        ← 목록
      </button>

      {/* 헤더 */}
      <div className="bg-white rounded-2xl p-6 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900">
            [{filing.fiscal_year}귀속] {filing.type}
          </h1>
          <span
            className={`text-xs px-3 py-1 rounded-full font-medium ${
              ST_COLOR[filing.review_status || '작성중']
            }`}
          >
            {filing.review_status || '작성중'}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          {filing.owner_type} #{filing.owner_id}
          {previous && (
            <span className="ml-2 text-brand-primary">
              · 작년 Case #{previous.id} 자동 참조
            </span>
          )}
        </p>
        {saving && (
          <p className="text-xs text-blue-500 mt-2">💾 자동 저장 중...</p>
        )}
      </div>

      {/* 결재 흐름 */}
      <div className="bg-white rounded-2xl p-5 mb-4">
        <h2 className="font-bold mb-3">📋 결재 흐름</h2>
        <div className="flex gap-2">
          {(['작성중', '결재대기', '보관완료'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              disabled={filing.review_status === s}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                filing.review_status === s
                  ? 'bg-brand-primary text-white cursor-not-allowed opacity-60'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 필드 그룹 — 작년 vs 올해 비교 */}
      {FIELD_GROUPS.map((group) => (
        <div key={group.title} className="bg-white rounded-2xl p-5 mb-4">
          <h2 className="font-bold mb-4">{group.title}</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="text-left py-2">항목</th>
                <th className="text-right py-2">작년 ({filing.fiscal_year - 1})</th>
                <th className="text-right py-2">올해 ({filing.fiscal_year})</th>
                <th className="text-right py-2">증감</th>
              </tr>
            </thead>
            <tbody>
              {group.fields.map((f) => (
                <tr key={f.key} className="border-t border-gray-100">
                  <td className="py-3 text-gray-700">{f.label}</td>
                  <td className="py-3 text-right font-mono text-gray-500">
                    {formatNumber(prevFields[f.key])}
                  </td>
                  <td className="py-3 text-right">
                    <input
                      type="text"
                      value={autoFields[f.key] || ''}
                      onChange={(e) => setAutoFields((s) => ({ ...s, [f.key]: e.target.value }))}
                      onBlur={(e) => saveField(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-32 text-right px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-primary font-mono"
                    />
                  </td>
                  <td className="py-3 text-right text-xs">
                    {(() => {
                      const d = diff(autoFields[f.key], prevFields[f.key]);
                      if (!d) return <span className="text-gray-300">-</span>;
                      return (
                        <span
                          className={
                            d.startsWith('+')
                              ? 'text-red-500 font-medium'
                              : 'text-blue-500 font-medium'
                          }
                        >
                          {d}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* 결재자 코멘트 */}
      <div className="bg-white rounded-2xl p-5 mb-4">
        <h2 className="font-bold mb-3">💬 결재자 코멘트</h2>
        <textarea
          value={reviewerComment}
          onChange={(e) => setReviewerComment(e.target.value)}
          onBlur={saveComment}
          rows={4}
          placeholder="결재 의견을 작성하세요..."
          className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-primary"
        />
      </div>

      {/* PDF export — 추후 */}
      <div className="bg-white rounded-2xl p-5 text-center">
        <button
          disabled
          className="bg-gray-200 text-gray-500 px-6 py-3 rounded-xl font-medium cursor-not-allowed"
        >
          📄 PDF 내보내기 (Day 16 — Puppeteer/Workers PDF API 통합)
        </button>
      </div>
    </div>
  );
}
