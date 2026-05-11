/**
 * EmptyState — 데이터 없을 때 표시.
 * 구글직원 패턴: 명확한 아이콘 + 제목 + 설명 + action button.
 */
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title = '데이터 없음',
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-8 px-4',
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="w-12 h-12 mb-2 flex items-center justify-center text-3xl text-gray-400">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-medium text-gray-700">{title}</h3>
      {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
