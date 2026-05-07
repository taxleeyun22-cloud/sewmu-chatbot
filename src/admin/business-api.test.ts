import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchBusinesses,
  fetchBusinessDetail,
  saveBusiness,
  addBusinessToUser,
  deleteBusiness,
  fetchRoomBusinesses,
  linkRoomBusiness,
  unlinkRoomBusiness,
} from './business-api';

let lastUrl = '';
let lastInit: RequestInit = {};
let mockResponse: unknown = { ok: true };

beforeEach(() => {
  lastUrl = '';
  lastInit = {};
  mockResponse = { ok: true };
  global.fetch = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
    lastUrl = String(url);
    lastInit = init || {};
    return { json: async () => mockResponse } as Response;
  }) as typeof fetch;
  (globalThis as Record<string, unknown>).KEY = 'TEST_KEY';
});

describe('fetchBusinesses', () => {
  it('전체 list', async () => {
    mockResponse = { ok: true, businesses: [] };
    await fetchBusinesses();
    expect(lastUrl).toContain('admin-businesses');
    expect(lastUrl).toContain('key=TEST_KEY');
  });

  it('user_id 매핑', async () => {
    await fetchBusinesses({ userId: 64 });
    expect(lastUrl).toContain('user_id=64');
  });

  it('search 쿼리', async () => {
    await fetchBusinesses({ search: '온나' });
    expect(lastUrl).toContain('search=');
  });
});

describe('saveBusiness / addBusinessToUser', () => {
  it('saveBusiness POST + body', async () => {
    await saveBusiness({ company_name: '테스트' });
    expect(lastInit.method).toBe('POST');
    expect(JSON.parse(String(lastInit.body)).company_name).toBe('테스트');
  });

  it('addBusinessToUser action=add_to_user', async () => {
    await addBusinessToUser(64, { business_id: 2 });
    expect(lastUrl).toContain('action=add_to_user');
    const body = JSON.parse(String(lastInit.body));
    expect(body.user_id).toBe(64);
    expect(body.business_id).toBe(2);
    expect(body.is_primary).toBe(0);
  });

  it('addBusinessToUser primary=true', async () => {
    await addBusinessToUser(64, { business_id: 2 }, true);
    expect(JSON.parse(String(lastInit.body)).is_primary).toBe(1);
  });
});

describe('deleteBusiness', () => {
  it('DELETE + action=delete', async () => {
    await deleteBusiness(2);
    expect(lastInit.method).toBe('DELETE');
    expect(lastUrl).toContain('action=delete');
    expect(lastUrl).toContain('id=2');
  });
});

describe('fetchBusinessDetail', () => {
  it('id 인자', async () => {
    mockResponse = { ok: true, business: { id: 2, company_name: 'X' } };
    await fetchBusinessDetail(2);
    expect(lastUrl).toContain('id=2');
  });
});

describe('room ↔ business 매핑', () => {
  it('fetchRoomBusinesses', async () => {
    mockResponse = { ok: true, businesses: [] };
    await fetchRoomBusinesses('Z2HBV2');
    expect(lastUrl).toContain('admin-room-businesses');
    expect(lastUrl).toContain('room_id=Z2HBV2');
  });

  it('linkRoomBusiness POST', async () => {
    await linkRoomBusiness('Z2HBV2', 2);
    expect(lastInit.method).toBe('POST');
    const body = JSON.parse(String(lastInit.body));
    expect(body.room_id).toBe('Z2HBV2');
    expect(body.business_id).toBe(2);
    expect(body.is_primary).toBe(0);
  });

  it('linkRoomBusiness primary', async () => {
    await linkRoomBusiness('R', 5, true);
    expect(JSON.parse(String(lastInit.body)).is_primary).toBe(1);
  });

  it('unlinkRoomBusiness DELETE', async () => {
    await unlinkRoomBusiness('Z2HBV2', 2);
    expect(lastInit.method).toBe('DELETE');
    expect(lastUrl).toContain('room_id=Z2HBV2');
    expect(lastUrl).toContain('business_id=2');
  });
});
