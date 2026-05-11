/** Phase Next-Day28 (2026-05-11): /admin/bulk-send React Query + lucide. */
'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { toast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Megaphone, Eye, Send, Star, Clock, Globe } from 'lucide-react';

const TEMPLATES = [
  { code: 'TPL_RECEIPT', name: '월말 매입 영수증 제출', body: '#{이름}님, 월말 매입 영수증 제출 부탁드립니다.' },
  { code: 'TPL_DEADLINE', name: '신고 마감일 임박', body: '#{이름}님, #{날짜} 신고 마감 임박입니다.' },
  { code: 'TPL_YEAREND', name: '연말정산 자료 요청', body: '#{이름}님, 연말정산 자료 준비 부탁드립니다.' },
  { code: 'TPL_RENEWAL', name: '계약갱신 안내', body: '#{이름}님, 계약 갱신 시기입니다.' },
];

const TARGETS = [
  { key: 'approved_client' as const, label: '기장거래처', icon: Star },
  { key: 'pending' as const, label: '대기', icon: Clock },
  { key: 'all' as const, label: '전체', icon: Globe },
];

interface PreviewResult {
  recipients: Array<{ id: number; real_name: string | null; name: string | null; phone: string | null }>;
  total: number; valid_phone: number; no_phone: number;
}

interface SendResult { ok: boolean; error?: string; recipients: number; sent: number; failed: number; }

export default function BulkSendPage() {
  const [target, setTarget] = useState<'all' | 'approved_client' | 'pending'>('approved_client');
  const [templateCode, setTemplateCode] = useState(TEMPLATES[0].code);
  const [message, setMessage] = useState(TEMPLATES[0].body);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const previewM = useMutation({
    mutationFn: () => trpcCall<PreviewResult>('bulkSend.preview', { target }),
    onSuccess: (r) => { setPreview(r); toast.info(`대상 ${r.valid_phone}명`); },
    onError: (e) => toast.error(`Preview 실패: ${(e as Error).message}`),
  });

  const sendM = useMutation({
    mutationFn: () => trpcCall<SendResult>('bulkSend.send', { target, template_code: templateCode, message }),
    onSuccess: (r) => { if (r.ok) toast.success(`성공 ${r.sent}명 · 실패 ${r.failed}명`); else toast.error(r.error || '실패'); },
    onError: (e) => toast.error((e as Error).message),
  });

  function selectTemplate(code: string) {
    setTemplateCode(code);
    const t = TEMPLATES.find((x) => x.code === code);
    if (t) setMessage(t.body);
  }

  function runSend() {
    if (!preview || preview.valid_phone === 0) { toast.error('먼저 미리보기'); return; }
    if (!confirm(`${preview.valid_phone}명 에게 발송?`)) return;
    sendM.mutate();
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      <header>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Megaphone size={18} strokeWidth={2} className="text-brand-primary" />단체발송
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">카카오 알림톡 (owner only)</p>
      </header>

      <Card>
        <CardHeader className="pb-1.5"><CardTitle className="text-xs">📌 템플릿</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-1.5">
            {TEMPLATES.map((t) => (
              <button key={t.code} onClick={() => selectTemplate(t.code)}
                className={cn('text-xs px-2 py-1.5 rounded-md text-left border transition-colors',
                  templateCode === t.code ? 'bg-blue-50 border-brand-primary text-brand-primary' : 'bg-white border-gray-200 hover:bg-gray-50')}>
                {t.name}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1.5"><CardTitle className="text-xs">🎯 대상 선택</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-1.5 flex-wrap">
            {TARGETS.map((t) => {
              const Icon = t.icon;
              return (
                <Button key={t.key} size="sm" variant={target === t.key ? 'default' : 'outline'}
                  onClick={() => { setTarget(t.key); setPreview(null); }}>
                  <Icon size={12} strokeWidth={2} className="mr-1" />{t.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1.5"><CardTitle className="text-xs">✍️ 메시지</CardTitle></CardHeader>
        <CardContent>
          <p className="text-[10px] text-gray-500 mb-1">💡 변수: <code className="bg-gray-100 px-1 rounded">#{`{이름}`}</code> 자동 치환</p>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5}
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary" />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => previewM.mutate()} disabled={previewM.isPending} className="flex-1">
          <Eye size={12} strokeWidth={2} className="mr-1" />{previewM.isPending ? '확인 중...' : '미리보기'}
        </Button>
        <Button onClick={runSend} disabled={!message.trim() || sendM.isPending || !preview || preview.valid_phone === 0} className="flex-1">
          <Send size={12} strokeWidth={2} className="mr-1" />{sendM.isPending ? '발송 중...' : '발송'}
        </Button>
      </div>

      {preview && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="py-2">
            <h3 className="font-bold text-xs mb-1 flex items-center gap-1.5">
              <Eye size={12} strokeWidth={2} />대상 미리보기 <Badge variant="primary">{preview.valid_phone}명</Badge>
            </h3>
            <p className="text-xs">전체 {preview.total}명 · 휴대폰 있음 <strong className="text-brand-primary">{preview.valid_phone}</strong>명 · 없음 {preview.no_phone}명</p>
            {preview.no_phone > 0 && <p className="text-[10px] text-orange-600 mt-0.5">⚠️ 휴대폰 없는 거래처 {preview.no_phone}명 발송 제외</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
