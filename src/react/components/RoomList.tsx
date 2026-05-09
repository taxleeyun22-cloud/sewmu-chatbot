/**
 * Phase 3.5.B (2026-05-08): 상담방 list React 컴포넌트.
 *
 * 안전 패턴:
 *   - HTML markup 은 admin-rooms-list.js 의 _buildRoomListHtml() 호출 (HTML string)
 *   - dangerouslySetInnerHTML 로 표시 — 마크업·onclick·디자인 100% 그대로
 *   - rooms-store ($rooms) 자동 reactive — mutation 후 즉시 갱신
 *
 * 효과:
 *   - admin-rooms-list.js loadRoomList 의 innerHTML 조작 제거 (store 갱신 만)
 *   - 사장님 화면 영향 0 (마크업·액션 그대로)
 */
import { useStore } from '@nanostores/react';
import { $rooms } from '../../admin/state/rooms-store';

declare global {
  interface Window {
    __buildRoomListHtml?: () => string;
  }
}

export function RoomList() {
  const state = useStore($rooms);

  /* Phase Infra-2 fix (2026-05-09): loading + 빈 list 일 때만 표시. cached 데이터 있으면 list. */
  if (state.loading && !state.rooms.length) {
    return <div className="empty">불러오는 중...</div>;
  }
  if (state.error) {
    return <div className="empty" style={{ color: '#f04452' }}>오류: {state.error}</div>;
  }
  if (!state.rooms.length) {
    return <div className="empty" style={{ padding: '40px 20px' }}>상담방이 없습니다</div>;
  }

  const buildFn = typeof window !== 'undefined' ? window.__buildRoomListHtml : undefined;
  if (typeof buildFn !== 'function') {
    return (
      <div className="empty">
        ⚠️ 빌더 미로드 — admin-rooms-list.js?v=N 확인 필요 ({state.rooms.length}개)
      </div>
    );
  }

  let html = '';
  try {
    html = buildFn();
  } catch (e) {
    return (
      <div className="empty" style={{ color: '#f04452' }}>
        ⚠️ 렌더 실패: {(e as Error).message}
      </div>
    );
  }

  /* dangerouslySetInnerHTML — 기존 markup·액션 그대로 (admin-rooms-list.js 의 onclick 작동) */
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
