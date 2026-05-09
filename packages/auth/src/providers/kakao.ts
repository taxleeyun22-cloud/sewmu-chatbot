/**
 * Phase Next-Week2 Day 3 (2026-05-09): 카카오 OAuth provider.
 *
 * 기존 functions/api/auth/kakao.js 마이그레이션.
 * 거래처 사장님 1순위 로그인 채널 (50~70대 多, 카톡 친숙).
 */

export interface KakaoProfile {
  id: number;
  kakao_account?: {
    email?: string;
    profile?: {
      nickname?: string;
      profile_image_url?: string;
    };
    phone_number?: string;
    name?: string;
  };
}

export const kakaoProvider = {
  id: 'kakao',
  name: 'Kakao',
  type: 'oauth' as const,
  authorization: {
    url: 'https://kauth.kakao.com/oauth/authorize',
    params: {
      response_type: 'code',
      scope: 'profile_nickname profile_image account_email phone_number name',
    },
  },
  token: 'https://kauth.kakao.com/oauth/token',
  userinfo: 'https://kapi.kakao.com/v2/user/me',
  profile(profile: KakaoProfile) {
    const acc = profile.kakao_account || {};
    return {
      id: String(profile.id),
      name: acc.profile?.nickname || acc.name || null,
      email: acc.email || null,
      image: acc.profile?.profile_image_url || null,
      phone: acc.phone_number || null,
      real_name: acc.name || null,
    };
  },
};
