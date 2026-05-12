/**
 * shadcn/ui Toast — 카톡 스타일 알림 + Phase 11 cleanup a11y.
 *
 * 사장님 명령: "카톡 UX 전방위 — 비슷한 사용감" + "구글개발자 시각".
 *
 * a11y:
 * - 각 toast: role="status" (info/success) 또는 role="alert" (error/warning)
 * - aria-live="polite" / "assertive" 분기
 * - aria-atomic="true" — 스크린리더 한 번에 읽음
 * - 키보드 ESC → 최신 toast dismiss
 * - 닫기 버튼 (X) — pointer 외 키보드 사용자 위함
 * - WCAG AA 명도 대비 (warning 텍스트 색 보강)
 *
 * 사용:
 *   import { toast } from '@/components/ui/toast';
 *   toast.success('저장 완료');
 *   toast.error('실패');
 */
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'default' | 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  duration: number;
}

type Listener = (toasts: Toast[]) => void;

class ToastStore {
  private toasts: Toast[] = [];
  private listeners: Set<Listener> = new Set();
  private nextId = 1;
  private timers: Map<number, ReturnType<typeof setTimeout>> = new Map();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) listener(this.toasts);
  }

  show(message: string, variant: ToastVariant = 'default', duration = 3000): number {
    const id = this.nextId++;
    this.toasts = [...this.toasts, { id, message, variant, duration }];
    this.notify();
    /* error 는 오래 표시 (사장님이 읽을 시간 필요) */
    const ms = variant === 'error' ? Math.max(duration, 5000) : duration;
    const t = setTimeout(() => this.dismiss(id), ms);
    this.timers.set(id, t);
    return id;
  }

  dismiss(id: number) {
    const t = this.timers.get(id);
    if (t) {
      clearTimeout(t);
      this.timers.delete(id);
    }
    this.toasts = this.toasts.filter((toast) => toast.id !== id);
    this.notify();
  }

  dismissLatest() {
    const latest = this.toasts[this.toasts.length - 1];
    if (latest) this.dismiss(latest.id);
  }

  success(msg: string, duration?: number) {
    return this.show(msg, 'success', duration);
  }
  error(msg: string, duration?: number) {
    return this.show(msg, 'error', duration);
  }
  info(msg: string, duration?: number) {
    return this.show(msg, 'info', duration);
  }
  warning(msg: string, duration?: number) {
    return this.show(msg, 'warning', duration);
  }
}

export const toast = new ToastStore();

const VARIANT_STYLES: Record<ToastVariant, string> = {
  default: 'bg-gray-900 text-white',
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-blue-600 text-white',
  /* WCAG AA: yellow-500 + gray-900 명도비 4.5:1+ 통과 (어두운 노랑 + 진한 회색) */
  warning: 'bg-amber-400 text-gray-900',
};

const VARIANT_ICONS: Record<ToastVariant, string> = {
  default: '💬',
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

function ariaRoleFor(variant: ToastVariant): 'alert' | 'status' {
  return variant === 'error' || variant === 'warning' ? 'alert' : 'status';
}

function ariaLiveFor(variant: ToastVariant): 'assertive' | 'polite' {
  return variant === 'error' || variant === 'warning' ? 'assertive' : 'polite';
}

/**
 * Toast 컨테이너 — root layout 에 한 번 mount.
 * 카톡 스타일: 화면 하단 중앙, slide-up 애니메이션, 자동 dismiss.
 */
export function Toaster() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  React.useEffect(() => toast.subscribe(setToasts), []);

  /* ESC 키 → 최신 toast 닫기 (사장님이 빨리 dismiss 하고 다음 작업 가능) */
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && toasts.length > 0) {
        toast.dismissLatest();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toasts.length]);

  return (
    <div
      aria-label="알림"
      className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 z-[99999] flex flex-col gap-2 max-w-md w-full px-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={ariaRoleFor(t.variant)}
          aria-live={ariaLiveFor(t.variant)}
          aria-atomic="true"
          className={cn(
            'pointer-events-auto rounded-lg shadow-lg px-4 py-2.5 text-sm font-medium',
            'flex items-center gap-2',
            'animate-in slide-in-from-bottom-4 fade-in duration-200',
            VARIANT_STYLES[t.variant],
          )}
        >
          <span aria-hidden="true" className="text-base leading-none">
            {VARIANT_ICONS[t.variant]}
          </span>
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            onClick={() => toast.dismiss(t.id)}
            aria-label="알림 닫기"
            className="opacity-70 hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded ml-1 px-1 text-base leading-none"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
