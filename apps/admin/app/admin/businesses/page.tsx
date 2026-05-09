/**
 * Phase Next-Week4 (2026-05-09): /admin/businesses.
 * 기존 admin-business-tab.js 마이그레이션. 본·지점 indent.
 */
'use client';

import { useState } from 'react';

const STATUS_TABS = [
  { key: 'all', label: '전체' },
  { key: 'active', label: '활성' },
  { key: 'closed', label: '종료' },
  { key: 'terminated', label: '이관' },
];

export default function BusinessesPage() {
  const [status, setStatus] = useState('all');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">업체</h1>
        <button className="bg-brand-success text-white px-4 py-2 rounded-lg font-medium">
          + 새 업체
        </button>
      </div>

      <input
        type="text"
        placeholder="🔍 업체명 / 사업자번호 / 대표자명 검색"
        className="w-full px-4 py-2 mb-4 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
      />

      <div className="flex gap-2 mb-6">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              status === t.key
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-6">
        <p className="text-center text-gray-400 py-12 text-sm">
          Phase Next-Week4 Day 1 — 골격 완성. Day 2: Drizzle query + 본·지점 indent + 14필드.
        </p>
      </div>
    </div>
  );
}
