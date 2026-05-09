/**
 * Phase Next-Week4 (2026-05-09): /admin/users.
 * 기존 admin-users-tab.js 마이그레이션.
 */
'use client';

import { useState } from 'react';

const STATUS_TABS = [
  { key: 'pending', label: '대기', color: 'yellow' },
  { key: 'approved_client', label: '기장거래처', color: 'blue' },
  { key: 'rejected', label: '거절', color: 'red' },
  { key: 'terminated', label: '종료', color: 'gray' },
  { key: 'rejoined', label: '재가입', color: 'orange' },
  { key: 'admin', label: '관리자', color: 'purple' },
];

export default function UsersPage() {
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">사용자</h1>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 이름 / 전화 / 이메일 검색"
          className="w-80 px-4 py-2 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
      </div>

      {/* status 탭 */}
      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              status === t.key
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* list 영역 */}
      <div className="bg-white rounded-2xl p-6">
        <div className="text-center text-gray-400 py-12">
          <p className="text-sm">Phase Next-Week4 Day 1 — 골격 완성</p>
          <p className="text-xs mt-2">Day 2: tRPC 사용자 list fetch + 액션 (승인/거절/등)</p>
          <p className="text-xs mt-1">현재 status: <code className="bg-gray-100 px-2 py-1 rounded">{status}</code></p>
          <p className="text-xs mt-1">검색: <code className="bg-gray-100 px-2 py-1 rounded">{search || '(없음)'}</code></p>
        </div>
      </div>
    </div>
  );
}
