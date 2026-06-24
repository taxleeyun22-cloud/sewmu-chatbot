/**
 * Phase 마이그레이션-P2 (2026-06-22): /admin/todos — 옛 admin.html redirect → 진짜 React.
 *
 * 사장님 요청: "내 할일 = 무조건 본인 것만". 거래처에 적은 할일도 작성자면 여기 뜸(개인 라이브러리).
 * - 본인거만: 담당자=나 OR 작성자=나 (legacy memos.js scope=my&only_mine=1, 본인필터 + 출처 JOIN)
 * - 출처 칩: 🏢업체 / 👤거래처 / 💬방 / 개인 (__none__ 박멸)
 * - 기한 그룹(지남/오늘/예정/기한없음) · 체크=완료(memo_type='완료') · 빠른추가
 * 완료는 레거시와 동일하게 memo_type='완료'. 거래처 일반메모 목록(scope=customer_info 등)은 무변경.
 */
'use client';
export const runtime = 'edge';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/toast';
import { SkeletonList } from '@/components/ui/skeleton';

interface Todo {
  id: number;
  content: string;
  memo_type: string;
  category: string | null;
  due_date: string | null;
  target_business_id: number | null;
  target_user_id: number | null;
  room_id: string | null;
  business_name: string | null;
  customer_name: string | null;
  customer_nickname: string | null;
  room_name: string | null;
  author_name: string | null;
}

const TODAY = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST yyyy-mm-dd

