/**
 * Phase 10 cleanup (2026-05-12): 검색 input debounce 훅.
 *
 * 사장님 prod 에 사용자 257명 / 업체 310개 — 매 키 입력마다 D1 query 가는 건
 * 비용 + UX 둘 다 손해. 250ms debounce 가 표준.
 *
 * 사용:
 *   const [raw, setRaw] = useState('');
 *   const search = useDebouncedValue(raw, 250);
 *   useQuery({ queryKey: ['users.list', status, search], queryFn: ... });
 */
'use client';

import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
