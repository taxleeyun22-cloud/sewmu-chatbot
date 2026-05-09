/**
 * Phase Next-Week2 Day 3 (2026-05-09): 네이버 OAuth provider.
 */

export interface NaverProfile {
  response: {
    id: string;
    nickname?: string;
    name?: string;
    email?: string;
    mobile?: string;
    profile_image?: string;
  };
}

export const naverProvider = {
  id: 'naver',
  name: 'Naver',
  type: 'oauth' as const,
  authorization: 'https://nid.naver.com/oauth2.0/authorize',
  token: 'https://nid.naver.com/oauth2.0/token',
  userinfo: 'https://openapi.naver.com/v1/nid/me',
  profile(profile: NaverProfile) {
    const r = profile.response || ({} as NaverProfile['response']);
    return {
      id: r.id,
      name: r.nickname || r.name || null,
      email: r.email || null,
      image: r.profile_image || null,
      phone: r.mobile || null,
      real_name: r.name || null,
    };
  },
};
