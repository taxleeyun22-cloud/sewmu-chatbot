/**
 * Phase 3.12 (2026-05-09): RoomAttachPreview 단위 테스트.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { RoomAttachPreview } from './RoomAttachPreview';
import {
  clearAttachments,
  addAttachments,
  getAttachments,
  type PendingAttachment,
} from '../../admin/state/attachments-store';

beforeEach(() => {
  clearAttachments();
  /* jsdom URL.revokeObjectURL polyfill */
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = vi.fn();
  }
});

afterEach(() => {
  cleanup();
});

const makeItem = (id: string): PendingAttachment => ({
  file: new File(['mock'], `photo${id}.jpg`, { type: 'image/jpeg' }),
  previewUrl: `blob:mock-${id}`,
});

describe('RoomAttachPreview', () => {
  it('빈 list → 렌더 0 (Fragment)', () => {
    const { container } = render(<RoomAttachPreview />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('첨부 1개 → img + 제거 버튼', () => {
    addAttachments([makeItem('A')]);
    const { container } = render(<RoomAttachPreview />);
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute('src')).toBe('blob:mock-A');
    const btn = container.querySelector('button[aria-label="제거"]');
    expect(btn).toBeTruthy();
  });

  it('첨부 3개 → img 3개 (순서 보존)', () => {
    addAttachments([makeItem('A'), makeItem('B'), makeItem('C')]);
    const { container } = render(<RoomAttachPreview />);
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBe(3);
    expect(imgs[0].getAttribute('src')).toBe('blob:mock-A');
    expect(imgs[2].getAttribute('src')).toBe('blob:mock-C');
  });

  it('store 변경 → 자동 re-render', () => {
    addAttachments([makeItem('A')]);
    const { container } = render(<RoomAttachPreview />);
    expect(container.querySelectorAll('img').length).toBe(1);
    act(() => {
      addAttachments([makeItem('B'), makeItem('C')]);
    });
    expect(container.querySelectorAll('img').length).toBe(3);
  });

  it('제거 버튼 클릭 → store 에서 제거', () => {
    addAttachments([makeItem('A'), makeItem('B')]);
    const { container } = render(<RoomAttachPreview />);
    expect(getAttachments().attachments.length).toBe(2);
    const btn = container.querySelectorAll('button[aria-label="제거"]')[0] as HTMLButtonElement;
    fireEvent.click(btn);
    expect(getAttachments().attachments.length).toBe(1);
    expect(getAttachments().attachments[0].previewUrl).toBe('blob:mock-B');
  });

  it('제거 후 빈 list → 컨테이너 사라짐', () => {
    addAttachments([makeItem('A')]);
    const { container } = render(<RoomAttachPreview />);
    expect(container.querySelector('img')).toBeTruthy();
    const btn = container.querySelector('button[aria-label="제거"]') as HTMLButtonElement;
    fireEvent.click(btn);
    expect(container.querySelector('img')).toBeNull();
  });
});
