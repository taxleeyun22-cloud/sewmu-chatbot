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

// 공통 프롬프트 — 문서 타입 자동 판별 + 타입별 필드 추출
// 반환 JSON 스키마는 doc_type에 따라 'extra' 내용이 달라짐 (vendor/amount 등 공통 필드는 최상위)
const PROMPT_UNIFIED = `이 한국 세무 관련 문서 이미지에서 아래 JSON을 추출해.

1단계 — 문서 종류 판별 (⚠️ 반드시 적극적으로 분류. "other"는 절대로 첫 선택이 되면 안 됨. 아래 가이드 참고):

분류 규칙 (우선순위 순):
  "receipt"       = 영수증/간이영수증/카드전표/현금영수증/POS전표 (상호+금액+날짜가 있으면 대부분 여기)
  "lease"         = 부동산 임대차 계약서 (보증금·월세·임대인·임차인 키워드)
  "insurance"     = 보험 증권/보험 계약서 (보험사·보험료·피보험자)
  "utility"       = 공과금 고지서 (한국전력/상수도/도시가스/통신사·요금)
  "property_tax"  = 자동차세/재산세/지방세 고지서 (세목·납부기한)
  "payroll"       = 근로계약서/급여명세서 (4대보험 가입 정규직 — 국민연금/건강보험 언급 있음)
  "freelancer_payment" = 프리랜서 지급 (3.3% 원천징수 — 사업소득 지급명세서, 일용직 외 프리)
  "bank_stmt"     = 은행 입출금/카드 명세 (거래내역·잔액)
  "business_reg"  = 사업자등록증 (등록번호·개업일·대표자)
  "identity"      = 신분증·주민등록등본·통장사본
  "contract"      = 외주·용역·매매 계약서 (부동산 임대 아닌)
  "tax_invoice"   = ⚠️ 종이/수기 세금계산서만 (전자 세금계산서는 홈택스에서 처리되므로 거의 없음 — 확실히 '세금계산서' 표기 있는 종이만)
  "other"         = ❌ 위 11개 중 정말 아무것도 아닐 때만. 영수증 같으면 "receipt"로.

⚠️ 분류 tie-breaking 규칙:
- 영수증 vs 세금계산서 구분 모호 → "receipt" 선호
- 영수증 vs 기타 모호 → "receipt" 선호 (실무상 영수증이 압도적)
- 어떤 업체·금액·날짜만 있고 무슨 문서인지 애매 → "receipt" 선호

2단계 — 필드 추출. JSON 스키마:
{
  "doc_type": <위 문자열 중 하나>,
  "confidence": 0~1 소수 (분류 확신도),
  "ambiguous_fields": [자신없는 필드명 배열],
  "lang": "ko"|"en"|"ja"|"other",
  "common": {
    "vendor": "상호·업체·발급처 (가장 눈에 띄는 업체명)" or null,
    "vendor_biz_no": "사업자번호 10자리 숫자 (- 제외)" or null,
    "amount": 총 금액 (원 단위 정수) or null,
    "vat_amount": 부가세 (원 단위 정수) or null,
    "date": "YYYY-MM-DD (문서 기준일, 영수일자·발급일·계약일 등)" or null
  },
  "extra": { <doc_type 별 추가 필드> }
}

doc_type별 "extra" 필드 가이드:
- receipt:      { "items": [품목], "category_guess": "식비|교통비|숙박비|소모품비|접대비|통신비|공과금|임대료|기타" }
- tax_invoice:  { "supplier": "공급자명", "supplier_biz_no": "...", "buyer": "공급받는자명", "buyer_biz_no": "...", "supply_amount": 공급가액 정수, "tax_amount": 세액 정수, "items": [품목] }
- lease:        { "lessor": "임대인", "lessee": "임차인", "property_address": "물건지 주소", "start_date": "계약시작 YYYY-MM-DD", "end_date": "계약만료 YYYY-MM-DD", "deposit": 보증금 정수, "monthly_rent": 월세 정수, "maintenance_fee": 관리비 정수 or null, "vat_included": true|false }
- payroll:      { "employee_name": "근로자명", "employer": "사업주·회사명", "start_date": "입사일 YYYY-MM-DD", "monthly_salary": 월급 정수, "work_hours": "근무시간 요약", "insurance_4": true|false (4대보험 가입) }
- insurance:    { "insurer": "보험사", "insurance_type": "보험종류 (화재/자동차/건강 등)", "policy_no": "증권번호", "contractor": "계약자", "insured": "피보험자", "premium": 보험료 정수, "payment_cycle": "annual|monthly|lump", "start_date": "...", "end_date": "..." }
- utility:      { "utility_type": "electric|water|gas|internet|phone|other", "customer_no": "고객번호", "usage": "사용량 요약", "billing_period": "사용기간", "due_date": "납부기한 YYYY-MM-DD" }
- property_tax: { "tax_name": "세목", "tax_year": "귀속연도", "due_date": "납부기한 YYYY-MM-DD", "notice_no": "고지번호" }
- bank_stmt:    { "account_no": "계좌번호 마지막 4자리만", "transaction_count": 건수 정수, "period": "조회기간" }
- business_reg: { "registration_no": "사업자번호", "business_name": "상호", "business_type": "업태", "business_category": "종목", "open_date": "개업일 YYYY-MM-DD", "representative": "대표자명", "address": "사업장 소재지" }
- identity:     { "id_type": "resident_card|driver_license|passport|bank_book", "full_name": "성명", "id_no_masked": "주민번호/계좌 마스킹 (****)", "bank_name": "은행명 (통장사본 한정)", "account_no_masked": "계좌 마스킹" }
- contract:     { "party_a": "갑", "party_b": "을", "contract_subject": "계약 목적·용역 내용", "contract_amount": 정수, "start_date": "...", "end_date": "..." }
- other:        { "raw_text_hint": "문서에서 읽히는 핵심 텍스트 한두 줄" }

규칙:
- 반드시 JSON 객체 하나만 반환. 다른 설명·주석·코드블록 금지.
- 금액은 정수만 (쉼표·원 표시·소수점 제거). 인식 불가면 null.
- 날짜는 YYYY-MM-DD 정확히. 영수증에 월일만 있으면 올해로 추정.
- 한국 세무 문서 기준. 모호하면 confidence를 0.5 이하로.
- 개인 정보(주민번호 등)는 마스킹 (앞 6자리만 or 뒤 전체 *) 해서 반환.`;

