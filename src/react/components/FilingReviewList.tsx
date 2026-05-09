/**
 * Phase 3.14 (2026-05-09): 신고 검토표 list React 컴포넌트.
 *
 * 안전 패턴:
 *   - HTML markup 은 admin-filing-review.js 의 _buildFilingReviewListHtml() 호출
 *   - dangerouslySetInnerHTML — onclick (openFilingDetail/openFilingNew) 100% 그대로
 *   - filing-review-store ($filingReview) 자동 reactive
 *
 * 효과:
 *   - admin-filing-review.js _filRenderListInto innerHTML 조작 제거 (store 갱신 만)
 *   - 신고 Case 생성/저장/상태변경 후 즉시 갱신 (사장님 새로고침 X)
 *
 * 마운트 위치: cdFilingsReview (거래처 dashboard) + bdFilingsReview (업체 dashboard)
 *   - 같은 컴포넌트 mount 2곳 → 같은 store 공유. 하지만 한 dashboard 만 visible 이라 OK
 *   - 사용자가 거래처 진입 → setList(Person, ...) → 거래처 mount 표시
 *   - 사용자가 업체 진입 → setList(Business, ...) → 업체 mount 표시
 *   - props.expectedType 으로 두 mount 가 자기 데이터만 보여주게 가드
 */
import { useStore } from '@nanostores/react';
import { $filingReview, type FilingOwnerType } from '../../admin/state/filing-review-store';

declare global {
  interface Window {
    __buildFilingReviewListHtml?: () => string;
  }
}

interface FilingReviewListProps {
  /** 이 mount 가 표시할 owner type — store ownerType 와 다르면 빈 fragment 반환 */
  expectedType?: FilingOwnerType;
}

export function FilingReviewList({ expectedType }: FilingReviewListProps = {}) {
  const state = useStore($filingReview);

  /* type 가드 — 다른 dashboard 데이터면 안 보임 */
  if (expectedType && state.ownerType && state.ownerType !== expectedType) {
    return <></>;
  }

  if (state.loading) {
    return (
      <div style={{ color: '#9ca3af', padding: '10px 0', fontSize: '.85em' }}>
        불러오는 중...
      </div>
    );
  }

  if (state.error) {
    return (
      <div style={{ color: '#f04452', padding: 8, fontSize: '.82em' }}>
        오류: {state.error}
      </div>
    );
  }

  /* 아직 owner 미설정 — 빈 상태 */
  if (!state.ownerType || !state.ownerId) {
    return <></>;
  }

  const buildFn = typeof window !== 'undefined' ? window.__buildFilingReviewListHtml : undefined;
  if (typeof buildFn !== 'function') {
    return (
      <div style={{ color: '#f04452', padding: 8, fontSize: '.82em' }}>
        ⚠️ 빌더 미로드 — admin-filing-review.js?v=N 확인 필요
      </div>
    );
  }

  let html = '';
  try {
    html = buildFn();
  } catch (e) {
    return (
      <div style={{ color: '#f04452', padding: 8, fontSize: '.82em' }}>
        ⚠️ 렌더 실패: {(e as Error).message}
      </div>
    );
  }

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
