/**
 * PersonCombobox.tsx — 거래처(사람) typeahead 검색 (2026-05-21).
 *
 * 사장님 명령: "사람이랑 업체가있어야하는거 아님" — billing-preview.html 의 person 모드.
 *
 * 동작:
 *   - 검색 input → users.list({ search, status:'approved_client', limit: 50 }) 서버 호출
 *   - 결과 카드: 본명/닉네임 + 전화·이메일
 *   - 클릭 → onChange(user_id, user_name) → 부모 setUserId + 그 사람의 매핑 사업장 picker
 *   - "← 변경" 으로 재선택
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { trpcCall } from '@/lib/trpc';

interface UserRow {
  id: number;
  name: string | null;
  real_name: string | null;
  phone: string | null;
  email: string | null;
  approval_status: string | null;
  is_admin: number | null;
}

function fmtPhone(p: string | null): string {
  if (!p) return '';
  const d = p.replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}

function statusBadge(u: UserRow): { label: string; cls: string } {
  if (u.is_admin) return { label: '관리자', cls: 'bg-purple-100 text-purple-800' };
  switch (u.approval_status) {
    case 'approved_client':
      return { label: '기장거래처', cls: 'bg-green-100 text-green-800' };
    case 'approved_guest':
      return { label: '일반승인', cls: 'bg-blue-100 text-blue-800' };
    case 'pending':
      return { label: '대기', cls: 'bg-yellow-100 text-yellow-800' };
    case 'rejected':
      return { label: '거절', cls: 'bg-red-100 text-red-800' };
    case 'terminated':
      return { label: '종료', cls: 'bg-gray-200 text-gray-700' };
    default:
      return { label: '거래처', cls: 'bg-gray-100 text-gray-700' };
  }
}

export function PersonCombobox({
  selectedId,
  selectedLabel,
  onChange,
}: {
  selectedId: number;
  selectedLabel?: string;
  onChange: (id: number, label: string) => void;
}) {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  /* users.list — 검색 시에만 fetch (2자 이상). 빈 검색 = 최근 기장거래처 50 */
  const { data, isFetching } = useQuery<{ users: UserRow[] }>({
    queryKey: ['users.list.person', { search: q.trim() }],
    queryFn: () =>
      trpcCall('users.list', {
        search: q.trim() || undefined,
        limit: 50,
      }),
    enabled: focused && !selectedId,
    staleTime: 30 * 1000,
  });

  const filtered = data?.users || [];

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!focused) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHi((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = filtered[hi];
      if (pick) {
        const label = pick.real_name || pick.name || `#${pick.id}`;
        onChange(pick.id, label);
        setFocused(false);
        setQ('');
      }
    } else if (e.key === 'Escape') {
      setFocused(false);
      inputRef.current?.blur();
    }
  }

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setFocused(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (selectedId) {
      setFocused(false);
      setQ('');
    }
  }, [selectedId]);

  /* 선택 후 표시 모드 */
  if (selectedId && !focused) {
    return (
      <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm text-gray-900 truncate">
            👤 {selectedLabel || `사용자 #${selectedId}`}
          </div>
          <div className="text-xs text-gray-500 truncate">user_id #{selectedId}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(0, '');
            setFocused(true);
            setQ('');
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="ml-3 text-xs text-blue-700 hover:bg-blue-100 px-2 py-1 rounded flex-shrink-0"
          title="다른 거래처 선택"
        >
          ← 변경
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setHi(0);
        }}
        onFocus={() => setFocused(true)}
        onKeyDown={onKey}
        placeholder="이름·닉네임·전화 검색 (예: 박, 010-1234)"
        className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
        autoComplete="off"
      />
      {focused && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {isFetching ? (
            <div className="px-3 py-4 text-sm text-gray-500 text-center">검색 중…</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-gray-500 text-center">
              {q.trim() ? '일치하는 거래처 없음.' : '검색어를 입력하세요 (이름·전화)'}
            </div>
          ) : (
            <>
              <div className="px-3 py-1.5 text-[11px] text-gray-500 bg-gray-50 border-b border-gray-200 sticky top-0">
                {filtered.length}건 일치
              </div>
              {filtered.map((u, i) => {
                const label = u.real_name || u.name || `#${u.id}`;
                const sb = statusBadge(u);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(u.id, label);
                      setFocused(false);
                      setQ('');
                    }}
                    onMouseEnter={() => setHi(i)}
                    className={`w-full text-left px-3 py-2 border-b border-gray-100 last:border-b-0 ${
                      i === hi ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-900 truncate">
                        👤 {label}
                      </span>
                      {u.name && u.real_name && u.name !== u.real_name && (
                        <span className="text-xs text-gray-500 truncate">({u.name})</span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${sb.cls}`}>
                        {sb.label}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      {u.phone && fmtPhone(u.phone)}
                      {u.email && ` · ${u.email}`}
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
