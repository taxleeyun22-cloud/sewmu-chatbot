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

  /* Phase Infra-2 fix (2026-05-09): 사장님 보고 — "민지" 검색 시 list filter 안 됨.
   * 원인: 기존 _doClientSearch (admin-search-bulk.js) 가 list.children 직접 hide/show 시도.
   *       React mount 후 list.children = [react root div] 1개 → filter 작동 X.
   * 해결: store searchQuery 읽어서 React 안에서 filter. */
  const q = (state.searchQuery || '').trim().toLowerCase();
  const filtered = q
    ? state.users.filter((u) => {
        const hay = (
          (u.real_name || '') +
          ' ' +
          (u.name || '') +
          ' ' +
          (u.phone || '') +
          ' ' +
          (u.email || '') +
          ' ' +
          (u.company_name || '') +
          ' ' +
          (u.ceo_name || '')
        ).toLowerCase();
        return hay.indexOf(q) >= 0;
      })
    : state.users;

  if (q && !filtered.length) {
    return (
      <div
        className="empty"
        style={{ padding: '30px 0', textAlign: 'center', color: '#8b95a1', fontSize: '.88em' }}
      >
        "{q}"에 일치하는 사용자가 없습니다 (현재 탭 내).
      </div>
    );
  }

  /* HTML string 합치기 — 카드 100+ 개도 빠름 (단일 dangerouslySetInnerHTML). */
  const html = filtered
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
