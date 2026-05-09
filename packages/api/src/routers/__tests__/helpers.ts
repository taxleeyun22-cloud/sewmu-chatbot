/**
 * Phase Next-Day23 (2026-05-09): tRPC integration test helpers.
 *
 * 사용:
 *   const { caller, db } = makeCaller({ isOwner: true });
 *   await caller.review.list({ filter: 'pending' });
 *   const rows = db.prepare('SELECT * FROM ...').all();
 */
import { vi } from 'vitest';
import { createTestDb } from '../../../../db/src/test-db';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AuthOverride {
  userId?: number | null;
  isOwner?: boolean;
  isAdmin?: boolean;
  staffRole?: 'manager' | 'staff' | null;
}

export interface CallerHandle {
  caller: any;
  ctx: any;
  rawDb: any;
  d1: any;
}

let _capturedTestDrizzle: any = null;

/** vitest setup 시 자동 호출 — drizzle 함수를 mock 으로 교체. */
export function setupDbMocks() {
  vi.mock('@sewmu/db/client', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@sewmu/db/client')>();
    return {
      ...actual,
      drizzle: () => _capturedTestDrizzle,
    };
  });
}

/** 테스트 DB 만들고 drizzle 인스턴스 capture. */
export async function makeCaller(authOverride: AuthOverride = {}): Promise<CallerHandle> {
  const { rawDb, d1, db } = createTestDb();
  _capturedTestDrizzle = db;

  /* dynamic import — vi.mock 적용 후 */
  const { appRouter } = await import('../../index');

  /* userId: 명시적으로 null 가능. 'userId' 키 미지정 시만 default 1. */
  const userId =
    'userId' in authOverride ? (authOverride.userId as number | null) : 1;

  const ctx = {
    db: d1,
    bucket: undefined,
    openaiApiKey: 'sk-test',
    auth: {
      userId,
      isOwner: authOverride.isOwner ?? false,
      isAdmin: authOverride.isAdmin ?? authOverride.isOwner ?? false,
      staffRole: authOverride.staffRole ?? null,
    },
  };

  const caller = appRouter.createCaller(ctx);
  return { caller, ctx, rawDb, d1 };
}

/** Seed helper — 사장님 (owner) + 직원 (staff) + 거래처 (customer) 기본 데이터. */
export function seedUsers(rawDb: any) {
  rawDb.exec(`
    INSERT INTO users (id, name, real_name, approval_status, is_admin, is_owner, created_at, last_login_at)
    VALUES
      (1, '사장님', '이재윤', 'approved_client', 1, 1, '2026-01-01T00:00:00Z', '2026-05-09T00:00:00Z'),
      (2, '직원-민지', '김민지', 'approved_client', 1, 0, '2026-02-01T00:00:00Z', '2026-05-09T00:00:00Z'),
      (3, '박사장', '박승호', 'approved_client', 0, 0, '2026-03-01T00:00:00Z', '2026-05-09T00:00:00Z'),
      (4, '대기-홍길동', '홍길동', 'pending', 0, 0, '2026-05-08T00:00:00Z', '2026-05-08T00:00:00Z')
  `);
}

export function seedBusiness(rawDb: any, biz: { id: number; company_name: string; ceo_name?: string }) {
  rawDb.prepare(
    `INSERT INTO businesses (id, company_name, ceo_name, status, created_at) VALUES (?, ?, ?, 'active', ?)`,
  ).run(biz.id, biz.company_name, biz.ceo_name ?? null, '2026-01-01T00:00:00Z');
}
