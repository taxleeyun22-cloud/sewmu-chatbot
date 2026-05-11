/**
 * Phase Next-Day27 (2026-05-11): admin Auth.js catch-all route.
 */
import { handlers } from '@/auth';

export const runtime = 'edge';
export const { GET, POST } = handlers;
