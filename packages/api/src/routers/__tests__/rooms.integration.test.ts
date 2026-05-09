/**
 * Phase Next-Day24 (2026-05-09): rooms router 통합 테스트.
 *
 * 사장님 매일 워크플로 핵심 — 상담방 list / 진입 / 메시지 / 1방 N업체 매핑.
 */
import { describe, it, expect } from 'vitest';
import { setupDbMocks, makeCaller, seedUsers, seedBusiness } from './helpers';

setupDbMocks();

describe('rooms router (integration)', () => {
  describe('create', () => {
    it('generates 6-char room id + adds owner as admin member', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true, userId: 1 });
      seedUsers(rawDb);

      const r = await caller.rooms.create({
        name: '박승호 상담',
        member_user_ids: [3],
      });

      expect(r.ok).toBe(true);
      expect(r.room_id).toMatch(/^[A-Z0-9]{6}$/);

      const room = rawDb.prepare('SELECT * FROM chat_rooms WHERE id = ?').get(r.room_id) as {
        name: string;
        status: string;
        is_internal: number;
      };
      expect(room.name).toBe('박승호 상담');
      expect(room.status).toBe('active');
      expect(room.is_internal).toBe(0);

      const members = rawDb.prepare('SELECT * FROM room_members WHERE room_id = ?').all(r.room_id);
      expect(members).toHaveLength(2); // sajangnim + member
      const sajang = (members as Array<{ user_id: number; role: string }>).find(
        (m) => m.user_id === 1,
      );
      expect(sajang?.role).toBe('admin');
    });

    it('is_internal=true creates 관리자방', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      const r = await caller.rooms.create({
        name: '관리자방',
        member_user_ids: [2],
        is_internal: true,
      });
      const room = rawDb.prepare('SELECT is_internal FROM chat_rooms WHERE id = ?').get(r.room_id) as {
        is_internal: number;
      };
      expect(room.is_internal).toBe(1);
    });

    it('rejects empty name', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      await expect(
        caller.rooms.create({ name: '', member_user_ids: [] }),
      ).rejects.toThrow();
    });
  });

  describe('list', () => {
    it('returns rooms + labels', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);

      const a = await caller.rooms.create({ name: '방1', member_user_ids: [3] });
      const b = await caller.rooms.create({ name: '방2', member_user_ids: [3] });
      rawDb.exec(`INSERT INTO room_labels (id, name, color, ord, created_at) VALUES (1, '예슬', '#abc', 1, '2026-01-01')`);

      const r = await caller.rooms.list({});
      expect(r.rooms.length).toBeGreaterThanOrEqual(2);
      expect(r.labels).toHaveLength(1);
      expect(r.labels[0].name).toBe('예슬');
    });

    it('internal=true filter', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      await caller.rooms.create({ name: '일반방', member_user_ids: [3] });
      await caller.rooms.create({ name: '관리자방', member_user_ids: [2], is_internal: true });

      const r = await caller.rooms.list({ internal: true });
      expect(r.rooms).toHaveLength(1);
      expect(r.rooms[0].name).toBe('관리자방');
    });
  });

  describe('get (방 진입)', () => {
    it('returns room + members + messages + businesses (parallel)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: '온나' });

      const r = await caller.rooms.create({ name: '테스트', member_user_ids: [3] });
      await caller.rooms.send({ room_id: r.room_id, content: '안녕하세요' });
      await caller.rooms.linkBusiness({ room_id: r.room_id, business_id: 1, is_primary: true });

      const got = await caller.rooms.get({ roomId: r.room_id });

      expect(got.room?.name).toBe('테스트');
      expect(got.members.length).toBeGreaterThanOrEqual(2);
      expect(got.messages).toHaveLength(1);
      expect(got.messages[0].content).toBe('안녕하세요');
      expect(got.messages[0].role).toBe('human_advisor');
      expect(got.businesses).toHaveLength(1);
      expect(got.businesses[0].company_name).toBe('온나');
      expect(got.businesses[0].is_primary).toBe(1);
    });

    it('returns null room for missing roomId', async () => {
      const { caller } = await makeCaller({ isOwner: true });
      const got = await caller.rooms.get({ roomId: 'NOSUCH' });
      expect(got.room).toBeNull();
      expect(got.members).toEqual([]);
      expect(got.messages).toEqual([]);
    });

    it('excludes left members', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      const r = await caller.rooms.create({ name: 'x', member_user_ids: [3] });
      rawDb.exec(`UPDATE room_members SET left_at = '2026-05-01T00:00:00Z' WHERE room_id = '${r.room_id}' AND user_id = 3`);

      const got = await caller.rooms.get({ roomId: r.room_id });
      const memberIds = got.members.map((m: { user_id: number }) => m.user_id);
      expect(memberIds).not.toContain(3);
    });
  });

  describe('send', () => {
    it('inserts message + bumps room.updated_at', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);

      const r = await caller.rooms.create({ name: 'test', member_user_ids: [3] });
      const beforeRoom = rawDb.prepare('SELECT updated_at FROM chat_rooms WHERE id = ?').get(r.room_id) as {
        updated_at: string;
      };
      await new Promise((res) => setTimeout(res, 10));

      const send = await caller.rooms.send({ room_id: r.room_id, content: '메시지 내용' });
      expect(send.message_id).toBeGreaterThan(0);

      const msg = rawDb.prepare('SELECT * FROM conversations WHERE id = ?').get(send.message_id) as {
        content: string;
        role: string;
      };
      expect(msg.content).toBe('메시지 내용');
      expect(msg.role).toBe('human_advisor');

      const afterRoom = rawDb.prepare('SELECT updated_at FROM chat_rooms WHERE id = ?').get(r.room_id) as {
        updated_at: string;
      };
      expect(afterRoom.updated_at >= beforeRoom.updated_at).toBe(true);
    });

    it('rejects empty content', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      const r = await caller.rooms.create({ name: 'x', member_user_ids: [3] });
      await expect(
        caller.rooms.send({ room_id: r.room_id, content: '' }),
      ).rejects.toThrow();
    });

    it('rejects content over 10000 chars', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      const r = await caller.rooms.create({ name: 'x', member_user_ids: [3] });
      await expect(
        caller.rooms.send({ room_id: r.room_id, content: 'a'.repeat(10001) }),
      ).rejects.toThrow();
    });
  });

  describe('close / reopen', () => {
    it('close sets status + closed_at', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      const r = await caller.rooms.create({ name: 'x', member_user_ids: [3] });

      await caller.rooms.close({ room_id: r.room_id });
      const room = rawDb.prepare('SELECT status, closed_at FROM chat_rooms WHERE id = ?').get(r.room_id) as {
        status: string;
        closed_at: string;
      };
      expect(room.status).toBe('closed');
      expect(room.closed_at).toBeTruthy();
    });

    it('reopen clears closed_at', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      const r = await caller.rooms.create({ name: 'x', member_user_ids: [3] });
      await caller.rooms.close({ room_id: r.room_id });
      await caller.rooms.reopen({ room_id: r.room_id });

      const room = rawDb.prepare('SELECT status, closed_at FROM chat_rooms WHERE id = ?').get(r.room_id) as {
        status: string;
        closed_at: string | null;
      };
      expect(room.status).toBe('active');
      expect(room.closed_at).toBeNull();
    });
  });

  describe('linkBusiness / unlinkBusiness (1방 N업체)', () => {
    it('links business — primary toggle', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: 'A' });

      const r = await caller.rooms.create({ name: 'x', member_user_ids: [3] });
      await caller.rooms.linkBusiness({ room_id: r.room_id, business_id: 1, is_primary: true });

      const link = rawDb.prepare(
        'SELECT * FROM room_businesses WHERE room_id = ? AND business_id = ?',
      ).get(r.room_id, 1) as { is_primary: number };
      expect(link.is_primary).toBe(1);
    });

    it('unlink soft-deletes (removed_at)', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: 'A' });

      const r = await caller.rooms.create({ name: 'x', member_user_ids: [3] });
      await caller.rooms.linkBusiness({ room_id: r.room_id, business_id: 1, is_primary: false });
      await caller.rooms.unlinkBusiness({ room_id: r.room_id, business_id: 1 });

      const link = rawDb.prepare(
        'SELECT removed_at FROM room_businesses WHERE room_id = ? AND business_id = ?',
      ).get(r.room_id, 1) as { removed_at: string };
      expect(link.removed_at).toBeTruthy();
    });

    it('1방 N업체 — multiple businesses linked', async () => {
      const { caller, rawDb } = await makeCaller({ isOwner: true });
      seedUsers(rawDb);
      seedBusiness(rawDb, { id: 1, company_name: 'A' });
      seedBusiness(rawDb, { id: 2, company_name: 'B' });

      const r = await caller.rooms.create({ name: 'x', member_user_ids: [3] });
      await caller.rooms.linkBusiness({ room_id: r.room_id, business_id: 1, is_primary: true });
      await caller.rooms.linkBusiness({ room_id: r.room_id, business_id: 2, is_primary: false });

      const got = await caller.rooms.get({ roomId: r.room_id });
      expect(got.businesses).toHaveLength(2);
    });
  });
});
