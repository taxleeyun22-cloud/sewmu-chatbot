/**
 * Phase 3.2.B (2026-05-08): 업체 list React 컴포넌트.
 *
 * Phase 3.1.B (UserList) 와 동일 패턴:
 *   - 카드 markup 은 admin-business-tab.js 의 _renderBizCardHtml(b) 호출 (HTML string)
 *   - dangerouslySetInnerHTML — 마크업·onclick 100% 그대로
 *   - businesses-store ($filteredBusinesses) — status + search 자동 필터
 *
 * 효과:
 *   - admin-business-tab.js loadBusinessList / _renderBizList 의 innerHTML 조작 제거
 *   - mutation (생성/삭제/수정) 후 store 만 갱신 → 자동 re-render
 *   - status 탭 / 검색박스 → store 갱신 → 자동 필터
 */
import { useStore } from '@nanostores/react';
import {
  $businesses,
  $filteredBusinesses,
} from '../../admin/state/businesses-store';

declare global {
  interface Window {
    __renderBizCardHtml?: (b: unknown) => string;
  }
}

export function BusinessList() {
  /* $businesses subscribe — loading/error 표시용 */
  const state = useStore($businesses);
  /* $filteredBusinesses subscribe — status + search 필터 후 list */
  const list = useStore($filteredBusinesses);

  /* Phase Infra-2 fix (2026-05-09): loading 표시 조건 강화 — 데이터 있으면 list 표시 (loading 무시).
   * 사장님 사고 (2026-05-09): React state.loading=true stuck 시 list 영원히 안 보임.
   * 첫 진입 (businesses=[]) 만 loading 표시. 그 후엔 cached list 표시 + 백그라운드 갱신. */
  if (state.loading && !state.businesses.length) {
    return (
      <div style={{ textAlign: 'center', color: '#8b95a1', padding: '40px 0', fontSize: '.88em' }}>
        불러오는 중...
      </div>
    );
  }
  if (state.error) {
    return (
      <div style={{ color: '#f04452', padding: '20px' }}>
        오류: {state.error}
      </div>
    );
  }
  if (!list.length) {
    const q = (state.searchQuery || '').trim();
    return (
      <div style={{ textAlign: 'center', color: '#8b95a1', padding: '40px 0', fontSize: '.88em' }}>
        {q ? '검색 결과 없음' : '등록된 업체가 없습니다. [＋ 새 업체] 로 추가하세요.'}
      </div>
    );
  }

  const renderFn = typeof window !== 'undefined' ? window.__renderBizCardHtml : undefined;
  if (typeof renderFn !== 'function') {
    return (
      <div style={{ color: '#f04452', padding: '20px' }}>
        ⚠️ 카드 렌더 함수 미로드 — admin-business-tab.js?v=N 확인 필요 ({list.length}개 업체)
      </div>
    );
  }

  const html = list
    .map((b) => {
      try {
        return renderFn(b);
      } catch (e) {
        return `<div style="color:#f04452;padding:8px">⚠️ 카드 렌더 실패: ${(e as Error).message}</div>`;
      }
    })
    .join('');

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
