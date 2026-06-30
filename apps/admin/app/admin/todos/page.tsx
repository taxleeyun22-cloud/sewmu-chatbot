/**
 * Phase 마이그레이션-P2 (2026-06-24): /admin/todos — 달력 + 목록 토글.
 *
 * 사장님 요청: 내 할일을 달력이랑 같이. [📋 목록 | 🗓 달력] 전환.
 * - 본인거만(담당 or 작성) — 백엔드 memos.js scope=my&only_mine=1 (출처 JOIN 포함)
 * - 달력: 월 그리드, due_date 있는 할일을 날짜칸 색칩(지남=빨강/업체=파랑/거래처=초록/방=보라).
 *   날짜 클릭 → 그 날 상세 패널 · 칩 클릭 → 완료. 기한없음은 트레이.
 * - 목록: 기한 그룹(지남/오늘/예정/기한없음) + 출처 칩 + 체크완료 + 빠른추가.
 * 완료는 레거시와 동일 memo_type='완료'. 거래처 공유 메모는 무변경.
 */
'use client';
export const runtime = 'edge';

import { useState, useMemo } from 'react';
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

const pad = (n: number) => String(n).padStart(2, '0');
const _now = new Date();
const TODAY = `${_now.getFullYear()}-${pad(_now.getMonth() + 1)}-${pad(_now.getDate())}`;

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

