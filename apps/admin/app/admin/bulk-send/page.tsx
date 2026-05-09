/**
 * Phase Next-Day24 (2026-05-09): /admin/bulk-send — 단체 알림톡.
 *
 * 사장님 워크플로:
 * 1. 템플릿 선택 (4개 사전 등록)
 * 2. 대상 선택 (전체 / 기장거래처 / 대기 / 특정)
 * 3. 메시지 입력 (#{이름} 변수 자동 치환)
 * 4. Preview → 대상 명단 확인
 * 5. 발송 → 카카오 Biz API
 */
'use client';

import { useState } from 'react';
import { trpcCall } from '@/lib/trpc';

const TEMPLATES = [
  { code: 'TPL_RECEIPT', name: '월말 매입 영수증 제출 안내', body: '#{이름}님, 월말 매입 영수증 제출 부탁드립니다.' },
  { code: 'TPL_DEADLINE', name: '신고 마감일 임박 안내', body: '#{이름}님, #{날짜} 신고 마감 임박입니다.' },
  { code: 'TPL_YEAREND', name: '연말정산 자료 요청', body: '#{이름}님, 연말정산 자료 준비 부탁드립니다.' },
  { code: 'TPL_RENEWAL', name: '계약갱신 안내', body: '#{이름}님, 계약 갱신 시기입니다.' },
];

const TARGETS = [
  { key: 'approved_client', label: '⭐ 기장거래처' },
  { key: 'pending', label: '⏳ 대기' },
  { key: 'all', label: '전체' },
];

interface PreviewResult {
  recipients: Array<{
    id: number;
    real_name: string | null;
    name: string | null;
    phone: string | null;
  }>;
  total: number;
  valid_phone: number;
  no_phone: number;
}

interface SendResult {
  ok: boolean;
  error?: string;
  recipients: number;
  sent: number;
  failed: number;
}

export default function BulkSendPage() {
  const [target, setTarget] = useState<'all' | 'approved_client' | 'pending'>(
    'approved_client',
  );
  const [templateCode, setTemplateCode] = useState(TEMPLATES[0].code);
  const [message, setMessage] = useState(TEMPLATES[0].body);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);

  function selectTemplate(code: string) {
    setTemplateCode(code);
    const t = TEMPLATES.find((x) => x.code === code);
    if (t) setMessage(t.body);
  }

  async function runPreview() {
    setPreviewing(true);
    setSendResult(null);
    try {
      const r = await trpcCall<PreviewResult>('bulkSend.preview', { target });
      setPreview(r);
    } catch (e) {
      alert(`Preview 실패: ${(e as Error).message}`);
    } finally {
      setPreviewing(false);
    }
  }

  async function runSend() {
    if (!preview || preview.valid_phone === 0) {
      alert('먼저 미리보기 → 대상 확인');
      return;
    }
    if (!confirm(`${preview.valid_phone}명 에게 발송하시겠습니까?`)) return;

    setSending(true);
    try {
      const r = await trpcCall<SendResult>('bulkSend.send', {
        target,
        template_code: templateCode,
        message,
      });
      setSendResult(r);
      if (!r.ok) alert(`발송 실패: ${r.error}`);
    } catch (e) {
      alert(`오류: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">📢 단체발송 (카카오 알림톡)</h1>

      <section className="bg-white rounded-2xl p-5 mb-4">
        <h2 className="font-bold mb-3">📌 템플릿</h2>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.code}
              onClick={() => selectTemplate(t.code)}
              className={`text-sm px-3 py-2 rounded-lg text-left border transition-colors ${
                templateCode === t.code
                  ? 'bg-blue-50 border-brand-primary text-brand-primary'
                  : 'bg-gray-100 border-transparent hover:bg-gray-200 text-gray-700'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl p-5 mb-4">
        <h2 className="font-bold mb-3">🎯 대상 선택</h2>
        <div className="flex gap-2 flex-wrap">
          {TARGETS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTarget(t.key as typeof target);
                setPreview(null);
              }}
              className={`px-4 py-2 rounded-full text-sm ${
                target === t.key
                  ? 'bg-brand-primary text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl p-5 mb-4">
        <h2 className="font-bold mb-3">✍️ 메시지</h2>
        <p className="text-xs text-gray-500 mb-2">
          💡 변수: <code className="bg-gray-100 px-1 rounded">#{`{이름}`}</code> 자동 치환 (사용자별 real_name)
        </p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          placeholder="메시지를 입력하세요..."
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
      </section>

      <div className="flex gap-3 mb-4">
        <button
          onClick={runPreview}
          disabled={previewing}
          className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-2xl font-medium hover:bg-gray-200 disabled:opacity-50"
        >
          {previewing ? '확인 중...' : '👀 미리보기 (대상 확인)'}
        </button>
        <button
          onClick={runSend}
          disabled={!message.trim() || sending || !preview || preview.valid_phone === 0}
          className="flex-1 bg-brand-primary text-white py-3 rounded-2xl font-medium hover:opacity-90 disabled:opacity-50"
        >
          {sending ? '발송 중...' : '📢 발송'}
        </button>
      </div>

      {preview && (
        <section className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-4">
          <h3 className="font-bold mb-2">대상 미리보기</h3>
          <p className="text-sm">
            전체 {preview.total}명 · 휴대폰 있음 <strong className="text-brand-primary">{preview.valid_phone}</strong>명 · 휴대폰 없음 {preview.no_phone}명
          </p>
          {preview.no_phone > 0 && (
            <p className="text-xs text-orange-600 mt-1">
              ⚠️ 휴대폰 없는 거래처 {preview.no_phone}명 은 발송 제외됩니다.
            </p>
          )}
        </section>
      )}

      {sendResult && (
        <section className={`rounded-2xl p-5 ${sendResult.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border`}>
          <h3 className="font-bold mb-2">발송 결과</h3>
          {sendResult.ok ? (
            <p className="text-sm">
              ✅ 대상 {sendResult.recipients}명 · 성공 {sendResult.sent}명 · 실패 {sendResult.failed}명
            </p>
          ) : (
            <p className="text-sm text-red-700">❌ {sendResult.error}</p>
          )}
        </section>
      )}
    </div>
  );
}
