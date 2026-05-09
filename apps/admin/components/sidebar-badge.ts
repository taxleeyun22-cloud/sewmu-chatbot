/**
 * Phase Next-Day25 (2026-05-09): Sidebar 카운트 배지 색깔 매핑.
 * 별도 파일 — next/link import 없이 단위 테스트 가능.
 */

export type CountKey =
  | 'pendingUsers'
  | 'approvedClients'
  | 'pendingDocs'
  | 'activeRooms'
  | 'unreadMessages'
  | 'urgentTodos'
  | 'reviewPending'
  | 'filingsInProgress'
  | 'errorLogs';

/** 0 hide / urgent (red) / warn (yellow) / normal (gray). */
export function badgeClass(key: CountKey | undefined, n: number): string {
  if (n === 0) return 'hidden';
  if (
    key === 'pendingUsers' ||
    key === 'urgentTodos' ||
    key === 'reviewPending' ||
    key === 'errorLogs'
  ) {
    return 'bg-red-100 text-red-700';
  }
  if (key === 'pendingDocs' || key === 'filingsInProgress') {
    return 'bg-yellow-100 text-yellow-700';
  }
  return 'bg-gray-200 text-gray-700';
}
