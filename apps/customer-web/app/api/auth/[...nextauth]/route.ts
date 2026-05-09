/**
 * Phase Next-Day15 (2026-05-09): Auth.js v5 catch-all route.
 * /api/auth/signin/kakao / /api/auth/callback/kakao / /api/auth/signout / etc.
 */
import { handlers } from '@/auth';

export const runtime = 'edge';
export const { GET, POST } = handlers;
