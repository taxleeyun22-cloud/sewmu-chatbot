/**
 * Phase Next-Day28 (2026-05-11): React Query Provider — 서버 state 관리.
 * 구글직원 패턴: useQuery + useMutation + queryClient invalidation.
 */
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000, // 30s — 옛 admin 의 polling 간격과 호환
            gcTime: 5 * 60_000, // 5m
            refetchOnWindowFocus: true,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
