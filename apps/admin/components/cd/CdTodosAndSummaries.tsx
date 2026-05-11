/**
 * Phase 3.4.F (2026-05-08): 거래처 dashboard 의 cdTodos / cdSummaries / 카운트 React.
 *
 * 4개 컴포넌트:
 *   - CdTodos: 미완료 할 일 list
 *   - CdSummaries: AI 요약 이력 (방별 + 자동 요약 카드)
 *   - CdTodoCount: "(N건)" 표시
 *   - CdSummaryCount: "(N건)" 표시
 *
 * admin-customer-dash.js _loadCdTodosAndSummaries / _loadCdAutoSummary 가
 * store 의 todosHtml / summariesHtml / todosCount / summaryCount 직접 갱신.
 * React 가 useStore 로 자동 reactive 표시 (dangerouslySetInnerHTML).
 */
import { useStore } from '@nanostores/react';
import { $dashboard } from '@/state/dashboard-store';

export function CdTodos() {
  const s = useStore($dashboard);
  if (s.loading) {
    return <div style={{ color: '#8b95a1', padding: '10px 0' }}>불러오는 중...</div>;
  }
  if (!s.todosHtml) {
    return <div style={{ color: '#adb5bd', padding: '10px 0', fontSize: '.88em' }}>미완료 할 일 없음</div>;
  }
  return <div dangerouslySetInnerHTML={{ __html: s.todosHtml }} />;
}

export function CdSummaries() {
  const s = useStore($dashboard);
  if (s.loading) {
    return <div style={{ color: '#8b95a1', padding: '10px 0' }}>불러오는 중...</div>;
  }
  if (!s.summariesHtml) {
    return <div style={{ color: '#adb5bd', padding: '10px 0', fontSize: '.88em' }}>생성된 요약이 없습니다</div>;
  }
  return <div dangerouslySetInnerHTML={{ __html: s.summariesHtml }} />;
}

export function CdTodoCount() {
  const s = useStore($dashboard);
  if (!s.todosCount) return <></>;
  return <>({s.todosCount}건)</>;
}

export function CdSummaryCount() {
  const s = useStore($dashboard);
  if (!s.summaryCount) return <></>;
  return <>({s.summaryCount}건)</>;
}
