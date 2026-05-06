/**
 * Phase #6 메타 (2026-05-06): 메모 상태 (nanostores)
 *
 * admin.js 의 _memoCache / _memoFilter / _cdMemosCache / _cdMemoCategory 등
 * 글로벌 변수를 단일 store 로. 신규 코드(TypeScript 변환 후)에서 사용.
 *
 * Phase #6 단계: 인프라만 활성화. 점진 마이그레이션은 후속.
 */
import { atom, map } from 'nanostores';

/** 메모 항목 — admin-modals.html memoModal / cdMemoList 공통 */
export interface Memo {
  id: number;
  room_id: string | null;
  target_user_id: number | null;
  target_business_id: number | null;
  author_user_id: number | null;
  author_name: string | null;
  memo_type: string;
  content: string;
  due_date: string | null;
  category: string | null;
  tags: string[];
  attachments: Array<{ key: string; name: string; size: number; mime: string }>;
  created_at: string;
  source?: 'room' | 'business' | 'user';
  business_name?: string | null;
  user_name?: string | null;
  memo_type_display?: string;
}

/** 상담방 메모 모달 캐시 (admin.js _memoCache) */
export const $roomMemoCache = atom<Memo[]>([]);

/** 메모 모달 필터 (admin.js _memoFilter) */
export const $memoFilter = atom<'todo' | 'ref' | 'done' | 'all'>('todo');

/** 거래처 dashboard 통합 메모 캐시 (admin.js _cdMemosCache) */
export const $cdMemoCache = atom<Memo[]>([]);

/** 거래처 dashboard 메모 카테고리 필터 (admin.js _cdMemoCategory) */
export const $cdMemoCategory = atom<string>('all');

/** 거래처 dashboard 일괄 액션 — 선택된 메모 ID set */
export const $cdSelectedMemoIds = map<Record<number, boolean>>({});

/** 휴지통 일괄 선택 ID set */
export const $trashSelectedIds = map<Record<number, boolean>>({});
