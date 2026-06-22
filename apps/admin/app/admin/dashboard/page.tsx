/**
 * Phase 마이그레이션-1 (2026-06-19): /admin/dashboard — 옛 admin.html redirect → 진짜 React 홈.
 *
 * strangler 1번 타자(읽기전용, 최저 리스크). dashboard tRPC(counts/recent) 재사용.
 * - KPI 카드 그리드(클릭 시 해당 화면) + 긴급 강조
 * - 영업·도구 바로가기
 * - 최근 활동(메시지·업로드·메모)
 */
'use client';
export const runtime = 'edge';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { trpcCall } from '@/lib/trpc';
import { SkeletonList } from '@/components/ui/skeleton';

interface Counts {
  pendingUsers: number;
  approvedClients: number;
  rejectedUsers: number;
  terminatedUsers: number;
  adminUsers: number;
  businesses: number;
  memosTotal: number;
  trash: number;
  pendingDocs: number;
  activeRooms: number;
  unreadMessages: number;
  urgentTodos: number;
  reviewPending: number;
  filingsInProgress: number;
  errorLogs: number;
}
interface RecentMsg {
  id: number;
  content: string | null;
  role: string;
  confidence: string | null;
  user_id: number | null;
  user_name: string | null;
  created_at: string | null;
}
interface RecentUpload {
  id: number;
  doc_type: string | null;
  status: string | null;
  vendor: string | null;
  amount: number | null;
  user_name: string | null;
  created_at: string | null;
}
interface RecentMemo {
  id: number;
  content: string | null;
  category: string | null;
  due_date: string | null;
  author_name: string | null;
  created_at: string | null;
}
interface Recent {
  recentMessages: RecentMsg[];
  recentUploads: RecentUpload[];
  recentMemos: RecentMemo[];
}

interface Kpi {
  key: keyof Counts;
  label: string;
  href: string;
  icon: string;
  urgent?: boolean; // >0 이면 빨강 강조
}
const KPIS: Kpi[] = [
  { key: 'pendingUsers', label: '미승인 사용자', href: '/admin/users', icon: '🙋', urgent: true },
  { key: 'reviewPending', label: '검증 대기 AI', href: '/admin/review', icon: '✅', urgent: true },
  { key: 'pendingDocs', label: '미처리 영수증', href: '/admin/docs', icon: '🧾', urgent: true },
  { key: 'urgentTodos', label: '임박 일정(3일)', href: '/admin/todos', icon: '⏰', urgent: true },
  { key: 'errorLogs', label: '에러(7일)', href: '/admin/errors', icon: '🐞', urgent: true },
  { key: 'activeRooms', label: '활성 상담방', href: '/admin/rooms', icon: '💬' },
  { key: 'approvedClients', label: '기장거래처', href: '/admin/users', icon: '🏢' },
  { key: 'businesses', label: '업체', href: '/admin/businesses', icon: '🏬' },
  { key: 'filingsInProgress', label: '검토표 진행', href: '/admin/filings', icon: '📋' },
  { key: 'memosTotal', label: '메모', href: '/admin/memos', icon: '📝' },
];

const QUICK_LINKS: { href: string; label: string; icon: string }[] = [
  { href: '/admin/sales-targets', label: '영업 타겟', icon: '🎯' },
  { href: '/admin/billing', label: '청구서', icon: '💰' },
  { href: '/admin/scrape', label: '신고서 스크래핑', icon: '🏢' },
  { href: '/admin/bulk-send', label: '단체발송', icon: '📢' },
  { href: '/admin/faq', label: 'FAQ', icon: '📚' },
  { href: '/admin/analytics', label: '분석', icon: '📊' },
  { href: '/admin.html', label: '옛 admin (상담방)', icon: '🗂️' },
];

function fmtTime(s: string | null): string {
  if (!s) return '';
  return s.replace('T', ' ').slice(5, 16); // MM-DD HH:mm
}
function won(n: number | null): string {
  return (n || 0).toLocaleString('ko-KR');
}

