import { describe, it, expect, beforeEach } from 'vitest';
import {
  addAttachments,
  removeAttachmentAt,
  clearAttachments,
  getAttachments,
  subscribeAttachments,
  initialAttachmentsState,
  type PendingAttachment,
} from './attachments-store';

beforeEach(() => clearAttachments());

const makeItem = (id: string): PendingAttachment => ({
  file: new File(['mock'], `photo${id}.jpg`, { type: 'image/jpeg' }),
  previewUrl: `blob:mock-${id}`,
});

describe('attachments-store', () => {
  it('초기 — 빈 list', () => {
    expect(initialAttachmentsState.attachments).toEqual([]);
    expect(getAttachments().attachments).toEqual([]);
  });

  it('addAttachments — 1개 추가', () => {
    addAttachments([makeItem('A')]);
    expect(getAttachments().attachments.length).toBe(1);
    expect(getAttachments().attachments[0].previewUrl).toBe('blob:mock-A');
  });

  it('addAttachments — 여러 번 추가 누적', () => {
    addAttachments([makeItem('A'), makeItem('B')]);
    addAttachments([makeItem('C')]);
    expect(getAttachments().attachments.length).toBe(3);
  });

  it('removeAttachmentAt — 인덱스로 제거 + 반환', () => {
    addAttachments([makeItem('A'), makeItem('B'), makeItem('C')]);
    const removed = removeAttachmentAt(1);
    expect(removed?.previewUrl).toBe('blob:mock-B');
    expect(getAttachments().attachments.length).toBe(2);
    expect(getAttachments().attachments[0].previewUrl).toBe('blob:mock-A');
    expect(getAttachments().attachments[1].previewUrl).toBe('blob:mock-C');
  });

  it('removeAttachmentAt — 잘못된 인덱스 → null', () => {
    addAttachments([makeItem('A')]);
    expect(removeAttachmentAt(5)).toBeNull();
    expect(removeAttachmentAt(-1)).toBeNull();
    expect(getAttachments().attachments.length).toBe(1);
  });

  it('clearAttachments — 전체 비우고 기존 배열 반환', () => {
    addAttachments([makeItem('A'), makeItem('B')]);
    const cleared = clearAttachments();
    expect(cleared.length).toBe(2);
    expect(getAttachments().attachments).toEqual([]);
  });

  it('subscribeAttachments — 변경 알림', () => {
    let latest = getAttachments();
    const unsub = subscribeAttachments((s) => { latest = s; });
    addAttachments([makeItem('Z')]);
    expect(latest.attachments.length).toBe(1);
    unsub();
  });

  it('window.__attachmentsStore global 노출', () => {
    expect(window.__attachmentsStore).toBeDefined();
    expect(typeof window.__attachmentsStore!.add).toBe('function');
    expect(typeof window.__attachmentsStore!.removeAt).toBe('function');
    expect(typeof window.__attachmentsStore!.clear).toBe('function');
  });
});