function promptFor(docHint) {
  return PROMPT_UNIFIED;
}

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
  const prompt = promptFor(docHint);

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

    // 필드 정규화: common 구조 플랫으로 펼침 (legacy 호환)
    const common = parsed.common || {};
    if (parsed.vendor == null) parsed.vendor = common.vendor || null;
    if (parsed.vendor_biz_no == null) parsed.vendor_biz_no = common.vendor_biz_no || null;
    if (parsed.amount == null) parsed.amount = common.amount != null ? common.amount : null;
    if (parsed.vat_amount == null) parsed.vat_amount = common.vat_amount != null ? common.vat_amount : null;
    if (parsed.receipt_date == null) parsed.receipt_date = common.date || null;
    if (parsed.amount != null) parsed.amount = normalizeAmount(parsed.amount);
    if (parsed.vat_amount != null) parsed.vat_amount = normalizeAmount(parsed.vat_amount);
    if (parsed.confidence == null) parsed.confidence = 0.5;
    parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    if (parsed.vendor_biz_no) parsed.vendor_biz_no = String(parsed.vendor_biz_no).replace(/\D/g, '') || null;

    // category_guess: receipt는 extra.category_guess 에 들어감
    if (parsed.category_guess == null && parsed.extra?.category_guess) {
      parsed.category_guess = parsed.extra.category_guess;
    }
    // items도 유사
    if (!parsed.items && parsed.extra?.items) parsed.items = parsed.extra.items;

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
