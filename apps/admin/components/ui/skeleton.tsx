/**
 * shadcn/ui Skeleton — loading state placeholder.
 * 카톡스러운 부드러운 pulse 애니메이션.
 */
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-gray-200', className)}
      {...props}
    />
  );
}
