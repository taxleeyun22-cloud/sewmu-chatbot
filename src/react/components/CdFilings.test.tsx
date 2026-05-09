/**
 * Phase 3.10 (2026-05-09): CdFilings 단위 테스트.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { CdFilings } from './CdFilings';
import {
  resetFilings,
  setFilingsList,
  setFilingsLoading,
  setFilingsError,
  type FilingCase,
} from '../../admin/state/filings-store';

beforeEach(() => {
  resetFilings();
  window.__renderFilingCard = vi.fn((f: unknown, userId: number) => {
    const filing = f as FilingCase;
    return `<div data-filing-id="${filing.id}" class="card-mock" data-user="${userId}">${filing.filing_type} ${filing.period}</div>`;
  });
});

afterEach(() => {
  cleanup();
  delete window.__renderFilingCard;
});

const makeFiling = (id: number, type = '부가세'): FilingCase => ({
  id,
  user_id: 64,
  filing_type: type,
  period: '2026-1기',
  status: 'active',
  items: [],
});

describe('CdFilings', () => {
  it('초기 — 빈 list 안내 메시지', () => {
    const { container } = render(<CdFilings />);
    expect(container.textContent).toContain('아직 생성된 신고 Case 가 없습니다');
  });

  it('loading=true → 불러오는 중', () => {
    setFilingsLoading(64);
    const { container } = render(<CdFilings />);
    expect(container.textContent).toContain('불러오는 중');
  });

  it('error → 오류 메시지', () => {
    setFilingsError('서버 다운');
    const { container } = render(<CdFilings />);
    expect(container.textContent).toContain('오류: 서버 다운');
  });

  it('filings 1개 → 카드 1개', () => {
    setFilingsList(64, [makeFiling(1)]);
    const { container } = render(<CdFilings />);
    const cards = container.querySelectorAll('.card-mock');
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain('부가세');
    expect(cards[0].getAttribute('data-user')).toBe('64');
  });

  it('filings 3개 + 순서 보존', () => {
    setFilingsList(64, [
      makeFiling(1, '부가세'),
      makeFiling(2, '종소세'),
      makeFiling(3, '법인세'),
    ]);
    const { container } = render(<CdFilings />);
    const cards = container.querySelectorAll('.card-mock');
    expect(cards.length).toBe(3);
    expect(cards[1].textContent).toContain('종소세');
  });

  it('store update → 자동 re-render', () => {
    setFilingsList(64, [makeFiling(1, '부가세')]);
    const { container } = render(<CdFilings />);
    expect(container.textContent).toContain('부가세');
    act(() => {
      setFilingsList(99, [makeFiling(2, '종소세')]);
    });
    expect(container.textContent).toContain('종소세');
    expect(container.textContent).not.toContain('부가세');
  });

  it('renderFn 호출 시 userId 전달', () => {
    setFilingsList(99, [makeFiling(1)]);
    render(<CdFilings />);
    expect(window.__renderFilingCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      99,
    );
  });

  it('__renderFilingCard 미로드 → fallback 메시지', () => {
    delete window.__renderFilingCard;
    setFilingsList(64, [makeFiling(1)]);
    const { container } = render(<CdFilings />);
    expect(container.textContent).toContain('빌더 미로드');
  });
});
