/**
 * Phase 2.1 (2026-05-08 사장님 명령 — 3단계 React 마이그레이션 첫 점진 phase):
 * 사이드바 휴지통 카운트 React 화. 가장 작은 단위.
 *
 * 효과:
 *   - sidebar-store ($sidebarCounts) 의 trash 값 자동 reactive 표시
 *   - admin.js refreshSidebarCounts 가 store 만 갱신 → 자동 re-render
 *   - mutation 후 textContent 수동 갱신 누락 가능성 0
 *
 * 안전:
 *   - 단순 카운트 표시만 (style 그대로 — admin.css 의 .cnt 클래스 사용)
 *   - mount 실패해도 데이터 손실 X (단지 카운트 안 보임)
 *   - 기존 admin.html element id="sbCntTrash" 의 스타일·className 그대로 유지
 */
import { useStore } from '@nanostores/react';
import { $sidebarCounts } from '../../admin/state/sidebar-store';

export function SidebarTrashCount() {
  const counts = useStore($sidebarCounts);
  /* 0 표시 — 사이드바 카운트 디자인 (admin.css .cnt) 그대로 */
  return <>{counts.trash}</>;
}