function source(t: Todo): { icon: string; label: string; chip: string; cal: string } {
  if (t.business_name) return { icon: '🏢', label: t.business_name, chip: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', cal: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' };
  const cn = t.customer_name || t.customer_nickname;
  if (cn) return { icon: '👤', label: cn, chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', cal: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' };
  if (t.room_name) return { icon: '💬', label: t.room_name, chip: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300', cal: 'bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' };
  return { icon: '', label: '개인', chip: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400', cal: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
}
const CAT_DOT: Record<string, string> = { 전화: 'bg-emerald-500', 문서: 'bg-amber-500', 이슈: 'bg-red-500', 약속: 'bg-violet-500' };
const dkey = (due: string | null) => (due ? due.slice(0, 10) : null);
function ddayLabel(d: string): { label: string; cls: string } {
  if (d < TODAY) {
    const days = Math.round((Date.parse(TODAY) - Date.parse(d)) / 86400000);
    return { label: `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))} (${days}일 지남)`, cls: 'text-red-600 font-bold' };
  }
  if (d === TODAY) return { label: '오늘', cls: 'text-brand-primary font-bold' };
  return { label: `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`, cls: 'text-amber-700 dark:text-amber-500 font-semibold' };
}

/* ───── 공용 행 ───── */
function TodoRow({ t, onComplete, busy }: { t: Todo; onComplete: (id: number) => void; busy: boolean }) {
  const s = source(t);
  const dk = dkey(t.due_date);
  const dd = dk ? ddayLabel(dk) : null;
  return (
    <li className="flex items-start gap-3 px-4 py-3 border-t border-gray-50 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/40">
      <button type="button" onClick={() => onComplete(t.id)} disabled={busy} title="완료" aria-label="완료 처리"
        className="mt-0.5 w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 hover:border-brand-success hover:bg-emerald-50 dark:hover:bg-emerald-900/30 flex-shrink-0 disabled:opacity-40" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">{t.content}</div>
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          <span className={`inline-flex items-center gap-1 text-[11px] font-bold rounded-lg px-2 py-0.5 ${s.chip}`}>{s.icon} {s.label}</span>
          {t.category && CAT_DOT[t.category] && (
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400"><span className={`w-1.5 h-1.5 rounded-full ${CAT_DOT[t.category]}`} />{t.category}</span>
          )}
          {dd && <span className={`text-[11px] ${dd.cls}`}>{dd.label}</span>}
          <span className="ml-auto text-[11px] text-gray-400 whitespace-nowrap">{t.author_name || ''}</span>
        </div>
      </div>
    </li>
  );
}

export default function TodosPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['memos.myTodos'], queryFn: getTodos, refetchInterval: 30_000 });
  const todos = data || [];
  const [view, setView] = useState<'list' | 'cal'>('cal');
  const [busy, setBusy] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const [cursor, setCursor] = useState({ y: _now.getFullYear(), m: _now.getMonth() }); // m: 0-indexed
  const [selDay, setSelDay] = useState<string>(TODAY);

  const refetch = () => qc.invalidateQueries({ queryKey: ['memos.myTodos'] });
  async function complete(id: number) {
    setBusy(id);
    try { await patchMemo(id, { memo_type: '완료' }); toast.success('완료'); refetch(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }
  async function add() {
    if (!text.trim()) return;
    setAdding(true);
    try { await createMemo({ memo_type: '할 일', content: text.trim(), ...(date ? { due_date: date } : {}) }); setText(''); setDate(''); toast.success('추가'); refetch(); }
    catch (e) { toast.error((e as Error).message); } finally { setAdding(false); }
  }

  /* 날짜별 그룹 (달력용) */
  const byDate = useMemo(() => {
    const m = new Map<string, Todo[]>();
    todos.forEach((t) => { const k = dkey(t.due_date); if (k) { (m.get(k) || m.set(k, []).get(k))!.push(t); } });
    return m;
  }, [todos]);
  const noDue = useMemo(() => todos.filter((t) => !t.due_date), [todos]);

  /* 6주 그리드 */
  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const start = new Date(first); start.setDate(1 - first.getDay()); // 그 주 일요일
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      return { key, day: d.getDate(), inMonth: d.getMonth() === cursor.m, dow: d.getDay() };
    });
  }, [cursor]);

  function shiftMonth(delta: number) {
    setCursor((c) => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  }
  function goToday() { setCursor({ y: _now.getFullYear(), m: _now.getMonth() }); setSelDay(TODAY); }

  const selTodos = (byDate.get(selDay) || []).slice().sort((a, b) => a.id - b.id);

  /* 목록 그룹 */
  const GROUPS = [
    { key: 'overdue', icon: '⚠️', label: '기한 지남' }, { key: 'today', icon: '📅', label: '오늘' },
    { key: 'upcoming', icon: '🗓', label: '예정' }, { key: 'none', icon: '🌙', label: '기한 없음' },
  ] as const;
  const bucket = (t: Todo) => { const k = dkey(t.due_date); if (!k) return 'none'; if (k < TODAY) return 'overdue'; if (k === TODAY) return 'today'; return 'upcoming'; };
  const grouped = GROUPS.map((g) => ({ ...g, items: todos.filter((t) => bucket(t) === g.key).sort((a, b) => (a.due_date || '9').localeCompare(b.due_date || '9')) })).filter((g) => g.items.length);

  const monthLabel = `${cursor.y}년 ${cursor.m + 1}월`;

  return (
    <div className="max-w-[960px] mx-auto px-5 py-6">
      {/* 헤더 + 토글 */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="text-lg font-extrabold text-gray-900 dark:text-gray-100">📋 내 할일</h1>
        <span className="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 rounded-full px-2.5 py-0.5">{todos.length}</span>
        <span className="text-[11px] text-gray-400">본인 담당·작성만</span>
        <div className="ml-auto flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          {(['list', 'cal'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-1.5 ${view === v ? 'bg-white dark:bg-gray-900 text-brand-primary shadow-sm' : 'text-gray-500'}`}>
              {v === 'list' ? '📋 목록' : '🗓 달력'}
            </button>
          ))}
        </div>
      </div>

      {/* 빠른 추가 (공통) */}
      <div className="flex gap-2 mb-4">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder="+ 할일 추가 (예: 박승호 부가세 자료 요청)"
          className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 outline-none focus:border-brand-primary" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-500 bg-white dark:bg-gray-900" />
        <button type="button" onClick={add} disabled={adding || !text.trim()}
          className="bg-brand-primary text-white rounded-lg px-4 text-sm font-bold disabled:opacity-40 hover:opacity-90">추가</button>
      </div>

      {isLoading ? <SkeletonList rows={5} /> : error ? (
        <div className="p-8 text-center text-sm text-red-600">불러오기 실패: {(error as Error).message}</div>
      ) : view === 'cal' ? (
        /* ===== 달력 뷰 ===== */
        <>
          <div className="flex items-center gap-2 mb-3">
            <button type="button" onClick={() => shiftMonth(-1)} className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">‹</button>
            <button type="button" onClick={() => shiftMonth(1)} className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">›</button>
            <span className="text-base font-bold text-gray-900 dark:text-gray-100 ml-1">{monthLabel}</span>
            <button type="button" onClick={goToday} className="ml-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">오늘</button>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800">
              {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => (
                <div key={w} className={`py-2 text-center text-[11px] font-bold ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-400'}`}>{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((c) => {
                const items = byDate.get(c.key) || [];
                const isToday = c.key === TODAY;
                const isSel = c.key === selDay;
                return (
                  <button type="button" key={c.key} onClick={() => setSelDay(c.key)}
                    className={`min-h-[92px] text-left border-r border-b border-gray-100 dark:border-gray-800 p-1.5 align-top ${c.inMonth ? '' : 'bg-gray-50/60 dark:bg-gray-800/20'} ${isSel ? 'ring-2 ring-brand-primary ring-inset' : ''}`}>
                    <div className={`w-6 h-6 flex items-center justify-center rounded-full text-[12px] mb-1 ${isToday ? 'bg-brand-primary text-white font-bold' : c.inMonth ? (c.dow === 0 ? 'text-red-500' : c.dow === 6 ? 'text-blue-500' : 'text-gray-700 dark:text-gray-300') : 'text-gray-300 dark:text-gray-600'}`}>{c.day}</div>
                    {items.slice(0, 3).map((t) => {
                      const over = c.key < TODAY;
                      const cls = over ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : source(t).cal;
                      return <div key={t.id} className={`text-[10.5px] leading-tight rounded px-1.5 py-0.5 mb-0.5 truncate font-semibold ${cls}`}>{t.content}</div>;
                    })}
                    {items.length > 3 && <div className="text-[10px] text-gray-400 px-1">+{items.length - 3}개</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 선택일 상세 */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl mt-3 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 text-sm font-bold text-gray-800 dark:text-gray-200">
              {selDay === TODAY ? '오늘' : `${Number(selDay.slice(5, 7))}월 ${Number(selDay.slice(8, 10))}일`} 할일 <span className="text-gray-400">{selTodos.length}</span>
            </div>
            {selTodos.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">이 날 할일 없음</div>
            ) : (
              <ul>{selTodos.map((t) => <TodoRow key={t.id} t={t} onComplete={complete} busy={busy === t.id} />)}</ul>
            )}
          </div>

          {/* 기한 없음 트레이 */}
          {noDue.length > 0 && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl mt-3 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 text-sm font-bold text-gray-500">🌙 기한 없음 <span className="text-gray-400">{noDue.length}</span></div>
              <ul>{noDue.map((t) => <TodoRow key={t.id} t={t} onComplete={complete} busy={busy === t.id} />)}</ul>
            </div>
          )}
        </>
      ) : (
        /* ===== 목록 뷰 ===== */
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          {todos.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">할일이 없어요. 위에서 추가하거나, 거래처 메모를 &quot;할 일&quot;로 적으면 여기 떠요.</div>
          ) : grouped.map((g) => (
            <div key={g.key} className="py-1">
              <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-xs font-extrabold">
                <span>{g.icon}</span>
                <span className={g.key === 'overdue' ? 'text-red-600' : g.key === 'today' ? 'text-brand-primary' : 'text-gray-500'}>{g.label}</span>
                <span className="text-gray-400 font-bold">{g.items.length}</span>
              </div>
              <ul>{g.items.map((t) => <TodoRow key={t.id} t={t} onComplete={complete} busy={busy === t.id} />)}</ul>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3 px-1">
        ※ 거래처/업체/방에 적은 &quot;할 일&quot;이면 작성자 본인에게 자동으로 떠요. 거래처 공유 메모(일반)는 거래처 화면에서 전부 그대로 보입니다.
      </p>
    </div>
  );
}
