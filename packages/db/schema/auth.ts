/**
 * Phase Next-Day15 (2026-05-09): Auth.js v5 — accounts + verification_tokens.
 *
 * accounts: OAuth provider 매핑 (provider + providerAccountId → userId)
 *   - 카카오 ID 12345678 + 사장님 users.id 1 → accounts (provider='kakao', providerAccountId='12345678', userId=1)
 *
 * verification_tokens: 이메일 매직링크 (현재 X, 향후 확장)
 */
import { sqliteTable, integer, text, primaryKey } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable(
  'accounts',
  {
    userId: integer('user_id').notNull(),
    type: text('type').notNull(),                       // 'oauth' | 'credentials' | 'email'
    provider: text('provider').notNull(),               // 'kakao' | 'naver'
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  }),
);

export const verificationTokens = sqliteTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: text('expires').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  }),
);

export type Account = typeof accounts.$inferSelect;
export type VerificationToken = typeof verificationTokens.$inferSelect;
