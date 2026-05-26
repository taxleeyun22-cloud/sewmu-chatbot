/**
 * Phase 담당자-1 (2026-05-25): staff 라우터 통합 테스트.
 *
 * 사장님 설계 (2026-05-26 확정): 거래처(사람) 담당자 지정 → 연결된 모든 업체(법인 포함) 자동 상속.
 *   법인 default 도 상속, 업체 단위 setAssignee 로 독립 override 가능.
 */
import { describe, it, expect } from 'vitest';
import { setupDbMocks, makeCaller, seedUsers } from './helpers';

setupDbMocks();

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 개인사업자(100) + 법인(200) 업체를 거래처 user 3 에 연결. */
function seedBizAndMembers(rawDb: any) {
  const now = '2026-01-01T00:00:00Z';
  rawDb
    .prepare(`INSERT INTO businesses (id, company_name, company_form, status, created_at) VALUES (?,?,?,'active',?)`)
    .run(100, '개인가게', '1.개인사업자', now);
  rawDb
    .prepare(`INSERT INTO businesses (id, company_name, company_form, status, created_at) VALUES (?,?,?,'active',?)`)
    .run(200, '주식회사법인', '0.법인사업자', now);
  rawDb.prepare(`INSERT INTO business_members (business_id, user_id, created_at) VALUES (?,?,?)`).run(100, 3, now);
  rawDb.prepare(`INSERT INTO business_members (business_id, user_id, created_at) VALUES (?,?,?)`).run(200, 3, now);
}

const staffOf = (rawDb: any, table: 'users' | 'businesses', id: number): number | null => {
  const row = rawDb.prepare(`SELECT staff_user_id FROM ${table} WHERE id = ?`).get(id) as any;
  return row ? (row.staff_user_id ?? null) : null;
};

describe('staff router (integration)', () => {
  describe('list', () => {
    it('직원(is_admin=1) 만 반환 — 거래처/대기자 제외', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb); // 1 이재윤(admin), 2 김민지(admin), 3 박승호(client), 4 홍길동(pending)
      const r = await caller.staff.list();
      const ids = r.staff.map((s: any) => s.id).sort();
      expect(ids).toEqual([1, 2]);
      const names = r.staff.map((s: any) => s.name);
      expect(names).toContain('이재윤');
      expect(names).toContain('김민지');
    });
  });

  describe('setAssignee — 거래처(user) 지정 + 상속', () => {
    it('사람 지정 시 연결된 모든 업체(법인 포함) 상속 — 사장님 확정 2026-05-26', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBizAndMembers(rawDb);

      const r = await caller.staff.setAssignee({ targetType: 'user', targetId: 3, staffUserId: 2 });
      expect(r.ok).toBe(true);
      expect(r.propagated).toBe(2); // 개인 + 법인 모두

      expect(staffOf(rawDb, 'users', 3)).toBe(2); // 거래처 본인
      expect(staffOf(rawDb, 'businesses', 100)).toBe(2); // 개인 → 상속
      expect(staffOf(rawDb, 'businesses', 200)).toBe(2); // 법인 → 상속 (default)

      const audit = rawDb
        .prepare(`SELECT * FROM audit_logs WHERE action = 'staff.setAssignee' ORDER BY id DESC LIMIT 1`)
        .get() as any;
      expect(audit).toBeTruthy();
      expect(audit.target_id).toBe(3);
    });

    it('staffUserId=null 이면 사람+연결된 모든 업체 담당자 해제', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBizAndMembers(rawDb);
      await caller.staff.setAssignee({ targetType: 'user', targetId: 3, staffUserId: 2 });
      await caller.staff.setAssignee({ targetType: 'user', targetId: 3, staffUserId: null });
      expect(staffOf(rawDb, 'users', 3)).toBe(null);
      expect(staffOf(rawDb, 'businesses', 100)).toBe(null);
      expect(staffOf(rawDb, 'businesses', 200)).toBe(null);
    });
  });

  describe('setAssignee — 업체(business) 독립 override', () => {
    it('법인은 default 상속되지만 업체 단위로 독립 override 가능', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBizAndMembers(rawDb);
      // 사람 담당자 = 2 → 법인도 default 상속
      await caller.staff.setAssignee({ targetType: 'user', targetId: 3, staffUserId: 2 });
      expect(staffOf(rawDb, 'businesses', 200)).toBe(2); // 법인 = 2 (상속)
      // 법인(200) 만 직원 1 로 override
      const r = await caller.staff.setAssignee({ targetType: 'business', targetId: 200, staffUserId: 1 });
      expect(r.ok).toBe(true);
      expect(staffOf(rawDb, 'businesses', 200)).toBe(1); // 법인 = 1 (override)
      expect(staffOf(rawDb, 'businesses', 100)).toBe(2); // 개인 = 2 (상속 유지)
    });
  });

  describe('RBAC', () => {
    it('비관리자는 setAssignee 거부 (adminProcedure)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: false, isAdmin: false, userId: 3 });
      seedUsers(rawDb);
      await expect(
        caller.staff.setAssignee({ targetType: 'user', targetId: 3, staffUserId: 2 }),
      ).rejects.toThrow();
    });
  });
});
