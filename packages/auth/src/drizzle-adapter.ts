/**
 * Phase Next-Day15 (2026-05-09): Auth.js v5 Drizzle adapter (D1).
 *
 * 사장님 명령 (Day 15): 실제 카카오 로그인 작동.
 *
 * 표준 @auth/drizzle-adapter 는 PostgreSQL/MySQL/SQLite (better-sqlite3) 만 지원.
 * Cloudflare D1 (HTTP-driver) 호환을 위해 자체 adapter 작성.
 *
 * 우리 schema 매핑 (기존 functions/api/auth/* 와 호환 위해 변경 X):
 * - users          ← Auth.js User 표준
 * - sessions       ← Auth.js Session (token PK, user_id FK)
 * - accounts       ← (lazy migration 신규) provider/providerAccountId 매핑
 * - verification_tokens ← (lazy migration 신규)
 *
 * 카카오 OAuth flow:
 *   카카오 ID → accounts 테이블 (provider='kakao', providerAccountId=K-ID)
 *           → user_id 로 users.id 매핑 (기존 데이터 연결)
 */
import type { Adapter, AdapterAccount, AdapterSession, AdapterUser } from '@auth/core/adapters';
import { eq, and } from 'drizzle-orm';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Drizzle D1 adapter factory.
 *
 * @param db - drizzle(d1Binding) — Cloudflare D1 binding 으로 만든 Drizzle client
 * @param schema - @sewmu/db 의 schema export
 */
export function DrizzleD1Adapter(db: any, schema: any): Adapter {
  const { users, sessions, accounts, verificationTokens } = schema;

  return {
    async createUser(data: AdapterUser) {
      const now = new Date().toISOString();
      const r = await db
        .insert(users)
        .values({
          name: data.name ?? null,
          email: data.email ?? null,
          email_verified: data.emailVerified ? data.emailVerified.toISOString() : null,
          profile_image: data.image ?? null,
          provider: 'auth.js',
          approval_status: 'pending',
          created_at: now,
          last_login_at: now,
        })
        .returning();
      const u = r[0];
      return {
        id: String(u.id),
        name: u.name,
        email: u.email,
        emailVerified: u.email_verified ? new Date(u.email_verified) : null,
        image: u.profile_image,
      };
    },

    async getUser(id) {
      const r = await db.select().from(users).where(eq(users.id, Number(id))).limit(1);
      const u = r[0];
      if (!u) return null;
      return {
        id: String(u.id),
        name: u.name,
        email: u.email,
        emailVerified: u.email_verified ? new Date(u.email_verified) : null,
        image: u.profile_image,
      };
    },

    async getUserByEmail(email) {
      const r = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const u = r[0];
      if (!u) return null;
      return {
        id: String(u.id),
        name: u.name,
        email: u.email,
        emailVerified: u.email_verified ? new Date(u.email_verified) : null,
        image: u.profile_image,
      };
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const r = await db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.provider, provider),
            eq(accounts.providerAccountId, providerAccountId),
          ),
        )
        .limit(1);
      if (!r[0]) return null;
      const u = await db.select().from(users).where(eq(users.id, r[0].userId)).limit(1);
      if (!u[0]) return null;
      return {
        id: String(u[0].id),
        name: u[0].name,
        email: u[0].email,
        emailVerified: u[0].email_verified ? new Date(u[0].email_verified) : null,
        image: u[0].profile_image,
      };
    },

    async updateUser(data) {
      const updates: Record<string, unknown> = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.email !== undefined) updates.email = data.email;
      if (data.image !== undefined) updates.profile_image = data.image;
      if (data.emailVerified !== undefined)
        updates.email_verified = data.emailVerified
          ? new Date(data.emailVerified).toISOString()
          : null;

      await db.update(users).set(updates).where(eq(users.id, Number(data.id)));
      const u = await db.select().from(users).where(eq(users.id, Number(data.id))).limit(1);
      return {
        id: String(u[0].id),
        name: u[0].name,
        email: u[0].email,
        emailVerified: u[0].email_verified ? new Date(u[0].email_verified) : null,
        image: u[0].profile_image,
      };
    },

    async linkAccount(data: AdapterAccount) {
      await db.insert(accounts).values({
        userId: Number(data.userId),
        type: data.type,
        provider: data.provider,
        providerAccountId: data.providerAccountId,
        refresh_token: data.refresh_token ?? null,
        access_token: data.access_token ?? null,
        expires_at: data.expires_at ?? null,
        token_type: data.token_type ?? null,
        scope: data.scope ?? null,
        id_token: data.id_token ?? null,
        session_state: data.session_state ?? null,
      });
    },

    async createSession(session) {
      await db.insert(sessions).values({
        token: session.sessionToken,
        user_id: Number(session.userId),
        expires_at: session.expires.toISOString(),
        created_at: new Date().toISOString(),
        last_accessed_at: new Date().toISOString(),
      });
      return session;
    },

    async getSessionAndUser(sessionToken) {
      const s = await db
        .select()
        .from(sessions)
        .where(eq(sessions.token, sessionToken))
        .limit(1);
      if (!s[0]) return null;
      const u = await db.select().from(users).where(eq(users.id, s[0].user_id)).limit(1);
      if (!u[0]) return null;

      const session: AdapterSession = {
        sessionToken: s[0].token,
        userId: String(s[0].user_id),
        expires: new Date(s[0].expires_at),
      };
      const user: AdapterUser = {
        id: String(u[0].id),
        name: u[0].name,
        email: u[0].email,
        emailVerified: u[0].email_verified ? new Date(u[0].email_verified) : null,
        image: u[0].profile_image,
      };
      return { session, user };
    },

    async updateSession(data) {
      const updates: Record<string, unknown> = {
        last_accessed_at: new Date().toISOString(),
      };
      if (data.expires) updates.expires_at = data.expires.toISOString();
      if (data.userId) updates.user_id = Number(data.userId);
      await db.update(sessions).set(updates).where(eq(sessions.token, data.sessionToken));
      const s = await db.select().from(sessions).where(eq(sessions.token, data.sessionToken)).limit(1);
      if (!s[0]) return null;
      return {
        sessionToken: s[0].token,
        userId: String(s[0].user_id),
        expires: new Date(s[0].expires_at),
      };
    },

    async deleteSession(sessionToken) {
      await db.delete(sessions).where(eq(sessions.token, sessionToken));
    },

    async createVerificationToken(data) {
      await db.insert(verificationTokens).values({
        identifier: data.identifier,
        token: data.token,
        expires: data.expires.toISOString(),
      });
      return data;
    },

    async useVerificationToken({ identifier, token }) {
      const r = await db
        .select()
        .from(verificationTokens)
        .where(
          and(
            eq(verificationTokens.identifier, identifier),
            eq(verificationTokens.token, token),
          ),
        )
        .limit(1);
      if (!r[0]) return null;
      await db
        .delete(verificationTokens)
        .where(
          and(
            eq(verificationTokens.identifier, identifier),
            eq(verificationTokens.token, token),
          ),
        );
      return {
        identifier: r[0].identifier,
        token: r[0].token,
        expires: new Date(r[0].expires),
      };
    },
  };
}
