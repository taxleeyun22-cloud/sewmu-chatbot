/**
 * Phase 3.4.D (2026-05-08): 거래처 dashboard 연결된 사업장 (cdBizDocs) React.
 *
 * 가장 큰 영역 — 사업장 카드 + 매핑 + 액션 버튼들.
 * UserList / BusinessList 와 동일 dangerouslySetInnerHTML 패턴.
 *
 * helper: admin-customer-dash.js 의 window.__buildCdBizDocsHtml() 호출 (HTML string).
 *   - store 에서 데이터 읽고 markup 반환 (마크업·onclick·디자인 100% 그대로)
 */
import { useStore } from '@nanostores/react';
import { $dashboard } from '../../admin/state/dashboard-store';

declare global {
  interface Window {
    __buildCdBizDocsHtml?: () => string;
  }
}

export function CdBizDocs() {
  const s = useStore($dashboard);

  if (s.loading) {
    return <div style={{ color: '#8b95a1' }}>…</div>;
  }
  if (!s.userId) {
    return <></>;
  }

  const buildFn = typeof window !== 'undefined' ? window.__buildCdBizDocsHtml : undefined;
  if (typeof buildFn !== 'function') {
    return (
      <div style={{ color: '#f04452', padding: '8px' }}>
        ⚠️ 사업장 빌더 미로드 — admin-customer-dash.js?v=N 확인 필요
      </div>
    );
  }

  let html = '';
  try {
    html = buildFn();
  } catch (e) {
    return (
      <div style={{ color: '#f04452', padding: '8px' }}>
        ⚠️ 사업장 렌더 실패: {(e as Error).message}
      </div>
    );
  }

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