export default function DashboardPage() {
  const countsQ = useQuery<Counts>({
    queryKey: ['dashboard.counts'],
    queryFn: () => trpcCall<Counts>('dashboard.counts'),
    refetchInterval: 30_000,
  });
  const recentQ = useQuery<Recent>({
    queryKey: ['dashboard.recent'],
    queryFn: () => trpcCall<Recent>('dashboard.recent'),
  });
  const c = countsQ.data;
  const r = recentQ.data;

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
      {/* 인사 */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">안녕하세요, 이재윤 대표세무사님 👋</h1>
        <p className="text-sm text-gray-500 mt-1">
          {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} · 오늘 한눈에 보기
        </p>
      </div>

      {/* KPI 그리드 */}
      {countsQ.isLoading ? (
        <SkeletonList rows={2} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {KPIS.map((k) => {
            const v = c ? c[k.key] : 0;
            const hot = !!k.urgent && v > 0;
            return (
              <Link
                key={k.key}
                href={k.href}
                className={`rounded-xl border p-4 transition hover:shadow-md ${
                  hot
                    ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                    : 'bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-700'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <span>{k.icon}</span>
                  <span className="truncate">{k.label}</span>
                </div>
                <div className={`mt-1 text-2xl font-bold ${hot ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                  {v.toLocaleString('ko-KR')}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* 바로가기 */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">바로가기</h2>
        <div className="flex flex-wrap gap-2">
          {QUICK_LINKS.map((q) =>
            q.href.startsWith('/admin.html') ? (
              <a
                key={q.href}
                href={q.href}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <span>{q.icon}</span>
                {q.label}
              </a>
            ) : (
              <Link
                key={q.href}
                href={q.href}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <span>{q.icon}</span>
                {q.label}
              </Link>
            ),
          )}
        </div>
      </div>

      {/* 최근 활동 3열 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <RecentCard title="💬 최근 대화" loading={recentQ.isLoading} empty={!r?.recentMessages.length}>
          {(r?.recentMessages || []).slice(0, 6).map((m) => (
            <li key={m.id} className="py-1.5 border-t border-gray-100 dark:border-gray-800 first:border-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                  {m.user_name || (m.role === 'assistant' ? 'AI' : '익명')}
                  {m.confidence && m.role === 'assistant' && (
                    <span className={`ml-1 text-[10px] ${m.confidence === '낮음' ? 'text-red-500' : 'text-gray-400'}`}>
                      [{m.confidence}]
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-gray-400 shrink-0">{fmtTime(m.created_at)}</span>
              </div>
              <p className="text-xs text-gray-500 truncate">{m.content}</p>
            </li>
          ))}
        </RecentCard>

        <RecentCard title="🧾 최근 업로드" loading={recentQ.isLoading} empty={!r?.recentUploads.length}>
          {(r?.recentUploads || []).slice(0, 6).map((u) => (
            <li key={u.id} className="py-1.5 border-t border-gray-100 dark:border-gray-800 first:border-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                  {u.user_name || '—'} · {u.doc_type || '문서'}
                </span>
                <span className="text-[10px] text-gray-400 shrink-0">{fmtTime(u.created_at)}</span>
              </div>
              <p className="text-xs text-gray-500 truncate">
                {u.vendor || ''} {u.amount ? `· ${won(u.amount)}원` : ''}{' '}
                <span className={u.status === 'pending' ? 'text-amber-600' : 'text-gray-400'}>({u.status})</span>
              </p>
            </li>
          ))}
        </RecentCard>

        <RecentCard title="📝 최근 메모" loading={recentQ.isLoading} empty={!r?.recentMemos.length}>
          {(r?.recentMemos || []).slice(0, 6).map((m) => (
            <li key={m.id} className="py-1.5 border-t border-gray-100 dark:border-gray-800 first:border-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                  {m.author_name || '—'} {m.category ? `· ${m.category}` : ''}
                </span>
                <span className="text-[10px] text-gray-400 shrink-0">{m.due_date ? `~${m.due_date.slice(5, 10)}` : fmtTime(m.created_at)}</span>
              </div>
              <p className="text-xs text-gray-500 truncate">{m.content}</p>
            </li>
          ))}
        </RecentCard>
      </div>
    </div>
  );
}

function RecentCard({
  title,
  loading,
  empty,
  children,
}: {
  title: string;
  loading: boolean;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">{title}</h3>
      {loading ? (
        <p className="text-xs text-gray-400 py-4">불러오는 중…</p>
      ) : empty ? (
        <p className="text-xs text-gray-400 py-4">없음</p>
      ) : (
        <ul>{children}</ul>
      )}
    </div>
  );
}
