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
  if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
    return Response.json({ error: "image_url 필수 (http/https)" }, { status: 400 });
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
            { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
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
