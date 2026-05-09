/**
 * Phase Next-Day22 (2026-05-09): RBAC 3단계 단위 테스트.
 *
 * CLAUDE.md "사장님 권한 자동 변경 절대 금지" 룰 — 권한 계산 정확성 보장.
 */
import { describe, it, expect } from 'vitest';
import { calculateRole, hasRole, can, PERMISSIONS } from './rbac';

describe('calculateRole', () => {
  it('is_owner=1 → owner (사장님 1명)', () => {
    expect(calculateRole({ is_owner: 1 })).toBe('owner');
  });

  it('owner takes precedence over manager (is_owner=1 + staff_role=manager)', () => {
    expect(
      calculateRole({ is_owner: 1, is_admin: 1, staff_role: 'manager' }),
    ).toBe('owner');
  });

  it('is_admin=1 + staff_role=manager → manager', () => {
    expect(calculateRole({ is_admin: 1, staff_role: 'manager' })).toBe('manager');
  });

  it('is_admin=1 + staff_role=staff → staff', () => {
    expect(calculateRole({ is_admin: 1, staff_role: 'staff' })).toBe('staff');
  });

  it('is_admin=1 with no staff_role → staff (default)', () => {
    expect(calculateRole({ is_admin: 1 })).toBe('staff');
    expect(calculateRole({ is_admin: 1, staff_role: null })).toBe('staff');
  });

  it('is_admin=0 → customer', () => {
    expect(calculateRole({ is_admin: 0 })).toBe('customer');
    expect(calculateRole({})).toBe('customer');
    expect(calculateRole({ is_admin: null, is_owner: null })).toBe('customer');
  });

  it('is_admin=1 with staff_role 0/undefined still → staff', () => {
    expect(calculateRole({ is_admin: 1, staff_role: undefined })).toBe('staff');
  });
});

describe('hasRole (위계)', () => {
  it('owner satisfies all roles', () => {
    expect(hasRole('owner', 'owner')).toBe(true);
    expect(hasRole('owner', 'manager')).toBe(true);
    expect(hasRole('owner', 'staff')).toBe(true);
    expect(hasRole('owner', 'customer')).toBe(true);
  });

  it('manager satisfies manager + staff + customer (NOT owner)', () => {
    expect(hasRole('manager', 'owner')).toBe(false);
    expect(hasRole('manager', 'manager')).toBe(true);
    expect(hasRole('manager', 'staff')).toBe(true);
    expect(hasRole('manager', 'customer')).toBe(true);
  });

  it('staff satisfies staff + customer (NOT manager / owner)', () => {
    expect(hasRole('staff', 'owner')).toBe(false);
    expect(hasRole('staff', 'manager')).toBe(false);
    expect(hasRole('staff', 'staff')).toBe(true);
    expect(hasRole('staff', 'customer')).toBe(true);
  });

  it('customer only satisfies customer', () => {
    expect(hasRole('customer', 'owner')).toBe(false);
    expect(hasRole('customer', 'manager')).toBe(false);
    expect(hasRole('customer', 'staff')).toBe(false);
    expect(hasRole('customer', 'customer')).toBe(true);
  });
});

describe('can (permission → role 매핑)', () => {
  it('admin:user:set_admin requires owner (CLAUDE.md 절대 룰)', () => {
    expect(can('owner', 'admin:user:set_admin')).toBe(true);
    expect(can('manager', 'admin:user:set_admin')).toBe(false);
    expect(can('staff', 'admin:user:set_admin')).toBe(false);
    expect(can('customer', 'admin:user:set_admin')).toBe(false);
  });

  it('admin:business:delete requires owner', () => {
    expect(can('owner', 'admin:business:delete')).toBe(true);
    expect(can('manager', 'admin:business:delete')).toBe(false);
  });

  it('admin:user:approve requires manager+', () => {
    expect(can('owner', 'admin:user:approve')).toBe(true);
    expect(can('manager', 'admin:user:approve')).toBe(true);
    expect(can('staff', 'admin:user:approve')).toBe(false);
  });

  it('admin:bulk_send requires manager+', () => {
    expect(can('manager', 'admin:bulk_send')).toBe(true);
    expect(can('staff', 'admin:bulk_send')).toBe(false);
  });

  it('admin:memo:write requires staff+', () => {
    expect(can('owner', 'admin:memo:write')).toBe(true);
    expect(can('manager', 'admin:memo:write')).toBe(true);
    expect(can('staff', 'admin:memo:write')).toBe(true);
    expect(can('customer', 'admin:memo:write')).toBe(false);
  });

  it('customer:chat allows everyone (including admins)', () => {
    expect(can('customer', 'customer:chat')).toBe(true);
    expect(can('staff', 'customer:chat')).toBe(true);
    expect(can('owner', 'customer:chat')).toBe(true);
  });
});

describe('PERMISSIONS catalog (절대 룰 검증)', () => {
  it('owner-only ops cannot be downgraded (CLAUDE.md 자동 변경 금지)', () => {
    expect(PERMISSIONS['admin:user:set_admin']).toBe('owner');
    expect(PERMISSIONS['admin:business:delete']).toBe('owner');
    expect(PERMISSIONS['admin:user:delete']).toBe('owner');
  });

  it('all admin:* permissions exist in catalog', () => {
    const adminPerms = Object.keys(PERMISSIONS).filter((k) => k.startsWith('admin:'));
    expect(adminPerms.length).toBeGreaterThanOrEqual(8);
  });

  it('every permission maps to a known role', () => {
    const validRoles = ['owner', 'manager', 'staff', 'customer'];
    for (const role of Object.values(PERMISSIONS)) {
      expect(validRoles).toContain(role);
    }
  });
});
