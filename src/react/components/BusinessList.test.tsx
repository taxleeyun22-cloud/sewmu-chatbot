/**
 * Phase 3.2.B (2026-05-08): BusinessList 단위 테스트.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { BusinessList } from './BusinessList';
import {
  resetBusinesses,
  setBusinessesList,
  setBusinessesLoading,
  setBusinessesError,
  setBusinessesStatus,
  setBusinessesSearch,
  type AdminBusiness,
} from '../../admin/state/businesses-store';

beforeEach(() => {
  resetBusinesses();
  window.__renderBizCardHtml = vi.fn((b: unknown) => {
    const biz = b as AdminBusiness;
    return `<div data-biz-id="${biz.id}" class="biz-card-mock">${biz.company_name || `#${biz.id}`}${biz.parent_business_id ? ' [지점]' : ''}</div>`;
  });
});

afterEach(() => {
  cleanup();
  delete window.__renderBizCardHtml;
});

const makeBiz = (id: number, status = 'active', name?: string, parent?: number): AdminBusiness => ({
  id,
  company_name: name || `회사${id}`,
  business_number: `${id}-${id}-${id}`,
  ceo_name: `대표${id}`,
  status,
  parent_business_id: parent,
});

describe('BusinessList', () => {
  it('초기 — 빈 list 안내', () => {
    const { container } = render(<BusinessList />);
    expect(container.textContent).toContain('등록된 업체가 없습니다');
  });

  it('loading=true → "불러오는 중"', () => {
    setBusinessesLoading();
    const { container } = render(<BusinessList />);
    expect(container.textContent).toContain('불러오는 중');
  });

  it('error → 오류 메시지', () => {
    setBusinessesError('서버 다운');
    const { container } = render(<BusinessList />);
    expect(container.textContent).toContain('오류: 서버 다운');
  });

  it('businesses 3개 → 카드 3개', () => {
    setBusinessesList([makeBiz(1), makeBiz(2), makeBiz(3)]);
    const { container } = render(<BusinessList />);
    const cards = container.querySelectorAll('.biz-card-mock');
    expect(cards.length).toBe(3);
  });

  it('status 필터 변경 → list 자동 갱신', () => {
    setBusinessesList([
      makeBiz(1, 'active'),
      makeBiz(2, 'closed'),
      makeBiz(3, 'active'),
    ]);
    const { container } = render(<BusinessList />);
    expect(container.querySelectorAll('.biz-card-mock').length).toBe(3);
    act(() => setBusinessesStatus('active'));
    expect(container.querySelectorAll('.biz-card-mock').length).toBe(2);
    act(() => setBusinessesStatus('closed'));
    expect(container.querySelectorAll('.biz-card-mock').length).toBe(1);
  });

  it('search 필터 변경 → list 자동 필터', () => {
    setBusinessesList([
      makeBiz(1, 'active', '주식회사 옆커폰'),
      makeBiz(2, 'active', '브라운도트 진주성점'),
      makeBiz(3, 'active', '에스제이엔비'),
    ]);
    const { container } = render(<BusinessList />);
    expect(container.querySelectorAll('.biz-card-mock').length).toBe(3);
    act(() => setBusinessesSearch('옆커폰'));
    expect(container.querySelectorAll('.biz-card-mock').length).toBe(1);
    act(() => setBusinessesSearch(''));
    expect(container.querySelectorAll('.biz-card-mock').length).toBe(3);
  });

  it('검색 결과 0 → "검색 결과 없음"', () => {
    setBusinessesList([makeBiz(1, 'active', 'A회사')]);
    const { container } = render(<BusinessList />);
    act(() => setBusinessesSearch('XYZ존재안함'));
    expect(container.textContent).toContain('검색 결과 없음');
  });

  it('지점 (parent_business_id) — 카드에 [지점] 표시', () => {
    setBusinessesList([
      makeBiz(1, 'active', '본점'),
      makeBiz(2, 'active', '지점A', 1),
    ]);
    const { container } = render(<BusinessList />);
    const cards = container.querySelectorAll('.biz-card-mock');
    expect(cards.length).toBe(2);
    expect(cards[1].textContent).toContain('[지점]');
  });

  it('renderBizCardHtml 미로드 → fallback 메시지', () => {
    setBusinessesList([makeBiz(1)]);
    delete window.__renderBizCardHtml;
    const { container } = render(<BusinessList />);
    expect(container.textContent).toContain('카드 렌더 함수 미로드');
  });

  it('renderBizCardHtml 에러 시 fallback (개별 카드)', () => {
    setBusinessesList([makeBiz(1), makeBiz(2), makeBiz(3)]);
    window.__renderBizCardHtml = vi.fn((b: unknown) => {
      const biz = b as AdminBusiness;
      if (biz.id === 2) throw new Error('카드2 에러');
      return `<div class="biz-card-mock">회사${biz.id}</div>`;
    });
    const { container } = render(<BusinessList />);
    expect(container.textContent).toContain('회사1');
    expect(container.textContent).toContain('카드 렌더 실패');
    expect(container.textContent).toContain('회사3');
  });
});
