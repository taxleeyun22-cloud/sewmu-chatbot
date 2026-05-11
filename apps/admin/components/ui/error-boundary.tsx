/**
 * Error Boundary — React 컴포넌트 에러 잡기.
 * 구글직원 패턴: graceful degradation + error 자동 로깅.
 */
'use client';

import * as React from 'react';
import { Card, CardContent } from './card';
import { Button } from './button';

interface State {
  hasError: boolean;
  error?: Error;
}

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    /* 자동 에러 로깅 — /api/admin-error-log */
    if (typeof window !== 'undefined') {
      fetch('/api/admin-error-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'admin',
          message: error.message,
          stack: error.stack,
          url: window.location.href,
          user_agent: navigator.userAgent,
          context: info.componentStack,
        }),
      }).catch(() => {});
    }
    this.props.onError?.(error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <Card className="bg-red-50 border-red-200 max-w-md mx-auto my-4">
          <CardContent className="py-4">
            <h3 className="text-sm font-semibold text-red-800 mb-1">
              ⚠️ 오류가 발생했습니다
            </h3>
            <p className="text-xs text-red-700 mb-3 font-mono break-all">
              {this.state.error?.message || '알 수 없는 오류'}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={this.reset}>
                다시 시도
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.location.reload()}
              >
                새로고침
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}
