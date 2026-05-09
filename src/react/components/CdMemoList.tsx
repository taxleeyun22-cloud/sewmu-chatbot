/**
 * Phase 3.3.B (2026-05-08): 거래처 dashboard 통합 메모 list React.
 *
 * 안전 패턴 (UserList / BusinessList 와 동일):
 *   - admin-memos.js 의 _buildCdMemosListHtml() 호출 (HTML string)
 *   - dangerouslySetInnerHTML — 마크업·onclick·정렬·필터 100% 그대로
 *
 * 자동 reactive trigger:
 *   - $cdMemoCache 변경 (메모 추가/삭제) → 자동 갱신
 *   - $cdMemoCategory 변경 (카테고리 탭 클릭) → 자동 갱신
 *   - $cdMemoListTrigger 변경 (cdSetTagFilter / cdSortChange / cdToggleSelect 등) → 자동 갱신
 *
 * cdMemoFilter / cdSetTagFilter / cdSortChange 등 admin-memos.js 함수들이
 * _renderCdMemos 를 호출하면 그 안에서 trigger increment → React 자동 re-render.
 */
import { useStore } from '@nanostores/react';
import {
  $cdMemoCache,
  $cdMemoCategory,
  $cdMemoListTrigger,
} from '../../features/memos/state';

declare global {
  interface Window {
    __buildCdMemosListHtml?: () => string;
  }
}

export function CdMemoList() {
  /* subscribe — 어느 store 든 변경되면 re-render */
  useStore($cdMemoCache);
  useStore($cdMemoCategory);
  useStore($cdMemoListTrigger);

  const buildFn = typeof window !== 'undefined' ? window.__buildCdMemosListHtml : undefined;
  if (typeof buildFn !== 'function') {
    return (
      <div style={{ color: '#f04452', padding: '8px' }}>
        ⚠️ 메모 빌더 미로드 — admin-memos.js?v=N 확인 필요
      </div>
    );
  }

  let html = '';
  try {
    html = buildFn();
  } catch (e) {
    return (
      <div style={{ color: '#f04452', padding: '8px' }}>
        ⚠️ 메모 list 렌더 실패: {(e as Error).message}
      </div>
    );
  }

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
