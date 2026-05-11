/**
 * Phase 3.4.E (2026-05-08): 거래처 dashboard 최근 대화 (cdRecentChat) React.
 *
 * 단순 메시지 — 추후 실제 메시지 표시로 확장 가능.
 * $dashboard.recentRoom 자동 reactive — 활성 방 있으면 그 방 정보 표시.
 */
import { useStore } from '@nanostores/react';
import { $dashboard } from '@/state/dashboard-store';

export function CdRecentChat() {
  const s = useStore($dashboard);

  if (s.loading) {
    return <div style={{ color: '#8b95a1' }}>…</div>;
  }
  if (!s.userId) {
    return <></>;
  }

  const room = s.recentRoom;
  if (!room) {
    return (
      <div style={{ color: '#8b95a1' }}>
        활성 상담방 없음.
      </div>
    );
  }

  return (
    <div style={{ color: '#8b95a1' }}>
      우측 "상담방 열기" 버튼으로 전체 대화 확인.
      {room.id ? (
        <span style={{ marginLeft: '8px', color: '#3182f6', fontSize: '.78em' }}>
          (방 #{room.id}{room.name ? ` · ${room.name}` : ''})
        </span>
      ) : null}
    </div>
  );
}
