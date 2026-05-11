/**
 * Phase Next-Day27 (2026-05-11): RBAC 3단계 단위 테스트.
 *
 * 사장님 결정 2026-05-11: 매니저/스태프 통합 → owner / admin / customer.
 * Owner-only = 8개 (admin/user/business 영구삭제 + set_admin + faq + 일괄삭제 3종 + 에러 비우기).
 */
import { describe, it, expect } from 'vitest';
import {
  calculateRole,
  hasRole,
  can,
  PERMISSIONS,
  ownerOnlyPermissions,
  exportPermissionsJson,
} from './rbac';

describe('calculateRole — 3단계 (owner/admin/customer)', () => {
  it('is_owner=1 → owner', () => {
    expect(calculateRole({ is_owner: 1 })).toBe('owner');
  });

  it('owner takes precedence over admin', () => {
    expect(calculateRole({ is_owner: 1, is_admin: 1 })).toBe('owner');
  });

  it('is_admin=1 → admin (staff_role 무관)', () => {
    expect(calculateRole({ is_admin: 1 })).toBe('admin');
    /* staff_role 컬럼 deprecated — 사용 X */
  });

  it('is_admin=0 → customer', () => {
    expect(calculateRole({ is_admin: 0 })).toBe('customer');
    expect(calculateRole({})).toBe('customer');
    expect(calculateRole({ is_admin: null, is_owner: null })).toBe('customer');
  });
});

describe('hasRole (위계 owner > admin > customer)', () => {
  it('owner satisfies all', () => {
    expect(hasRole('owner', 'owner')).toBe(true);
    expect(hasRole('owner', 'admin')).toBe(true);
    expect(hasRole('owner', 'customer')).toBe(true);
  });

  it('admin satisfies admin + customer (NOT owner)', () => {
    expect(hasRole('admin', 'owner')).toBe(false);
    expect(hasRole('admin', 'admin')).toBe(true);
    expect(hasRole('admin', 'customer')).toBe(true);
  });

  it('customer only customer', () => {
    expect(hasRole('customer', 'owner')).toBe(false);
    expect(hasRole('customer', 'admin')).toBe(false);
    expect(hasRole('customer', 'customer')).toBe(true);
  });
});

describe('can — 권한 게이트', () => {
  describe('Owner-only (8개, 사장님 결정 2026-05-11)', () => {
    const ownerActions = [
      'admin:user:set_admin',
      'admin:business:delete',
      'admin:user:delete',
      'admin:faq:write',
      'admin:error_log:clear_all',
      'admin:memo:bulk_delete',
      'admin:trash:purge',
      'admin:room:msg_bulk_delete',
    ] as const;

    for (const action of ownerActions) {
      it(`${action} — owner only`, () => {
        expect(can('owner', action)).toBe(true);
        expect(can('admin', action)).toBe(false);
        expect(can('customer', action)).toBe(false);
      });
    }
  });

  describe('Admin actions (직원 + 사장님)', () => {
    const adminActions = [
      'admin:user:approve',
      'admin:business:status',
      'admin:business:write',
      'admin:bulk_send',
      'admin:doc:approve',
      'admin:room:close',
      'admin:memo:write',
      'admin:filing:write',
      'admin:search:global',
      'admin:trash:restore',
    ] as const;

    for (const action of adminActions) {
      it(`${action} — admin+`, () => {
        expect(can('owner', action)).toBe(true);
        expect(can('admin', action)).toBe(true);
        expect(can('customer', action)).toBe(false);
      });
    }
  });

  describe('Customer actions (모두)', () => {
    it('customer:chat / upload_doc / mypage — 모두 OK', () => {
      expect(can('customer', 'customer:chat')).toBe(true);
      expect(can('admin', 'customer:chat')).toBe(true);
      expect(can('owner', 'customer:chat')).toBe(true);
      expect(can('customer', 'customer:upload_doc')).toBe(true);
      expect(can('customer', 'customer:mypage')).toBe(true);
    });
  });
});

describe('PERMISSIONS catalog (SSOT)', () => {
  it('contains exactly 8 owner-only permissions (사장님 결정 2026-05-11)', () => {
    const owners = Object.entries(PERMISSIONS).filter(([, r]) => r === 'owner');
    expect(owners).toHaveLength(8);
  });

  it('all roles valid (owner / admin / customer)', () => {
    const validRoles = ['owner', 'admin', 'customer'];
    for (const role of Object.values(PERMISSIONS)) {
      expect(validRoles).toContain(role);
    }
  });

  it('all permissions have prefix admin:* or customer:*', () => {
    for (const key of Object.keys(PERMISSIONS)) {
      expect(key).toMatch(/^(admin|customer):/);
    }
  });
});

describe('ownerOnlyPermissions (helper)', () => {
  it('returns exactly 8 owner-only keys', () => {
    expect(ownerOnlyPermissions()).toHaveLength(8);
  });

  it('includes all 8 expected actions', () => {
    const list = ownerOnlyPermissions();
    const expected = [
      'admin:user:set_admin',
      'admin:business:delete',
      'admin:user:delete',
      'admin:faq:write',
      'admin:error_log:clear_all',
      'admin:memo:bulk_delete',
      'admin:trash:purge',
      'admin:room:msg_bulk_delete',
    ];
    for (const e of expected) {
      expect(list).toContain(e);
    }
  });
});

describe('exportPermissionsJson (옛 admin.html SSOT inject)', () => {
  it('returns JSON-serializable map', () => {
    const json = exportPermissionsJson();
    expect(typeof json).toBe('object');
    expect(JSON.stringify(json)).toContain('admin:business:delete');
  });

  it('matches catalog 1:1', () => {
    const json = exportPermissionsJson();
    expect(Object.keys(json).length).toBe(Object.keys(PERMISSIONS).length);
  });
});
