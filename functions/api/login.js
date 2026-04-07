export async function onRequestPost(context) {
  const { password } = await context.request.json();
  const correctPassword = context.env.SITE_PASSWORD;

  if (!correctPassword) {
    return Response.json({ ok: false, error: "Password not configured" }, { status: 500 });
  }

  if (password === correctPassword) {
    // 간단한 토큰 생성 (비밀번호 해시 + 타임스탬프)
    const encoder = new TextEncoder();
    const data = encoder.encode(correctPassword + Date.now());
    const hash = await crypto.subtle.digest("SHA-256", data);
    const token = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");

    // 토큰을 KV 대신 간단히 env에 저장할 수 없으므로, 토큰 자체에 검증 정보 포함
    // 토큰 = SHA256(password + secret)
    const verifyData = encoder.encode(correctPassword + (context.env.TOKEN_SECRET || "sewmu2025"));
    const verifyHash = await crypto.subtle.digest("SHA-256", verifyData);
    const verifyToken = Array.from(new Uint8Array(verifyHash)).map(b => b.toString(16).padStart(2, "0")).join("");

    return Response.json({ ok: true, token: verifyToken });
  }

  return Response.json({ ok: false }, { status: 401 });
}
