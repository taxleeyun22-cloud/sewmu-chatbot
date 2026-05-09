/**
 * Phase Next-Day23 (2026-05-09): faq router 통합 테스트.
 *
 * CLAUDE.md "정확성 최우선" 룰 검증:
 * - update 시 자동 재임베딩 (OpenAI fetch mock)
 * - verified_status 마킹
 * - 검색 / 카테고리 / verified 필터
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { setupDbMocks, makeCaller, seedUsers } from './helpers';

setupDbMocks();

describe('faq router (integration)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function seedFaqs(rawDb: any) {
    rawDb.exec(`
      INSERT INTO faqs (id, q_number, category, question, answer, law_refs, embedding, active, verified_status, created_at, updated_at) VALUES
        (1, 1, '부가세', '부가세 신고 기한?', '1/25, 4/25, 7/25, 10/25', '부가세법 제49조', '[0.1,0.2]', 1, 'verified', '2026-01-01', '2026-01-01'),
        (2, 2, '종소세', '종소세 신고 기간?', '5/1 ~ 5/31', '소득세법 제70조', '[0.3,0.4]', 1, 'unchecked', '2026-01-01', '2026-01-01'),
        (3, 3, '부가세', '간이과세자 환급?', '대답 X', NULL, NULL, 1, 'wrong', '2026-01-01', '2026-01-01'),
        (4, NULL, '종소세', '의심 답변', '확인 필요', NULL, NULL, 0, 'suspicious', '2026-01-01', '2026-01-01')
    `);
  }

  describe('list', () => {
    it('returns all FAQs sorted by q_number ASC (SQLite NULLs FIRST)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedFaqs(rawDb);

      const r = await caller.faq.list({});
      expect(r.faqs).toHaveLength(4);
      // SQLite ASC: NULL → 1 → 2 → 3
      expect(r.faqs[0].q_number).toBeNull();
      expect(r.faqs[1].q_number).toBe(1);
      expect(r.faqs[2].q_number).toBe(2);
      expect(r.faqs[3].q_number).toBe(3);
    });

    it('has_embedding flag — true when embedding column has value', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedFaqs(rawDb);

      const r = await caller.faq.list({});
      const f1 = r.faqs.find((f: { id: number }) => f.id === 1);
      const f3 = r.faqs.find((f: { id: number }) => f.id === 3);
      expect(f1?.has_embedding).toBe(true);
      expect(f3?.has_embedding).toBe(false);
    });

    it('search filter LIKE matches question / answer / law_refs (NOT category)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedFaqs(rawDb);

      // "부가세" 는 id=1 의 question + law_refs 에 매칭. id=3 의 category 만 부가세 (검색 X).
      const r = await caller.faq.list({ search: '부가세' });
      expect(r.faqs).toHaveLength(1);
      expect(r.faqs[0].id).toBe(1);
    });

    it('search matches answer text', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedFaqs(rawDb);

      const r = await caller.faq.list({ search: '환급' });
      expect(r.faqs).toHaveLength(1);
      expect(r.faqs[0].id).toBe(3); // question contains '환급'
    });

    it('category filter', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedFaqs(rawDb);

      const r = await caller.faq.list({ category: '종소세' });
      expect(r.faqs.length).toBe(2);
      expect(r.faqs.every((f: { category: string }) => f.category === '종소세')).toBe(true);
    });

    it('verified=verified filter', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedFaqs(rawDb);

      const r = await caller.faq.list({ verified: 'verified' });
      expect(r.faqs).toHaveLength(1);
      expect(r.faqs[0].id).toBe(1);
    });

    it('verified=unchecked also returns NULL verified_status', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      rawDb.exec(`
        INSERT INTO faqs (id, question, answer, active, created_at, updated_at)
        VALUES (10, 'NULL status', 'A', 1, '2026-01-01', '2026-01-01')
      `);
      rawDb.exec(`
        INSERT INTO faqs (id, question, answer, active, verified_status, created_at, updated_at)
        VALUES (11, 'unchecked status', 'A', 1, 'unchecked', '2026-01-01', '2026-01-01')
      `);

      const r = await caller.faq.list({ verified: 'unchecked' });
      const ids = r.faqs.map((f: { id: number }) => f.id).sort();
      expect(ids).toEqual([10, 11]);
    });

    it('list response excludes raw embedding (size guard)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedFaqs(rawDb);

      const r = await caller.faq.list({});
      r.faqs.forEach((f: { embedding?: unknown }) => {
        expect(f.embedding).toBeUndefined();
      });
    });

    it('staff (non-owner) BLOCKED', async () => {
      const { caller } = await makeCaller({
        userId: 2,
        isAdmin: true,
        isOwner: false,
      });
      await expect(caller.faq.list({})).rejects.toThrow();
    });
  });

  describe('byId', () => {
    it('returns single FAQ + embedding included', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedFaqs(rawDb);

      const r = await caller.faq.byId({ id: 1 });
      expect(r.faq?.question).toBe('부가세 신고 기한?');
      expect(r.faq?.embedding).toBe('[0.1,0.2]');
    });

    it('returns null for missing id', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedFaqs(rawDb);

      const r = await caller.faq.byId({ id: 99999 });
      expect(r.faq).toBeNull();
    });
  });

  describe('create', () => {
    it('inserts FAQ + auto-embeds via OpenAI', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: [0.5, 0.5, 0.5] }] }),
      } as Response);

      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);

      const r = await caller.faq.create({
        q_number: 100,
        category: '부가세',
        question: '신규 질문?',
        answer: '신규 답변',
        law_refs: '부가세법 제50조',
      });

      expect(r.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalled();

      const row = rawDb.prepare('SELECT * FROM faqs WHERE id = ?').get(r.id) as {
        question: string;
        embedding: string;
        verified_status: string;
      };
      expect(row.question).toBe('신규 질문?');
      expect(row.embedding).toBe('[0.5,0.5,0.5]');
      expect(row.verified_status).toBe('unchecked');
    });

    it('still creates FAQ when embedding fails (graceful)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({}),
      } as Response);

      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);

      const r = await caller.faq.create({
        question: 'Q',
        answer: 'A',
      });

      const row = rawDb.prepare('SELECT * FROM faqs WHERE id = ?').get(r.id) as {
        question: string;
        embedding: string | null;
      };
      expect(row.question).toBe('Q');
      expect(row.embedding).toBeNull(); // 실패해도 FAQ 자체는 저장
    });
  });

  describe('update — 자동 재임베딩', () => {
    it('question/answer 변경 시 embedding 재생성', async () => {
      let embedCalls = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        embedCalls++;
        return {
          ok: true,
          json: async () => ({ data: [{ embedding: [0.9, 0.9] }] }),
        } as Response;
      });

      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedFaqs(rawDb);

      await caller.faq.update({
        id: 1,
        answer: '새 답변',
      });

      expect(embedCalls).toBe(1);
      const row = rawDb.prepare('SELECT * FROM faqs WHERE id = 1').get() as {
        answer: string;
        embedding: string;
      };
      expect(row.answer).toBe('새 답변');
      expect(row.embedding).toBe('[0.9,0.9]');
    });

    it('law_refs 만 변경 시 embedding 재생성 X', async () => {
      let embedCalls = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        embedCalls++;
        return {
          ok: true,
          json: async () => ({ data: [{ embedding: [] }] }),
        } as Response;
      });

      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedFaqs(rawDb);

      await caller.faq.update({
        id: 1,
        law_refs: '갱신된 근거',
      });

      expect(embedCalls).toBe(0); // embedding fetch 호출 X
      const row = rawDb.prepare('SELECT law_refs, embedding FROM faqs WHERE id = 1').get() as {
        law_refs: string;
        embedding: string;
      };
      expect(row.law_refs).toBe('갱신된 근거');
      expect(row.embedding).toBe('[0.1,0.2]'); // 그대로
    });
  });

  describe('setVerified', () => {
    it('marks verified + records timestamp', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedFaqs(rawDb);

      await caller.faq.setVerified({
        id: 2,
        status: 'verified',
        note: '법조문 재확인 완료',
      });

      const row = rawDb.prepare('SELECT * FROM faqs WHERE id = 2').get() as {
        verified_status: string;
        verified_note: string;
        verified_at: string;
      };
      expect(row.verified_status).toBe('verified');
      expect(row.verified_note).toBe('법조문 재확인 완료');
      expect(row.verified_at).toBeTruthy();
    });

    it('rejects invalid status', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedFaqs(rawDb);

      await expect(
        caller.faq.setVerified({ id: 2, status: 'unknown' as never }),
      ).rejects.toThrow();
    });
  });

  describe('remove', () => {
    it('soft delete (active=0)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedFaqs(rawDb);

      await caller.faq.remove({ id: 1 });

      const row = rawDb.prepare('SELECT active FROM faqs WHERE id = 1').get() as {
        active: number;
      };
      expect(row.active).toBe(0);
    });
  });
});
