/**
 * shadcn/ui Input — Tailwind 패턴.
 */
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-8 w-full rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs',
          /* Phase 15 dark mode — bg/border/text/placeholder 모두 dark variants */
          'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'placeholder:text-gray-400 dark:placeholder:text-gray-500',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-primary focus-visible:border-brand-primary',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
