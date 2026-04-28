/**
 * Phase 0 — 단일 fetch wrapper (모든 features 가 import)
 *
 * 백엔드 응답 모양이 바뀌면 이 파일 한 곳만 수정.
 * Phase 2 부터 admin-rooms / conversations / admin-finance 등을 호출하는
 * 도메인 함수(getRooms, getMessages 등)를 같은 파일에 추가.
 */

export class ApiError extends Error {
  constructor(public status: number, public path: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

function buildUrl(path: string, query?: ApiOptions['query']): string {
  const base = path.startsWith('/') ? path : `/api/${path}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, query, headers, ...rest } = options;
  const url = buildUrl(path, query);

  const init: RequestInit = {
    credentials: 'include',
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const res = await fetch(url, init);

  if (!res.ok) {
    let msg: string;
    try {
      const data = await res.json();
      msg = (data as { error?: string }).error ?? `HTTP ${res.status}`;
    } catch {
      msg = `HTTP ${res.status}`;
    }
    throw new ApiError(res.status, url, msg);
  }

  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}
