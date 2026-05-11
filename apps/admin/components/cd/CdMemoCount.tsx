/**
 * Phase 3.3.A (2026-05-08): 거래처 dashboard 통합 메모 카운트 React.
 * 가장 작은 단위 — `<span id="cdMemoCount">` 안 메모 수 자동 reactive.
 *
 * 효과:
 *   - admin-memos.js _loadCdAllMemos 가 store 갱신 (이미 _syncMemoStore 호출 중)
 *   - 거래처 dashboard 의 "총 N건" 자동 갱신
 *   - 메모 추가/삭제 시 즉시 반영
 */
import { useStore } from '@nanostores/react';
import { $cdMemoCache } from '@/state/features/memos/state';

export function CdMemoCount() {
  const memos = useStore($cdMemoCache);
  return <>{memos.length}</>;
}
