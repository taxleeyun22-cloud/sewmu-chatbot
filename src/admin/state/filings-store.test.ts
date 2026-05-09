import { describe, it, expect, beforeEach } from 'vitest';
import {
  setFilingsLoading,
  setFilingsList,
  setFilingsError,
  resetFilings,
  getFilings,
  subscribeFilings,
  initialFilingsState,
  type FilingCase,
} from './filings-store';

beforeEach(() => resetFilings());

const makeFiling = (id: number, type = '부가세'): FilingCase => ({
  id,
  user_id: 64,
  filing_type: type,
  period: '2026-1기',
  status: 'active',
  items: [],
});

describe('filings-store', () => {
  it('초기 — userId null + 빈 list', () => {
    expect(initialFilingsState.userId).toBeNull();
    expect(initialFilingsState.filings).toEqual([]);
  });

  it('setFilingsLoading + setFilingsList', () => {
    setFilingsLoading(64);
    expect(getFilings().userId).toBe(64);
    expect(getFilings().loading).toBe(true);
    setFilingsList(64, [makeFiling(1), makeFiling(2, '종소세')]);
    expect(getFilings().filings.length).toBe(2);
    expect(getFilings().loading).toBe(false);
    expect(getFilings().lastFetchedAt).not.toBeNull();
  });

  it('setFilingsError', () => {
    setFilingsError('서버 다운');
    expect(getFilings().error).toBe('서버 다운');
  });

  it('resetFilings — 초기화', () => {
    setFilingsList(64, [makeFiling(1)]);
    resetFilings();
    expect(getFilings().userId).toBeNull();
    expect(getFilings().filings).toEqual([]);
  });

  it('subscribeFilings — 변경 알림', () => {
    let latest = getFilings();
    const unsub = subscribeFilings((s) => { latest = s; });
    setFilingsList(99, [makeFiling(1)]);
    expect(latest.userId).toBe(99);
    expect(latest.filings.length).toBe(1);
    unsub();
  });

  it('window.__filingsStore global 노출', () => {
    expect(window.__filingsStore).toBeDefined();
    expect(typeof window.__filingsStore!.setList).toBe('function');
  });
});
