// 관리자 전용: 이미지 URL 하나를 OpenAI Vision에 보내 문서 분류
// 세무사가 "🔍 AI 확인" 버튼 눌렀을 때만 호출됨 (수동·유료)
// 비용 통제: detail:'low' + max_tokens:200

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY 미설정" }, { status: 500 });

  let body = {};
  try { body = await context.request.json(); } catch {}
  const imageUrl = String(body.image_url || '').trim();
  /* 내부 프록시(/api/image?k=...) 또는 외부 http(s) 모두 허용 */
  const isInternal = /^\/api\/(image|file)\?k=/.test(imageUrl);
  const isExternal = /^https?:\/\//.test(imageUrl);
  if (!imageUrl || (!isInternal && !isExternal)) {
    return Response.json({ error: "image_url 필수 (http/https 또는 /api/image?k=)" }, { status: 400 });
  }

  /* OpenAI Vision 은 외부 접근 가능한 URL 또는 data:base64 만 수용.
     내부 프록시는 인증 쿠키 필요할 수 있어 서버에서 base64 로 변환해 전달 */
  let imgForOpenAI = imageUrl;
  if (isInternal) {
    try {
      const origin = new URL(context.request.url).origin;
      /* 내부 fetch — Workers 에서 같은 도메인 호출. 세션 쿠키 전달 */
      const cookie = context.request.headers.get('Cookie') || '';
      const ir = await fetch(origin + imageUrl, { headers: cookie ? { Cookie: cookie } : {} });
      if (!ir.ok) return Response.json({ error: "내부 이미지 접근 실패: " + ir.status }, { status: 500 });
      const ct = ir.headers.get('content-type') || 'image/jpeg';
      const buf = await ir.arrayBuffer();
      if (buf.byteLength > 8 * 1024 * 1024) return Response.json({ error: "이미지 8MB 초과 — Vision 분석 불가" }, { status: 400 });
      /* base64 인코딩 (chunk 로 call stack 회피) */
      const u8 = new Uint8Array(buf);
      let bin = '';
      const CHUNK = 32768;
      for (let i = 0; i < u8.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
      }
      const b64 = btoa(bin);
      imgForOpenAI = `data:${ct};base64,${b64}`;
    } catch (e) {
      return Response.json({ error: "이미지 변환 실패: " + e.message }, { status: 500 });
    }
  }

  const prompt = `이 이미지가 아래 중 무엇인지 판정해. JSON만 출력.

카테고리:
- receipt (영수증·카드전표·간이영수증)
- lease (임대차계약서)
- insurance (보험증권·보험청구서)
- contract (일반 계약서·계약서 스캔)
- identity (신분증·운전면허증)
- business_reg (사업자등록증)
- bank_stmt (은행 거래내역·통장 사본)
- tax_invoice (세금계산서·전자세금계산서)
- other_doc (그 외 문서류)
- photo (일반 사진 — 음식·풍경·인물)

출력 형식 (반드시 이 JSON 한 줄):
{"kind":"receipt","confidence":0.92,"summary":"식당 영수증 50,000원 (2026-04-15)"}

confidence: 0.0~1.0 / summary: 20~40자 한국어 요약`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 200,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imgForOpenAI, detail: 'low' } },
          ],
        }],
      }),
    });
    const d = await res.json();
    if (!res.ok) return Response.json({ error: d?.error?.message || 'OpenAI error' }, { status: 500 });

    const raw = d.choices?.[0]?.message?.content || '';
    let parsed = null;
    try {
      // JSON 블록만 뽑아서 파싱
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : raw);
    } catch {}
    if (!parsed || !parsed.kind) {
      return Response.json({ error: "응답 파싱 실패", raw }, { status: 500 });
    }
    const usage = d.usage || {};
    const costCents = (usage.prompt_tokens || 0) * 0.15 / 10000 + (usage.completion_tokens || 0) * 0.60 / 10000;
    return Response.json({
      ok: true,
      kind: parsed.kind,
      confidence: parsed.confidence ?? null,
      summary: parsed.summary || '',
      usage,
      cost_cents: costCents,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
