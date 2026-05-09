/**
 * Phase 3.12 (2026-05-09): 상담방 첨부 대기열 React 컴포넌트.
 *
 * 안전 패턴:
 *   - JSX 직접 (마크업 단순 — img + 제거 버튼)
 *   - attachments-store ($attachments) 자동 reactive
 *   - 제거 버튼 클릭 시 store 업데이트 + URL revoke
 *
 * 효과:
 *   - admin-rooms-msg.js _renderPendingAttachments innerHTML 조작 제거
 *   - 사진 추가/제거 시 즉시 반영, 깜빡임 0
 */
import { useStore } from '@nanostores/react';
import { $attachments, removeAttachmentAt } from '../../admin/state/attachments-store';

export function RoomAttachPreview() {
  const state = useStore($attachments);

  if (!state.attachments.length) {
    /* 첨부 0 → 컴포넌트 자체 안 보이게 */
    return <></>;
  }

  return (
    <div
      style={{
        padding: '8px 12px',
        borderTop: '1px solid #e5e8eb',
        background: '#f9fafb',
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
      }}
    >
      {state.attachments.map((a, i) => (
        <div key={a.previewUrl} style={{ position: 'relative', flexShrink: 0 }}>
          <img
            src={a.previewUrl}
            alt={`첨부 ${i + 1}`}
            style={{
              width: 60,
              height: 60,
              objectFit: 'cover',
              borderRadius: 8,
              border: '1px solid #e5e8eb',
              display: 'block',
            }}
          />
          <button
            onClick={() => {
              const removed = removeAttachmentAt(i);
              if (removed && removed.previewUrl) {
                try {
                  URL.revokeObjectURL(removed.previewUrl);
                } catch (_) {
                  /* ignore */
                }
              }
            }}
            aria-label="제거"
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              width: 20,
              height: 20,
              background: '#000',
              color: '#fff',
              border: 'none',
              borderRadius: '50%',
              fontSize: '.72em',
              cursor: 'pointer',
              lineHeight: 1,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
