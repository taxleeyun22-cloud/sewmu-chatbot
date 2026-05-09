/**
 * Phase 3.2.A (2026-05-08): businesses-store 단위 테스트.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  setBusinessesList,
  setBusinessesLoading,
  setBusinessesError,
  setBusinessesStatus,
  setBusinessesSearch,
  removeBusinessFromList,
  updateBusinessInList,
  addBusinessToList,
  resetBusinesses,
  getBusinesses,
  subscribeBusinesses,
  $filteredBusinesses,
  $businessesActiveCount,
  $businessesClosedCount,
  initialBusinessesState,
  type AdminBusiness,
} from './businesses-store';

beforeEach(() => {
  resetBusinesses();
});

const makeBiz = (id: number, status = 'active', name?: string): AdminBusiness => ({
  id,
  company_name: name || `회사${id}`,
  business_number: `${id}${id}${id}-${id}${id}-${id}${id}${id}${id}${id}`,
  ceo_name: `대표${id}`,
  status,
});

describe('businesses-store', () => {
  it('초기 — currentStatus=all / 빈 배열', () => {
    expect(initialBusinessesState.currentStatus).toBe('all');
    expect(initialBusinessesState.businesses).toEqual([]);
    expect(initialBusinessesState.lastFetchedAt).toBeNull();
  });

  it('setBusinessesList — list + counts 갱신', () => {
    setBusinessesList([makeBiz(1), makeBiz(2)], { active: 2, closed: 0 });
    const s = getBusinesses();
    expect(s.businesses.length).toBe(2);
    expect(s.counts.active).toBe(2);
    expect(s.lastFetchedAt).not.toBeNull();
  });

  it('setBusinessesLoading + Error', () => {
    setBusinessesLoading();
    expect(getBusinesses().loading).toBe(true);
    setBusinessesError('서버 오류');
    expect(getBusinesses().error).toBe('서버 오류');
    expect(getBusinesses().loading).toBe(false);
  });

  it('setBusinessesStatus / setBusinessesSearch', () => {
    setBusinessesStatus('closed');
    setBusinessesSearch('테스트');
    expect(getBusinesses().currentStatus).toBe('closed');
    expect(getBusinesses().searchQuery).toBe('테스트');
  });

  it('removeBusinessFromList', () => {
    setBusinessesList([makeBiz(1), makeBiz(2), makeBiz(3)]);
    removeBusinessFromList(2);
    expect(getBusinesses().businesses.length).toBe(2);
    expect(getBusinesses().businesses.map(b => b.id)).toEqual([1, 3]);
  });

  it('updateBusinessInList', () => {
    setBusinessesList([makeBiz(1), makeBiz(2)]);
    updateBusinessInList(1, { company_name: '새 이름', status: 'closed' });
    const s = getBusinesses();
    expect(s.businesses[0].company_name).toBe('새 이름');
    expect(s.businesses[0].status).toBe('closed');
    expect(s.businesses[1].company_name).toBe('회사2');
  });

  it('addBusinessToList — 중복 ID 방지', () => {
    setBusinessesList([makeBiz(1)]);
    addBusinessToList(makeBiz(2));
    expect(getBusinesses().businesses.length).toBe(2);
    addBusinessToList(makeBiz(1));  /* 중복 — skip */
    expect(getBusinesses().businesses.length).toBe(2);
  });

  it('addBusinessToList — 신규는 list 앞에 추가', () => {
    setBusinessesList([makeBiz(1)]);
    addBusinessToList(makeBiz(99));
    expect(getBusinesses().businesses[0].id).toBe(99);
  });

  it('$filteredBusinesses — status 필터', () => {
    setBusinessesList([
      makeBiz(1, 'active'),
      makeBiz(2, 'closed'),
      makeBiz(3, 'active'),
    ]);
    setBusinessesStatus('all');
    expect($filteredBusinesses.get().length).toBe(3);
    setBusinessesStatus('active');
    expect($filteredBusinesses.get().length).toBe(2);
    setBusinessesStatus('closed');
    expect($filteredBusinesses.get().length).toBe(1);
  });

  it('$filteredBusinesses — 검색 필터', () => {
    setBusinessesList([
      makeBiz(1, 'active', '주식회사 옆커폰'),
      makeBiz(2, 'active', '브라운도트 진주성점'),
      makeBiz(3, 'active', '에스제이엔비'),
    ]);
    setBusinessesSearch('옆커폰');
    expect($filteredBusinesses.get().length).toBe(1);
    expect($filteredBusinesses.get()[0].id).toBe(1);
    setBusinessesSearch('진주');
    expect($filteredBusinesses.get().length).toBe(1);
    setBusinessesSearch('');
    expect($filteredBusinesses.get().length).toBe(3);
  });

  it('$businessesActiveCount / ClosedCount — computed', () => {
    setBusinessesList([
      makeBiz(1, 'active'),
      makeBiz(2, 'closed'),
      makeBiz(3, 'active'),
    ]);
    expect($businessesActiveCount.get()).toBe(2);
    expect($businessesClosedCount.get()).toBe(1);
  });

  it('subscribeBusinesses — 변경 알림', () => {
    let latest = getBusinesses();
    const unsub = subscribeBusinesses((s) => { latest = s; });
    setBusinessesList([makeBiz(7)]);
    expect(latest.businesses[0].id).toBe(7);
    unsub();
  });

  it('window.__businessesStore global 노출', () => {
    expect(window.__businessesStore).toBeDefined();
    expect(typeof window.__businessesStore!.setList).toBe('function');
    expect(typeof window.__businessesStore!.removeBusiness).toBe('function');
    expect(typeof window.__businessesStore!.addBusiness).toBe('function');
  });
});
