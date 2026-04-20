// OpenAI Vision 래퍼 — 문서 사진에서 구조화 필드 추출
// 사용법:
//   const { parsed, usage, raw } = await visionExtract(env, imageUrl, 'receipt');

const MODEL_DEFAULT = 'gpt-4o';

// 모델별 대략 비용 (USD per 1M tokens, 2025-04 기준 공시가)
// gpt-4o: input $2.50, output $10.00 + 이미지 추가 요금
// gpt-4o-mini: input $0.15, output $0.60
const PRICE = {
  'gpt-4o':       { in: 2.50 / 1_000_000, out: 10.00 / 1_000_000 },
  'gpt-4o-mini':  { in: 0.15 / 1_000_000, out:  0.60 / 1_000_000 },
};

// doc_type별 프롬프트 (MVP는 receipt만, 추후 확장)
const PROMPTS = {
  receipt: `이 영수증/간이영수증 이미지에서 아래 필드를 JSON으로 추출해.
{
  "doc_type": "receipt",
  "confidence": 0~1 사이 소수 (얼마나 확실한지),
  "ambiguous_fields": ["필드명", ...] (자신 없는 것들),
  "vendor": "가맹점 상호",
  "vendor_biz_no": "사업자번호 10자리 숫자 (- 제외)" or null,
  "amount": 총 결제금액 (원 단위 정수),
  "vat_amount": 부가세 (원 단위 정수) or null,
  "receipt_date": "YYYY-MM-DD" or null,
  "items": ["품목1", "품목2", ...] (최대 5개),
  "category_guess": "식비|교통비|숙박비|소모품비|접대비|통신비|공과금|임대료|기타" 중 하나
}

규칙:
- 반드시 JSON 객체 하나만 반환. 다른 말 금지.
- 영수증이 아니면 doc_type에 추정 타입(lease|payroll|tax_invoice|property_tax|insurance|utility|bank_stmt|other) 넣고 confidence 낮춰.
- 금액은 정수만 (쉼표·원 표시 제외). 인식 불가면 null.
- 날짜는 YYYY-MM-DD 정확히. 영수증에 월일만 있으면 올해로 추정.
- 한국 영수증 기준. 가맹점명은 최대한 정식 상호 기준으로.`,
};

/**
 * 이미지 URL에서 구조화 필드 추출
 * @param {object} env - Cloudflare env (OPENAI_API_KEY 필요)
 * @param {string} imageUrl - 공개 URL 또는 data URI
 * @param {string} docHint - 힌트 ('receipt' 등). 없으면 'receipt' 기본
 * @param {object} opts - { model?: string }
 * @returns {Promise<{ok:boolean, parsed?:object, usage?:object, raw?:string, error?:string, cost_cents?:number}>}
 */
export async function visionExtract(env, imageUrl, docHint, opts = {}) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY 미설정' };

  const model = opts.model || MODEL_DEFAULT;
  const prompt = PROMPTS[docHint] || PROMPTS.receipt;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        max_tokens: 700,
        temperature: 0.1,
        messages: [
          { role: 'system', content: '당신은 한국 세무 문서 판독 전문가입니다. JSON 객체 하나만 반환합니다.' },
          { role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
          ]},
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.error?.message || 'OpenAI API 오류', raw: JSON.stringify(data) };
    }

    const content = data.choices?.[0]?.message?.content || '';
    let parsed = null;
    try { parsed = JSON.parse(content); } catch (e) {
      return { ok: false, error: 'JSON 파싱 실패', raw: content };
    }

    // 필드 정규화
    if (parsed.amount != null) parsed.amount = normalizeAmount(parsed.amount);
    if (parsed.vat_amount != null) parsed.vat_amount = normalizeAmount(parsed.vat_amount);
    if (parsed.confidence == null) parsed.confidence = 0.5;
    parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    if (parsed.vendor_biz_no) parsed.vendor_biz_no = String(parsed.vendor_biz_no).replace(/\D/g, '') || null;

    // 비용 계산
    const usage = data.usage || {};
    const price = PRICE[model] || PRICE['gpt-4o'];
    const costUsd = (usage.prompt_tokens || 0) * price.in + (usage.completion_tokens || 0) * price.out;
    const cost_cents = costUsd * 100;

    return { ok: true, parsed, usage, raw: content, cost_cents, model };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function normalizeAmount(v) {
  if (typeof v === 'number') return Math.round(v);
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return isNaN(n) ? null : n;
}
