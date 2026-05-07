/**
 * Phase #2 (2026-05-07): 첫 React Hook — admin role 자동 fetch + 캐시.
 *
 * 사용:
 *   import { useAdminRole } from '@/react/hooks/useAdminRole';
 *   const { role, owner, manager, loading } = useAdminRole();
 *
 * /api/admin-whoami 호출 + 30초 polling.
 */

import { useEffect, useState } from 'react';

export type AdminRole = 'owner' | 'manager' | 'staff' | null;

export interface AdminRoleState {
  role: AdminRole;
  owner: boolean;
  manager: boolean;
  staff: boolean;
  userId: number | null;
  loading: boolean;
  error: string | null;
}

const INITIAL: AdminRoleState = {
  role: null,
  owner: false,
  manager: false,
  staff: false,
  userId: null,
  loading: true,
  error: null,
};

function getKey(): string {
  /* admin.js classic script global. React component 가 호출 시 KEY 접근. */
  if (typeof window === 'undefined') return '';
  // @ts-expect-error — admin-globals.d.ts declared but window 안에 직접 추가 X
  return window.KEY || '';
}

export function useAdminRole(pollIntervalMs: number = 30000): AdminRoleState {
  const [state, setState] = useState<AdminRoleState>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchRole = async () => {
      const key = getKey();
      if (!key) {
        if (!cancelled) setState({ ...INITIAL, loading: false, error: 'no key' });
        return;
      }
      try {
        const r = await fetch('/api/admin-whoami?key=' + encodeURIComponent(key));
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = (await r.json()) as {
          ok: boolean;
          role?: AdminRole;
          owner?: boolean;
          manager?: boolean;
          userId?: number | null;
        };
        if (cancelled) return;
        if (d.ok) {
          setState({
            role: d.role || null,
            owner: !!d.owner,
            manager: !!d.manager,
            staff: !!(d.role === 'staff' || d.role === 'manager' || d.role === 'owner'),
            userId: d.userId ?? null,
            loading: false,
            error: null,
          });
        } else {
          setState({ ...INITIAL, loading: false, error: 'unauthorized' });
        }
      } catch (e) {
        if (!cancelled) {
          setState((prev) => ({ ...prev, loading: false, error: (e as Error).message }));
        }
      }
    };

    void fetchRole();
    if (pollIntervalMs > 0) {
      timer = setInterval(fetchRole, pollIntervalMs);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [pollIntervalMs]);

  return state;
}
