/**
 * Phase Next-Week5 (2026-05-09): /admin/filings.
 * 기존 admin-filing-review.js 마이그레이션.
 * 신고 검토표 (부가세/종소세/법인세 Case + 체크리스트 + PDF export).
 */
'use client';

import { useState } from 'react';

const FILING_TYPES = ['부가세', '종소세', '법인세', '원천세', '양도세', '지방세', '기타'];

export default function FilingsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">신고 검토표</h1>
        <button className="bg-brand-primary text-white px-4 py-2 rounded-lg font-medium">
          + 새 Case
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        <button className="px-4 py-2 rounded-full text-sm font-medium bg-brand-primary text-white">
          전체
        </button>
        {FILING_TYPES.map((t) => (
          <button
            key={t}
            className="px-4 py-2 rounded-full text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {t}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-6">
        <p className="text-center text-gray-400 py-12 text-sm">
          Phase Next-Week5 — Case + 체크리스트 + D-day + PDF export Day 2 본격.
        </p>
      </div>
    </div>
  );
}
