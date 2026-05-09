/**
 * Phase 3.12 (2026-05-09): 상담방 첨부 대기열 nanostore.
 *
 * admin-rooms-msg.js _addPendingAttachments / _removePendingAttach 가 store 갱신 →
 * RoomAttachPreview React 컴포넌트 자동 reactive.
 *
 * 사장님 효과:
 *   - 사진 붙여넣기 / 드래그 / 파일 선택 후 즉시 미리보기 표시
 *   - X 버튼 클릭 후 즉시 사라짐
 *   - 사진 1장 → 10장 추가/제거 시 깜빡임 0
 */
import { atom } from 'nanostores';

/** 첨부 대기열 1개 */
export interface PendingAttachment {
  /** 원본 File 객체 (전송 시 사용) */
  file: File;
  /** 미리보기 URL (URL.createObjectURL) */
  previewUrl: string;
}

export interface AttachmentsState {
  attachments: PendingAttachment[];
}

export const initialAttachmentsState: AttachmentsState = {
  attachments: [],
};

export const $attachments = atom<AttachmentsState>({ ...initialAttachmentsState });

/** 첨부 추가 (1개 또는 여러개) */
export function addAttachments(items: PendingAttachment[]): void {
  const cur = $attachments.get();
  $attachments.set({ ...cur, attachments: [...cur.attachments, ...items] });
}

/** 인덱스로 제거 (URL revoke 는 caller 가 처리) */
export function removeAttachmentAt(index: number): PendingAttachment | null {
  const cur = $attachments.get();
  if (index < 0 || index >= cur.attachments.length) return null;
  const removed = cur.attachments[index];
  $attachments.set({
    ...cur,
    attachments: cur.attachments.filter((_, i) => i !== index),
  });
  return removed;
}

/** 전체 비우기 (전송 후 / 답장 충돌 시) */
export function clearAttachments(): PendingAttachment[] {
  const cur = $attachments.get();
  $attachments.set({ ...cur, attachments: [] });
  return cur.attachments;
}

export function getAttachments(): AttachmentsState {
  return $attachments.get();
}

export function subscribeAttachments(cb: (s: AttachmentsState) => void): () => void {
  return $attachments.subscribe(cb);
}

/* ============================================================
 * Global 노출 — admin-rooms-msg.js (classic script) 호출용
 * ============================================================ */
export interface AttachmentsStoreGlobal {
  add: (items: PendingAttachment[]) => void;
  removeAt: (index: number) => PendingAttachment | null;
  clear: () => PendingAttachment[];
  get: () => AttachmentsState;
  subscribe: (cb: (s: AttachmentsState) => void) => () => void;
}

declare global {
  interface Window {
    __attachmentsStore?: AttachmentsStoreGlobal;
  }
}

if (typeof window !== 'undefined') {
  window.__attachmentsStore = {
    add: addAttachments,
    removeAt: removeAttachmentAt,
    clear: clearAttachments,
    get: getAttachments,
    subscribe: subscribeAttachments,
  };
}
