/**
 * 💼 영업 파이프라인 (2026-07-08 사장님 명령 — 허브스팟 B안: 리스트 + 활동 타임라인).
 *
 * 핵심 규칙:
 *  - "체크 = 단계 이동" 아님. 활동 기록의 결과 버튼에 따라 단계가 자동으로 따라옴 (서버 매핑).
 *  - 진행중 리드는 반드시 다음 액션 날짜를 가짐 — 없으면 서버가 저장 거부.
 *
 * 데이터: /api/sales-pipeline (legacy Pages Function, Next wrapper 경유).
 */
'use client';
export const runtime = 'edge';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/toast';
import { SkeletonList } from '@/components/ui/skeleton';

/* ── 타입 ── */
interface Lead {
  id: number;
  name: string;
  company: string | null;
  phone: string | null;
  lead_type: string;
  source: string;
  stage: string;
  assignee_user_id: number | null;
  assignee_name: string | null;
  next_action: string | null;
  next_action_date: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
  won_at: string | null;
  note?: string | null;
}
interface LeadLog {
  id: number;
  kind: string;
  content: string | null;
  result: string | null;
  stage_after: string | null;
  actor_name: string | null;
  created_at: string;
}
interface Summary {
  today: number; overdue: number; noAction: number; active: number; wonMonth: number;
  stages: Record<string, number>;
}
interface ListResp { ok: boolean; today: string; leads: Lead[]; summary: Summary }
interface DetailResp { ok: boolean; lead: Lead; logs: LeadLog[] }
interface MetaResp { ok: boolean; staff: { id: number; name: string }[]; pending: { id: number; name: string; phone: string | null; created_at: string }[] }

