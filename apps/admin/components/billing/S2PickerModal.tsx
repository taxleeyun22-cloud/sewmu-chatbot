/**
 * Phase D4-4 (2026-05-21): S2 Picker Modal — Section 2 (활증업무) 항목 추가.
 *
 * 사장님 명령: "구글식". prompt() 폐기 → Dialog 컴포넌트.
 * Section 2 = 양식의 활증업무 (4대보험·신용카드 검토 등) 또는 직접 입력.
 *
 * 단순화 (D4-4): 새 admin 의 templateGet 에는 활증업무 list 없음 (옛 billing-preview.html
 * 의 SECTIONS s2 와 별도) → 직접 입력만 지원. 향후 templateGet 에 s2_options 추가 시 양식 선택 옵션.
 */
'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

export interface S2Item {
  name: string;
  val: number;
  qty: number;
}

export function S2PickerModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (item: S2Item) => void;
}) {
  const [name, setName] = useState('');
  const [val, setVal] = useState<string>('');
  const [qty, setQty] = useState<string>('1');

  useEffect(() => {
    if (open) {
      setName('');
      setVal('');
      setQty('1');
    }
  }, [open]);

  const valNum = parseFloat(val) || 0;
  const qtyNum = parseFloat(qty) || 1;
  const gain = valNum * qtyNum;

  const canSubmit = name.trim().length > 0 && valNum > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>📞 Section 2 항목 추가 (활증업무)</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              항목명
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 4대보험 / 신용카드 검토 / 부가세 수정신고"
              autoFocus
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
                placeholder="예: 10000"
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

          {/* 가산액 실시간 표시 */}
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-sm flex items-center">
            <span className="text-blue-700">단가 × 건수 = 가산</span>
            <span className="ml-auto font-bold text-blue-900">
              {gain.toLocaleString('ko-KR')}원
            </span>
          </div>
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
