/**
 * Phase Next-Day28 (2026-05-11): shadcn/ui style utility.
 *
 * cn() = clsx + tailwind-merge — Tailwind class 중복 자동 해결.
 *
 * 예: cn('px-2 py-1', condition && 'px-4') → 'py-1 px-4'
 *     (단순 clsx 라면 'px-2 py-1 px-4' = px 충돌)
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
