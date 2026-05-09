/**
 * Phase 3.6 (2026-05-08): business.html "💬 연결된 상담방" React 컴포넌트.
 *
 * 안전 패턴:
 *   - JSX 직접 (마크업 단순 — id / name / status 만)
 *   - biz-rooms-store ($bizRooms) 자동 reactive
 *   - onclick → location.href (기존 동작 동일)
 *
 * 효과:
 *   - business.js room list innerHTML 조작 제거 (store 갱신 만)
 *   - admin.html 에서 상담방 변경 시 business.html 도 즉시 반영 (cross-page signal 후속 가능)
 *   - 사장님 화면 영향 0 (마크업·디자인 그대로)
 */
import { useStore } from '@nanostores/react';
import { $bizRooms } from '../../admin/state/biz-rooms-store';

export function BizRoomList() {
  const state = useStore($bizRooms);

  if (state.loading) {
    return <div className="loading">상담방 불러오는 중...</div>;
  }
  if (state.error) {
    return <div className="empty" style={{ color: '#f04452' }}>오류: {state.error}</div>;
  }
  if (!state.rooms.length) {
    return <div className="empty">연결된 상담방 없음</div>;
  }

  /* admin auth key 보존 — admin.html#rooms?room_id=X 진입 시 같이 전달.
   * business.js 와 동일 패턴 (URL key 또는 sessionStorage). */
  let keyParam = '';
  try {
    const urlKey = new URL(location.href).searchParams.get('key');
    keyParam = urlKey || sessionStorage.getItem('ADMIN_KEY') || localStorage.getItem('ADMIN_KEY') || '';
  } catch (_) { /* SSR / 권한 없음 */ }

  return (
    <>
      {state.rooms.map((r) => {
        const isClosed = r.status === 'closed';
        const href =
          '/admin.html#rooms?room_id=' +
          encodeURIComponent(r.id) +
          (keyParam ? '&key=' + encodeURIComponent(keyParam) : '');
        return (
          <div
            key={r.id}
            className="room-row"
            onClick={() => { location.href = href; }}
            style={{ cursor: 'pointer' }}
          >
            <div style={{ flex: 1 }}>
              <b>{r.name || r.id}</b>
              {isClosed && (
                <span style={{ color: '#9ca3af', fontSize: '.78em', marginLeft: 4 }}>
                  종료
                </span>
              )}
              <div style={{ fontSize: '.72em', color: '#8b95a1' }}>ID: {r.id}</div>
            </div>
            <div style={{ color: '#3182f6' }}>›</div>
          </div>
        );
      })}
    </>
  );
}
