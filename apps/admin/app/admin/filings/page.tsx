/**
 * Phase Next-Week5 (2026-05-09): /admin/filings.
 * 기존 admin-filing-review.js 마이그레이션.
 * 신고 검토표 (부가세/종소세/법인세 Case + 체크리스트 + PDF export).
 */
'use client';

import { useEffect, useState } from 'react';
import { trpcCall } from '@/lib/trpc';

interface Filing {
  id: number;
  fiscal_year: number | string;
  type: string | null;
  review_status: string | null;
  auto_fields: string | null;
}

const ST_COLOR: Record<string, string> = {
  작성중: 'bg-gray-200 text-gray-700',
  결재대기: 'bg-yellow-100 text-yellow-800',
  보관완료: 'bg-green-100 text-green-800',
};

export default function FilingsPage() {
  const [filings, setFilings] = useState<Filing[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    trpcCall<{ filings: Filing[] }>('filings.list', {})
      .then((d) => setFilings(d.filings || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">신고 검토표</h1>
        <button className="bg-brand-primary text-white px-4 py-2 rounded-lg font-medium">
          + 새 Case
        </button>
      </div>

      <div className="bg-white rounded-2xl p-6">
        {loading && <p className="text-center text-gray-400 py-12 text-sm">불러오는 중...</p>}
        {!loading && filings.length === 0 && (
          <p className="text-center text-gray-400 py-12 text-sm">
            신고 Case 가 없습니다. + 새 Case 로 시작하세요.
          </p>
        )}
        {!loading && filings.length > 0 && (
          <ul className="space-y-2">
            {filings.map((f) => (
              <li
                key={f.id}
                className="p-4 border border-gray-200 rounded-xl hover:border-brand-primary cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div>
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
                  </div>
                  <span className="text-brand-primary">›</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
