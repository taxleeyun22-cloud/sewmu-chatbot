import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import {
  CdTodos,
  CdSummaries,
  CdTodoCount,
  CdSummaryCount,
} from './CdTodosAndSummaries';
import {
  closeDashboard,
  setDashboardLoading,
  updateDashboard,
} from '../../admin/state/dashboard-store';

beforeEach(() => closeDashboard());
afterEach(() => cleanup());

describe('CdTodos', () => {
  it('초기 — "미완료 할 일 없음"', () => {
    const { container } = render(<CdTodos />);
    expect(container.textContent).toContain('미완료 할 일 없음');
  });

  it('loading=true → 불러오는 중', () => {
    setDashboardLoading(64);
    const { container } = render(<CdTodos />);
    expect(container.textContent).toContain('불러오는 중');
  });

  it('todosHtml 있으면 dangerouslySetInnerHTML', () => {
    updateDashboard({ todosHtml: '<div class="todo-mock">할 일1</div>' });
    const { container } = render(<CdTodos />);
    expect(container.querySelector('.todo-mock')).not.toBeNull();
    expect(container.textContent).toContain('할 일1');
  });

  it('store 변경 → 자동 갱신', () => {
    const { container } = render(<CdTodos />);
    act(() => updateDashboard({ todosHtml: '<div class="t">A</div>' }));
    expect(container.textContent).toContain('A');
    act(() => updateDashboard({ todosHtml: '<div class="t">B</div>' }));
    expect(container.textContent).toContain('B');
  });
});

describe('CdSummaries', () => {
  it('초기 — "생성된 요약이 없습니다"', () => {
    const { container } = render(<CdSummaries />);
    expect(container.textContent).toContain('생성된 요약이 없습니다');
  });

  it('loading=true → 불러오는 중', () => {
    setDashboardLoading(64);
    const { container } = render(<CdSummaries />);
    expect(container.textContent).toContain('불러오는 중');
  });

  it('summariesHtml 있으면 표시', () => {
    updateDashboard({ summariesHtml: '<div class="sum-mock">요약1</div>' });
    const { container } = render(<CdSummaries />);
    expect(container.querySelector('.sum-mock')).not.toBeNull();
  });
});

describe('CdTodoCount', () => {
  it('초기 — 빈', () => {
    const { container } = render(<CdTodoCount />);
    expect(container.textContent).toBe('');
  });

  it('count > 0 → "(N건)"', () => {
    updateDashboard({ todosCount: 5 });
    const { container } = render(<CdTodoCount />);
    expect(container.textContent).toBe('(5건)');
  });

  it('count = 0 → 빈', () => {
    updateDashboard({ todosCount: 0 });
    const { container } = render(<CdTodoCount />);
    expect(container.textContent).toBe('');
  });
});

describe('CdSummaryCount', () => {
  it('초기 — 빈', () => {
    const { container } = render(<CdSummaryCount />);
    expect(container.textContent).toBe('');
  });

  it('count > 0 → "(N건)"', () => {
    updateDashboard({ summaryCount: 3 });
    const { container } = render(<CdSummaryCount />);
    expect(container.textContent).toBe('(3건)');
  });
});
