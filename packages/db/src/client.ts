/**
 * Phase Next-Day5 (2026-05-09): Drizzle D1 client.
 *
 * 사용 (Cloudflare Workers):
 *   import { drizzle } from '@sewmu/db/client';
 *   const db = drizzle(env.DB);
 *   const list = await db.query.users.findMany();
 *
 * Cloudflare Pages 환경:
 *   - context.env.DB 가 D1 binding (사장님이 대시보드에서 설정)
 *   - 로컬 dev: wrangler.toml 또는 mock
 */
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import * as schema from '../schema';

export type DB = ReturnType<typeof drizzleD1<typeof schema>>;

export function drizzle(d1: any): DB {
  return drizzleD1(d1 as never, { schema });
}

export { schema };
