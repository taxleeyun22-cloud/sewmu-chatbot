/**
 * Phase Next-Day28 (2026-05-11): /admin/dashboard — React Query + lucide + Skeleton.
 */
'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import {
  Clock,
  Star,
  MessageSquare,
  AlarmClock,
  FileText,
  CheckCircle2,
  ClipboardList,
  Bug,
  Search,
  StickyNote,
  Megaphone,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';

interface Counts {
  pendingUsers: number;
  approvedClients: number;
  pendingDocs: number;
  activeRooms: number;
  unreadMessages: number;
  urgentTodos: number;
  reviewPending: number;
  filingsInProgress: number;
  errorLogs: number;
}

interface RecentMessage {
  id: number;
  content: string | null;
  role: string;
  confidence: string | null;
  user_name: string | null;
  created_at: string | null;
}

interface RecentUpload {
  id: number;
  doc_type: string;
  status: string | null;
  vendor: string | null;
  amount: number | null;
  user_name: string | null;
  created_at: string | null;
}

interface RecentMemo {
  id: number;
  content: string;
  category: string | null;
  due_date: string | null;
  author_name: string | null;
  created_at: string | null;
}

const KPI_CONFIG: {
  key: keyof Counts;
  label: string;
  href: string;
  tone: string;
  icon: LucideIcon;
}[] = [
  { key: 'pendingUsers', label: '대기 거래처', href: '/admin/users?status=pending', tone: 'yellow', icon: Clock },
  { key: 'approvedClients', label: '기장거래처', href: '/admin/users?status=approved_client', tone: 'blue', icon: Star },
  { key: 'activeRooms', label: '활성 상담방', href: '/admin/rooms', tone: 'green', icon: MessageSquare },
  { key: 'urgentTodos', label: '임박 일정', href: '/admin/todos', tone: 'orange', icon: AlarmClock },
  { key: 'pendingDocs', label: '미처리 영수증', href: '/admin/docs?status=pending', tone: 'red', icon: FileText },
  { key: 'reviewPending', label: '검증 대기', href: '/admin/review', tone: 'purple', icon: CheckCircle2 },
  { key: 'filingsInProgress', label: '진행 신고', href: '/admin/filings', tone: 'indigo', icon: ClipboardList },
  { key: 'errorLogs', label: '에러 로그', href: '/admin/errors', tone: 'gray', icon: Bug },
];

const TONE_CLASSES: Record<string, string> = {
  yellow: 'border-yellow-200 bg-yellow-50/60 hover:bg-yellow-50',
  blue: 'border-blue-200 bg-blue-50/60 hover:bg-blue-50',
  orange: 'border-orange-200 bg-orange-50/60 hover:bg-orange-50',
  green: 'border-green-200 bg-green-50/60 hover:bg-green-50',
  red: 'border-red-200 bg-red-50/60 hover:bg-red-50',
  purple: 'border-purple-200 bg-purple-50/60 hover:bg-purple-50',
  indigo: 'border-indigo-200 bg-indigo-50/60 hover:bg-indigo-50',
  gray: 'border-gray-200 bg-gray-50 hover:bg-gray-100',
};

const TONE_ICON_COLORS: Record<string, string> = {
  yellow: 'text-yellow-600',
  blue: 'text-blue-600',
  orange: 'text-orange-600',
  green: 'text-green-600',
  red: 'text-red-600',
  purple: 'text-purple-600',
  indigo: 'text-indigo-600',
  gray: 'text-gray-600',
};

const QUICK_LINKS: { icon: LucideIcon; label: string; href: string }[] = [
  { icon: Search, label: '전역 검색', href: '/admin/search' },
  { icon: StickyNote, label: '메모', href: '/admin/memos' },
  { icon: Megaphone, label: '단체발송', href: '/admin/bulk-send' },
  { icon: ClipboardList, label: '신고 검토표', href: '/admin/filings' },
  { icon: BookOpen, label: 'FAQ', href: '/admin/faq' },
];

