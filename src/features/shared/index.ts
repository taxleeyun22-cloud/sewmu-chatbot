/**
 * features/shared 공개 API
 *
 * 다른 features/* 모듈이 import 할 때 이 파일만 참조.
 * 내부 구조 변경(state.ts 분할 등) 시 외부 영향 없음.
 */
export {
  $key,
  $isOwner,
  $currentRoomId,
  $currentRoomStatus,
  $currentRoomPhone,
  $userStatusFilter,
  $roomReplyingTo,
  $pendingAttachments,
  $reviewConfidenceFilter,
  $roomsMode,
} from './state';

export type { ReplyingTo, PendingAttachment } from './state';
