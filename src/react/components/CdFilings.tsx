/**
 * Phase 3.10 (2026-05-09): 거래처 dashboard 신고 Case (cdFilings) React 컴포넌트.
 *
 * 안전 패턴:
 *   - 카드 markup 은 admin.js 의 _renderFilingCard(f, userId) 호출 (HTML string)
 *   - dangerouslySetInnerHTML — 마크업·체크박스·onclick 100% 그대로
 *   - filings-store ($filings) 자동 reactive
 *
 * 효과:
 *   - admin.js _loadCdFilings 의 innerHTML 조작 제거 (store 갱신 만)
 *   - 항목 체크/삭제/추가/Case 생성·삭제 후 즉시 갱신
 */
import { useStore } from '@nanostores/react';
import { $filings } from '../../admin/state/filings-store';

declare global {
  interface Window {
    __renderFilingCard?: (f: unknown, userId: number) => string;
  }
}

export function CdFilings() {
  const state = useStore($filings);

  if (state.loading) {
    return (
      <div style={{ color: '#8b95a1', padding: '10px 0', fontSize: '.85em' }}>
        불러오는 중...
      </div>
    );
  }
  if (state.error) {
    return <div style={{ color: '#f04452' }}>오류: {state.error}</div>;
  }
  if (!state.filings.length) {
    return (
      <div
        style={{
          color: '#adb5bd',
          padding: '10px 0',
          fontSize: '.85em',
          lineHeight: 1.6,
        }}
      >
        아직 생성된 신고 Case 가 없습니다.
        <br />
        우측 "+ 새 Case" 로 부가세/종소세/법인세 등 신고 건을 시작하세요.
      </div>
    );
  }

  const renderFn = typeof window !== 'undefined' ? window.__renderFilingCard : undefined;
  if (typeof renderFn !== 'function') {
    return (
      <div className="empty">
        ⚠️ 빌더 미로드 — admin.js?v=N 확인 필요 ({state.filings.length}건)
      </div>
    );
  }

  const userId = state.userId || 0;
  const html = state.filings
    .map((f) => {
      try {
        return renderFn(f, userId);
      } catch (e) {
        return `<div style="color:#f04452">⚠️ 카드 렌더 실패: ${(e as Error).message}</div>`;
      }
    })
    .join('');

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
