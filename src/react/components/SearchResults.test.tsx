/**
 * Phase 3.13 (2026-05-09): SearchResults 단위 테스트.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { SearchResults } from './SearchResults';
import {
  resetSearch,
  setSearchResults,
  setSearchLoading,
  setSearchError,
} from '../../admin/state/search-store';

beforeEach(() => {
  resetSearch();
  window.__buildSearchResultsHtml = vi.fn(() => {
    return '<div class="sr-mock">검색 mock 결과</div>';
  });
});

afterEach(() => {
  cleanup();
  delete window.__buildSearchResultsHtml;
});

describe('SearchResults', () => {
  it('초기 — 2자 이상 입력 안내', () => {
    const { container } = render(<SearchResults />);
    expect(container.textContent).toContain('2자 이상 입력하세요');
  });

  it('1자 query → 2자 이상 안내', () => {
    setSearchResults('박', {});
    const { container } = render(<SearchResults />);
    expect(container.textContent).toContain('2자 이상');
  });

  it('loading=true → 검색 중', () => {
    setSearchLoading('박승호');
    const { container } = render(<SearchResults />);
    expect(container.textContent).toContain('검색 중');
  });

  it('error → 오류 메시지', () => {
    setSearchLoading('박승호');
    setSearchError('서버 다운');
    const { container } = render(<SearchResults />);
    expect(container.textContent).toContain('오류: 서버 다운');
  });

  it('totalN=0 → "검색 결과가 없습니다"', () => {
    setSearchResults('xyz', {});
    const { container } = render(<SearchResults />);
    expect(container.textContent).toContain('xyz');
    expect(container.textContent).toContain('검색 결과가 없습니다');
  });

  it('결과 있음 → builder 호출 + mock html', () => {
    setSearchResults('박승호', { users: [{ id: 1 }] });
    const { container } = render(<SearchResults />);
    expect(window.__buildSearchResultsHtml).toHaveBeenCalled();
    expect(container.querySelector('.sr-mock')).toBeTruthy();
  });

  it('store update → 자동 re-render', () => {
    setSearchResults('박승호', { users: [{ id: 1 }] });
    const { container } = render(<SearchResults />);
    const callsBefore = (window.__buildSearchResultsHtml as ReturnType<typeof vi.fn>).mock.calls.length;
    act(() => {
      setSearchResults('이재윤', { rooms: [{ id: 'A' }] });
    });
    expect((window.__buildSearchResultsHtml as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('builder 미로드 → fallback 메시지', () => {
    delete window.__buildSearchResultsHtml;
    setSearchResults('박승호', { users: [{ id: 1 }] });
    const { container } = render(<SearchResults />);
    expect(container.textContent).toContain('빌더 미로드');
  });
});
