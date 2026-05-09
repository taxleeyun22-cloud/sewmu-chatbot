/**
 * Phase 3.4.B (2026-05-08): 거래처 dashboard 헤더 React.
 *
 * 3개 영역:
 *   - CdName: 거래처 이름 (real_name || name || #id)
 *   - CdSub: phone · provider · approval_status
 *   - CdPriority: 1/2/3순위 배지 (active 방의 priority 기반)
 *
 * 모두 $dashboard store 자동 reactive.
 */
import { useStore } from '@nanostores/react';
import { $dashboard } from '../../admin/state/dashboard-store';

const STATUS_LABEL: Record<string, string> = {
  approved_client: '🏢 기장거래처',
  approved_guest: '✅ 일반',
};

function statusLabel(s?: string | null): string {
  if (!s) return '⏳ pending';
  return STATUS_LABEL[s] || `⏳ ${s}`;
}

const PRIORITY_COLORS: Record<number, string> = {
  1: '#dc2626',
  2: '#f59e0b',
  3: '#10b981',
};

export function CdName() {
  const s = useStore($dashboard);
  if (s.loading) return <>불러오는 중...</>;
  if (!s.user) return <>{s.userId ? `#${s.userId}` : ''}</>;
  return <>{s.user.real_name || s.user.name || `#${s.userId}`}</>;
}

export function CdSub() {
  const s = useStore($dashboard);
  if (!s.user) return <></>;
  const u = s.user;
  const phone = u.phone || '연락처 미등록';
  const provider = u.provider ? ` · ${u.provider} 로그인` : '';
  const status = statusLabel(u.approval_status);
  return <>{phone}{provider} · {status}</>;
}

export function CdPriority() {
  const s = useStore($dashboard);
  const pri = s.priority || 0;
  const color = PRIORITY_COLORS[pri] || '#9ca3af';
  const label = pri > 0 ? `${pri}순위` : '미분류';
  return (
    <span style={{ background: color, color: '#fff', padding: '4px 10px', borderRadius: '14px', fontSize: '.74em', fontWeight: 700 }}>
      {label}
    </span>
  );
}
