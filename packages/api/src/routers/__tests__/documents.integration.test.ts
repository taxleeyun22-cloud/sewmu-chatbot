/**
 * Phase Next-Day24 (2026-05-09): documents router 통합 테스트.
 *
 * 영수증 업로드 → OCR 자동 분석 → 사장님 승인/반려 흐름.
 */
import { describe, it, expect } from 'vitest';
import { setupDbMocks, makeCaller, seedUsers, seedBusiness } from './helpers';

setupDbMocks();

function seedDocs(rawDb: any) {
  rawDb.exec(`
    INSERT INTO documents (id, user_id, business_id, doc_type, image_key, status, vendor, amount, receipt_date, category, created_at) VALUES
      (1, 3, 1, '영수증', 'documents/3/abc.jpg', 'pending', NULL, NULL, NULL, NULL, '2026-05-08T10:00:00Z'),
      (2, 3, 1, '영수증', 'documents/3/def.jpg', 'approved', '스타벅스', 5500, '2026-05-07', '복리후생비', '2026-05-07T10:00:00Z'),
      (3, 3, 2, '계약서', 'documents/3/ghi.pdf', 'rejected', NULL, NULL, NULL, NULL, '2026-05-06T10:00:00Z'),
      (4, 4, 1, '영수증', 'documents/4/jkl.jpg', 'pending', NULL, NULL, NULL, NULL, '2026-05-08T11:00:00Z')
  `);
}

describe('documents router (integration)', () => {
  describe('list + counts', () => {
    it('returns all documents with status counts', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: 'A' });
      seedBusiness(rawDb, { id: 2, company_name: 'B' });
      seedDocs(rawDb);

      const r = await caller.documents.list({ status: 'all' });
      expect(r.documents).toHaveLength(4);
      expect(r.counts.pending).toBe(2);
      expect(r.counts.approved).toBe(1);
      expect(r.counts.rejected).toBe(1);
    });

    it('status filter (pending only)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: 'A' });
      seedBusiness(rawDb, { id: 2, company_name: 'B' });
      seedDocs(rawDb);

      const r = await caller.documents.list({ status: 'pending' });
      expect(r.documents).toHaveLength(2);
      expect(r.documents.every((d: { status: string }) => d.status === 'pending')).toBe(true);
    });

    it('user_id filter', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: 'A' });
      seedBusiness(rawDb, { id: 2, company_name: 'B' });
      seedDocs(rawDb);

      const r = await caller.documents.list({ status: 'all', user_id: 4 });
      expect(r.documents).toHaveLength(1);
      expect(r.documents[0].user_id).toBe(4);
    });

    it('business_id filter', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: 'A' });
      seedBusiness(rawDb, { id: 2, company_name: 'B' });
      seedDocs(rawDb);

      const r = await caller.documents.list({ status: 'all', business_id: 2 });
      expect(r.documents).toHaveLength(1);
      expect(r.documents[0].id).toBe(3);
    });

    it('excludes soft-deleted', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: 'A' });
      seedBusiness(rawDb, { id: 2, company_name: 'B' });
      seedDocs(rawDb);
      rawDb.exec(`UPDATE documents SET deleted_at = '2026-04-01T00:00:00Z' WHERE id = 1`);

      const r = await caller.documents.list({ status: 'all' });
      expect(r.documents.find((d: { id: number }) => d.id === 1)).toBeUndefined();
    });
  });

  describe('approve / reject', () => {
    it('approve sets status + approver_id + OCR field overrides', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true, userId: 1 });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: 'A' });
      seedDocs(rawDb);

      await caller.documents.approve({
        id: 1,
        vendor: '스타벅스',
        amount: 5500,
        receipt_date: '2026-05-08',
        category: '복리후생비',
      });

      const row = rawDb.prepare('SELECT * FROM documents WHERE id = 1').get() as {
        status: string;
        vendor: string;
        amount: number;
        category: string;
        category_src: string;
        approver_id: number;
      };
      expect(row.status).toBe('approved');
      expect(row.vendor).toBe('스타벅스');
      expect(row.amount).toBe(5500);
      expect(row.category).toBe('복리후생비');
      expect(row.category_src).toBe('manual');
      expect(row.approver_id).toBe(1);
    });

    it('reject sets reject_reason + status', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: 'A' });
      seedDocs(rawDb);

      await caller.documents.reject({ id: 1, reason: '영수증 이미지 흐림 — 다시 업로드 부탁드립니다.' });

      const row = rawDb.prepare('SELECT status, reject_reason FROM documents WHERE id = 1').get() as {
        status: string;
        reject_reason: string;
      };
      expect(row.status).toBe('rejected');
      expect(row.reject_reason).toContain('흐림');
    });

    it('reject rejects empty reason', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: 'A' });
      seedDocs(rawDb);
      await expect(caller.documents.reject({ id: 1, reason: '' })).rejects.toThrow();
    });
  });

  describe('upload (customerProcedure)', () => {
    it('inserts document with R2 key + ocr_status=pending', async () => {
      const { caller, rawDb } = await makeCaller({ userId: 3 });
      seedUsers(rawDb);

      const r = await caller.documents.upload({
        key: 'documents/3/test_uuid.jpg',
        name: 'receipt.jpg',
        size: 12345,
        mime: 'image/jpeg',
        doc_type: '영수증',
      });

      expect(r.ok).toBe(true);
      expect(r.document_id).toBeGreaterThan(0);

      const row = rawDb.prepare('SELECT * FROM documents WHERE id = ?').get(r.document_id) as {
        user_id: number;
        image_key: string;
        ocr_status: string;
        status: string;
      };
      expect(row.user_id).toBe(3);
      expect(row.image_key).toBe('documents/3/test_uuid.jpg');
      expect(row.ocr_status).toBe('pending');
      expect(row.status).toBe('pending');
    });

    it('rejects unauth (customerProcedure)', async () => {
      const { caller } = await makeCaller({ userId: null });
      await expect(
        caller.documents.upload({
          key: 'k',
          name: 'n',
          size: 1,
          mime: 'image/jpeg',
        }),
      ).rejects.toThrow();
    });
  });

  describe('myList (거래처 본인 영수증함)', () => {
    it('returns only own documents', async () => {
      const { caller, rawDb } = await makeCaller({ userId: 3 });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: 'A' });
      seedBusiness(rawDb, { id: 2, company_name: 'B' });
      seedDocs(rawDb);

      const r = await caller.documents.myList({});
      // user_id=3 의 문서 3개 (id 1, 2, 3)
      expect(r.documents).toHaveLength(3);
      expect(r.documents.every((d: { user_id: number }) => d.user_id === 3)).toBe(true);
    });

    it('filters by status', async () => {
      const { caller, rawDb } = await makeCaller({ userId: 3 });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: 'A' });
      seedBusiness(rawDb, { id: 2, company_name: 'B' });
      seedDocs(rawDb);

      const r = await caller.documents.myList({ status: 'approved' });
      expect(r.documents).toHaveLength(1);
      expect(r.documents[0].id).toBe(2);
    });
  });
});
