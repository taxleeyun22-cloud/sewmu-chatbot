/**
 * Phase 0 — 공유 상태 저장소 (nanostores)
 *
 * 규칙: 모든 모듈이 공유하는 상태는 여기에 박고 둘 다 구독.
 * props 직접 전달 금지. 데이터 한 곳에서 관리.
 */
import { atom } from 'nanostores';

import type { User } from '@/types';

export const $session = atom<User | null>(null);

export const $selectedClientId = atom<number | null>(null);
