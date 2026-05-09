/**
 * Phase Next-1.4 (2026-05-09): cn() utility (shadcn/ui 표준).
 *
 * Tailwind class 합치기 + 충돌 해결.
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
