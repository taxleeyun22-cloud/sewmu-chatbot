/**
 * Phase Next-Day15 (2026-05-09): /admin/filings — 신고 검토표 list.
 * 사장님 명세 (2026-05-07): 종소세·법인세 결재 검토표.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trpcCall } from '@/lib/trpc';

interface Filing {
  id: number;
  fiscal_year: number;
  type: string;
  review_status: string | null;
  owner_type: string;
  owner_id: number;
  updated_at: string | null;
}

const ST_COLOR: Record<string, string> = {
  작성중: 'bg-gray-200 text-gray-700',
  결재대기: 'bg-yellow-100 text-yellow-800',
  보관완료: 'bg-green-100 text-green-800',
};

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: '작성중', label: '작성중' },
  { key: '결재대기', label: '결재대기' },
  { key: '보관완료', label: '보관완료' },
];

export default function FilingsPage() {
  const [filings, setFilings] = useState<Filing[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);

  function refetch() {
    setLoading(true);
    trpcCall<{ filings: Filing[] }>('filings.list', { limit: 100 })
      .then((d) => setFilings(d.filings || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refetch();
  }, []);

  const visible = statusFilter === 'all'
    ? filings
    : filings.filter((f) => (f.review_status || '작성중') === statusFilter);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">📋 신고 검토표</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-brand-primary text-white px-4 py-2 rounded-lg font-medium hover:opacity-90"
        >
          + 새 Case
        </button>
      </div>

      {/* 상태 탭 */}
      <div className="flex gap-2 mb-6">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              statusFilter === t.key
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-6">
        {loading && <p className="text-center text-gray-400 py-12 text-sm">불러오는 중...</p>}
        {!loading && visible.length === 0 && (
          <p className="text-center text-gray-400 py-12 text-sm">
            {statusFilter === 'all'
              ? '신고 Case 가 없습니다. + 새 Case 로 시작하세요.'
              : `"${statusFilter}" 상태의 Case 가 없습니다.`}
          </p>
        )}
        {!loading && visible.length > 0 && (
          <ul className="space-y-2">
            {visible.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/admin/filings/${f.id}`}
                  className="block p-4 border border-gray-200 rounded-xl hover:border-brand-primary cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">
                        [{f.fiscal_year}귀속] {f.type}
                        <span
                          className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                            ST_COLOR[f.review_status || '작성중'] || 'bg-gray-200'
                          }`}
                        >
                          {f.review_status || '작성중'}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {f.owner_type} #{f.owner_id}
                        {f.updated_at && ` · ${f.updated_at.slice(0, 10)}`}
                      </p>
                    </div>
                    <span className="text-brand-primary text-xl">›</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showCreate && (
        <CreateFilingModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function CreateFilingModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<'종소세' | '법인세'>('종소세');
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear() - 1);
  const [ownerType, setOwnerType] = useState<'Person' | 'Business'>('Person');
  const [ownerId, setOwnerId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const oid = Number(ownerId);
    if (!Number.isFinite(oid) || oid <= 0) {
      alert('Owner ID 를 정확히 입력하세요.');
      return;
    }
    setSubmitting(true);
    try {
      await trpcCall('filings.create', {
        type,
        fiscal_year: fiscalYear,
        owner_type: ownerType,
        owner_id: oid,
      });
      onCreated();
    } catch (e) {
      alert(`생성 실패: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-4">+ 새 신고 Case</h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">유형</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as '종소세' | '법인세')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-primary"
            >
              <option value="종소세">종합소득세 (Person)</option>
              <option value="법인세">법인세 (Business)</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">귀속연도</label>
            <input
              type="number"
              value={fiscalYear}
              onChange={(e) => setFiscalYear(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-primary"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Owner</label>
            <div className="flex gap-2">
              <select
                value={ownerType}
                onChange={(e) => setOwnerType(e.target.value as 'Person' | 'Business')}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-primary"
              >
                <option value="Person">Person</option>
                <option value="Business">Business</option>
              </select>
              <input
                type="number"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                placeholder="ID"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-primary"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={submitting || !ownerId}
            className="flex-1 py-2 bg-brand-primary text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? '생성 중...' : '생성'}
          </button>
        </div>
      </div>
    </div>
  );
}
