/**
 * shadcn/ui Button — 6 variants + 4 sizes.
 * Phase Next-Day28 (2026-05-11): 사장님 명령 "구글직원처럼 ㄱㄱ".
 */
'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-brand-primary text-white hover:bg-brand-primary/90',
        destructive: 'bg-brand-danger text-white hover:bg-brand-danger/90',
        outline: 'border border-gray-300 bg-white text-gray-900 hover:bg-gray-50',
        secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
        ghost: 'text-gray-900 hover:bg-gray-100',
        link: 'text-brand-primary underline-offset-4 hover:underline',
        success: 'bg-brand-success text-white hover:bg-brand-success/90',
        warning: 'bg-brand-warn text-gray-900 hover:bg-brand-warn/90',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-7 px-2.5 py-0.5 text-xs',
        xs: 'h-6 px-1.5 py-0 text-[11px]',
        lg: 'h-10 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
