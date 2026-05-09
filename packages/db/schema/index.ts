/**
 * Phase Next-1.2 (2026-05-09): @sewmu/db — D1 schema 단일 export.
 *
 * 사용:
 *   import { users, businesses, chatRooms, memos } from '@sewmu/db';
 *
 * 향후 (Week 2+):
 *   - admin-businesses.js / admin-users.js 등 functions/api/* 가 점진 마이그레이션
 *   - Drizzle query 사용 (SQL 직접 X)
 *
 * 현재 (Week 1):
 *   - 기존 functions/api/* 의 Lazy ALTER + raw SQL 그대로 작동
 *   - 새 코드만 Drizzle 사용 권장
 */

export * from './users';
export * from './businesses';
export * from './rooms';
export * from './memos';
export * from './conversations';
export * from './filings';
export * from './faqs';
export * from './auth';
