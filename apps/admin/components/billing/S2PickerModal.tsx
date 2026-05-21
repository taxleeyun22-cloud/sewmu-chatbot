/**
 * Phase D4-4 + 사장님 명령 2026-05-21: S2 Picker Modal — Section 2 (활증업무) 항목 추가.
 *
 * 사장님 명령: "개인은 양식추가에 근로소득 합산추가 이런거 넣고 금액넣을수있게".
 *
 * 흐름:
 *   1. 양식 (billing.templateGet) 의 s2_options 옵션 카드 표시 (법인/개인 자동 분기)
 *   2. 사장님이 카드 클릭 → name + 단가 prefill
 *   3. 또는 ✏️ "직접 추가" 카드 → 자유 입력
 *   4. 단가 / 건수 입력 → 가산액 실시간
 *   5. + 추가
 */
'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { trpcCall } from '@/lib/trpc';

export interface S2Item {
  name: string;
  val: number;
  qty: number;
}

interface S2Option {
  name: string;
  type: 'unit' | 'rate' | 'direct';
  val: number;
  desc?: string;
}

interface TemplateData {
  fee_rule_indv?: { tariff: unknown; s2_options?: S2Option[] };
  fee_rule_corp?: { tariff: unknown; s2_options?: S2Option[] };
}

export function S2PickerModal({
  open,
  onClose,
  onAdd,
  form = 'corp',
  base = 0,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (item: S2Item) => void;
  form?: 'corp' | 'indv';  // 법인 / 개인 분기
  base?: number;  // 기본보수 (rate type 계산용)
}) {
  /* 양식 fetch — s2_options list */
  const { data } = useQuery<{ template: TemplateData | null }>({
    queryKey: ['billing.templateGet'],
    queryFn: () => trpcCall('billing.templateGet'),
    enabled: open,
  });

  const options =
    (form === 'indv'
      ? data?.template?.fee_rule_indv?.s2_options
      : data?.template?.fee_rule_corp?.s2_options) || [];

  const [selected, setSelected] = useState<S2Option | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [name, setName] = useState('');
  const [val, setVal] = useState<string>('');
  const [qty, setQty] = useState<string>('1');

  useEffect(() => {
    if (open) {
      setSelected(null);
      setCustomMode(false);
      setName('');
      setVal('');
      setQty('1');
    }
  }, [open]);

  const selectOption = (opt: S2Option) => {
    setSelected(opt);
    setCustomMode(false);
    setName(opt.name);
    /* rate type 이면 base × val% 자동 계산 후 단가 prefill */
    if (opt.type === 'rate' && base > 0) {
      const calc = Math.floor((base * opt.val) / 100 / 1000) * 1000;
      setVal(String(calc));
    } else {
      setVal(String(opt.val || 0));
    }
    setQty('1');
  };

  const selectCustom = () => {
    setSelected(null);
    setCustomMode(true);
    setName('');
    setVal('');
    setQty('1');
  };

  const valNum = parseFloat(val) || 0;
  const qtyNum = parseFloat(qty) || 1;
  const gain = valNum * qtyNum;

  const canSubmit = name.trim().length > 0 && valNum > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            📞 Section 2 항목 추가 (활증업무 — {form === 'indv' ? '개인' : '법인'})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* 양식 옵션 카드 */}
          {options.length > 0 && (
            <>
              <div className="text-xs text-gray-500 font-semibold">📋 양식 등록 활증업무</div>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {options.map((opt, i) => {
                  const sel = selected?.name === opt.name && !customMode;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectOption(opt)}
                      className={`p-2.5 border rounded text-left transition-all ${
                        sel
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                          : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-bold text-sm text-gray-900">{opt.name}</div>
                      <div className="flex items-center gap-1.5 mt-1 text-xs">
                        <span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-semibold">
                          {opt.type === 'rate'
                            ? `기본보수 × ${opt.val}%`
                            : opt.type === 'unit'
                            ? `건당 ${opt.val.toLocaleString('ko-KR')}원`
                            : '직접 입력'}
                        </span>
                        {opt.desc && <span className="text-gray-400">{opt.desc}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* 직접 추가 카드 */}
          <button
            type="button"
            onClick={selectCustom}
            className={`w-full p-2.5 border rounded text-left transition-all ${
              customMode
                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                : 'border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-50'
            }`}
          >
            <div className="font-bold text-sm text-blue-800">✏️ 직접 추가 (양식 X)</div>
            <div className="text-xs text-blue-600 mt-0.5">
              일회성 항목 — 항목명·단가·건수 자유 입력
            </div>
          </button>

          {/* 입력 영역 (옵션 선택 또는 직접 추가 시) */}
          {(selected || customMode) && (
            <div className="bg-gray-50 border border-gray-200 rounded p-3 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  항목명
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 근로소득 합산 / 4대보험 / ..."
                  autoFocus={customMode}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    단가 (원)
                  </label>
                  <Input
                    type="number"
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    placeholder="단가"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    건수
                  </label>
                  <Input
                    type="number"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    placeholder="1"
                  />
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded p-2 text-sm flex items-center">
                <span className="text-blue-700">단가 × 건수 = 가산</span>
                <span className="ml-auto font-bold text-blue-900">
                  {gain.toLocaleString('ko-KR')}원
                </span>
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
              onAdd({ name: name.trim(), val: valNum, qty: qtyNum });
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
