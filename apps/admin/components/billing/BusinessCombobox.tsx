/**
 * BusinessCombobox.tsx — 사업장 typeahead/검색 select (2026-05-21).
 *
 * 사장님 보고: "사업장선택 저거 글로좀 치는거도 나와야지.."
 * → 150+ 사업장 scroll 비현실적. 회사명 / 사업자번호 / 대표자명 부분 일치 검색 + 결과 list.
 *
 * 동작:
 *   - 클릭 시 입력 받음 (자유 텍스트)
 *   - 입력 2자 이상 부터 client-side 필터 (이미 list 전체 fetch 됨)
 *   - 결과 카드 클릭 → 선택 + 입력 닫힘
 *   - "← 다른 사업장" 으로 재선택 가능
 *   - URL ?business_id=N 으로 진입 시 자동 선택 + 검색 UI 닫힘
 */
'use client';

import { useState, useRef, useEffect } from 'react';

export interface BizRow {
  id: number;
  company_name: string | null;
  company_form: string | null;
  tax_type: string | null;
  ceo_name: string | null;
  business_number: string | null;
}

function isCorp(b: BizRow): boolean {
  const f = b.company_form || '';
  return f === '법인' || f === 'corp' || /법인/.test(f) || /\(주\)|㈜|주식회사/.test(b.company_name || '');
}

function fmtBizNo(n: string | null): string {
  if (!n) return '';
  const d = n.replace(/\D/g, '');
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  return n;
}

export function BusinessCombobox({
  businesses,
  selectedId,
  onChange,
  isLoading,
}: {
  businesses: BizRow[];
  selectedId: number;
  onChange: (id: number) => void;
  isLoading?: boolean;
}) {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [hi, setHi] = useState(0); // keyboard highlight
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = businesses.find((b) => b.id === selectedId) || null;

  /* 필터 — 회사명·사업자번호·대표자명 (대소문자 무시, 사업자번호는 숫자만) */
  const filtered = (() => {
    const trimmed = q.trim();
    if (!trimmed) return businesses.slice(0, 50); // 빈 검색 = 첫 50개
    const lower = trimmed.toLowerCase();
    const digits = trimmed.replace(/\D/g, '');
    return businesses
      .filter((b) => {
        const name = (b.company_name || '').toLowerCase();
        const ceo = (b.ceo_name || '').toLowerCase();
        const bizNoDigits = (b.business_number || '').replace(/\D/g, '');
        return (
          name.includes(lower) ||
          ceo.includes(lower) ||
          (digits.length >= 2 && bizNoDigits.includes(digits))
        );
      })
      .slice(0, 50);
  })();

  /* keyboard navigation */
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
        onChange(pick.id);
        setFocused(false);
        setQ('');
      }
    } else if (e.key === 'Escape') {
      setFocused(false);
      inputRef.current?.blur();
    }
  }

  /* outside click → close */
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  /* selectedId 가 외부에서 set 되면 검색창 닫고 q 초기화 */
  useEffect(() => {
    if (selectedId) {
      setFocused(false);
      setQ('');
    }
  }, [selectedId]);

  /* 선택 후 표시 모드 */
  if (selected && !focused) {
    return (
      <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm text-gray-900 truncate">
            {selected.company_name}
            <span className="ml-2 text-xs text-gray-500 font-normal">
              ({isCorp(selected) ? '법인' : '개인'})
            </span>
          </div>
          <div className="text-xs text-gray-500 truncate">
            {selected.ceo_name && `대표 ${selected.ceo_name}`}
            {selected.business_number && ` · ${fmtBizNo(selected.business_number)}`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(0);
            setFocused(true);
            setQ('');
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="ml-3 text-xs text-blue-700 hover:bg-blue-100 px-2 py-1 rounded flex-shrink-0"
          title="다른 사업장 선택"
        >
          ← 변경
        </button>
      </div>
    );
  }

  /* 검색 모드 */
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
        placeholder={isLoading ? '사업장 로딩 중…' : '회사명·사업자번호·대표자 검색 (예: 박, 123-45)'}
        className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
        autoComplete="off"
      />
      {focused && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-4 text-sm text-gray-500 text-center">로딩 중…</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-gray-500 text-center">
              일치하는 사업장 없음. (총 {businesses.length}개)
            </div>
          ) : (
            <>
              <div className="px-3 py-1.5 text-[11px] text-gray-500 bg-gray-50 border-b border-gray-200 sticky top-0">
                {q.trim() ? `${filtered.length}건 일치` : `최근 ${filtered.length}개 (검색 시 전체 ${businesses.length}개 중 매칭)`}
              </div>
              {filtered.map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()} // input blur 방지
                  onClick={() => {
                    onChange(b.id);
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
                      {b.company_name || '(이름없음)'}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${
                        isCorp(b) ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {isCorp(b) ? '법인' : '개인'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">
                    {b.ceo_name && `대표 ${b.ceo_name}`}
                    {b.business_number && ` · ${fmtBizNo(b.business_number)}`}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
