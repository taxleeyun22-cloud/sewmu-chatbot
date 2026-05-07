/**
 * api-spec 단위 테스트 — metadata 정합성 검증.
 */

import { describe, it, expect } from 'vitest';
import { ENDPOINT_METADATA } from './api-spec';

describe('ENDPOINT_METADATA', () => {
  it('빈 array 아님', () => {
    expect(ENDPOINT_METADATA.length).toBeGreaterThan(0);
  });

  it('각 endpoint 필수 필드', () => {
    for (const ep of ENDPOINT_METADATA) {
      expect(ep.method).toMatch(/^(GET|POST|PUT|DELETE|PATCH)$/);
      expect(ep.path).toMatch(/^\/api\//);
      expect(ep.description).toBeTruthy();
      expect(ep.permission).toBeTruthy();
    }
  });

  it('admin-whoami 포함', () => {
    const found = ENDPOINT_METADATA.find((e) => e.path === '/api/admin-whoami');
    expect(found).toBeDefined();
    expect(found?.method).toBe('GET');
  });

  it('admin-error-log 3개 method (POST / GET / DELETE)', () => {
    const errorLogEndpoints = ENDPOINT_METADATA.filter(
      (e) => e.path === '/api/admin-error-log',
    );
    expect(errorLogEndpoints.length).toBe(3);
    const methods = errorLogEndpoints.map((e) => e.method).sort();
    expect(methods).toEqual(['DELETE', 'GET', 'POST']);
  });

  it('rate limit 정보 — admin-error-log POST', () => {
    const post = ENDPOINT_METADATA.find(
      (e) => e.path === '/api/admin-error-log' && e.method === 'POST',
    );
    expect(post?.rateLimit).toBeTruthy();
  });

  it('owner only 권한 확인 — set_admin / set_staff_role', () => {
    const ownerOnly = ENDPOINT_METADATA.filter((e) => e.permission === 'owner only');
    expect(ownerOnly.length).toBeGreaterThanOrEqual(2);
  });

  it('manager+ 권한 확인 — memos purge', () => {
    const managerPlus = ENDPOINT_METADATA.find((e) => e.permission === 'manager+');
    expect(managerPlus).toBeDefined();
    expect(managerPlus?.path).toContain('memos');
  });
});
