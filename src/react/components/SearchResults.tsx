/**
 * Phase 3.13 (2026-05-09): 전역 검색 결과 React 컴포넌트.
 *
 * 안전 패턴:
 *   - HTML markup 은 admin-search-bulk.js 의 _buildSearchResultsHtml() 호출
 *   - dangerouslySetInnerHTML — 마크업·onclick (jumpToUser/jumpToRoom/etc) 100% 그대로
 *   - search-store ($search) 자동 reactive
 *
 * 효과:
 *   - admin-search-bulk.js doSearch innerHTML 조작 제거 (store 갱신 만)
 *   - 검색어 입력 → debounce → 즉시 결과 표시 (loading 자동)
 */
import { useStore } from '@nanostores/react';
import { $search } from '../../admin/state/search-store';

declare global {
  interface Window {
    __buildSearchResultsHtml?: () => string;
  }
}

export function SearchResults() {
  const state = useStore($search);

  /* 빈 query (2자 미만) — 안내 표시 */
  if (!state.query || state.query.length < 2) {
    return (
      <div style={{ textAlign: 'center', color: '#8b95a1', fontSize: '.85em', padding: '40px 0' }}>
        2자 이상 입력하세요
      </div>
    );
  }

  if (state.loading) {
    return (
      <div style={{ textAlign: 'center', color: '#8b95a1', fontSize: '.85em', padding: '40px 0' }}>
        검색 중...
      </div>
    );
  }

  if (state.error) {
    return (
      <div style={{ color: '#f04452', fontSize: '.85em', padding: '20px 0' }}>
        오류: {state.error}
      </div>
    );
  }

  if (state.totalN === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#8b95a1', fontSize: '.85em', padding: '40px 0' }}>
        "{state.query}"에 대한 검색 결과가 없습니다
      </div>
    );
  }

  /* admin-search-bulk.js 의 _buildSearchResultsHtml 호출 — store 에서 읽어 빌드 */
  const buildFn = typeof window !== 'undefined' ? window.__buildSearchResultsHtml : undefined;
  if (typeof buildFn !== 'function') {
    return (
      <div style={{ color: '#f04452', fontSize: '.85em', padding: '20px 0' }}>
        ⚠️ 빌더 미로드 — admin-search-bulk.js?v=N 확인 필요 ({state.totalN}건)
      </div>
    );
  }

  let html = '';
  try {
    html = buildFn();
  } catch (e) {
    return (
      <div style={{ color: '#f04452', fontSize: '.85em', padding: '20px 0' }}>
        ⚠️ 렌더 실패: {(e as Error).message}
      </div>
    );
  }

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
