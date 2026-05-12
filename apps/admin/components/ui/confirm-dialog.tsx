/**
 * Phase 11 cleanup (2026-05-12): shadcn AlertDialog 패턴 — browser native `confirm()` 대체.
 *
 * 사장님 명령 "구글개발자 시각". `confirm()` 은 OS native 다이얼로그라
 * 디자인 망가짐 + a11y X + 모바일 못생김. 모든 destructive action 은 이 컴포넌트로.
 *
 * 사용 패턴 1 — promise-based imperative API (가장 쉬움):
 *   const { confirm, ConfirmDialog } = useConfirm();
 *   const ok = await confirm({
 *     title: '거절',
 *     description: `${name} 을(를) 거절할까요?`,
 *     confirmText: '거절',
 *     variant: 'destructive',
 *   });
 *   if (ok) doSetStatus('rejected');
 *
 *   // 컴포넌트 트리 어딘가에 한 번:
 *   <ConfirmDialog />
 *
 * a11y:
 * - role="alertdialog" + aria-labelledby + aria-describedby
 * - 자동 포커스 → cancel 버튼 (destructive 시 안전 default)
 * - ESC 닫기 + backdrop 클릭 닫기
 * - 키보드 Enter → confirm 액션
 */
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** confirm 버튼 라벨. default '확인' */
  confirmText?: string;
  /** cancel 버튼 라벨. default '취소' */
  cancelText?: string;
  /** destructive 면 confirm 버튼 빨강 */
  variant?: 'default' | 'destructive';
}

interface ActiveDialog extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const dialogState: {
  active: ActiveDialog | null;
  listeners: Set<(d: ActiveDialog | null) => void>;
} = {
  active: null,
  listeners: new Set(),
};

function setActive(d: ActiveDialog | null) {
  dialogState.active = d;
  for (const fn of dialogState.listeners) fn(d);
}

/**
 * imperative confirm — `await confirm({...})` 패턴.
 * 호출 전에 `<ConfirmDialog />` 가 컴포넌트 트리에 mount 되어 있어야 작동.
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    /* 이전 다이얼로그가 있으면 false 로 resolve 후 교체 */
    if (dialogState.active) {
      dialogState.active.resolve(false);
    }
    setActive({ ...options, resolve });
  });
}

export function useConfirm() {
  return { confirm, ConfirmDialog };
}

/**
 * 단일 mount — layout.tsx 또는 providers.tsx 한 곳에만 배치.
 */
export function ConfirmDialog() {
  const [active, setActiveLocal] = React.useState<ActiveDialog | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    const listener = (d: ActiveDialog | null) => setActiveLocal(d);
    dialogState.listeners.add(listener);
    return () => {
      dialogState.listeners.delete(listener);
    };
  }, []);

  /* 자동 포커스 — destructive 면 cancel 버튼 (안전 default), 아니면 confirm */
  React.useEffect(() => {
    if (active && cancelRef.current) {
      cancelRef.current.focus();
    }
  }, [active]);

  /* ESC / Enter 키 */
  React.useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function handleConfirm() {
    if (!active) return;
    active.resolve(true);
    setActive(null);
  }

  function handleCancel() {
    if (!active) return;
    active.resolve(false);
    setActive(null);
  }

  if (!active) return null;

  const titleId = 'confirm-dialog-title';
  const descId = 'confirm-dialog-desc';
  const isDestructive = active.variant === 'destructive';

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm animate-in fade-in-0"
        onClick={handleCancel}
        aria-hidden="true"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={active.description ? descId : undefined}
        className={cn(
          'fixed left-[50%] top-[50%] z-[100] w-full max-w-md translate-x-[-50%] translate-y-[-50%]',
          'rounded-lg border bg-white p-5 shadow-xl',
          'animate-in zoom-in-95 fade-in-0',
        )}
      >
        <h2 id={titleId} className="text-base font-semibold text-gray-900">
          {active.title}
        </h2>
        {active.description && (
          <p id={descId} className="mt-2 text-sm text-gray-600 whitespace-pre-line">
            {active.description}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            ref={cancelRef}
            variant="outline"
            onClick={handleCancel}
            data-testid="confirm-cancel"
          >
            {active.cancelText ?? '취소'}
          </Button>
          <Button
            variant={isDestructive ? 'destructive' : 'default'}
            onClick={handleConfirm}
            data-testid="confirm-ok"
          >
            {active.confirmText ?? '확인'}
          </Button>
        </div>
      </div>
    </>
  );
}
