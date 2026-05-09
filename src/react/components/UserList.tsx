/**
 * Phase 3.1.B (2026-05-08): 사용자 list React 컴포넌트.
 *
 * 안전 패턴:
 *   - 카드 markup 은 admin-users-tab.js 의 _renderUserCardHtml(u, status) 호출 (HTML string)
 *   - dangerouslySetInnerHTML 로 표시 — 마크업·액션·디자인 100% 그대로
 *   - users-store ($users) 자동 reactive — mutation 후 즉시 갱신
 *
 * 효과:
 *   - admin-users-tab.js loadUsers 의 innerHTML 조작 제거
 *   - mutation (approve/reject/admin) 후 store 만 갱신 → React 자동 re-render
 *   - 사장님 화면 영향 0 (마크업·액션 그대로)
 */
import { useStore } from '@nanostores/react';
import { $users } from '../../admin/state/users-store';

declare global {
  interface Window {
    __renderUserCardHtml?: (u: unknown, status: string) => string;
  }
}

export function UserList() {
  const state = useStore($users);

  if (state.loading) {
    return <div className="empty">불러오는 중...</div>;
  }
  if (state.error) {
    return <div className="empty" style={{ color: '#f04452' }}>오류: {state.error}</div>;
  }
  if (!state.users.length) {
    return <div className="empty">해당 상태의 사용자가 없습니다</div>;
  }

  /* admin-users-tab.js 의 _renderUserCardHtml 함수가 fallback 으로 노출.
   * 없으면 fallback (단순 표시). */
  const renderFn = typeof window !== 'undefined' ? window.__renderUserCardHtml : undefined;
  if (typeof renderFn !== 'function') {
    return (
      <div className="empty">
        ⚠️ 카드 렌더 함수 미로드 — admin-users-tab.js?v=N 확인 필요 ({state.users.length}명)
      </div>
    );
  }

  /* HTML string 합치기 — 카드 100+ 개도 빠름 (단일 dangerouslySetInnerHTML).
   * key 는 user.id 기반 — React 가 list 재렌더 시 효율 */
  const html = state.users
    .map((u) => {
      try {
        return renderFn(u, state.currentStatus);
      } catch (e) {
        return `<div class="empty" style="color:#f04452">⚠️ 카드 렌더 실패: ${(e as Error).message}</div>`;
      }
    })
    .join('');

  /* dangerouslySetInnerHTML — 기존 markup·액션 그대로 (admin-users-tab.js 함수 onclick 작동) */
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
