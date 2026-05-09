/**
 * Phase Next-Week5 (2026-05-09): /admin/memos.
 * 기존 admin-memos.js 마이그레이션. 통합 메모 (할 일/거래처 정보/완료 + 카테고리).
 */
'use client';

import { useState } from 'react';

const CATEGORIES = [
  { key: 'all', label: '전체' },
  { key: 'todo', label: '📌 할 일' },
  { key: 'phone', label: '📞 전화' },
  { key: 'doc', label: '📁 문서' },
  { key: 'issue', label: '⚠️ 이슈' },
  { key: 'appt', label: '📅 약속' },
  { key: 'general', label: '📝 일반' },
];

export default function MemosPage() {
  const [category, setCategory] = useState('all');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">메모</h1>
        <button className="bg-brand-primary text-white px-4 py-2 rounded-lg font-medium">
          + 빠른 메모
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              category === c.key
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-6">
        <p className="text-center text-gray-400 py-12 text-sm">
          Phase Next-Week5 — 메모 통합 list (#태그, D-day, 첨부, 거래처/업체/방 매핑) Day 2 본격.
        </p>
      </div>
    </div>
  );
}
