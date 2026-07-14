/**
 * 💼 LeadPeek — 영업 리드 우측 피크 패널 (2026-07-08 사장님 "영업타겟에서 연동되게" 허브 통합).
 *
 * 발굴(영업타겟) 페이지에서 행의 파이프라인 pill/담기 클릭 시 열림.
 * 검토표 근거(evidence) + 단계 트랙 + 활동 기록(결과→단계 자동) + 타임라인 — 페이지 이동 없이 한 화면.
 * 데이터: /api/sales-pipeline (기록 규칙은 서버가 강제 — 진행형 결과는 next_action_date 필수).
 */
'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/toast';

export interface PeekEvidence { label: string; value: string; hot?: boolean }

interface Lead {
  id: number; name: string; company: string | null; phone: string | null;
  lead_type: string; stage: string; assignee_user_id: number | null; assignee_name: string | null;
  next_action: string | null; next_action_date: string | null; lost_reason: string | null; won_at: string | null;
}
interface LeadLog {
  id: number; kind: string; content: string | null; result: string | null;
  stage_after: string | null; actor_name: string | null; created_at: string;
}

const STAGE_LABEL: Record<string, string> = {
  lead: '리드', contacted: '연락함', consulting: '상담중', proposal: '제안', won: '성사', hold: '보류', lost: '무산',
};
const STAGE_CLS: Record<string, string> = {
  lead: 'bg-gray-100 text-gray-600', contacted: 'bg-blue-50 text-blue-600', consulting: 'bg-violet-50 text-violet-600',
  proposal: 'bg-amber-50 text-amber-700', won: 'bg-emerald-50 text-emerald-600', hold: 'bg-orange-50 text-orange-600', lost: 'bg-red-50 text-red-500',
};
const TYPE_LABEL: Record<string, string> = {
  pension: '연금 절세', insurance: '보험', incorporation: '법인전환', income: '소득률',
  new_biz: '신규 기장', referral: '소개', other: '기타',
};
const TRACK = ['lead', 'contacted', 'consulting', 'proposal', 'won'];
const RESULT_BTNS = [
  { key: 'called', label: '📞 통화됨', cls: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
  { key: 'missed', label: '📵 부재중', cls: 'bg-gray-100 text-gray-600 hover:bg-gray-200' },
  { key: 'meeting', label: '🗓 상담 잡힘', cls: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
  { key: 'sent', label: '📄 견적·제안', cls: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
  { key: 'note', label: '✏️ 메모', cls: 'bg-gray-50 text-gray-500 hover:bg-gray-100' },
  { key: 'won', label: '🎉 계약!', cls: 'bg-emerald-500 text-white hover:bg-emerald-600' },
  { key: 'hold', label: '⏸ 보류', cls: 'bg-orange-50 text-orange-700 hover:bg-orange-100' },
  { key: 'lost', label: '✕ 거절', cls: 'bg-red-50 text-red-600 hover:bg-red-100' },
];
const RESULT_LABEL: Record<string, string> = {
  called: '📞 통화됨', missed: '📵 부재중', meeting: '🗓 상담 잡힘', sent: '📄 견적·제안',
  won: '🎉 계약', lost: '✕ 거절', hold: '⏸ 보류', note: '✏️ 메모',
};

function addDays(n: number) {
  return new Date(Date.now() + 9 * 3600 * 1000 + n * 86400000).toISOString().slice(0, 10);
}

async function api<T = { [k: string]: unknown }>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch('/api/sales-pipeline' + path, { credentials: 'same-origin', ...init });
  const d = (await r.json()) as { error?: string };
  if (!r.ok || d.error) throw new Error(d.error || 'HTTP ' + r.status);
  return d as T;
}

export function LeadPeek({ leadId, evidence, pitch, onClose, onChanged }: {
  leadId: number;
  evidence?: PeekEvidence[];
  pitch?: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const detailQ = useQuery<{ lead: Lead; logs: LeadLog[] }>({
    queryKey: ['sp-detail', leadId],
    queryFn: () => api('?id=' + leadId),
  });
  const metaQ = useQuery<{ staff: { id: number; name: string }[] }>({
    queryKey: ['sp-meta'],
    queryFn: () => api('?view=meta'),
  });
  const [content, setContent] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextDate, setNextDate] = useState(addDays(3));
  const [saving, setSaving] = useState(false);

  const lead = detailQ.data?.lead;
  const logs = detailQ.data?.logs || [];
  const active = lead ? ['lead', 'contacted', 'consulting', 'proposal', 'hold'].includes(lead.stage) : false;

  function changed() {
    qc.invalidateQueries({ queryKey: ['sp-detail', leadId] });
    onChanged?.();
  }

  async function submit(result: string) {
    if (!lead || saving) return;
    let body: Record<string, unknown> = { lead_id: lead.id, content, result };
    if (['called', 'missed', 'meeting', 'sent', 'note'].includes(result)) {
      if (!nextDate) { toast.error('다음 액션 날짜를 잡아주세요 — 리드가 잊히지 않게'); return; }
      body = { ...body, next_action: nextAction || undefined, next_action_date: nextDate };
    }
    if (result === 'hold') {
      const hu = prompt('언제 다시 접촉할까요? (YYYY-MM-DD)', addDays(30));
      if (!hu) return;
      body = { ...body, hold_until: hu };
    }
    if (result === 'lost') {
      const reason = prompt('거절 사유 (통계용 — 예: 수수료 / 타사무소 / 폐업)', content || '');
      if (reason === null) return;
      body = { ...body, lost_reason: reason };
    }
    if (result === 'note' && !content.trim()) { toast.error('내용을 입력해주세요'); return; }
    setSaving(true);
    try {
      const d = await api<{ stage: string }>('?action=log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      toast.success(result === 'won' ? '🎉 성사 축하합니다!' : '기록 완료' + (d.stage !== lead.stage ? ` — 단계: ${STAGE_LABEL[d.stage]}` : ''));
      setContent(''); setNextAction('');
      changed();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  const trackIdx = lead ? TRACK.indexOf(lead.stage) : -1;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col bg-white shadow-2xl">
        {!lead ? (
          <div className="p-6 text-sm text-gray-400">불러오는 중…</div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-gray-100 px-5 pb-3 pt-4">
              <span className="text-base font-extrabold text-gray-900">{lead.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${STAGE_CLS[lead.stage]}`}>
                {STAGE_LABEL[lead.stage]}{lead.stage === 'won' && ' 🎉'}
              </span>
              <select
                value={lead.assignee_user_id || ''}
                onChange={async (e) => {
                  try {
                    await api('', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: lead.id, assignee_user_id: Number(e.target.value) || null }) });
                    toast.success('담당 변경'); changed();
                  } catch (err) { toast.error((err as Error).message); }
                }}
                className="ml-auto rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-bold text-gray-600"
              >
                <option value="">담당 없음</option>
                {(metaQ.data?.staff || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button onClick={onClose} className="px-1 text-lg text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="mb-3 text-[11.5px] text-gray-500">
                {lead.company && <span>{lead.company} · </span>}
                {TYPE_LABEL[lead.lead_type] || lead.lead_type}
                {lead.phone && <> · <a className="font-bold text-blue-600" href={`tel:${lead.phone}`}>{lead.phone}</a></>}
                {lead.next_action_date && active && <> · 다음: <b className="text-gray-700">{lead.next_action_date} {lead.next_action}</b></>}
              </div>

              {/* 단계 트랙 */}
              <div className="mb-3 flex gap-1">
                {TRACK.map((s, i) => (
                  <span key={s} className={`flex-1 rounded-md py-1.5 text-center text-[10px] font-extrabold ${
                    trackIdx === i ? 'bg-blue-600 text-white' : trackIdx > i ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
                  }`}>{STAGE_LABEL[s]}</span>
                ))}
              </div>
              {(lead.stage === 'hold' || lead.stage === 'lost') && (
                <div className={`mb-3 rounded-lg px-3 py-2 text-[11.5px] font-bold ${lead.stage === 'hold' ? 'bg-orange-50 text-orange-700' : 'bg-red-50 text-red-600'}`}>
                  {lead.stage === 'hold' ? `⏸ 보류 — ${lead.next_action_date} 재접촉 예정` : `✕ 무산 — ${lead.lost_reason || '사유 미기록'}`}
                </div>
              )}

              {/* 검토표 근거 — 통화하면서 볼 숫자 */}
              {evidence && evidence.length > 0 && (
                <div className="mb-3 rounded-xl border border-gray-200 bg-slate-50 px-3.5 py-3">
                  <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-400">📋 검토표 근거 — 통화할 때 이 숫자로</div>
                  {evidence.map((ev) => (
                    <div key={ev.label} className="flex justify-between py-0.5 text-xs">
                      <span className="text-gray-500">{ev.label}</span>
                      <b className={ev.hot ? 'text-red-600' : 'text-gray-800'}>{ev.value}</b>
                    </div>
                  ))}
                  {pitch && <div className="mt-2 rounded-lg bg-blue-50 px-2.5 py-2 text-[11.5px] leading-relaxed text-blue-700">💬 {pitch}</div>}
                </div>
              )}

              {/* 기록 입력 */}
              {active && (
                <div className="mb-4 rounded-xl border border-gray-200 p-3">
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder='뭐 했는지 한 줄 — 예: "통화 8분, 노란우산 문의. 다음주 방문"'
                    rows={2}
                    className="w-full resize-none rounded-lg border border-gray-200 px-2.5 py-2 text-xs outline-none focus:border-blue-400"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                    <span className="font-bold text-gray-400">다음 액션</span>
                    <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="예: 시뮬레이션 전달" className="w-32 rounded-lg border border-gray-200 px-2 py-1 outline-none" />
                    <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1 outline-none" />
                    <span className="text-gray-400">← 없으면 저장 안 됨</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {RESULT_BTNS.map((b) => (
                      <button key={b.key} disabled={saving} onClick={() => submit(b.key)} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-extrabold ${b.cls} disabled:opacity-50`}>
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {lead.stage === 'won' && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-700">
                  🎉 {lead.won_at?.slice(0, 10)} 성사 — 신규 기장이면 사용자 탭에서 승인 + 업체 연결로 이어가세요
                </div>
              )}

              {/* 타임라인 */}
              <div className="relative ml-1.5 border-l-2 border-gray-200 pl-4">
                {logs.map((lg) => (
                  <div key={lg.id} className="relative mb-3.5">
                    <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-[3px] border-blue-500 bg-white" />
                    <div className="text-[11.5px] font-extrabold text-gray-800">
                      {lg.result ? (RESULT_LABEL[lg.result] || lg.result) : '단계 변경'}
                      {lg.stage_after && lg.result && ['meeting', 'sent', 'won', 'lost', 'hold', 'called'].includes(lg.result) && (
                        <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[9.5px] ${STAGE_CLS[lg.stage_after]}`}>{STAGE_LABEL[lg.stage_after]}</span>
                      )}
                      <span className="ml-2 font-semibold text-gray-400">{lg.created_at?.slice(5, 16)} · {lg.actor_name}</span>
                    </div>
                    {lg.content && <div className="mt-0.5 text-xs leading-relaxed text-gray-600">{lg.content}</div>}
                  </div>
                ))}
                {logs.length === 0 && <div className="py-5 text-xs text-gray-400">기록이 없습니다</div>}
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
