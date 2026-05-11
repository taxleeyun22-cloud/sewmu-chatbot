/**
 * shadcn/ui Avatar — 첫글자 fallback + ring + size variants.
 */
'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const avatarVariants = cva(
  'inline-flex items-center justify-center rounded-full font-semibold uppercase text-white select-none flex-shrink-0',
  {
    variants: {
      size: {
        xs: 'w-5 h-5 text-[9px]',
        sm: 'w-7 h-7 text-[10px]',
        default: 'w-9 h-9 text-xs',
        lg: 'w-12 h-12 text-sm',
        xl: 'w-16 h-16 text-base',
      },
      variant: {
        primary: 'bg-brand-primary',
        kakao: 'bg-yellow-300 text-gray-900',
        secondary: 'bg-purple-500',
        success: 'bg-green-500',
        danger: 'bg-red-500',
        neutral: 'bg-gray-400',
      },
    },
    defaultVariants: {
      size: 'default',
      variant: 'primary',
    },
  },
);

export interface AvatarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof avatarVariants> {
  name?: string | null;
  src?: string | null;
}

export function Avatar({ name, src, size, variant, className, ...props }: AvatarProps) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <div className={cn(avatarVariants({ size, variant }), className)} {...props}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name || ''} className="w-full h-full rounded-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}
