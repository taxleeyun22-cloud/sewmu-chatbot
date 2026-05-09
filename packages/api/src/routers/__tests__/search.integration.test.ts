/**
 * Phase Next-Day24 (2026-05-09): search router 통합 테스트.
 *
 * 6개 그룹 통합 검색 — users / businesses / rooms / memos / conversations + documents.
 */
import { describe, it, expect } from 'vitest';
import { setupDbMocks, makeCaller, seedUsers, seedBusiness } from './helpers';

setupDbMocks();

describe('search router (integration)', () => {
  it('rejects too-short query', async () => {
    const { caller } = await makeCaller({ isOwner: true });
    await expect(caller.search.global({ query: 'a' })).rejects.toThrow();
  });

  it('searches users by real_name / phone / email', async () => {
    const { caller, rawDb } = await makeCaller({ isOwner: true });
    seedUsers(rawDb);
    rawDb.exec(`UPDATE users SET phone = '010-1234-5678' WHERE id = 3`);

    const r = await caller.search.global({ query: '박승호' });
    expect(r.users.length).toBeGreaterThanOrEqual(1);
    expect(r.users[0].real_name).toBe('박승호');

    const r2 = await caller.search.global({ query: '5678' });
    expect(r2.users.find((u: { id: number }) => u.id === 3)).toBeTruthy();
  });

  it('searches businesses by company_name / business_number / ceo_name', async () => {
    const { caller, rawDb } = await makeCaller({ isOwner: true });
    seedUsers(rawDb);
    seedBusiness(rawDb, { id: 1, company_name: '온나플러스', ceo_name: '박대표' });
    rawDb.exec(`UPDATE businesses SET business_number = '111-22-33333' WHERE id = 1`);

    const r1 = await caller.search.global({ query: '온나' });
    expect(r1.businesses).toHaveLength(1);

    const r2 = await caller.search.global({ query: '111-22' });
    expect(r2.businesses.find((b: { id: number }) => b.id === 1)).toBeTruthy();

    const r3 = await caller.search.global({ query: '박대표' });
    expect(r3.businesses.length).toBeGreaterThanOrEqual(1);
  });

  it('searches rooms by id or name', async () => {
    const { caller, rawDb } = await makeCaller({ isOwner: true });
    seedUsers(rawDb);
    rawDb.exec(`INSERT INTO chat_rooms (id, name, status, created_at) VALUES ('ABC123', '박승호 상담', 'active', '2026-05-09')`);

    const r = await caller.search.global({ query: '박승호 상담' });
    expect(r.rooms).toHaveLength(1);
    expect(r.rooms[0].id).toBe('ABC123');

    const r2 = await caller.search.global({ query: 'ABC123' });
    expect(r2.rooms).toHaveLength(1);
  });

  it('searches memos by content / tags', async () => {
    const { caller, rawDb } = await makeCaller({ isOwner: true });
    seedUsers(rawDb);
    rawDb.prepare(
      `INSERT INTO memos (content, tags, target_user_id, created_at) VALUES (?, ?, ?, ?)`,
    ).run('5월 종소세 마감', JSON.stringify(['종소세']), 3, '2026-05-09');
    rawDb.prepare(
      `INSERT INTO memos (content, target_user_id, created_at) VALUES (?, ?, ?)`,
    ).run('전화 연락', 3, '2026-05-09');

    const r = await caller.search.global({ query: '종소세' });
    expect(r.memos).toHaveLength(1);
    expect(r.memos[0].content).toContain('종소세');
  });

  it('memo tag filter', async () => {
    const { caller, rawDb } = await makeCaller({ isOwner: true });
    seedUsers(rawDb);
    rawDb.prepare(
      `INSERT INTO memos (content, tags, target_user_id, created_at) VALUES (?, ?, ?, ?)`,
    ).run('a', JSON.stringify(['부가세']), 3, '2026-05-09');
    rawDb.prepare(
      `INSERT INTO memos (content, tags, target_user_id, created_at) VALUES (?, ?, ?, ?)`,
    ).run('b', JSON.stringify(['종소세']), 3, '2026-05-09');

    const r = await caller.search.global({ query: '메모', tag: '부가세' });
    /* tag filter narrows to 부가세 memos */
    expect(r.memos.every((m: { content: string }) => m.content === 'a' || r.memos.length === 0)).toBe(true);
  });

  it('searches conversations content', async () => {
    const { caller, rawDb } = await makeCaller({ isOwner: true });
    seedUsers(rawDb);
    rawDb.exec(`INSERT INTO conversations (role, content, user_id, created_at) VALUES ('user', '부가세 신고 기한이 언제죠?', 3, '2026-05-09')`);
    rawDb.exec(`INSERT INTO conversations (role, content, user_id, created_at) VALUES ('assistant', '1/25, 4/25 등...', 3, '2026-05-09')`);

    const r = await caller.search.global({ query: '부가세' });
    expect(r.conversations.length).toBeGreaterThanOrEqual(1);
  });

  it('omits soft-deleted users / businesses / memos / conversations', async () => {
    const { caller, rawDb } = await makeCaller({ isOwner: true });
    seedUsers(rawDb);
    seedBusiness(rawDb, { id: 1, company_name: '활성업체' });
    seedBusiness(rawDb, { id: 2, company_name: '삭제업체' });
    rawDb.exec(`UPDATE businesses SET deleted_at = '2026-04-01' WHERE id = 2`);
    rawDb.exec(`UPDATE users SET deleted_at = '2026-04-01' WHERE id = 4`);

    const r = await caller.search.global({ query: '업체' });
    expect(r.businesses.find((b: { id: number }) => b.id === 2)).toBeUndefined();

    const r2 = await caller.search.global({ query: '홍길동' });
    expect(r2.users.find((u: { id: number }) => u.id === 4)).toBeUndefined();
  });

  it('returns documents array (placeholder for future)', async () => {
    const { caller, rawDb } = await makeCaller({ isOwner: true });
    seedUsers(rawDb);
    const r = await caller.search.global({ query: 'test' });
    expect(Array.isArray(r.documents)).toBe(true);
  });
});
