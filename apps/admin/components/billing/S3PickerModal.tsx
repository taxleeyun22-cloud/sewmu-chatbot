/**
 * Phase D4-4 (2026-05-21): S3 Picker Modal — Section 3 (세액공제·감면) 카탈로그 검색·선택.
 *
 * 사장님 명령: "구글식". prompt() 폐기 → 카탈로그 grid 모달.
 *
 * 카탈로그 = /filing-tax-credit-catalog.json (118개)
 * billable=true 만 표시 (사장님 룰):
 *   - cat='general'|'special' → billable=false (자녀·근로·연금·의료비 등 자연발생, 자동 제외)
 *   - 나머지 → billable=true (사장님 노력 가산)
 * Rule:
 *   - code='112' or 'JTL_7' → flat_5
 *   - 나머지 → progressive_u
 */
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

export interface S3Item {
  code: string;
  name: string;
  amt: number;
  rule: 'flat_5' | 'progressive_u' | 'none';
}

interface CatalogEntry {
  code: string;
  name: string;
  alias?: string[];
  law?: string;
  cat: string;
  billable?: boolean;
  rule?: 'flat_5' | 'progressive_u' | 'none';
}

function calcGain(amt: number, rule: 'flat_5' | 'progressive_u' | 'none'): number {
  if (amt <= 0) return 0;
  if (rule === 'flat_5') return Math.floor(amt * 0.05);
  if (rule === 'progressive_u') {
    let g = 0;
    if (amt <= 5_000_000) g = amt * 0.2;
    else if (amt <= 10_000_000) g = amt * 0.1;
    else g = amt * 0.2;
    return Math.floor(g);
  }
  return 0;
}

function catLabel(cat: string): string {
  const map: Record<string, string> = {
    general: '일반',
    special: '특별공제',
    credit_invest: '투자',
    credit_rnd: 'R&D',
    credit_employee: '고용',
    credit_general: '일반세액',
    exemption: '감면',
  };
  return map[cat] || cat;
}

