export async function onRequestPost(context) {
  // 토큰 검증
  const auth = context.request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "");

  const password = context.env.SITE_PASSWORD;
  const secret = context.env.TOKEN_SECRET || "sewmu2025";

  const encoder = new TextEncoder();
  const verifyData = encoder.encode(password + secret);
  const verifyHash = await crypto.subtle.digest("SHA-256", verifyData);
  const expectedToken = Array.from(new Uint8Array(verifyHash)).map(b => b.toString(16).padStart(2, "0")).join("");

  if (token !== expectedToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // OpenAI API 호출
  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    const body = await context.request.json();

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: body.messages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    const data = await res.json();
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
