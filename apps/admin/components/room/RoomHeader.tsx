/**
 * Phase 3.9 (2026-05-09): 상담방 헤더 React 컴포넌트.
 *
 * 안전 패턴:
 *   - JSX 직접 (마크업 단순)
 *   - messages-store ($messages) 자동 reactive
 *   - 기존 글로벌 함수 (toggleRoomStatus / openCustomerDashboardFromRoom 등) onClick 호출
 *
 * 효과:
 *   - admin-rooms-list.js loadRoomDetail 의 roomChatTitle / roomStatusBtn / roomMembers 갱신 코드 제거
 *   - 방 진입·이름 변경·status 변경 시 즉시 반영
 *   - 사장님 화면 영향 0 (기존 마크업 그대로)
 */
import { useStore } from '@nanostores/react';
import { $messages } from '@/state/messages-store';

declare global {
  interface Window {
    toggleRoomStatus?: () => void;
    _bindRoomMemberLongPress?: () => void;
  }
}

export function RoomChatTitle() {
  const s = useStore($messages);
  if (!s.roomId) {
    return <>좌측 상담방을 선택하세요</>;
  }
  return (
    <>
      <b>{s.roomName || '상담방'}</b>{' '}
      <span style={{ fontSize: '.75em', color: '#8b95a1' }}>({s.roomId})</span>
    </>
  );
}

/** roomStatusBtn 자체가 이미 <button onclick="toggleRoomStatus()"> 임 — React 는 그 안에 텍스트만 */
export function RoomStatusBtn() {
  const s = useStore($messages);
  const label = s.roomStatus === 'active' ? '종료' : '재개';
  return <>{label}</>;
}

/**
 * 멤버 영역 — 마크업 복잡 (각 멤버 long-press 메뉴 위해 data-uid / data-name 보존).
 * 기존 admin-rooms-list.js 와 동일 markup → dangerouslySetInnerHTML.
 * 그리고 _bindRoomMemberLongPress 호출 해서 listener 부착.
 */
export function RoomMembers() {
  const s = useStore($messages);
  if (!s.roomId || !s.members.length) {
    return null;
  }
  const active = s.members.filter((m) => !m.left_at);
  if (!active.length) return null;

  /* admin-rooms-list.js 와 동일 escape — XSS 방지 */
  const e = (t: unknown) =>
    String(t ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const escAttr = (t: unknown) =>
    String(t ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const memberHtml = active
    .map((m) => {
      const nm = e(m.real_name || m.name || '이름없음');
      if (m.role === 'admin') return nm + '(관리)';
      return (
        '<span class="room-member" data-uid="' +
        (m.user_id || '') +
        '" data-name="' +
        escAttr(m.real_name || m.name || '') +
        '" style="cursor:context-menu;text-decoration:underline dotted #9ca3af;text-underline-offset:2px" title="꾹 누르면 메뉴 (거래 종료 등)">' +
        nm +
        '</span>'
      );
    })
    .join(', ');

  const html = `👥 멤버 ${active.length}명: ${memberHtml}  + 🏢 세무회계 이윤`;

  return (
    <div
      ref={(el) => {
        if (el && typeof window._bindRoomMemberLongPress === 'function') {
          /* DOM mount 직후 long-press listener 부착 */
          setTimeout(() => window._bindRoomMemberLongPress!(), 0);
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