/* Catalog 한번 fetch + module-level cache (re-fetch 방지) */
let _catalogCache: CatalogEntry[] | null = null;
async function loadCatalog(): Promise<CatalogEntry[]> {
  if (_catalogCache) return _catalogCache;
  try {
    const r = await fetch('/filing-tax-credit-catalog.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = (await r.json()) as { items?: CatalogEntry[] } | CatalogEntry[];
    const arr = Array.isArray(j) ? j : j.items || [];
    /* 카탈로그 → billable + rule 매핑 */
    _catalogCache = arr.map((c) => {
      const billable = !(c.cat === 'general' || c.cat === 'special');
      let rule: 'flat_5' | 'progressive_u' | 'none' = billable ? 'progressive_u' : 'none';
      if (
        c.code === 'JTL_7' ||
        c.code === '112' ||
        (c.name && c.name.indexOf('특별세액감면') >= 0) ||
        (c.alias && c.alias.indexOf('중특') >= 0)
      ) {
        rule = 'flat_5';
      }
      return { ...c, billable, rule };
    });
    return _catalogCache;
  } catch (e) {
    console.error('[S3PickerModal] catalog fetch failed:', e);
    return [];
  }
}

export function S3PickerModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (item: S3Item) => void;
}) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  const [amt, setAmt] = useState<string>('');
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState('');

  useEffect(() => {
    if (open) {
      setSearch('');
      setSelected(null);
      setAmt('');
      setCustomMode(false);
      setCustomName('');
      loadCatalog().then(setCatalog);
    }
  }, [open]);

  const billable = useMemo(() => catalog.filter((c) => c.billable), [catalog]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return billable.slice(0, 100);
    return billable
      .filter((c) => {
        const h = `${c.name} ${c.code} ${(c.alias || []).join(' ')} ${c.law || ''}`.toLowerCase();
        return h.indexOf(q) >= 0;
      })
      .slice(0, 100);
  }, [billable, search]);

  const amtNum = parseFloat(amt) || 0;
  const gain = selected ? calcGain(amtNum, selected.rule || 'progressive_u') : 0;

  const canSubmit = customMode
    ? customName.trim().length > 0 && amtNum > 0
    : selected !== null && amtNum > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>💸 Section 3 항목 추가 (세액공제·감면)</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* 검색 */}
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCustomMode(false);
              setSelected(null);
            }}
            placeholder="🔍 검색 (이름·코드·별칭, 예: 중특, 통합고용, R&D, 환경보전)"
            autoFocus
          />
          <div className="text-xs text-gray-500">
            <b>{filtered.length}</b>/{billable.length} 표시 · billable=true 만
          </div>

          {/* 카드 grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
            {/* 직접 추가 카드 (검색어 있으면 prefill) */}
            <button
              type="button"
              onClick={() => {
                setCustomMode(true);
                setSelected(null);
                setCustomName(search.trim());
              }}
              className={`p-2.5 border rounded text-left transition-all ${
                customMode
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                  : 'border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-50'
              }`}
            >
              <div className="font-bold text-sm text-blue-800">
                ✏️ 직접 추가{search ? `: "${search}"` : ''}
              </div>
              <div className="text-xs text-blue-600 mt-0.5">자유 입력 (양식 X)</div>
            </button>

            {filtered.map((c) => {
              const sel = selected?.code === c.code && !customMode;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    setSelected(c);
                    setCustomMode(false);
                  }}
                  className={`p-2.5 border rounded text-left transition-all ${
                    sel
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                      : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-bold text-sm text-gray-900">{c.name}</div>
                  <div className="flex items-center gap-1.5 mt-1 text-xs">
                    <span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-semibold">
                      {catLabel(c.cat)}
                    </span>
                    {c.rule === 'flat_5' && (
                      <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">
                        5%
                      </span>
                    )}
                    {c.rule === 'progressive_u' && (
                      <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-semibold">
                        U자
                      </span>
                    )}
                    <span className="text-gray-400 font-mono text-[10px]">{c.code}</span>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full text-center text-gray-500 text-sm py-6">
                검색 결과 없음 — 위 "직접 추가" 사용
              </div>
            )}
          </div>

          {/* 선택 후 입력 영역 */}
          {(selected || customMode) && (
            <div className="bg-gray-50 border border-gray-200 rounded p-3 space-y-2">
              <div className="text-sm">
                선택:{' '}
                <b className="text-gray-900">
                  {customMode ? '✏️ 직접 추가' : selected?.name}
                </b>
                <span className="text-xs text-gray-500 ml-2">
                  {customMode ? '자유 입력' : `${catLabel(selected!.cat)} · ${selected!.law || ''}`}
                </span>
              </div>
              {customMode && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    항목명
                  </label>
                  <Input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="예: 사장님 추가 정리"
                  />
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    감면액 (원)
                  </label>
                  <Input
                    type="number"
                    value={amt}
                    onChange={(e) => setAmt(e.target.value)}
                    placeholder="검토표 입력값"
                  />
                </div>
                <div className="text-right text-sm">
                  <div className="text-xs text-gray-500">
                    × {selected?.rule === 'flat_5' ? '5%' : customMode ? 'U자(default)' : 'U자'}
                  </div>
                  <div className="font-bold text-blue-700">
                    = {gain.toLocaleString('ko-KR')}원
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => {
              const item: S3Item = customMode
                ? {
                    code: 'CUSTOM_' + Date.now(),
                    name: customName.trim(),
                    amt: amtNum,
                    rule: 'progressive_u',
                  }
                : {
                    code: selected!.code,
                    name: selected!.name,
                    amt: amtNum,
                    rule: (selected!.rule || 'progressive_u') as 'flat_5' | 'progressive_u',
                  };
              onAdd(item);
              onClose();
            }}
          >
            + 추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
