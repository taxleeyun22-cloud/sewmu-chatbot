/**
 * Phase 3.7 (2026-05-08): 상담방 메시지 list React 컴포넌트.
 *
 * 안전 패턴:
 *   - HTML markup 은 admin-rooms-list.js 의 _buildRoomMessagesHtml() 호출
 *   - dangerouslySetInnerHTML — 마크업·data-attr·디자인 100% 그대로
 *   - messages-store ($messages) 자동 reactive — 새 메시지 / 삭제 / polling 후 즉시 갱신
 *
 * 효과:
 *   - admin-rooms-list.js loadRoomDetail container.innerHTML 제거
 *   - 새 메시지 도착 polling (10s) 시 store 갱신 → React 자동 re-render
 *   - 사장님 화면 영향 0 (long-press / 답장 / 영수증 변환 / etc onclick 그대로)
 */
import { useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { $messages } from '@/state/messages-store';

declare global {
  interface Window {
    __buildRoomMessagesHtml?: () => string;
    /** 사장님이 새 메시지 보낸 직후 강제 스크롤 — admin-rooms-msg.js 가 set */
    adminForceScrollOnNext?: boolean;
  }
}

export function RoomMessages() {
  const state = useStore($messages);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wasAtBottomRef = useRef<boolean>(true);

  /* 렌더 직전: 외부 #roomMessages 스크롤 위치를 미리 캡처 (atBottom 판단용) */
  const outer = typeof document !== 'undefined' ? document.getElementById('roomMessages') : null;
  if (outer) {
    wasAtBottomRef.current = outer.scrollHeight - outer.scrollTop - outer.clientHeight < 50;
  }

  /* 메시지 변경 시 자동 스크롤 — atBottom 이거나 강제 플래그.
   * useEffect 는 render 후 실행 → 새 scrollHeight 기준으로 정확. */
  useEffect(() => {
    const el = document.getElementById('roomMessages');
    if (!el) return;
    if (wasAtBottomRef.current || window.adminForceScrollOnNext) {
      el.scrollTop = el.scrollHeight;
      if (window.adminForceScrollOnNext) window.adminForceScrollOnNext = false;
    }
  }, [state.messages, state.lastFetchedAt]);

  if (state.error) {
    return (
      <div
        ref={containerRef}
        style={{ textAlign: 'center', color: '#dc2626', fontSize: '.85em', padding: '30px 0' }}
      >
        메시지 불러오기 실패: {state.error}
        <br />
        <button
          onClick={() => {
            const fn = (window as unknown as { loadRoomDetail?: () => void }).loadRoomDetail;
            if (typeof fn === 'function') fn();
          }}
          style={{
            marginTop: 10,
            background: '#3182f6',
            color: '#fff',
            border: 'none',
            padding: '6px 14px',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          🔄 재시도
        </button>
      </div>
    );
  }

  if (!state.messages.length) {
    if (state.loading) {
      return (
        <div ref={containerRef} style={{ textAlign: 'center', color: '#8b95a1', padding: '20px 0' }}>
          메시지 불러오는 중...
        </div>
      );
    }
    /* 빈 방 상태 — 첫 메시지 입력 안내 */
    return (
      <div ref={containerRef} style={{ textAlign: 'center', color: '#8b95a1', padding: '40px 0', fontSize: '.85em' }}>
        새 상담방입니다 — 첫 메시지를 입력하세요.
      </div>
    );
  }

  const buildFn = typeof window !== 'undefined' ? window.__buildRoomMessagesHtml : undefined;
  if (typeof buildFn !== 'function') {
    return (
      <div ref={containerRef} style={{ textAlign: 'center', color: '#dc2626', padding: '20px 0' }}>
        ⚠️ 빌더 미로드 — admin-rooms-list.js 확인 필요
      </div>
    );
  }

  let html = '';
  try {
    html = buildFn();
  } catch (e) {
    return (
      <div ref={containerRef} style={{ textAlign: 'center', color: '#dc2626', padding: '20px 0' }}>
        ⚠️ 렌더 실패: {(e as Error).message}
      </div>
    );
  }

  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: html }} />;
}
