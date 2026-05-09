import { describe, it, expect, beforeEach } from 'vitest';
import {
  setSearchLoading,
  setSearchResults,
  setSearchError,
  resetSearch,
  getSearch,
  subscribeSearch,
  initialSearchState,
} from './search-store';

beforeEach(() => resetSearch());

describe('search-store', () => {
  it('초기 — 빈 query + 빈 results', () => {
    expect(initialSearchState.query).toBe('');
    expect(initialSearchState.results).toEqual({});
    expect(initialSearchState.totalN).toBe(0);
  });

  it('setSearchLoading — query + loading=true', () => {
    setSearchLoading('박승호');
    expect(getSearch().query).toBe('박승호');
    expect(getSearch().loading).toBe(true);
  });

  it('setSearchResults — totalN 자동 계산', () => {
    setSearchResults('박승호', {
      users: [{ id: 1 }, { id: 2 }],
      rooms: [{ id: 'A' }],
      memos: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    expect(getSearch().totalN).toBe(6);
    expect(getSearch().loading).toBe(false);
    expect(getSearch().lastFetchedAt).not.toBeNull();
  });

  it('setSearchResults — 빈 group → totalN 0', () => {
    setSearchResults('xxx', {});
    expect(getSearch().totalN).toBe(0);
  });

  it('setSearchError — error 설정 + loading=false', () => {
    setSearchLoading('q');
    setSearchError('서버 다운');
    expect(getSearch().error).toBe('서버 다운');
    expect(getSearch().loading).toBe(false);
  });

  it('resetSearch — 초기화', () => {
    setSearchResults('q', { users: [{ id: 1 }] });
    resetSearch();
    expect(getSearch().query).toBe('');
    expect(getSearch().results).toEqual({});
  });

  it('subscribeSearch — 변경 알림', () => {
    let latest = getSearch();
    const unsub = subscribeSearch((s) => { latest = s; });
    setSearchResults('z', { users: [{ id: 9 }] });
    expect(latest.totalN).toBe(1);
    unsub();
  });

  it('window.__searchStore global 노출', () => {
    expect(window.__searchStore).toBeDefined();
    expect(typeof window.__searchStore!.setResults).toBe('function');
  });
});
