// 프론트엔드에 OAuth 클라이언트 ID 전달 (public 정보만)
export async function onRequestGet(context) {
  return Response.json({
    kakao_client_id: context.env.KAKAO_CLIENT_ID || "",
    // 네이버 로그인 제거됨 (2026-04)
    naver_client_id: "",
  });
}
