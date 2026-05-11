/**
 * shadcn/ui Toast — 카톡 스타일 알림.
 * 사장님 명령: "카톡 UX 전방위 — 비슷한 사용감".
 *
 * 사용:
 *   import { toast } from '@/components/ui/toast';
 *   toast.success('저장 완료');
 *   toast.error('실패');
 *   toast.info('알림');
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

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) listener(this.toasts);
  }

  show(message: string, variant: ToastVariant = 'default', duration = 3000): number {
    const id = this.nextId++;
    this.toasts = [...this.toasts, { id, message, variant, duration }];
    this.notify();
    setTimeout(() => this.dismiss(id), duration);
    return id;
  }

  dismiss(id: number) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
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
  warning: 'bg-yellow-500 text-gray-900',
};

const VARIANT_ICONS: Record<ToastVariant, string> = {
  default: '💬',
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

/**
 * Toast 컨테이너 — root layout 에 한 번 mount.
 * 카톡 스타일: 화면 하단 중앙, slide-up 애니메이션, 자동 dismiss.
 */
export function Toaster() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  React.useEffect(() => {
    return toast.subscribe(setToasts);
  }, []);

  return (
    <div
      role="region"
      aria-label="알림"
      className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 z-[99999] flex flex-col gap-2 max-w-md w-full px-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto rounded-lg shadow-lg px-4 py-2.5 text-sm font-medium',
            'flex items-center gap-2 cursor-pointer',
            'animate-in slide-in-from-bottom-4 fade-in duration-200',
            VARIANT_STYLES[t.variant],
          )}
          onClick={() => toast.dismiss(t.id)}
        >
          <span className="text-base leading-none">{VARIANT_ICONS[t.variant]}</span>
          <span className="flex-1">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
