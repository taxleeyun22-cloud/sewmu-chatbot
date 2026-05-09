/**
 * Phase Next-Day12 (2026-05-09): /admin/bulk-send — 단체발송.
 */
'use client';

import { useState } from 'react';

const TEMPLATES = [
  '월말 매입 영수증 제출 안내',
  '신고 마감일 임박 안내',
  '연말정산 자료 요청',
  '계약갱신 안내',
];

export default function BulkSendPage() {
  const [target, setTarget] = useState<'all' | 'approved_client'>('approved_client');
  const [message, setMessage] = useState('');

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">📢 단체발송</h1>

      <section className="bg-white rounded-2xl p-5 mb-4">
        <h2 className="font-bold mb-3">📌 템플릿</h2>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t}
              onClick={() => setMessage(t)}
              className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-left"
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl p-5 mb-4">
        <h2 className="font-bold mb-3">🎯 대상 선택</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setTarget('approved_client')}
            className={`px-4 py-2 rounded-full text-sm ${
              target === 'approved_client'
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            ⭐ 기장거래처
          </button>
          <button
            onClick={() => setTarget('all')}
            className={`px-4 py-2 rounded-full text-sm ${
              target === 'all'
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            전체
          </button>
        </div>
      </section>

      <section className="bg-white rounded-2xl p-5 mb-4">
        <h2 className="font-bold mb-3">✍️ 메시지</h2>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          placeholder="메시지를 입력하세요..."
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
      </section>

      <button
        disabled={!message.trim()}
        className="w-full bg-brand-primary text-white py-3 rounded-2xl font-medium disabled:opacity-50"
      >
        📢 발송 (Day 13 — 카톡 알림톡 Kakao Biz API 통합)
      </button>
    </div>
  );
}