/* ── 라벨/색 ── */
const STAGE_LABEL: Record<string, string> = {
  lead: '리드', contacted: '연락함', consulting: '상담중', proposal: '제안', won: '성사', hold: '보류', lost: '무산',
};
const STAGE_CLS: Record<string, string> = {
  lead: 'bg-gray-100 text-gray-600',
  contacted: 'bg-blue-50 text-blue-600',
  consulting: 'bg-violet-50 text-violet-600',
  proposal: 'bg-amber-50 text-amber-700',
  won: 'bg-emerald-50 text-emerald-600',
  hold: 'bg-orange-50 text-orange-600',
  lost: 'bg-red-50 text-red-500',
};
const TYPE_LABEL: Record<string, string> = {
  pension: '연금 절세', insurance: '보험', incorporation: '법인전환', income: '소득률',
  new_biz: '신규 기장', referral: '소개', other: '기타',
};
const RESULT_BTNS: { key: string; label: string; cls: string }[] = [
  { key: 'called', label: '📞 통화됨', cls: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
  { key: 'missed', label: '📵 부재중', cls: 'bg-gray-100 text-gray-600 hover:bg-gray-200' },
  { key: 'meeting', label: '🗓 상담 잡힘', cls: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
  { key: 'sent', label: '📄 견적·제안 보냄', cls: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
  { key: 'note', label: '✏️ 메모만', cls: 'bg-gray-50 text-gray-500 hover:bg-gray-100' },
  { key: 'won', label: '🎉 계약!', cls: 'bg-emerald-500 text-white hover:bg-emerald-600' },
  { key: 'hold', label: '⏸ 보류', cls: 'bg-orange-50 text-orange-700 hover:bg-orange-100' },
  { key: 'lost', label: '✕ 거절', cls: 'bg-red-50 text-red-600 hover:bg-red-100' },
];
const RESULT_LABEL: Record<string, string> = {
  called: '📞 통화됨', missed: '📵 부재중', meeting: '🗓 상담 잡힘', sent: '📄 견적·제안',
  won: '🎉 계약', lost: '✕ 거절', hold: '⏸ 보류', note: '✏️ 메모',
};

function todayStr() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDays(n: number) {
  return new Date(Date.now() + 9 * 3600 * 1000 + n * 86400000).toISOString().slice(0, 10);
}

async function api<T = { [k: string]: unknown }>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch('/api/sales-pipeline' + path, { credentials: 'same-origin', ...init });
  const d = (await r.json()) as { error?: string };
  if (!r.ok || d.error) throw new Error(d.error || 'HTTP ' + r.status);
  return d as T;
}

type FilterTab = 'all' | 'todo' | 'active' | 'won' | 'closed';

export default function SalesPipelinePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<FilterTab>('all');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);

  const listQ = useQuery<ListResp>({
    queryKey: ['sp-list'],
    queryFn: () => api<ListResp>('?view=list'),
    refetchInterval: 60000,
  });
  const metaQ = useQuery<MetaResp>({ queryKey: ['sp-meta'], queryFn: () => api<MetaResp>('?view=meta') });
  const detailQ = useQuery<DetailResp>({
    queryKey: ['sp-detail', selId],
    queryFn: () => api<DetailResp>('?id=' + selId),
    enabled: !!selId,
  });

  const today = listQ.data?.today || todayStr();
  const sum = listQ.data?.summary;
  const allLeads = listQ.data?.leads || [];
  const leads = allLeads.filter((l) => {
    if (tab === 'todo') return ['lead', 'contacted', 'consulting', 'proposal'].includes(l.stage) && !!l.next_action_date && l.next_action_date <= today;
    if (tab === 'active') return ['lead', 'contacted', 'consulting', 'proposal', 'hold'].includes(l.stage);
    if (tab === 'won') return l.stage === 'won';
    if (tab === 'closed') return l.stage === 'lost';
    return true;
  }).filter((l) => !q.trim() || (l.name + ' ' + (l.company || '') + ' ' + (l.phone || '')).includes(q.trim()));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['sp-list'] });
    qc.invalidateQueries({ queryKey: ['sp-meta'] });
    if (selId) qc.invalidateQueries({ queryKey: ['sp-detail', selId] });
  };

  const selected = detailQ.data?.lead;

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col p-4 md:p-6">
      {/* 헤더 + 요약 */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-extrabold text-gray-900">💼 영업 파이프라인</h1>
        {sum && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-blue-700">오늘 팔로업 {sum.today}</span>
            {sum.overdue > 0 && <span className="rounded-lg bg-red-50 px-2.5 py-1 text-red-600">지남 {sum.overdue}</span>}
            {sum.noAction > 0 && <span className="rounded-lg border border-dashed border-red-300 bg-red-50 px-2.5 py-1 text-red-500">⚠ 다음액션 없음 {sum.noAction}</span>}
            <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-gray-600">진행중 {sum.active}</span>
            <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-emerald-600">이번달 성사 {sum.wonMonth} 🎉</span>
          </div>
        )}
        <button
          onClick={() => setShowNew(true)}
          className="ml-auto rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-blue-700"
        >
          ＋ 리드 추가
        </button>
      </div>

      {/* 승인대기 챗봇 리드 후보 배너 */}
      {(metaQ.data?.pending?.length || 0) > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs">
          <span className="font-extrabold text-amber-800">💬 챗봇 승인대기 {metaQ.data!.pending.length}명 — 먼저 손 든 리드입니다</span>
          {metaQ.data!.pending.slice(0, 5).map((p) => (
            <button
              key={p.id}
              onClick={async () => {
                try {
                  await api('', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      name: p.name, phone: p.phone, lead_type: 'new_biz', source: 'chatbot',
                      ref_owner_type: 'User', ref_owner_id: p.id,
                      next_action: '첫 연락 — 기장 니즈 확인', next_action_date: todayStr(),
                    }),
                  });
                  toast.success(p.name + ' 리드 추가');
                  refresh();
                } catch (e) { toast.error((e as Error).message); }
              }}
              className="rounded-lg bg-white px-2.5 py-1 font-bold text-amber-700 shadow-sm hover:bg-amber-100"
            >
              ＋ {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        {/* ── 좌: 리스트 ── */}
        <div className="flex w-[58%] min-w-0 flex-col rounded-2xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 px-4 py-3">
            {([['all', '전체'], ['todo', '오늘 할 일'], ['active', '진행중'], ['won', '성사'], ['closed', '무산']] as [FilterTab, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${tab === k ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {label}
              </button>
            ))}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="이름·업체·전화 검색"
              className="ml-auto w-40 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-400"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {listQ.isLoading ? (
              <div className="p-4"><SkeletonList rows={8} /></div>
            ) : leads.length === 0 ? (
              <div className="p-10 text-center text-sm text-gray-400">
                {tab === 'todo' ? '오늘 팔로업이 없습니다 🎉' : '리드가 없습니다 — 우측 상단 [＋ 리드 추가] 또는 영업 타겟에서 추가하세요'}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 text-[11px] text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-bold">이름 / 업체</th>
                    <th className="px-2 py-2 text-left font-bold">유형</th>
                    <th className="px-2 py-2 text-left font-bold">단계</th>
                    <th className="px-2 py-2 text-left font-bold">다음 액션</th>
                    <th className="px-2 py-2 text-left font-bold">담당</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => {
                    const overdue = l.next_action_date && l.next_action_date < today && ['lead', 'contacted', 'consulting', 'proposal'].includes(l.stage);
                    const isToday = l.next_action_date === today;
                    return (
                      <tr
                        key={l.id}
                        onClick={() => setSelId(l.id)}
                        className={`cursor-pointer border-b border-gray-50 hover:bg-gray-50 ${selId === l.id ? 'bg-blue-50/60' : ''}`}
                      >
                        <td className="px-4 py-2.5">
                          <div className="font-extrabold text-gray-900">{l.name}</div>
                          {l.company && <div className="text-[11px] text-gray-400">{l.company}</div>}
                        </td>
                        <td className="px-2 py-2.5 text-gray-600">{TYPE_LABEL[l.lead_type] || l.lead_type}</td>
                        <td className="px-2 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${STAGE_CLS[l.stage] || ''}`}>
                            {STAGE_LABEL[l.stage] || l.stage}{l.stage === 'won' && ' 🎉'}
                          </span>
                        </td>
                        <td className="px-2 py-2.5">
                          {l.stage === 'won' ? <span className="text-emerald-600">완료</span>
                            : l.stage === 'lost' ? <span className="text-gray-400">{l.lost_reason || '—'}</span>
                            : !l.next_action_date ? <span className="font-extrabold text-red-500">⚠ 없음</span>
                            : (
                              <span className={overdue ? 'font-extrabold text-red-600' : isToday ? 'font-extrabold text-blue-600' : 'text-gray-600'}>
                                {overdue && '🔥 '}{isToday ? '오늘' : l.next_action_date.slice(5).replace('-', '/')} · {l.next_action}
                              </span>
                            )}
                        </td>
                        <td className="px-2 py-2.5 text-gray-500">{l.assignee_name || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── 우: 상세 + 타임라인 ── */}
        <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-gray-200 bg-gray-50/60">
          {!selId ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-gray-400">
              왼쪽에서 리드를 선택하세요<br />활동 타임라인과 기록 입력이 여기 표시됩니다
            </div>
          ) : detailQ.isLoading || !selected ? (
            <div className="p-5"><SkeletonList rows={5} /></div>
          ) : (
            <DetailPane
              lead={selected}
              logs={detailQ.data?.logs || []}
              staff={metaQ.data?.staff || []}
              onChanged={refresh}
            />
          )}
        </div>
      </div>

      {showNew && (
        <NewLeadModal
          staff={metaQ.data?.staff || []}
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); setSelId(id); refresh(); }}
        />
      )}
    </div>
  );
}

/* ── 상세 + 타임라인 + 기록 입력 ── */
function DetailPane({ lead, logs, staff, onChanged }: {
  lead: Lead; logs: LeadLog[]; staff: { id: number; name: string }[]; onChanged: () => void;
}) {
  const [content, setContent] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextDate, setNextDate] = useState(addDays(3));
  const [saving, setSaving] = useState(false);

  const active = ['lead', 'contacted', 'consulting', 'proposal', 'hold'].includes(lead.stage);

  async function submit(result: string) {
    if (saving) return;
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
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      {/* 헤더 */}
      <div className="mb-1 flex items-center gap-2">
        <span className="text-base font-extrabold text-gray-900">{lead.name}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${STAGE_CLS[lead.stage]}`}>{STAGE_LABEL[lead.stage]}{lead.stage === 'won' && ' 🎉'}</span>
        <select
          value={lead.assignee_user_id || ''}
          onChange={async (e) => {
            try {
              await api('', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: lead.id, assignee_user_id: Number(e.target.value) || null }) });
              toast.success('담당 변경'); onChanged();
            } catch (err) { toast.error((err as Error).message); }
          }}
          className="ml-auto rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-bold text-gray-600"
        >
          <option value="">담당 없음</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="mb-3 text-[11.5px] text-gray-500">
        {lead.company && <span>{lead.company} · </span>}
        {TYPE_LABEL[lead.lead_type]}{lead.phone && <> · <a className="font-bold text-blue-600" href={`tel:${lead.phone}`}>{lead.phone}</a></>}
        {lead.next_action_date && active && <> · 다음: <b className="text-gray-700">{lead.next_action_date} {lead.next_action}</b></>}
      </div>

      {/* 기록 입력 */}
      {active && (
        <div className="mb-3 rounded-xl border border-gray-200 bg-white p-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder='뭐 했는지 한 줄 — 예: "통화 8분, 노란우산 한도 문의. 다음주 방문하기로"'
            rows={2}
            className="w-full resize-none rounded-lg border border-gray-200 px-2.5 py-2 text-xs outline-none focus:border-blue-400"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10.5px] font-bold text-gray-400">다음 액션</span>
            <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="예: 시뮬레이션 전달" className="w-36 rounded-lg border border-gray-200 px-2 py-1 text-[11px] outline-none" />
            <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] outline-none" />
            <span className="text-[10px] text-gray-400">← 진행형 결과는 필수</span>
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
      {!active && lead.stage === 'won' && (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-700">
          🎉 {lead.won_at?.slice(0, 10)} 성사 — 신규 기장이면 사용자 탭에서 승인 + 업체 연결로 이어가세요
        </div>
      )}

      {/* 타임라인 */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
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
          {logs.length === 0 && <div className="py-6 text-xs text-gray-400">기록이 없습니다</div>}
        </div>
      </div>
    </div>
  );
}

/* ── 새 리드 모달 ── */
function NewLeadModal({ staff, onClose, onCreated }: {
  staff: { id: number; name: string }[]; onClose: () => void; onCreated: (id: number) => void;
}) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [leadType, setLeadType] = useState('new_biz');
  const [assignee, setAssignee] = useState('');
  const [nextAction, setNextAction] = useState('첫 연락');
  const [nextDate, setNextDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim()) { toast.error('이름을 입력해주세요'); return; }
    if (!nextDate) { toast.error('첫 연락 날짜가 필요합니다'); return; }
    setSaving(true);
    try {
      const d = await api<{ id: number }>('', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, company: company || undefined, phone: phone || undefined,
          lead_type: leadType, source: 'manual',
          assignee_user_id: Number(assignee) || undefined,
          next_action: nextAction, next_action_date: nextDate, note: note || undefined,
        }),
      });
      toast.success('리드 등록');
      onCreated(d.id);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 text-base font-extrabold text-gray-900">＋ 새 리드</div>
        <div className="space-y-2.5 text-xs">
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 *" className="flex-1 rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-blue-400" />
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="업체명" className="flex-1 rounded-lg border border-gray-200 px-3 py-2 outline-none" />
          </div>
          <div className="flex gap-2">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="전화번호" className="flex-1 rounded-lg border border-gray-200 px-3 py-2 outline-none" />
            <select value={leadType} onChange={(e) => setLeadType(e.target.value)} className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2">
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2">
              <option value="">담당 없음</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="첫 액션" className="flex-1 rounded-lg border border-gray-200 px-3 py-2 outline-none" />
            <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-2 outline-none" />
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모 — 예: 김영수 사장님 소개, 음식점 2호점 오픈 예정" rows={2} className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 outline-none" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg bg-gray-100 px-3.5 py-2 text-xs font-bold text-gray-600">취소</button>
          <button onClick={create} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">등록</button>
        </div>
      </div>
    </div>
  );
}
