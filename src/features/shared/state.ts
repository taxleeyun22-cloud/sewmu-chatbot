/**
 * Phase 2 Stage 2-2 — 공유 상태 (nanostores)
 *
 * 기존 admin.js 의 글로벌 변수들을 features/* 모듈이 공유하기 위한 단일 저장소.
 * Phase 2 진행 중 admin.js 의 let/var 선언이 여기로 점진 이전됨.
 *
 * 사용 패턴:
 *   import { $key, $isOwner, $currentRoomId } from '@/features/shared/state';
 *   const k = $key.get();           // 읽기
 *   $key.set('new-value');          // 쓰기
 *   $key.subscribe(v => ...);       // 구독
 */
import { atom } from 'nanostores';

/** 관리자 로그인 토큰 (admin.js 줄 13: KEY) */
export const $key = atom<string>('');

/** 권한 분기 (admin.js 줄 560: IS_OWNER) — true=admin.html, false=staff.html */
export const $isOwner = atom<boolean>(false);

/** 현재 열려있는 상담방 ID (admin.js 줄 613: currentRoomId) */
export const $currentRoomId = atom<string | null>(null);

/** 현재 상담방 상태 (admin.js 줄 614: currentRoomStatus) */
export const $currentRoomStatus = atom<'active' | 'closed' | null>(null);

/** 현재 상담방 직통번호 (admin.js 줄 615: currentRoomPhone) */
export const $currentRoomPhone = atom<string | null>(null);

/** 사용자 승인 탭 필터 (admin.js 줄 2494: currentStatus) */
export const $userStatusFilter = atom<'pending' | 'approved_guest' | 'approved_client' | 'rejected'>(
  'pending',
);

/** 답장 인용 메타데이터 (admin.js 줄 1272: roomReplyingTo) */
export interface ReplyingTo {
  msgId: number;
  preview: string;
  author: string;
}
export const $roomReplyingTo = atom<ReplyingTo | null>(null);

/** 첨부 대기 (admin.js 줄 1566: _pendingAttachments) */
export interface PendingAttachment {
  type: 'image' | 'file';
  blob: Blob;
  name: string;
  size: number;
}
export const $pendingAttachments = atom<PendingAttachment[]>([]);

/** 검증(review) 탭 필터 (admin.js 줄 3130: curFilter) */
export const $reviewConfidenceFilter = atom<'all' | '높음' | '보통' | '낮음'>('all');

/** 상담방 모드 (admin.js 줄 572: _roomsMode) */
export const $roomsMode = atom<'external' | 'internal'>('external');
