// 프론트엔드에 OAuth 클라이언트 ID 전달 (public 정보만)
export async function onRequestGet(context) {
  return Response.json({
    kakao_client_id: context.env.KAKAO_CLIENT_ID || "",
    naver_client_id: context.env.NAVER_CLIENT_ID || "",
  });
}
