/**
 * Phase Next-Day28 (2026-05-11): /admin/bulk-send — shadcn/ui.
 */
'use client';

import { useState } from 'react';
import { trpcCall } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TEMPLATES = [
  { code: 'TPL_RECEIPT', name: '월말 매입 영수증 제출', body: '#{이름}님, 월말 매입 영수증 제출 부탁드립니다.' },
  { code: 'TPL_DEADLINE', name: '신고 마감일 임박', body: '#{이름}님, #{날짜} 신고 마감 임박입니다.' },
  { code: 'TPL_YEAREND', name: '연말정산 자료 요청', body: '#{이름}님, 연말정산 자료 준비 부탁드립니다.' },
  { code: 'TPL_RENEWAL', name: '계약갱신 안내', body: '#{이름}님, 계약 갱신 시기입니다.' },
];

const TARGETS = [
  { key: 'approved_client' as const, label: '⭐ 기장거래처' },
  { key: 'pending' as const, label: '⏳ 대기' },
  { key: 'all' as const, label: '🌐 전체' },
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
  const [target, setTarget] = useState<'all' | 'approved_client' | 'pending'>('approved_client');
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
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      <header>
        <h1 className="text-lg font-bold text-gray-900">📢 단체발송</h1>
        <p className="text-xs text-gray-500 mt-0.5">카카오 알림톡 (owner only)</p>
      </header>

      <Card>
        <CardHeader className="pb-1.5">
          <CardTitle className="text-xs">📌 템플릿</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-1.5">
            {TEMPLATES.map((t) => (
              <button
                key={t.code}
                onClick={() => selectTemplate(t.code)}
                className={cn(
                  'text-xs px-2 py-1.5 rounded-md text-left border transition-colors',
                  templateCode === t.code
                    ? 'bg-blue-50 border-brand-primary text-brand-primary'
                    : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700',
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1.5">
          <CardTitle className="text-xs">🎯 대상 선택</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-1.5 flex-wrap">
            {TARGETS.map((t) => (
              <Button
                key={t.key}
                size="sm"
                variant={target === t.key ? 'default' : 'outline'}
                onClick={() => {
                  setTarget(t.key);
                  setPreview(null);
                }}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1.5">
          <CardTitle className="text-xs">✍️ 메시지</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[10px] text-gray-500 mb-1">
            💡 변수: <code className="bg-gray-100 px-1 rounded">#{`{이름}`}</code> 자동 치환
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="메시지를 입력하세요..."
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={runPreview} disabled={previewing} className="flex-1">
          {previewing ? '확인 중...' : '👀 미리보기'}
        </Button>
        <Button
          onClick={runSend}
          disabled={!message.trim() || sending || !preview || preview.valid_phone === 0}
          className="flex-1"
        >
          {sending ? '발송 중...' : '📢 발송'}
        </Button>
      </div>

      {preview && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="py-2">
            <h3 className="font-bold text-xs mb-1 flex items-center gap-1.5">
              👀 대상 미리보기
              <Badge variant="primary">{preview.valid_phone}명</Badge>
            </h3>
            <p className="text-xs text-gray-700">
              전체 {preview.total}명 · 휴대폰 있음{' '}
              <strong className="text-brand-primary">{preview.valid_phone}</strong>명 · 없음{' '}
              {preview.no_phone}명
            </p>
            {preview.no_phone > 0 && (
              <p className="text-[10px] text-orange-600 mt-0.5">
                ⚠️ 휴대폰 없는 거래처 {preview.no_phone}명 은 발송 제외됩니다.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {sendResult && (
        <Card className={sendResult.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
          <CardContent className="py-2">
            <h3 className="font-bold text-xs mb-1">발송 결과</h3>
            {sendResult.ok ? (
              <p className="text-xs">
                ✓ 대상 {sendResult.recipients}명 · 성공 {sendResult.sent}명 · 실패{' '}
                {sendResult.failed}명
              </p>
            ) : (
              <p className="text-xs text-red-700">❌ {sendResult.error}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
