/**
 * Phase Next-Day22 (2026-05-09): Zod schema 단위 테스트.
 *
 * API 입력 검증 — DB 들어가기 전에 잘못된 값 차단되는지.
 * CLAUDE.md 보안 룰: 모든 입력은 Zod 검증 필수.
 */
import { describe, it, expect } from 'vitest';
import {
  ChatMessageSchema,
  NewMemoSchema,
  ApprovalStatus,
  StaffRole,
  FilingType,
} from './index';

describe('ChatMessageSchema', () => {
  it('accepts valid message', () => {
    const r = ChatMessageSchema.parse({ content: '부가세 신고 기한?' });
    expect(r.content).toBe('부가세 신고 기한?');
    expect(r.session_id).toBeUndefined();
  });

  it('rejects empty content', () => {
    expect(() => ChatMessageSchema.parse({ content: '' })).toThrow();
  });

  it('rejects content over 2000 chars (DoS guard)', () => {
    const long = 'a'.repeat(2001);
    expect(() => ChatMessageSchema.parse({ content: long })).toThrow();
  });

  it('accepts exactly 2000 chars (boundary)', () => {
    const r = ChatMessageSchema.parse({ content: 'a'.repeat(2000) });
    expect(r.content.length).toBe(2000);
  });

  it('rejects non-uuid session_id', () => {
    expect(() =>
      ChatMessageSchema.parse({ content: 'hi', session_id: 'not-a-uuid' }),
    ).toThrow();
  });

  it('accepts valid uuid session_id', () => {
    const r = ChatMessageSchema.parse({
      content: 'hi',
      session_id: '11111111-2222-3333-4444-555555555555',
    });
    expect(r.session_id).toBe('11111111-2222-3333-4444-555555555555');
  });
});

describe('NewMemoSchema', () => {
  it('accepts minimal memo (content only)', () => {
    const r = NewMemoSchema.parse({ content: '부가세 신고 안내' });
    expect(r.content).toBe('부가세 신고 안내');
    expect(r.category).toBeUndefined();
  });

  it('rejects empty content', () => {
    expect(() => NewMemoSchema.parse({ content: '' })).toThrow();
  });

  it('rejects content over 5000 chars', () => {
    expect(() => NewMemoSchema.parse({ content: 'a'.repeat(5001) })).toThrow();
  });

  it('accepts all allowed categories', () => {
    const cats = ['전화', '문서', '이슈', '약속', '일반', '할 일', '거래처 정보', '완료'];
    for (const c of cats) {
      const r = NewMemoSchema.parse({ content: 'x', category: c as never });
      expect(r.category).toBe(c);
    }
  });

  it('rejects unknown category', () => {
    expect(() =>
      NewMemoSchema.parse({ content: 'x', category: '없는카테고리' as never }),
    ).toThrow();
  });

  it('rejects non-positive target_user_id', () => {
    expect(() =>
      NewMemoSchema.parse({ content: 'x', target_user_id: 0 }),
    ).toThrow();
    expect(() =>
      NewMemoSchema.parse({ content: 'x', target_user_id: -1 }),
    ).toThrow();
  });

  it('rejects non-integer target_user_id', () => {
    expect(() =>
      NewMemoSchema.parse({ content: 'x', target_user_id: 1.5 }),
    ).toThrow();
  });

  it('accepts valid YYYY-MM-DD due_date', () => {
    const r = NewMemoSchema.parse({ content: 'x', due_date: '2026-05-09' });
    expect(r.due_date).toBe('2026-05-09');
  });

  it('rejects malformed due_date', () => {
    expect(() => NewMemoSchema.parse({ content: 'x', due_date: '2026/05/09' })).toThrow();
    expect(() => NewMemoSchema.parse({ content: 'x', due_date: '5/9/26' })).toThrow();
    expect(() => NewMemoSchema.parse({ content: 'x', due_date: '20260509' })).toThrow();
  });

  it('accepts tags array', () => {
    const r = NewMemoSchema.parse({
      content: 'x',
      tags: ['부가세', '1기예정', '영수증'],
    });
    expect(r.tags).toEqual(['부가세', '1기예정', '영수증']);
  });
});

describe('ApprovalStatus', () => {
  it('accepts all CLAUDE.md statuses', () => {
    const all = [
      'pending',
      'approved_client',
      'approved_guest',
      'rejected',
      'terminated',
      'rejoined',
      'withdrawn',
      'deleted',
    ];
    for (const s of all) {
      expect(ApprovalStatus.parse(s)).toBe(s);
    }
  });

  it('rejects unknown status (typo guard)', () => {
    expect(() => ApprovalStatus.parse('approved')).toThrow();
    expect(() => ApprovalStatus.parse('PENDING')).toThrow();
    expect(() => ApprovalStatus.parse('')).toThrow();
  });
});

describe('StaffRole (RBAC 3단계)', () => {
  it('accepts owner / manager / staff', () => {
    expect(StaffRole.parse('owner')).toBe('owner');
    expect(StaffRole.parse('manager')).toBe('manager');
    expect(StaffRole.parse('staff')).toBe('staff');
  });

  it('rejects customer (별도 role)', () => {
    expect(() => StaffRole.parse('customer')).toThrow();
  });

  it('rejects unknown roles', () => {
    expect(() => StaffRole.parse('admin')).toThrow();
    expect(() => StaffRole.parse('superuser')).toThrow();
  });
});

describe('FilingType', () => {
  it('accepts all 7 Korean tax types', () => {
    const types = ['부가세', '종소세', '법인세', '원천세', '양도세', '지방세', '기타'];
    for (const t of types) {
      expect(FilingType.parse(t)).toBe(t);
    }
  });

  it('rejects English / unknown types', () => {
    expect(() => FilingType.parse('VAT')).toThrow();
    expect(() => FilingType.parse('소득세')).toThrow();
  });
});
