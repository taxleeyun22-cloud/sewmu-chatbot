/**
 * Phase Next-1.6 (2026-05-09): @sewmu/api (placeholder — Week 2-3 에서 본격).
 *
 * Week 2-3 도입 예정:
 *   - tRPC v11 (typed RPC)
 *   - Hono middleware (Cloudflare Workers 호환)
 *   - 기존 functions/api/* 76개 endpoint 점진 마이그레이션:
 *       admin-users → trpc.users.*
 *       admin-businesses → trpc.businesses.*
 *       memos → trpc.memos.*
 *       chat → trpc.chat.*
 *       etc.
 *   - 자동 type 추론 (client ↔ server)
 *   - middleware: auth, rate limit, logging, validation (Zod)
 *
 * 현재: placeholder. functions/api/* 그대로 작동.
 */

export const placeholder = 'Week 2-3 에서 tRPC routers 작성';
