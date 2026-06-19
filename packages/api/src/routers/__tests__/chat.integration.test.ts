/**
 * Phase 보안-C2 (2026-06-18): chat.send roomId 멤버십(IDOR) 통합 테스트.
 *
 * 거래처가 임의/내부 방에 메시지 주입 못 하게 — roomId 가 오면 활성 멤버만 허용.
 * @sewmu/ai 는 stub (OpenAI/RAG 네트워크 차단).
 */
import { describe, it, expect, vi } from 'vitest';
import { setupDbMocks, makeCaller, seedUsers } from './helpers';

setupDbMocks();

vi.mock('@sewmu/ai', () => ({
  chatCompletion: vi.fn(async () => ({ content: '안녕하세요 [신뢰도: 높음]', tokensUsed: 10, model: 'test' })),
  extractConfidence: (s: string) => ({ cleaned: s, confidence: '높음' }),
  buildSystemPrompt: () => 'SYS',
  embedQuery: vi.fn(async () => [0.1, 0.2, 0.3]),
  rankFaqsByEmbedding: () => [],
  formatRagContext: () => '',
}));

function seedRoom(rawDb: any, id: string, isInternal = 0) {
  rawDb.exec(
    `INSERT INTO chat_rooms (id, name, status, is_internal, created_at) VALUES ('${id}','방','active',${isInternal},'2026-01-01')`,
  );
}
function addMember(rawDb: any, mid: number, roomId: string, userId: number, left: string | null = null) {
  rawDb.prepare(
    `INSERT INTO room_members (id, room_id, user_id, role, joined_at, left_at) VALUES (?, ?, ?, 'member', '2026-01-01', ?)`,
  ).run(mid, roomId, userId, left);
}

describe('chat.send roomId 멤버십 (C2 IDOR)', () => {
  it('멤버인 방 → 성공, conversations 에 room_id 기록', async () => {
    const { caller, rawDb } = await makeCaller({ userId: 3, isOwner: false });
    seedUsers(rawDb);
    seedRoom(rawDb, 'ROOM01');
    addMember(rawDb, 1, 'ROOM01', 3);

    const r = await caller.chat.send({ message: '안녕', roomId: 'ROOM01' });
    expect(r.response).toContain('안녕하세요');

    const rows = rawDb.prepare(`SELECT * FROM conversations WHERE room_id = 'ROOM01'`).all();
    expect(rows).toHaveLength(2); // user + assistant
  });

  it('멤버가 아닌 방 → FORBIDDEN (임의 방 주입 차단)', async () => {
    const { caller, rawDb } = await makeCaller({ userId: 3, isOwner: false });
    seedUsers(rawDb);
    seedRoom(rawDb, 'OTHER9');
    addMember(rawDb, 1, 'OTHER9', 2); // 다른 사용자만 멤버

    await expect(caller.chat.send({ message: '안녕', roomId: 'OTHER9' })).rejects.toThrow(/접근 권한/);
    const rows = rawDb.prepare(`SELECT * FROM conversations WHERE room_id = 'OTHER9'`).all();
    expect(rows).toHaveLength(0); // 주입 안 됨
  });

  it('내부 관리자방(is_internal) 도 비멤버면 차단', async () => {
    const { caller, rawDb } = await makeCaller({ userId: 3, isOwner: false });
    seedUsers(rawDb);
    seedRoom(rawDb, 'INT001', 1);
    await expect(caller.chat.send({ message: '몰래', roomId: 'INT001' })).rejects.toThrow(/접근 권한/);
  });

  it('나간 방(left_at) → 차단', async () => {
    const { caller, rawDb } = await makeCaller({ userId: 3, isOwner: false });
    seedUsers(rawDb);
    seedRoom(rawDb, 'LEFT01');
    addMember(rawDb, 1, 'LEFT01', 3, '2026-05-01'); // 떠남
    await expect(caller.chat.send({ message: '안녕', roomId: 'LEFT01' })).rejects.toThrow(/접근 권한/);
  });

  it('roomId 없으면 일반 챗 — 통과 (room_id NULL)', async () => {
    const { caller, rawDb } = await makeCaller({ userId: 3, isOwner: false });
    seedUsers(rawDb);
    const r = await caller.chat.send({ message: '안녕' });
    expect(r.response).toContain('안녕하세요');
    const rows = rawDb.prepare(`SELECT * FROM conversations WHERE user_id = 3 AND room_id IS NULL`).all();
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
