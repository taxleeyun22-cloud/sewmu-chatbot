/**
 * Phase 14 (2026-05-12): Focus trap 훅 — 모달 안에서 Tab 키 갇히게 + 닫힐 때 trigger 로 복귀.
 *
 * a11y 요구: WAI-ARIA Modal Dialog Pattern.
 * 키보드 사용자가 모달 안에서 Tab → 모달 내 elements 만 순환, 외부 페이지로 이동 X.
 * 모달 닫히면 트리거 element (모달 연 버튼) 으로 포커스 복귀.
 *
 * 사용:
 *   const trapRef = useFocusTrap(open);
 *   return open ? <div ref={trapRef}>...</div> : null;
 */
'use client';

import { useEffect, useRef } from 'react';

/** 모달 안에서 포커스 가능한 element 셀렉터 — WAI-ARIA 권장. */
const FOCUSABLE_SELECTOR = [
  'a[href]:not([disabled])',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(',');

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(active: boolean) {
  const containerRef = useRef<T | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    /* 1. 트리거 element 저장 — 모달 닫힐 때 복귀 */
    previousFocusRef.current = document.activeElement as HTMLElement;

    /* 2. 첫 포커스 가능 element 로 이동 (자동 포커스 안 됐을 때 보장) */
    const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusables.length > 0 && !container.contains(document.activeElement)) {
      focusables[0].focus();
    }

    /* 3. Tab 키 가두기 */
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const list = container!.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (list.length === 0) {
        /* 포커스 가능 element 없으면 자체 정지 */
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active2 = document.activeElement as HTMLElement;
      if (e.shiftKey) {
        /* Shift+Tab — 첫 → 마지막 wrap */
        if (active2 === first || !container!.contains(active2)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        /* Tab — 마지막 → 첫 wrap */
        if (active2 === last || !container!.contains(active2)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      /* 4. 닫힐 때 트리거로 복귀 — element 가 여전히 존재해야 */
      const prev = previousFocusRef.current;
      if (prev && document.contains(prev)) {
        try {
          prev.focus();
        } catch {
          /* element 가 disabled 등 — silent */
        }
      }
    };
  }, [active]);

  return containerRef;
}