export default function DashboardPage() {
  const { data: counts, isLoading: countsLoading } = useQuery({
    queryKey: ['dashboard.counts'],
    queryFn: () => trpcCall<Counts>('dashboard.counts'),
  });

  const { data: recent, isLoading: recentLoading } = useQuery({
    queryKey: ['dashboard.recent'],
    queryFn: () =>
      trpcCall<{
        recentMessages: RecentMessage[];
        recentUploads: RecentUpload[];
        recentMemos: RecentMemo[];
      }>('dashboard.recent'),
  });

  return (
    <div className="p-4 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">대시보드</h1>
          <p className="text-xs text-gray-500 mt-0.5">사장님 매일 진입 · 30초 자동 갱신</p>
        </div>
        <Badge variant="success" className="animate-pulse">실시간</Badge>
      </header>

      {/* KPI Grid */}
      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        {KPI_CONFIG.map((kpi) => {
          const Icon = kpi.icon;
          const value = counts?.[kpi.key];
          return (
            <Link
              key={kpi.key}
              href={kpi.href}
              className={cn(
                'block border rounded-lg p-2.5 transition-all hover:shadow-md group',
                TONE_CLASSES[kpi.tone],
              )}
            >
              <Icon
                size={16}
                strokeWidth={1.8}
                className={cn('mb-1', TONE_ICON_COLORS[kpi.tone])}
              />
              <p className="text-[10px] text-gray-600">{kpi.label}</p>
              {countsLoading ? (
                <Skeleton className="h-5 w-8 mt-0.5" />
              ) : (
                <p className="text-lg font-bold text-gray-900 leading-tight">
                  {value ?? '-'}
                </p>
              )}
            </Link>
          );
        })}
      </section>

      {/* 빠른 진입 */}
      <Card>
        <CardHeader className="pb-1.5">
          <CardTitle className="text-xs">⚡ 빠른 진입</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-1.5">
            {QUICK_LINKS.map((q) => {
              const Icon = q.icon;
              return (
                <Link
                  key={q.href}
                  href={q.href}
                  className="flex flex-col items-center gap-1 py-2 px-1 bg-gray-50 rounded-md hover:bg-blue-50 hover:text-brand-primary transition-colors text-gray-700"
                >
                  <Icon size={16} strokeWidth={1.8} />
                  <span className="text-[10px] font-medium">{q.label}</span>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Feed */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <RecentSection
          title="💬 최근 대화"
          loading={recentLoading}
          items={recent?.recentMessages.map((m) => ({
            id: m.id,
            primary: m.user_name || '익명',
            secondary: (m.content || '').slice(0, 50),
            badge: m.confidence || undefined,
            badgeVariant: confidenceBadge(m.confidence),
            time: m.created_at || '',
            href: '/admin/review',
          }))}
        />
        <RecentSection
          title="📄 최근 업로드"
          loading={recentLoading}
          items={recent?.recentUploads.map((u) => ({
            id: u.id,
            primary: u.user_name || '익명',
            secondary: `${u.doc_type} · ${u.vendor || '-'} · ${
              u.amount ? `${u.amount.toLocaleString()}원` : '-'
            }`,
            badge: u.status || 'pending',
            badgeVariant: docBadge(u.status),
            time: u.created_at || '',
            href: '/admin/docs',
          }))}
        />
        <RecentSection
          title="📒 최근 메모"
          loading={recentLoading}
          items={recent?.recentMemos.map((m) => ({
            id: m.id,
            primary: m.author_name || '사장님',
            secondary: m.content.slice(0, 50),
            badge: m.category || undefined,
            badgeVariant: 'default' as const,
            time: m.created_at || '',
            href: '/admin/memos',
          }))}
        />
      </section>
    </div>
  );
}

function confidenceBadge(c: string | null): 'success' | 'warning' | 'danger' | 'default' {
  if (c === '높음') return 'success';
  if (c === '보통') return 'warning';
  if (c === '낮음') return 'danger';
  return 'default';
}

function docBadge(s: string | null): 'success' | 'warning' | 'danger' | 'default' {
  if (s === 'approved') return 'success';
  if (s === 'pending') return 'warning';
  if (s === 'rejected') return 'danger';
  return 'default';
}

function RecentSection({
  title,
  loading,
  items,
}: {
  title: string;
  loading: boolean;
  items?: {
    id: number;
    primary: string;
    secondary: string;
    badge?: string;
    badgeVariant?: 'success' | 'warning' | 'danger' | 'default';
    time: string;
    href: string;
  }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-1.5">
        <CardTitle className="text-xs">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && (
          <ul className="space-y-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="space-y-0.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-full" />
              </li>
            ))}
          </ul>
        )}
        {!loading && items && items.length === 0 && (
          <EmptyState title="데이터 없음" className="py-3" />
        )}
        {!loading && items && items.length > 0 && (
          <ul className="space-y-0.5">
            {items.slice(0, 5).map((it) => (
              <li key={it.id}>
                <Link
                  href={it.href}
                  className="block px-1.5 py-1 rounded hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-gray-900 truncate">
                        {it.primary}
                      </p>
                      <p className="text-[10px] text-gray-500 truncate">{it.secondary}</p>
                    </div>
                    {it.badge && (
                      <Badge variant={it.badgeVariant || 'default'} className="whitespace-nowrap">
                        {it.badge}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[9px] text-gray-400 font-mono mt-0.5">
                    {it.time?.slice(2, 16)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