async function getTodos(): Promise<Todo[]> {
  const r = await fetch('/api/memos?scope=my&only_mine=1', { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = (await r.json()) as { ok?: boolean; memos?: Todo[]; error?: string };
  if (d.error) throw new Error(d.error);
  return d.memos || [];
}
async function patchMemo(id: number, body: Record<string, unknown>) {
  const r = await fetch(`/api/memos?id=${id}`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function createMemo(body: Record<string, unknown>) {
  const r = await fetch('/api/memos', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* 출처 칩 */
function source(t: Todo): { icon: string; label: string; cls: string } {
  if (t.business_name) return { icon: '🏢', label: t.business_name, cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' };
  const cn = t.customer_name || t.customer_nickname;
  if (cn) return { icon: '👤', label: cn, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' };
  if (t.room_name) return { icon: '💬', label: t.room_name, cls: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' };
  return { icon: '', label: '개인', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' };
}
const CAT_DOT: Record<string, string> = {
  전화: 'bg-emerald-500', 문서: 'bg-amber-500', 이슈: 'bg-red-500', 약속: 'bg-violet-500',
};
function dday(due: string | null): { label: string; cls: string } {
  if (!due) return { label: '', cls: 'text-gray-400' };
  const d = due.slice(0, 10);
  const md = `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  if (d < TODAY) {
    const days = Math.round((Date.parse(TODAY) - Date.parse(d)) / 86400000);
    return { label: `${md} (${days}일 지남)`, cls: 'text-red-600 font-bold' };
  }
  if (d === TODAY) return { label: '오늘', cls: 'text-brand-primary font-bold' };
  return { label: md, cls: 'text-amber-700 dark:text-amber-500 font-semibold' };
}
function bucket(due: string | null): 'overdue' | 'today' | 'upcoming' | 'none' {
  if (!due) return 'none';
  const d = due.slice(0, 10);
  if (d < TODAY) return 'overdue';
  if (d === TODAY) return 'today';
  return 'upcoming';
}
const GROUPS: { key: ReturnType<typeof bucket>; icon: string; label: string }[] = [
  { key: 'overdue', icon: '⚠️', label: '기한 지남' },
  { key: 'today', icon: '📅', label: '오늘' },
  { key: 'upcoming', icon: '🗓', label: '예정' },
  { key: 'none', icon: '🌙', label: '기한 없음' },
];

export default function TodosPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['memos.myTodos'], queryFn: getTodos, refetchInterval: 30_000 });
  const todos = data || [];
  const [busy, setBusy] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [date, setDate] = useState('');

  const refetch = () => qc.invalidateQueries({ queryKey: ['memos.myTodos'] });

  async function complete(id: number) {
    setBusy(id);
    try { await patchMemo(id, { memo_type: '완료' }); toast.success('완료 처리'); refetch(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  }
  async function add() {
    if (!text.trim()) return;
    setAdding(true);
    try {
      await createMemo({ memo_type: '할 일', content: text.trim(), ...(date ? { due_date: date } : {}) });
      setText(''); setDate(''); toast.success('할일 추가'); refetch();
    } catch (e) { toast.error((e as Error).message); }
    finally { setAdding(false); }
  }

  const grouped = GROUPS.map((g) => ({
    ...g,
    items: todos.filter((t) => bucket(t.due_date) === g.key)
      .sort((a, b) => (a.due_date || '9').localeCompare(b.due_date || '9')),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="max-w-[760px] mx-auto px-5 py-6">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <span className="text-lg font-extrabold text-gray-900 dark:text-gray-100">📋 내 할일</span>
          <span className="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 rounded-full px-2.5 py-0.5">{todos.length}</span>
          <span className="ml-auto text-[11px] text-gray-400">본인 담당·작성 할일만</span>
        </div>

        {/* 빠른 추가 */}
        <div className="flex gap-2 px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/30">
          <input
            value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            placeholder="+ 할일 추가 (예: 박승호 부가세 자료 요청)"
            className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 outline-none focus:border-brand-primary"
          />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-500 bg-white dark:bg-gray-900" />
          <button type="button" onClick={add} disabled={adding || !text.trim()}
            className="bg-brand-primary text-white rounded-lg px-4 text-sm font-bold disabled:opacity-40 hover:opacity-90">추가</button>
        </div>

        {/* 본문 */}
        {isLoading ? (
          <div className="p-5"><SkeletonList rows={4} /></div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-600">불러오기 실패: {(error as Error).message}</div>
        ) : todos.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">할일이 없어요. 위에서 추가하거나, 거래처 메모를 &quot;할 일&quot;로 적으면 여기 떠요.</div>
        ) : (
          grouped.map((g) => (
            <div key={g.key} className="py-1">
              <div className="flex items-center gap-2 px-5 pt-3 pb-1 text-xs font-extrabold">
                <span>{g.icon}</span>
                <span className={g.key === 'overdue' ? 'text-red-600' : g.key === 'today' ? 'text-brand-primary' : 'text-gray-500'}>{g.label}</span>
                <span className="text-gray-400 font-bold">{g.items.length}</span>
              </div>
              <ul>
                {g.items.map((t) => {
                  const s = source(t);
                  const dd = dday(t.due_date);
                  return (
                    <li key={t.id} className="flex items-start gap-3 px-5 py-3 border-t border-gray-50 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <button type="button" onClick={() => complete(t.id)} disabled={busy === t.id}
                        title="완료" aria-label="완료 처리"
                        className="mt-0.5 w-5 h-5 rounded-md border-2 border-gray-300 dark:border-gray-600 hover:border-brand-success hover:bg-emerald-50 dark:hover:bg-emerald-900/30 flex-shrink-0 disabled:opacity-40" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">{t.content}</div>
                        <div className="flex items-center gap-2 flex-wrap mt-1.5">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold rounded-lg px-2 py-0.5 ${s.cls}`}>
                            {s.icon} {s.label}
                          </span>
                          {t.category && CAT_DOT[t.category] && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                              <span className={`w-1.5 h-1.5 rounded-full ${CAT_DOT[t.category]}`} />{t.category}
                            </span>
                          )}
                          {dd.label && <span className={`text-[11px] ${dd.cls}`}>{dd.label}</span>}
                          <span className="ml-auto text-[11px] text-gray-400 whitespace-nowrap">{t.author_name || ''}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
      <p className="text-[11px] text-gray-400 mt-3 px-1">
        ※ 거래처/업체/방에 적은 &quot;할 일&quot;이면 작성자 본인에게 자동으로 떠요. 거래처 공유 메모(일반)는 거래처 화면에서 전부 그대로 보입니다.
      </p>
    </div>
  );
}
