/**
 * Phase Next-Week5 (2026-05-09): /admin/search.
 * 기존 admin-search-bulk.js (전역 검색) 마이그레이션.
 * 7개 그룹: 사용자 / 상담방 / 메시지 / 메모 / 업체 / 문서 / 일반대화
 */
'use client';

import { useState } from 'react';

export default function SearchPage() {
  const [query, setQuery] = useState('');

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">전역 검색</h1>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="사용자 · 상담방 · 메시지 · 메모 · 업체 · 문서 검색"
        autoFocus
        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
      />

      <div className="mt-6 bg-white rounded-2xl p-6">
        {query.length < 2 ? (
          <p className="text-center text-gray-400 py-8 text-sm">2자 이상 입력하세요</p>
        ) : (
          <p className="text-center text-gray-400 py-8 text-sm">
            Phase Next-Week5 — Day 2 부터 admin-search API 연동
          </p>
        )}
      </div>
    </div>
  );
}
