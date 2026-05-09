/**
 * Phase Next-Day22 (2026-05-09): OAuth provider profile mapping 테스트.
 *
 * 카톡/네이버 응답 → 우리 user 모델 매핑 정확성 검증.
 * CLAUDE.md 보안 룰: 본명·연락처 정확 매핑 (오·결손 시 사장님 거래처 식별 X).
 */
import { describe, it, expect } from 'vitest';
import { kakaoProvider } from './kakao';
import { naverProvider } from './naver';

describe('kakaoProvider', () => {
  it('config — id/name/type', () => {
    expect(kakaoProvider.id).toBe('kakao');
    expect(kakaoProvider.name).toBe('Kakao');
    expect(kakaoProvider.type).toBe('oauth');
  });

  it('requested scopes include name + phone (사장님 거래처 식별)', () => {
    const scope = kakaoProvider.authorization.params.scope;
    expect(scope).toContain('phone_number');
    expect(scope).toContain('name');
    expect(scope).toContain('account_email');
  });

  describe('profile', () => {
    it('full profile maps all fields', () => {
      const r = kakaoProvider.profile({
        id: 12345678,
        kakao_account: {
          email: 'park@kakao.com',
          phone_number: '+82 10-1234-5678',
          name: '박승호',
          profile: {
            nickname: '박사장',
            profile_image_url: 'https://k.kakaocdn.net/xxx.jpg',
          },
        },
      });
      expect(r.id).toBe('12345678');
      expect(r.name).toBe('박사장');                    // nickname 우선
      expect(r.real_name).toBe('박승호');                // 실명
      expect(r.email).toBe('park@kakao.com');
      expect(r.image).toBe('https://k.kakaocdn.net/xxx.jpg');
      expect(r.phone).toBe('+82 10-1234-5678');
    });

    it('falls back to account.name when nickname missing', () => {
      const r = kakaoProvider.profile({
        id: 1,
        kakao_account: {
          name: '실명만',
        },
      });
      expect(r.name).toBe('실명만');
    });

    it('handles missing kakao_account (defensive)', () => {
      const r = kakaoProvider.profile({ id: 1 });
      expect(r.id).toBe('1');
      expect(r.name).toBeNull();
      expect(r.email).toBeNull();
      expect(r.phone).toBeNull();
      expect(r.real_name).toBeNull();
    });

    it('id is always stringified (Auth.js 표준)', () => {
      const r = kakaoProvider.profile({ id: 99999999 });
      expect(typeof r.id).toBe('string');
      expect(r.id).toBe('99999999');
    });
  });
});

describe('naverProvider', () => {
  it('config — id/name/type', () => {
    expect(naverProvider.id).toBe('naver');
    expect(naverProvider.name).toBe('Naver');
    expect(naverProvider.type).toBe('oauth');
  });

  describe('profile', () => {
    it('full response maps all fields', () => {
      const r = naverProvider.profile({
        response: {
          id: 'naver-123',
          nickname: '닉네임',
          name: '김철수',
          email: 'kim@naver.com',
          mobile: '010-1234-5678',
          profile_image: 'https://ssl.pstatic.net/xxx.jpg',
        },
      });
      expect(r.id).toBe('naver-123');
      expect(r.name).toBe('닉네임');
      expect(r.real_name).toBe('김철수');
      expect(r.email).toBe('kim@naver.com');
      expect(r.phone).toBe('010-1234-5678');
      expect(r.image).toBe('https://ssl.pstatic.net/xxx.jpg');
    });

    it('falls back to name when nickname missing', () => {
      const r = naverProvider.profile({
        response: { id: 'x', name: '본명만' },
      });
      expect(r.name).toBe('본명만');
    });

    it('handles missing response object (defensive)', () => {
      // @ts-expect-error testing defensive path
      const r = naverProvider.profile({});
      expect(r.id).toBeUndefined();
      expect(r.name).toBeNull();
      expect(r.email).toBeNull();
    });

    it('all optional fields → null defaults', () => {
      const r = naverProvider.profile({ response: { id: 'only-id' } });
      expect(r.id).toBe('only-id');
      expect(r.name).toBeNull();
      expect(r.email).toBeNull();
      expect(r.phone).toBeNull();
      expect(r.image).toBeNull();
      expect(r.real_name).toBeNull();
    });
  });
});
