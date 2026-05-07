/**
 * Phase #2 (2026-05-07): 첫 React 컴포넌트 — admin role 배지.
 *
 * useAdminRole hook 사용 → role 자동 표시.
 * - owner: 👑 사장님
 * - manager: 🛡️ Manager
 * - staff: Staff
 * - 미인증: 표시 X
 *
 * 사용 (admin.html 안):
 *   <div id="admin-role-badge"></div>
 *   <script type="module" src="/assets/react.js"></script>
 *
 * react/main.tsx 가 #admin-role-badge 안 mount.
 */

import { type FC } from 'react';
import { useAdminRole } from '../hooks/useAdminRole';

export interface AdminRoleBadgeProps {
  /** 표시 위치 — 'inline' (기본) | 'block' (큰 배지) */
  variant?: 'inline' | 'block';
  /** polling 간격 (ms). 0 이면 polling X (1회만). */
  pollMs?: number;
}

const ROLE_CONFIG: Record<NonNullable<ReturnType<typeof useAdminRole>['role']>, { icon: string; label: string; bg: string; fg: string }> = {
  owner: { icon: '👑', label: '사장님 (owner)', bg: '#8b6914', fg: '#fff' },
  manager: { icon: '🛡️', label: 'Manager', bg: '#3182f6', fg: '#fff' },
  staff: { icon: '', label: 'Staff', bg: '#f1f5f9', fg: '#475569' },
};

export const AdminRoleBadge: FC<AdminRoleBadgeProps> = ({ variant = 'inline', pollMs = 30000 }) => {
  const { role, loading, error } = useAdminRole(pollMs);

  if (loading) {
    return (
      <span style={{ fontSize: '.7em', color: '#9ca3af', fontStyle: 'italic' }}>
        권한 확인 중...
      </span>
    );
  }

  if (error || !role) {
    return null; /* 미인증 시 hide */
  }

  const config = ROLE_CONFIG[role];
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    background: config.bg,
    color: config.fg,
    fontWeight: 700,
    borderRadius: '5px',
  };

  const inlineStyle: React.CSSProperties = {
    ...baseStyle,
    padding: '2px 7px',
    fontSize: '.68em',
  };

  const blockStyle: React.CSSProperties = {
    ...baseStyle,
    padding: '6px 12px',
    fontSize: '.85em',
    borderRadius: '8px',
  };

  const style = variant === 'block' ? blockStyle : inlineStyle;

  return (
    <span style={style} title={config.label}>
      {config.icon && <span aria-hidden="true">{config.icon}</span>}
      <span>{config.label.split(' ')[0]}</span>
    </span>
  );
};

export default AdminRoleBadge;
