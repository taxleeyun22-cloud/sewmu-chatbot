/**
 * Phase Next-Week2 (2026-05-09): "/" 챗봇 메인 page.
 *
 * 기존 index.html (411줄) + index.js (3545줄) → Next.js App Router.
 *
 * 마이그레이션 단계:
 *   1. 기본 UI (이번 commit) — 메시지 input + 응답 영역 + 추천 질문 4개
 *   2. tRPC chat procedure (다음 commit) — chat.js 로직 재사용
 *   3. 카카오 OAuth (다음) — Auth.js v5
 *   4. FAQ RAG retrieval (다음) — _faq.js + 임베딩
 *   5. 영수증 업로드 / 첨부 (그 다음)
 *
 * 사장님 추천 질문 (5월 종소세 시즌, 2026-05-02 결정):
 */
'use client';

import { useState } from 'react';

const QUICK_QUESTIONS = [
  '5월 종소세 누가 신고해야 하나요?',
  '프리랜서 3.3% 환급되나요?',
  '셀프 신고 vs 세무사 신고 차이?',
  '종소세 가산세 얼마?',
];

interface Message {
  role: 'user' | 'assistant';
  content: string;
  confidence?: '높음' | '보통' | '낮음';
  timestamp: Date;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        '안녕하세요. 세무회계 이윤 AI 세무사 입니다.\n부가세, 종소세, 법인세 등 세무 관련 질문 무엇이든 물어보세요.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendMessage(content: string) {
    if (!content.trim()) return;
    const userMsg: Message = { role: 'user', content, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // Phase Next-Week2-Day2 (next): tRPC procedure 또는 옛 /api/chat 호출
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
      });
      const data = await res.json();
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.response || data.error || '답변 생성 실패',
        confidence: data.confidence,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '⚠️ 네트워크 오류. 잠시 후 다시 시도해주세요.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function askQuick(q: string) {
    sendMessage(q);
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">
          🏢 세무회계 이윤 — AI 세무 상담
        </h1>
        <a
          href="/mypage"
          className="text-sm text-brand-primary hover:underline"
        >
          내 정보 →
        </a>
      </header>

      {/* 메시지 영역 */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] px-4 py-3 rounded-2xl ${
                  m.role === 'user'
                    ? 'bg-brand-kakao text-brand-kakao-text rounded-br-sm'
                    : 'bg-white border border-gray-200 rounded-bl-sm'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {m.content}
                </p>
                {m.confidence && (
                  <span
                    className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full ${
                      m.confidence === '높음'
                        ? 'bg-green-100 text-green-800'
                        : m.confidence === '보통'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                    }`}
                  >
                    [신뢰도: {m.confidence}]
                  </span>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3">
                <p className="text-sm text-gray-500">답변 생성 중...</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 추천 질문 */}
      {messages.length <= 1 && (
        <div className="px-4 py-3 bg-white border-t border-gray-200">
          <div className="max-w-3xl mx-auto">
            <p className="text-xs text-gray-500 mb-2">📌 빠른 질문</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => askQuick(q)}
                  disabled={loading}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-full transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 입력 */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border-t border-gray-200 px-4 py-3"
      >
        <div className="max-w-3xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="세무 질문을 입력하세요..."
            disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-brand-primary text-white px-5 py-2 rounded-full font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            전송
          </button>
        </div>
        <p className="text-[10px] text-gray-400 text-center mt-2 max-w-3xl mx-auto">
          ⓘ AI 답변은 참고 정보입니다. 중요 결정 전 세무사 직접 상담 권장.
        </p>
      </form>
    </div>
  );
}
