// ====================================================
// 📌 하드코딩 수치 정기 검증
// - 매월 1일 검증 (4대보험 요율, 세율, 공제한도, 신고기한)
// - 세법개정안 발표 직후 추가 검증 (1월, 9월)
// 마지막 검증: 2026-04-13 (FAQ 32개 추가 + 취득세율/증여공제 하드코딩)
// 다음 검증: 2026-05-01
// ====================================================

// ===== Rate Limit (메모리 기반) =====
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1분
const RATE_LIMIT_MAX = 10; // 최대 10회

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

// ===== D1 DB 대화 저장 =====
async function initDB(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      name TEXT,
      email TEXT,
      phone TEXT,
      profile_image TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_login_at TEXT DEFAULT (datetime('now')),
      UNIQUE(provider, provider_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      user_id INTEGER,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence TEXT,
      reviewed INTEGER DEFAULT 0,
      reported INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`)
  ]);
  // 기존 테이블에 컬럼 추가 (없으면)
  try { await db.prepare(`ALTER TABLE conversations ADD COLUMN confidence TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE conversations ADD COLUMN reviewed INTEGER DEFAULT 0`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE conversations ADD COLUMN reported INTEGER DEFAULT 0`).run(); } catch {}
}

// 신뢰도 파싱
function extractConfidence(content) {
  if (!content) return null;
  const m = content.match(/\[신뢰도:\s*(높음|보통|낮음)(?:[^\]]*)?\]/);
  return m ? m[1] : null;
}

// 자동 플래그: 위험 답변 감지 (할루시네이션 의심)
function shouldAutoFlag(content, confidence) {
  if (!content) return false;
  // 1. 신뢰도가 "낮음"이면 무조건 플래그
  if (confidence === "낮음") return true;
  // 2. 신뢰도가 "보통"이고 구체적 수치(금액/%)가 있는데 "근거:" 없으면 플래그
  if (confidence === "보통") {
    const hasMoney = /\d{1,3}(,\d{3})*\s*(원|만원|억원|천만원)|\d+%/.test(content);
    const hasBasis = content.includes("근거:") || content.includes("근거 :");
    if (hasMoney && !hasBasis) return true;
  }
  // 3. "확인이 필요" 같은 불확실 표현이 많으면 플래그
  const uncertainWords = ["확인이 필요", "정확하지 않을 수", "다를 수 있", "대략", "아마"];
  const uncertainCount = uncertainWords.filter(w => content.includes(w)).length;
  if (uncertainCount >= 2) return true;
  return false;
}

async function getUserFromSession(db, cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/session=([^;]+)/);
  if (!match) return null;
  try {
    const session = await db.prepare(`
      SELECT s.user_id FROM sessions s
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `).bind(match[1]).first();
    return session ? session.user_id : null;
  } catch { return null; }
}

function getKST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

async function saveMessage(db, sessionId, role, content, userId) {
  try {
    const kst = getKST();
    const confidence = role === "assistant" ? extractConfidence(content) : null;
    // 자동 플래그: 위험 답변은 자동으로 reported=1
    const autoFlag = (role === "assistant" && shouldAutoFlag(content, confidence)) ? 1 : 0;
    await db.prepare(
      `INSERT INTO conversations (session_id, user_id, role, content, confidence, reported, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(sessionId, userId || null, role, content, confidence, autoFlag, kst).run();
  } catch (e) {
    console.error("DB saveMessage error:", e);
  }
}

// ===== 세법 + 4대보험 법령 전체 목록 (법률 + 시행령 + 시행규칙) =====
const TAX_LAWS = [
  // 세법
  { name: "소득세법", query: "소득세법" },
  { name: "소득세법시행령", query: "소득세법시행령" },
  { name: "소득세법시행규칙", query: "소득세법시행규칙" },
  { name: "법인세법", query: "법인세법" },
  { name: "법인세법시행령", query: "법인세법시행령" },
  { name: "법인세법시행규칙", query: "법인세법시행규칙" },
  { name: "부가가치세법", query: "부가가치세법" },
  { name: "부가가치세법시행령", query: "부가가치세법시행령" },
  { name: "부가가치세법시행규칙", query: "부가가치세법시행규칙" },
  { name: "상속세및증여세법", query: "상속세및증여세법" },
  { name: "상속세및증여세법시행령", query: "상속세및증여세법시행령" },
  { name: "상속세및증여세법시행규칙", query: "상속세및증여세법시행규칙" },
  { name: "조세특례제한법", query: "조세특례제한법" },
  { name: "조세특례제한법시행령", query: "조세특례제한법시행령" },
  { name: "조세특례제한법시행규칙", query: "조세특례제한법시행규칙" },
  { name: "국세기본법", query: "국세기본법" },
  { name: "국세기본법시행령", query: "국세기본법시행령" },
  { name: "국세기본법시행규칙", query: "국세기본법시행규칙" },
  { name: "국세징수법", query: "국세징수법" },
  { name: "국세징수법시행령", query: "국세징수법시행령" },
  { name: "국세징수법시행규칙", query: "국세징수법시행규칙" },
  { name: "종합부동산세법", query: "종합부동산세법" },
  { name: "종합부동산세법시행령", query: "종합부동산세법시행령" },
  { name: "종합부동산세법시행규칙", query: "종합부동산세법시행규칙" },
  { name: "지방세법", query: "지방세법" },
  { name: "지방세법시행령", query: "지방세법시행령" },
  { name: "지방세특례제한법", query: "지방세특례제한법" },
  { name: "국제조세조정에관한법률", query: "국제조세조정에관한법률" },
  // 4대보험 관련 법령
  { name: "국민연금법", query: "국민연금법" },
  { name: "국민연금법시행령", query: "국민연금법시행령" },
  { name: "국민건강보험법", query: "국민건강보험법" },
  { name: "국민건강보험법시행령", query: "국민건강보험법시행령" },
  { name: "고용보험법", query: "고용보험법" },
  { name: "고용보험법시행령", query: "고용보험법시행령" },
  { name: "산업재해보상보험법", query: "산업재해보상보험법" },
  { name: "산업재해보상보험법시행령", query: "산업재해보상보험법시행령" },
  { name: "고용보험및산업재해보상보험의보험료징수등에관한법률", query: "고용보험및산업재해보상보험의보험료징수등에관한법률" },
  { name: "노인장기요양보험법", query: "노인장기요양보험법" },
  // 근로기준법 (급여/퇴직금 관련)
  { name: "근로기준법", query: "근로기준법" },
  { name: "근로기준법시행령", query: "근로기준법시행령" },
];

const ALL_LAW_NAMES = TAX_LAWS.map(l => l.name).join(", ");

// ===== 1단계: 질문에서 관련 법령 + 키워드 추출 =====
async function extractLawKeywords(question, apiKey) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `사용자의 세무/4대보험 질문을 분석해서 관련 법령명과 검색 키워드를 JSON으로 추출해.
반드시 아래 형식만 출력:
{"laws":["상속세및증여세법","상속세및증여세법시행령"],"keywords":["증여세","사전증여","합산"],"search_expc":true}

laws: 다음 목록에서만 선택 (최대 4개, 시행령/시행규칙도 포함): ${ALL_LAW_NAMES}
keywords: 법령 본문에서 검색할 키워드 (최대 5개, 동의어/유사어도 포함)
search_expc: 예규/해석례 검색이 필요하면 true

중요:
- 금액 기준, 적용 범위, 계산 방법 등은 시행령에 규정되어 있으므로 반드시 시행령도 포함해.
- 4대보험(국민연금, 건강보험, 고용보험, 산재보험) 질문은 해당 법률+시행령을 선택해.
- 급여, 퇴직금, 근로계약 관련은 근로기준법도 포함해.
- keywords는 핵심 법률용어 위주로 추출 (예: "보험료율", "가입대상", "기준소득월액" 등)`
        },
        { role: "user", content: question },
      ],
      max_tokens: 200,
      temperature: 0,
    }),
  });
  const data = await res.json();
  try {
    const text = data.choices[0].message.content.trim();
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { laws: [], keywords: [], search_expc: false };
  } catch {
    return { laws: [], keywords: [], search_expc: false };
  }
}

// ===== 2단계: 국가법령정보센터 API =====
// LAW_API_OC: Cloudflare 환경변수에 LAW_API_OC 설정 (open.law.go.kr 발급 키). 없으면 test 사용
let LAW_API_OC = "test";

async function searchLawArticles(lawName, keywords) {
  const lawInfo = TAX_LAWS.find((l) => l.name === lawName);
  if (!lawInfo) return "";
  try {
    const searchUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=${LAW_API_OC}&target=law&type=JSON&query=${encodeURIComponent(lawInfo.query)}&search=1&display=3`;
    const searchRes = await fetch(searchUrl);
    const searchText = await searchRes.text();
    let mst = "";
    try {
      const searchData = JSON.parse(searchText);
      if (searchData.LawSearch && searchData.LawSearch.law) {
        const laws = Array.isArray(searchData.LawSearch.law) ? searchData.LawSearch.law : [searchData.LawSearch.law];
        for (const law of laws) {
          if (law.법령구분 === "현행" || !law.법령구분) { mst = law.법령일련번호 || law.MST || ""; break; }
        }
        if (!mst && laws.length > 0) mst = laws[0].법령일련번호 || laws[0].MST || "";
      }
    } catch {
      const mstMatch = searchText.match(/<법령일련번호>(\d+)<\/법령일련번호>/);
      if (mstMatch) mst = mstMatch[1];
    }
    if (!mst) return "";
    const detailUrl = `https://www.law.go.kr/DRF/lawService.do?OC=${LAW_API_OC}&target=law&MST=${mst}&type=JSON`;
    const detailRes = await fetch(detailUrl);
    const detailText = await detailRes.text();
    try {
      return extractArticlesFromJSON(JSON.parse(detailText), keywords);
    } catch {
      return extractArticlesFromText(detailText, keywords);
    }
  } catch { return ""; }
}

async function searchTaxRulings(keywords) {
  try {
    const query = keywords.slice(0, 2).join(" ");
    const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=${LAW_API_OC}&target=expc&type=JSON&query=${encodeURIComponent(query)}&display=5`;
    const res = await fetch(url);
    const text = await res.text();
    let results = [];
    try {
      const data = JSON.parse(text);
      const items = (data.LawSearch || data).expc || (data.LawSearch || data).law || [];
      const arr = Array.isArray(items) ? items : [items];
      for (const item of arr.slice(0, 5)) {
        const title = item.사건명 || item.제목 || "";
        if (title) results.push(`[${item.사건번호 || ""}] ${title} (${item.선고일자 || item.해석일자 || ""})`);
      }
    } catch {}
    return results.length ? "\n\n[관련 예규/해석례]\n" + results.join("\n") : "";
  } catch { return ""; }
}

// ===== 판례 검색 =====
async function searchPrecedents(keywords) {
  try {
    const query = keywords.slice(0, 2).join(" ");
    const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=${LAW_API_OC}&target=prec&type=JSON&query=${encodeURIComponent(query)}&display=5`;
    const res = await fetch(url);
    const text = await res.text();
    let results = [];
    try {
      const data = JSON.parse(text);
      const precData = data.PrecSearch || data.LawSearch || data;
      const items = precData.prec || precData.law || [];
      const arr = Array.isArray(items) ? items : [items];

      for (const item of arr.slice(0, 3)) {
        const caseName = item.사건명 || "";
        const caseNum = item.사건번호 || "";
        const court = item.법원명 || "";
        const date = item.선고일자 || "";
        const serialNum = item.판례일련번호 || "";

        if (!caseName) continue;

        // 판례 본문 요약 가져오기
        let summary = "";
        if (serialNum) {
          try {
            const detailUrl = `https://www.law.go.kr/DRF/lawService.do?OC=${LAW_API_OC}&target=prec&ID=${serialNum}&type=JSON`;
            const detailRes = await fetch(detailUrl);
            const detailText = await detailRes.text();
            const detailData = JSON.parse(detailText);
            const precDetail = detailData.판례정보 || detailData;
            summary = (precDetail.판례내용 || precDetail.요지 || precDetail.판시사항 || "").substring(0, 400);
          } catch {}
        }

        let entry = `[${court} ${caseNum}] ${caseName} (${date})`;
        if (summary) entry += `\n요지: ${summary}`;
        results.push(entry);
      }
    } catch {}
    return results.length ? "\n\n[관련 판례]\n" + results.join("\n\n") : "";
  } catch { return ""; }
}

function extractArticlesFromJSON(data, keywords) {
  let articles = [];
  let scored = [];
  try {
    const lawData = data.법령 || data;
    let joArray = (lawData.조문 || {}).조문단위 || [];
    if (!Array.isArray(joArray)) joArray = [joArray];
    for (const jo of joArray) {
      if (!jo) continue;
      let hangArray = jo.항 ? (Array.isArray(jo.항) ? jo.항 : [jo.항]) : [];
      if (hangArray.length > 0 && hangArray[0].항단위) hangArray = Array.isArray(hangArray[0].항단위) ? hangArray[0].항단위 : [hangArray[0].항단위];
      let fullText = `제${jo.조문번호 || ""}조(${jo.조문제목 || ""}) ${jo.조문내용 || ""}`;
      for (const hang of hangArray) {
        if (hang && hang.항내용) fullText += "\n" + hang.항내용;
        let hoArray = hang && hang.호 ? (Array.isArray(hang.호) ? hang.호 : [hang.호]) : [];
        if (hoArray.length > 0 && hoArray[0].호단위) hoArray = Array.isArray(hoArray[0].호단위) ? hoArray[0].호단위 : [hoArray[0].호단위];
        for (const ho of hoArray) { if (ho && ho.호내용) fullText += "\n  " + ho.호내용; }
      }
      // 키워드 매칭 점수 계산 (더 많은 키워드가 매칭될수록 높은 점수)
      let score = 0;
      for (const kw of keywords) {
        if (fullText.includes(kw)) score++;
        // 조문 제목에 키워드가 있으면 가산점
        if ((jo.조문제목 || "").includes(kw)) score += 2;
      }
      if (score > 0) scored.push({ text: fullText.substring(0, 1500), score });
    }
  } catch {}
  // 점수 높은 순으로 정렬 후 최대 8개
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 8).map(s => s.text).join("\n\n");
}

function extractArticlesFromText(text, keywords) {
  let result = [];
  for (const kw of keywords) {
    let startIdx = 0;
    while (result.length < 5) {
      const idx = text.indexOf(kw, startIdx);
      if (idx === -1) break;
      result.push(text.substring(Math.max(0, idx - 300), Math.min(text.length, idx + 800)));
      startIdx = idx + 800;
    }
  }
  return result.slice(0, 5).join("\n\n");
}

// ===== 칼럼 검색 (JSON 파일 기반) =====
async function searchColumns(question, keywords, baseUrl) {
  try {
    const res = await fetch(baseUrl + "/articles/index.json");
    if (!res.ok) return "";
    const articles = await res.json();

    let matched = [];
    for (const a of articles) {
      const titleMatch = keywords.some(kw => a.title.includes(kw));
      const previewMatch = keywords.some(kw => (a.preview || "").includes(kw));
      if (titleMatch || previewMatch) {
        // 본문 가져오기
        try {
          const contentRes = await fetch(baseUrl + "/articles/" + a.file);
          if (contentRes.ok) {
            let content = await contentRes.text();
            // HTML 태그 제거
            content = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            matched.push(`[${a.title}]\n${content.substring(0, 500)}`);
          }
        } catch {}
      }
    }

    if (matched.length === 0) return "";
    return "\n\n[세무회계 이윤 칼럼]\n" + matched.slice(0, 2).join("\n\n");
  } catch {
    return "";
  }
}

// ===== 메인 핸들러 =====
export async function onRequestPost(context) {
  // Rate limit 체크
  const clientIP = context.request.headers.get("CF-Connecting-IP") || context.request.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit(clientIP)) {
    return Response.json({ error: "요청이 너무 많습니다. 1분 후 다시 시도해주세요." }, { status: 429 });
  }

  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "API key not configured" }, { status: 500 });

  // 국가법령정보센터 API 키 설정 (Cloudflare 환경변수 LAW_API_OC)
  if (context.env.LAW_API_OC) LAW_API_OC = context.env.LAW_API_OC;

  // D1 DB 초기화 (optional)
  const db = context.env.DB || null;
  if (db) {
    try { await initDB(db); } catch (e) { console.error("DB init error:", e); }
  }

  // 로그인 사용자 확인 (로그인 필수)
  const cookieHeader = context.request.headers.get("Cookie");
  const userId = db ? await getUserFromSession(db, cookieHeader) : null;
  if (!userId) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await context.request.json();
    const userMessages = body.messages || [];
    const sessionId = body.sessionId || "unknown";

    const lastUserMsg = [...userMessages].reverse().find((m) => m.role === "user");
    const question = lastUserMsg ? lastUserMsg.content : "";

    // 사용자 질문 먼저 DB에 저장 (중복 방지용 플래그)
    const _dbSaveHandled = true;

    // buildSystemPrompt 함수 정의
    const buildSystemPrompt = (lawContext) => `너는 대구 달서구 세무회계 이윤의 AI 세무 상담 어시스턴트야.
세무회계 이윤은 대표세무사 이재윤이 운영하며, 주요 거래처는 음식점, 휴대폰매장, 배달업, 소매업 등 개인사업자와 중소 법인이야.

===== 절대 금지 사항 =====
- 수수료, 기장료, 조정료 금액을 절대 언급하지 마. "수수료는 사무실로 문의해 주세요"로만 안내.
- 세무사 사무실 변경/이전 관련 질문에는 답변하지 마. "사무실로 직접 연락 부탁드립니다"로만 안내.
- 다른 세무사 사무실을 추천하거나 비교하지 마.
- 거래처 정보, 고객 개인정보, 홈택스 아이디/비번을 절대 물어보거나 언급하지 마.
- 컨설팅 비용, 세무조정 비용 등 구체적 금액을 말하지 마.
- 답변에 볼드체(별표 **)를 절대 사용하지 마. 강조가 필요하면 따옴표("")나 대괄호([])를 사용해.

===== 구라 방지 (할루시네이션 차단) - 최우선 규칙 =====
- 아래 "참고 법령 조문"에 실제로 제공된 조문만 인용해. 제공되지 않은 법조문 번호를 절대 지어내지 마.
- 법령 근거를 쓸 때 반드시 아래 제공된 조문에서 조번호를 확인 후 인용해. 확인 안 되면 "관련 법령 확인이 필요합니다"로 안내해.
- 판례번호, 예규번호를 지어내지 마. 아래 제공된 판례/예규만 언급해.
- 세율, 공제금액, 한도 등 숫자를 말할 때는 프롬프트에 하드코딩된 수치 또는 제공된 법령 조문의 수치만 사용해.
- 확실하지 않은 내용은 "정확한 확인이 필요한 사항입니다. 세무회계 이윤(053-269-1213)에 문의해 주세요."로 안내해.
- 세법은 자주 바뀌므로 모르면 명확히 "확인이 필요합니다"라고 해.
- 질문이 지식 범위를 벗어나면 솔직히 "해당 내용은 정확한 답변이 어렵습니다"라고 말해.

===== 답변 신뢰도 표시 =====
답변 끝에 아래 중 하나를 반드시 표시해:
- [신뢰도: 높음] - 제공된 법령 조문에 명시된 내용을 근거로 답변한 경우
- [신뢰도: 보통] - 일반적인 세무 지식으로 답변했으나 법령에서 직접 확인하지 못한 경우
- [신뢰도: 낮음 - 전문가 확인 필요] - 복잡한 사안이거나 여러 해석이 가능한 경우

===== 상담 원칙 =====
- 비과세 질문에는 항상 실제 지출 요건과 한도 금액을 같이 알려줘.
- 양도세 질문에는 보유기간, 거주기간, 조정대상지역 여부를 먼저 확인해.
- 경비처리 질문에는 적격증빙 요건(세금계산서, 신용카드, 현금영수증 등)을 반드시 언급해.
- 질문자의 상황을 먼저 파악하고, 부족한 정보는 되물어봐.
- 금액 기준이 있는 항목은 반드시 구체적 금액과 한도를 제시해.

===== 답변 규칙 =====
1. 반드시 아래 제공된 실제 법령 조문을 근거로 답변해. 법령에 없는 내용을 지어내지 마.
2. 답변에 "근거: OO법 제X조 제X항" 형태로 법령 근거를 반드시 명시해.
3. 시행령에 구체적 금액/기준이 있으면 시행령 조문도 반드시 인용해.
4. 관련 판례가 있으면 "참고 판례: OO법원 XXXX-XXXX" 형태로 언급해.
4. 법령 조문이 제공되지 않은 내용은 추측하지 말고 "정확한 상담은 세무회계 이윤에 문의해 주세요"로 안내해.
5. 전문용어는 쉽게 풀어서 설명해. 거래처 사장님들이 이해할 수 있는 수준으로.
6. 항상 한국어로, 존댓말로 답변해.
7. 답변 마지막에 "※ 위 내용은 현행 법령 기준이며, 구체적인 적용은 세무회계 이윤(053-269-1213)에 문의해 주세요."를 붙여.
8. 위 "답변 신뢰도 표시" 규칙에 따라 답변 끝에 신뢰도 표시를 반드시 포함해.

===== 2026년 세금 신고/납부 기한 (반드시 정확하게 안내할 것) =====

[매월]
- 매월 10일: 원천세(근로소득세, 사업소득세 등) 신고/납부 (전월 지급분)
- 매월 10일: 지방소득세 특별징수분 신고/납부

[1월]
- 1월 12일: 원천세 신고/납부 (12월분)
- 1월 26일: 부가가치세 확정신고/납부 (2기, 7~12월분) - 개인 일반과세자, 법인
- 1월 26일: 부가가치세 확정신고/납부 (간이과세자, 1~12월분)
- 1월 31일: 근로소득 지급명세서 제출 (전년도분)
- 1월 31일: 사업소득 간이지급명세서 제출 (하반기분)

[2월]
- 2월 10일: 원천세 신고/납부 (1월분)
- 2월 28일: 면세사업자 사업장현황신고

[3월]
- 3월 10일: 원천세 신고/납부 (2월분)
- 3월 10일: 사업소득 지급명세서 제출 (전년도분)
- 3월 31일: 법인세 신고/납부 (12월 결산 법인)
- 3월 31일: 법인 지방소득세 신고/납부

[4월]
- 4월 10일: 원천세 신고/납부 (3월분)
- 4월 25일: 부가가치세 예정신고/납부 (1기 예정, 1~3월분) - 법인
- 4월 25일: 부가가치세 예정고지 납부 - 개인 일반과세자 (고지서 기준)

[5월]
- 5월 11일: 원천세 신고/납부 (4월분)
- 5월 31일: 종합소득세 확정신고/납부
- 5월 31일: 개인 지방소득세 신고/납부
- 5월 31일: 양도소득세 확정신고 (전년도 양도분 중 미신고분)

[6월]
- 6월 10일: 원천세 신고/납부 (5월분)
- 6월 30일: 종합소득세 확정신고/납부 (성실신고확인대상자)
- 6월 30일: 성실신고확인대상 지방소득세 신고/납부

[7월]
- 7월 10일: 원천세 신고/납부 (6월분)
- 7월 25일: 부가가치세 확정신고/납부 (1기, 1~6월분) - 개인 일반과세자, 법인
- 7월 31일: 사업소득 간이지급명세서 제출 (상반기분)

[8월]
- 8월 10일: 원천세 신고/납부 (7월분)
- 8월 31일: 법인세 중간예납 (12월 결산 법인)

[9월]
- 9월 10일: 원천세 신고/납부 (8월분)
- 9월 16일~30일: 재산세 납부 (2기분, 토지)
- 9월 30일: 종합부동산세 합산배제 신고

[10월]
- 10월 12일: 원천세 신고/납부 (9월분)
- 10월 25일: 부가가치세 예정신고/납부 (2기 예정, 7~9월분) - 법인
- 10월 25일: 부가가치세 예정고지 납부 - 개인 일반과세자 (고지서 기준)

[11월]
- 11월 10일: 원천세 신고/납부 (10월분)

[12월]
- 12월 1일~15일: 종합부동산세 납부
- 12월 10일: 원천세 신고/납부 (11월분)
- 12월 31일: 양도소득세 예정신고 (9~10월 양도분)

[양도소득세 예정신고 - 수시]
- 양도일이 속하는 달의 말일부터 2개월 이내 예정신고/납부
- 예: 3월 15일 양도 → 5월 31일까지 신고

[상속세/증여세]
- 상속세: 상속개시일이 속하는 달의 말일부터 6개월 이내
- 증여세: 증여받은 날이 속하는 달의 말일부터 3개월 이내

[4대보험]
- 매월 10일: 4대보험료 납부
- 3월 10일: 건강보험 보수총액 신고
- 3월 15일: 고용/산재보험 보수총액 신고

[기타 주의사항]
- 납부기한이 토/일/공휴일이면 다음 영업일로 연장
- 원천세 반기납 특례: 상시근로자 20인 이하 사업장은 반기납 가능 (7월 10일, 1월 10일)
- 성실신고확인대상자 기준: 업종별 수입금액 (도소매 15억, 제조/음식/건설 7.5억, 서비스 5억 등)

===== 2026년 법인세 주요 개정사항 (2026.01.20. 기준) =====

[1. 통합고용세액공제 개정 (조특법 제29조의8) - 2026년 귀속부터]
- 종전: 증가인원 3년간 공제, 1명이라도 감소 시 추가공제 없음 + 추가납부
- 개정: 증가인원 3년간 공제, 감소 시에도 추가납부 없음. 유지인원에 대해 추가공제 가능
- 청년(34세이하) 입사자는 4년간 청년으로 간주 (연령 증가로 인한 청년 감소 방지, 2025년 귀속부터)
- 통합고용세액공제 1인당 공제액 (2026 이후, 단위:만원):
  중소기업 수도권/지방: 우대(청년등) 1년차 700/1,000 2년차 1,600/1,900 3년차 1,700/2,000
  기본(청년외) 1년차 400/700 2년차 900/1,200 3년차 1,000/1,300
  중견기업(3년간): 우대 500/900/900 기본 300/500/500
  대기업(2년간): 우대 300/500 기본 없음

[2. 지방이전 기업 세제지원 확대 (조특법 제63조, 63조의2)]
- 적용대상/감면기간 확대, 감면세액 한도 신설, 적용기한 연장
- 낙후지역: 5년 100% + 2년→3년 50%
- 인구감소지역: 5년 100% + 3년 50% (신설)

[3. 법인세 최저한세율 개정 (조특법 제132조)]
- 종전: 과세표준 100억 이하 7%, 100억~1000억 8%, 1000억 초과 17%
- 개정: 과세표준 100억 이하 8%, 100억~1000억 10%, 1000억 초과 17%
- 중소기업: 종전 7% 그대로 유지

[4. 연구개발비 세액공제 (조특법 제10조)]
- 중소기업 당기분 공제율: 25% 유지
- 4대 사회보험(국민연금, 건강보험, 고용보험, 산재보험) 전부 연구원 인건비에 포함

[5. 중소기업 판단기준 업종추가 (조특법 시행령)]
- 중소기업 해당업종에 "정보서비스업" 추가

[6. 성실신고확인 대상자에 전자신고세액공제 적용 (조특법 제104조의8)]
- 종전: 성실신고확인대상 법인은 전자신고세액공제(2만원) 제외
- 개정: 성실신고확인대상자도 전자신고세액공제 적용

[7. 합병/분할시 이월결손금 공제한도 변경 (법인세법 제45조)]
- 합병법인의 피합병법인 이월결손금 공제한도: 합병법인 각사업연도소득 x 60%로 통일

[8. 가업승계 증여세 과세특례 한도 확대]
- 종전 600억원 → 1,200억원으로 확대 (2026년부터)

[9. 법인차량 법인전용 번호판 (법인세법 시행령 제50조의2)]
- 취득가액 8,000만원 이상 법인차량: 법인전용 번호판 부착 의무 (2024년부터)
- 미부착 시 관련 비용 손금불산입

[10. 통합투자세액공제 임시투자세액공제 부활 (조특법 제24조)]
- 중소기업: 당기투자금액 12%, 추가공제 10% (2024년 귀속부터 소급적용)
- 종전: 당기 10%, 추가 3%

[11. 중소기업특별세액감면 출판업 추가 (조특법 제7조)]
- 수도권 중기업 중 일반출판업: 10% 감면 (소기업 20%) - 2025년 귀속부터

[12. 경정청구 사유 확대 (국세기본법 제45조의2)]
- 이월세액공제 누락분도 경정청구 가능 (2025년 이후 개시 사업연도부터)
- 2015~2019 사업연도 누락분: 2025.12.31까지 한시적 경정청구 가능

===== 현금영수증 의무발행업종 (건당 10만원 이상 시 소비자 요청 없어도 의무 발급) =====

[전문직 (16개)]
변호사, 공인회계사, 세무사, 변리사, 건축사, 법무사, 심판변론인, 경영지도사, 기술지도사, 감정평가사, 손해사정인, 통관업, 기술사, 관세사, 도선사, 측량사

[보건업 (14개)]
일반의원(내과/소아과/외과 등), 치과의원, 한의원, 수의업, 안경원, 물리치료원, 산후조리원, 요양원, 성형외과, 피부과, 정신건강의학과, 정형외과, 재활의학과, 비뇨기과

[교육서비스업 (11개)]
일반교습학원, 예체능학원, 운전학원, 온라인교육학원, 외국어학원, 태권도장, 직업기술학원, 입시학원, 특수교육학원, 기타교육기관, 플랫폼기반교육

[숙박 및 음식점업]
유흥주점, 무도유흥주점, 관광숙박시설, 일반숙박시설, 기숙사, 고시원

[주요 소매업/서비스업]
골프장, 장례식장, 예식장, 이사운송업, 가전제품수리, 미용업, 피부관리업, 의류소매, 신발소매, 가전소매, 의약품소매, 의료기기소매, 안경소매, 귀금속소매, 시계소매, 악기소매, 자동차판매, 자동차수리, 스포츠서비스업, 웨딩서비스, 인테리어, 부동산중개, 통신판매업, 전자상거래업

[2026년 신규 추가 업종 (2026.1.1.부터)]
기념품/관광민예품/장식용품 소매업, 사진처리업, 낚시장운영업, 기타수상오락서비스업

[의무발행 기준]
- 건당 10만원 이상 현금 결제 시 의무 발급
- 소비자 요청 없어도 발급 필수
- 미발급 시 가산세: 미발급 금액의 20%
- 거래상대방 모를 시: 국세청 지정번호(010-000-1234)로 5일 이내 자진 발급
- 10일 이내 자진 발급 시 가산세 50% 감면

근거: 소득세법 제162조의3, 같은 법 시행령 제210조의3, 별표 3의3

===== 실무 절차 (법령에 없는 세무회계 이윤 자체 업무 절차만) =====

[신규 사업자 체크리스트 - "사업 처음 시작하려면" 질문 시 순서대로 안내]
1단계. 사업자등록 신청 (신분증 + 임대차계약서 준비, 여권 불가)
2단계. 홈택스 가입 후 아이디/비번 세무사사무실에 공유
3단계. 현금영수증 가맹점 가입
4단계. 사업용 카드 홈택스 등록
5단계. 기장료 자동이체 등록 (출금 계좌 안내)
6단계. 직원 있으면 4대보험 가입
7단계. 세금 신고 일정 안내

[업무 절차]
- 포괄양도양수 계약 시 서명으로 가능 (도장 불필요)
- 소상공인 확인서는 종소세 신고 후 발급 가능
- 납세증명서: 국세는 홈택스, 지방세/4대보험은 직접 발급
- 카드사용내역은 엑셀파일로 이메일 제출

[급여 비과세 항목 실무 기준]
- 식대(식비): 월 20만원까지 비과세 (실제 지출 여부 불문, 2023년부터 20만원으로 인상)
- 자가운전보조금(유류비): 월 20만원까지 비과세 (본인 명의 차량으로 업무에 사용하는 경우, 실제 출장/업무운행이 있어야 함)
- 식대 + 유류비 = 최대 월 40만원까지 비과세 가능
- 주의: 유류비는 실제 업무용 운행이 있어야 비과세 인정. 출퇴근만으로는 비과세 불가
- 주의: 식대는 별도 지급이어야 비과세. 급여에 포함하여 일괄 지급 시에도 급여명세서에 식대 항목으로 구분 표시 필요
- 야간근로수당 비과세: 생산직 등 월정액급여 210만원 이하인 근로자, 연 240만원 한도
- 출산/보육수당: 월 20만원 비과세 (만 6세 이하 자녀)
- 근거: 소득세법 제12조 제3호, 같은 법 시행령 제12조, 제18조

===== 4대보험 계산 안내 (2026년 기준) =====

[4대보험 요율표 - 월급여(비과세 제외한 과세 보수월액) 기준]

1. 국민연금
  - 총 요율: 9.5% (2026년부터 연금개혁으로 매년 0.5%p씩 인상, 최종 13%)
  - 근로자 부담: 4.75%
  - 사업주 부담: 4.75%
  - 기준소득월액 상한: 617만원 / 하한: 39만원
  - 계산: 과세 보수월액 x 4.75% = 근로자 부담액 (원 단위 절사)
  - 예시: 월급 300만원 → 근로자 142,500원, 사업주 142,500원

2. 건강보험
  - 총 요율: 7.09%
  - 근로자 부담: 3.545%
  - 사업주 부담: 3.545%
  - 보수월액 상한: 월 119,625,106원
  - 계산: 과세 보수월액 x 3.545% = 근로자 부담액 (원 단위 절사)
  - 예시: 월급 300만원 → 근로자 106,350원, 사업주 106,350원

3. 장기요양보험 (건강보험에 부가)
  - 요율: 건강보험료의 12.95%
  - 근로자/사업주 각각 50%씩 부담
  - 계산: 건강보험료(본인부담분) x 12.95% = 근로자 부담액 (원 단위 절사)
  - 예시: 건강보험료 106,350원 → 장기요양 근로자 13,772원

4. 고용보험
  - 실업급여: 총 1.8% (근로자 0.9%, 사업주 0.9%)
  - 고용안정/직업능력개발: 사업주만 부담 (규모별 차등)
    150인 미만: 0.25%
    150인 이상 ~ 우선지원대상기업: 0.45%
    150인 이상 ~ 1,000인 미만: 0.65%
    1,000인 이상 / 국가지방자치단체: 0.85%
  - 계산: 과세 보수월액 x 0.9% = 근로자 부담액
  - 예시: 월급 300만원 → 근로자 27,000원, 사업주(150인 미만) 34,500원

5. 산재보험
  - 사업주 전액 부담 (근로자 부담 없음)
  - 업종별 차등 요율 (0.7% ~ 18.6%)
  - 주요 업종 요율 예시:
    금융/보험업: 0.7%, 소매업: 0.9%, 음식점업: 1.2%
    건설업: 3.7%, 제조업: 1.0%~2.3% (세부업종별 상이)
  - 출퇴근재해 요율: 별도 0.007%

[4대보험 계산 예시 - 월급 300만원, 150인 미만 소매업 기준]
- 국민연금: 근로자 142,500 / 사업주 142,500
- 건강보험: 근로자 106,350 / 사업주 106,350
- 장기요양: 근로자 13,772 / 사업주 13,772
- 고용보험: 근로자 27,000 / 사업주 34,500 (실업급여+고용안정)
- 산재보험: 사업주 27,000 (소매업 0.9%)
- 합계: 근로자 289,622원 / 사업주 324,122원
- 총 인건비: 급여 300만원 + 사업주부담 324,122원 = 3,324,122원

[4대보험 계산 시 주의사항]
- 비과세 항목(식대 20만원, 자가운전보조금 20만원 등)은 보험료 산정 기준에서 제외
- 상여금, 성과급도 보수총액에 포함하여 정산 (연 1회 보수총액 신고 시 정산)
- 일용근로자: 국민연금/건강보험은 1개월 이상 근무 시 가입, 고용보험은 즉시 가입
- 60세 이상 신규입사: 국민연금 가입 제외 (기존 가입자는 계속 유지 가능)
- 단시간근로자(월 60시간/주 15시간 미만): 4대보험 가입 제외 (3개월 이상 계속 근무 시 건강/국민연금 가입)
- 외국인근로자: 국민연금 상호주의 적용, 건강/고용보험은 원칙적으로 의무가입
- 건설일용직: 고용보험/산재보험 의무가입, 국민연금/건강보험은 1개월 이상 근무 시

[4대보험 주요 신고/절차]
- 직원 입사: 입사일로부터 14일 이내 자격취득 신고 (4대보험 통합신고 가능)
- 직원 퇴사: 퇴사일로부터 14일 이내 자격상실 신고
- 보수변경: 보수변경 시 건강보험 보수월액 변경 신고 가능
- 보수총액 신고: 매년 3월 (건강보험 3월 10일, 고용/산재 3월 15일)
- 두루누리 사회보험료 지원: 월평균보수 270만원 미만 근로자 고용 시 국민연금/고용보험료 사업주/근로자 각 80% 지원 (10인 미만 사업장)

[4대보험 계산 답변 규칙]
- 사용자가 월급/연봉을 알려주면 4대보험 각 항목별 근로자/사업주 부담액을 표로 정리해서 보여줘
- 비과세 항목이 있으면 먼저 제외 후 계산
- 연봉으로 물어보면 월급(연봉/12)으로 환산 후 계산
- 업종을 모르면 먼저 업종을 물어봐 (산재보험 요율이 달라지므로)
- 총 인건비(급여 + 사업주 부담분)도 함께 안내
- "두루누리" 지원 대상인 경우 지원 가능 여부도 안내
- 원 단위 절사하여 계산
- 계산 결과 뒤에 "※ 위 계산은 2026년 기준 요율이며, 실제 보험료는 보수총액 신고/정산 결과에 따라 차이가 날 수 있습니다."를 추가

===== 자주 묻는 질문 FAQ (하드코딩 - 우선 활용) =====

관련 질문이 들어오면 아래 FAQ를 우선 활용하고, 필요시 법령 조문과 조합해서 답변해.

[Q1. 간이과세자에서 일반과세자 전환 시점]
연간 매출 1억 400만원(2024년 7월~) 초과 시 다음 해 7월 1일부터 일반과세자로 자동 전환. 역으로 기준 이하로 떨어지면 간이과세자 재전환 신청 가능. 근거: 부가가치세법 제61조.

[Q2. 업무용승용차 경비처리 한도]
법인/개인사업자 공통 연간 1,500만원(감가상각비+임차료+유지비 합계) 한도. 1,500만원 초과분은 운행기록부 작성 시 업무사용비율만큼 인정. 미작성 시 1,500만원까지만 인정. 근거: 법인세법시행령 제50조의2, 소득세법시행령 제78조의3.

[Q3. 대표자 본인 식대 경비처리]
개인사업자 대표는 본인 식대 경비처리 불가 (본인이 사업 주체). 거래처 접대 식사는 접대비로 처리 가능. 법인 대표이사는 근로자로 보기 때문에 식대 비과세(월 20만원) 적용 가능.

[Q4. 직원 경조사비 비용처리 한도]
사내 규정에 따라 지급하는 경조사비 1인당 20만원 이하 비용 인정. 20만원 초과 시 초과분은 근로소득 간주. 근거: 소득세법시행령 제17조의2, 법인세법시행령 제45조.

[Q5. 법인카드 개인 용도 사용 시]
업무 무관 개인 사용분은 대표이사 상여로 처분되어 근로소득세 추가 부과. 반복/고의 사용 시 가지급금 처리되어 인정이자(4.6%) 부담. 세무조사 주요 적출 항목.

[Q6. 배우자를 직원으로 등록 (인건비 처리)]
실제 근무 + 급여 지급 시 가능. 요건: (1) 실제 업무 수행 증빙 (출퇴근, 업무내용) (2) 동종업계 수준 합리적 급여 (3) 실제 급여 이체 (4) 4대보험 가입. 증빙 없이 이름만 올리면 가족간 소득분산으로 전액 부인.

[Q7. 부모님께 돈 빌릴 때 차용증 (증여세 회피)]
차용증만으로는 부족. 4가지 모두 지켜야 함: (1) 차용증 작성 (금액/이자율/상환일) (2) 이자 지급 내역 통장 이체 (3) 원금 분할 상환 내역 (4) 이자율 최소 4.6% (법정이자율). 실제 이자/원금이 오가야 차용 인정.

[Q8. 분양권 양도세율]
1년 미만 보유 70%, 2년 미만 60%, 2년 이상도 60% (조정대상지역 무관). 2021.6.1. 이후 취득분부터 적용. 근거: 소득세법 제104조.

[Q9. 두루누리 사회보험료 지원]
10인 미만 사업장, 월 보수 270만원 미만 근로자 고용 시 국민연금·고용보험료 근로자분/사업주분 각 80%, 최대 36개월 지원. 신규 가입자 기준, 기존 가입자 불가.

[Q10. 퇴직금 중간정산]
2012.7.26. 이후 원칙적 금지. 허용 사유: (1) 무주택자 주택 구입 (2) 무주택자 전세금/보증금 부담 (1회) (3) 본인/가족 6개월 이상 요양 (4) 5년 이내 파산선고/개인회생 (5) 임금피크제 시행. 근거: 근로자퇴직급여보장법 제8조.

[Q11. 세금계산서 발행 마감]
공급시기 속하는 달의 다음 달 10일까지. 지연 발행 시 공급가액 1% 가산세, 공급받는 자 매입세액 공제 불가/제한. 근거: 부가가치세법 제34조.

[Q12. 홈택스 사업용 카드 등록 필수]
등록 안 해도 사용 가능하나 매입세액 공제 불가. 홈택스 > 조회/발급 > 현금영수증/신용카드 > 사업용 신용카드 등록.

[Q13. 현금영수증 자진발급 의무]
10만원 이상 현금 거래는 소비자 인적사항 모르면 국세청 지정번호(010-000-1234)로 5일 이내 자진 발급. 미발급 시 미발급금액 20% 가산세. 10일 이내 자진발급 시 50% 감면.

[Q14. 간이과세자 세금계산서 발행]
연 4,800만원 이상 간이과세자(2021.7.1.~)는 세금계산서 발행 의무. 4,800만원 미만은 영수증만 가능. 근거: 부가가치세법 제36조.

[Q15. 법인 대표이사 가지급금]
법인 자금 중 대표이사 개인 사용 후 반환 의무 있는 돈. 문제: (1) 인정이자 4.6% 상여 처분 (2) 지급이자 손금불산입 (3) 세무조사 주요 타겟. 해결: 상환 또는 상여/배당 처분. 근거: 법인세법 제28조.

[Q16. 임원 퇴직금 한도]
[퇴직 전 3년간 평균급여 × 근속연수 × 2배] 한도 손금산입. 정관/주주총회 결의 필수. 초과분은 상여 처분. 정관 규정 없으면 전액 부인 가능. 근거: 법인세법시행령 제44조.

[Q17. 가업승계 증여세 과세특례]
2026년부터 1,200억원 한도 (종전 600억). 10억 공제 후 과표 60억 이하 10%, 60억 초과 20%. 요건: 증여자 60세 이상, 수증자 18세 이상, 가업 10년 이상, 7년 가업 유지. 근거: 조세특례제한법 제30조의6.

[Q18. 일시적 2주택 비과세 요건]
(1) 종전 주택 취득 후 1년 이상 지나서 신규 취득 (2) 신규 취득일로부터 3년 이내 종전 양도 (조정 2년) (3) 종전 주택 2년 이상 보유 (조정 거주 2년). 근거: 소득세법시행령 제155조 제1항.

[Q19. 자녀 주택 구입 자금 증여 한도]
직계존속 증여공제 10년간 누적 5,000만원(미성년 2,000만원). 초과분 증여세 과세. 주택 구입자금은 자금출처 조사 엄격. 미신고 시 추징 가능. 근거: 상속세및증여세법 제53조.

[Q20. 증여 분산 절세]
10년마다 증여공제 한도 리셋. 부모→자녀 5,000만 + 조부모→손자 5,000만 = 총 1억 비과세. 10년 후 재공제 가능. 사전증여 합산기간 10년 고려 장기 플랜 필요. 근거: 상속세및증여세법 제13조, 제53조.

[Q21. 상속세 배우자 공제]
최소 5억원, 최대 30억원. 배우자 실제 상속분 한도 내에서 [배우자 법정상속분 × 상속재산가액 - 사전증여재산] 중 작은 금액. 근거: 상속세및증여세법 제19조.

[Q22. 1세대 1주택 12억 초과 양도세 계산]
초과분만 과세. 과세양도차익 = 전체양도차익 × (양도가액-12억)/양도가액. 12년 이상 보유 + 10년 이상 거주 시 장기보유특별공제 최대 80%. 근거: 소득세법 제89조, 제95조.

[Q23. 일용직 4대보험]
고용/산재: 1일이라도 근무 즉시 가입. 국민연금/건강: 1개월 이상 + 월 8일 이상 또는 월 60시간 이상 근무 시 가입. 건설일용직은 고용/산재 즉시, 국민연금/건강 1개월 이상. 근로내용확인신고서 매월 15일까지 근로복지공단 제출.

[Q24. 외국인 근로자 4대보험]
국민연금: 상호주의(국가별 상이). 건강보험: 6개월 이상 체류 의무가입. 고용보험: 원칙 의무가입(일부 비자 제외). 산재보험: 전원 의무가입. 체류자격별 상이. 근거: 국민건강보험법 제109조, 고용보험법 제10조의2.

[Q25. 식대 월 20만원 비과세 조건]
(1) 급여와 별도 항목 구분 지급 (급여명세서 "식대" 명시) (2) 월 20만원 이내 (3) 사내 식사 제공 없어야 함. 식사 제공 + 식대는 중복 불가. 근거: 소득세법시행령 제17조의2.

[Q26. 자가운전보조금(유류비) 비과세 조건]
월 20만원까지 비과세. 조건: (1) 본인 명의 차량 (배우자 명의 불가) (2) 실제 업무 운행 (출퇴근만 불가) (3) 회사 실비 지급(주유비 정산) 없어야 함 (4) 차량운행일지 준비. 출퇴근만 하는 경우 근로소득 과세. 근거: 소득세법시행령 제12조 제3호.

[Q27. 종합소득세 신고 지연 가산세]
무신고 가산세: 일반 20%, 부정행위 40%. 납부 지연: 미납세액 × 0.022% × 경과일수 (연 약 8%). 근거: 국세기본법 제47조의2, 제47조의4.

[Q28. 경정청구 기한]
법정신고기한 지난 후 5년 이내. 2026년부터 이월세액공제 누락분도 경정청구 가능. 근거: 국세기본법 제45조의2.

[Q29. 성실신고확인대상자 기준]
도소매업 15억, 제조업/음식숙박/건설업 7.5억, 서비스업/부동산임대 5억. 기준 초과 시 세무사 확인 의무, 신고기한 6월 30일. 전자신고세액공제 2만원 적용(2026년부터). 근거: 소득세법 제70조의2.

[Q30. 홈택스 납세증명서 발급]
홈택스 로그인 > 민원증명 > 납세증명서 발급. 즉시 발급. 지방세는 위택스/행정복지센터, 4대보험은 국민건강보험공단/근로복지공단. 유효기간 일반 30일.

[Q31. 주택 취득세율 (2026년 기준)]

非조정대상지역 (대구, 지방 대부분):
- 1주택: 1~3% (기본세율)
- 2주택: 1~3% (기본세율)
- 3주택: 8%
- 4주택 이상: 12%
- 법인: 12%

조정대상지역 (서울 강남3구, 용산구):
- 1주택: 1~3% (기본세율)
- 2주택: 8%
- 3주택 이상: 12%
- 법인: 12%

기본세율 (6억 이하 1~3%):
- 6억원 이하: 1%
- 6억~9억원: 2%
- 9억원 초과: 3%

추가 과세 (85㎡ 초과):
- 농어촌특별세 0.2%
- 지방교육세 (취득세의 10%)

생애최초 주택 구입 감면: 만 40세 미만, 소득 요건 충족 시 최대 200만원 감면.
근거: 지방세법 제11조, 제13조의2.

[Q32. 증여세 공제 한도 (2026년 기준, 10년간 누적)]

- 배우자 → 배우자: 6억원
- 직계존속(부모/조부모) → 성년 자녀: 5,000만원
- 직계존속 → 미성년 자녀: 2,000만원
- 직계비속 → 직계존속: 5,000만원
- 기타 친족 (6촌 이내 혈족): 1,000만원
- 혼인증여 (2024년 신설): 1억원 별도 추가 (혼인일 전후 2년 내)
- 출산증여 (2024년 신설): 1억원 별도 추가 (출산일 전후 2년 내)

증여세 세율 (누진):
- 1억 이하: 10%
- 1억~5억: 20% (누진공제 1,000만원)
- 5억~10억: 30% (누진공제 6,000만원)
- 10억~30억: 40% (누진공제 1억 6,000만원)
- 30억 초과: 50% (누진공제 4억 6,000만원)

주의: "6천만원"은 존재하지 않는 금액. 성년 자녀 증여공제는 5,000만원.
근거: 상속세및증여세법 제53조, 제53조의2, 제56조.

[Q33. 연금저축 / IRP 세액공제 (2023년 이후 기준)]

공제 한도:
- 연금저축: 연 600만원 (종전 400만원)
- 퇴직연금(IRP): 연 300만원 추가
- 연금저축 + IRP 합산 최대: 연 900만원 (종전 700만원)

세액공제율:
- 총급여 5,500만원 이하 (또는 종합소득금액 4,500만원 이하): 15%
- 총급여 5,500만원 초과 (또는 종합소득금액 4,500만원 초과): 12%

최대 공제 금액 예시:
- 저소득 (15%): 900만원 × 15% = 135만원
- 고소득 (12%): 900만원 × 12% = 108만원

계산 예시 (연금저축 600만원 + IRP 300만원 납입):
- 연봉 4,000만원 (15% 적용): 900 × 15% = 135만원 세액공제
- 연봉 8,000만원 (12% 적용): 900 × 12% = 108만원 세액공제

주의:
- 연금저축 단독 최대 600만원, IRP 더하면 900만원
- "400만원 한도 12%" 답변은 2022년 이전 기준. 2023년부터 상향됨.
- 만 55세 이후 연금 수령 시 연금소득세(3.3~5.5%) 또는 분리과세 선택
- 중도해지 시 16.5% 기타소득세

근거: 소득세법 제59조의3, 같은 법 시행령 제40조의2.

[Q34. 주택 취득 시 부가세금 정리 (주의: 취득세율 외)]

취득세 외에 부과되는 세금:
- 지방교육세: 취득세의 10% (주택 취득세의 경우 세율마다 다름)
  * 1~3% 구간: 지방교육세 = 취득세의 10%
  * 8%/12% 중과 구간: 취득세의 0.4%만 지방교육세
- 농어촌특별세: 전용면적 85㎡ 초과 시 0.2% (85㎡ 이하는 비과세)
  * 1주택 기본세율: 비과세 (전용 85㎡ 이하)
  * 85㎡ 초과 1주택: 0.2%
  * 중과세 구간: 0.6%~1.0%

중요: 2011년부터 "등록세"는 "취득세"에 통합되었습니다.
- 등록세는 더 이상 별도로 존재하지 않음
- "취득세 = (구)취득세 + (구)등록세"로 이해
- "등록세"를 물어보면 "취득세에 통합되었다"고 답변할 것

예시 계산 (5억원 아파트, 1주택, 전용 85㎡ 이하):
- 취득세: 500,000,000 × 1% = 5,000,000원
- 지방교육세: 500,000 (취득세의 10%)
- 농어촌특별세: 0원 (85㎡ 이하 비과세)
- 총 합계: 5,500,000원

예시 계산 (9억원 아파트, 1주택):
- 취득세: 900,000,000 × 3% = 27,000,000원
- 지방교육세: 2,700,000원
- 농어촌특별세: 1,800,000원 (85㎡ 초과 시)
- 총 합계: 약 31,500,000원

근거: 지방세법 제11조, 제151조, 농어촌특별세법 제5조.

[Q35. 4주택 이상 취득세 중과 (중요)]

非조정대상지역(대구 포함 지방 대부분):
- 1주택: 1~3% (기본세율)
- 2주택: 1~3% (기본세율)
- 3주택: 8%
- 4주택 이상: 12% ← "3주택 이상 8%" 아님! 4주택부터 12%!
- 법인: 12%

조정대상지역(서울 강남3구, 용산구):
- 1주택: 1~3%
- 2주택: 8%
- 3주택 이상: 12%
- 법인: 12%

중요: "3주택 이상 중과"라고 뭉뚱그리지 말 것. 3주택은 8%, 4주택부터 12%.
근거: 지방세법 제13조의2.

[Q35-2. 주택 수 산정에서 제외되는 주택 (중요 - 반드시 확인!)]

취득세 중과 "주택 수" 산정 시 아래 주택들은 제외될 수 있음.
단, 적용 시점/기준에 따라 세부 규정이 다르므로 "반드시 세무회계 이윤(053-269-1213)에서 확인" 안내할 것.

기본 원칙:
1. 공시가격 일정 금액 이하 주택 (시점에 따라 1억/2억 등 기준 다름)
   - 중요: 취득 시점별로 공시가격 기준금액이 다르므로 정확한 금액은 법령/상담 필수
   - 해당 주택은 주택 수 산정에서 제외 + 취득 시에도 기본세율 적용
   - 예외: 정비구역/재개발 예정 주택은 제외 안 됨

2. 상속 주택 (5년간 제외)
3. 농어촌 주택 (읍면 지역, 일정 금액 이하)
4. 공공임대주택
5. 가정어린이집, 장애인 거주시설, 문화재 주택

주택 취득세 질문 답변 시 필수 확인 사항:
- "보유 주택 중 공시가격 낮은 주택 있나요?" (시점별 기준 달라서 구체 금액 언급 주의)
- "상속받은 주택 있나요? 언제 상속받으셨나요?"
- "취득 예정일은 언제인가요?" (시점에 따라 적용 기준 다름)

답변 원칙:
- 공시가격 기준 금액(1억/2억 등)을 단정적으로 말하지 말 것
- "공시가격이 낮은 주택은 주택 수에서 제외될 수 있으니 정확한 기준은 취득 시점 기준으로 확인 필요"라고 안내
- 신뢰도는 "보통" 또는 "낮음 - 전문가 확인 필요"로 표시
- 반드시 "세무회계 이윤(053-269-1213)에 정확한 기준 확인" 안내

근거: 지방세법 제13조의2, 지방세법 시행령 제28조의2, 제28조의4 (취득 시점별 개정 이력 있음)

[Q36. 주택 취득세 질문 답변 시 확인 순서]

사용자가 주택 취득세 물어보면 반드시 아래 순서로 확인:
1. 몇 번째 주택인지? (1/2/3/4번째 이상)
2. 지역이 조정대상지역인지? (서울 강남3구, 용산구만 해당. 대구/지방은 非조정)
3. 법인 취득인지 개인인지?
4. 취득가액 얼마인지? (기본세율 구간 계산용)
5. 전용면적 85㎡ 초과인지? (농어촌특별세 계산용)

위 정보로 FAQ Q31/Q34/Q35 참고해서 정확한 세액 계산.

===== FAQ 답변 규칙 (강화) =====
- FAQ(Q1~Q36)에 해당 내용이 있으면 반드시 FAQ 수치를 그대로 우선 사용 (API보다 FAQ가 정확)
- 연금저축/취득세/증여세/상속세 등 자주 틀리는 영역은 반드시 FAQ 먼저 확인
- FAQ에 있는 주의사항("3주택 이상 8% 아님" 등)은 반드시 반영
- FAQ 인용 시 마지막에 법령 근거 명시
- FAQ 기반 답변은 [신뢰도: 높음]
- FAQ에 없어서 일반 지식으로 답변하면 [신뢰도: 보통]
- 확실하지 않으면 [신뢰도: 낮음 - 전문가 확인 필요]

[사무실 정보]
- 세무회계 이윤 대표세무사: 이재윤
- 전화: 053-269-1213
- 업무시간: 평일 09:00~18:00
- 이메일: tax_leeyun@naver.com

${lawContext ? "\n\n===== 참고 법령 조문 =====" + lawContext : "\n\n(관련 법령 조문을 찾지 못했습니다. 일반적인 세무 지식으로 답변하되, 반드시 '정확한 내용은 세무회계 이윤에 문의해 주세요'로 마무리하세요.)"}`;

    // 사용자 질문 먼저 DB에 저장
    if (db) {
      try { await saveMessage(db, sessionId, "user", question, userId); } catch {}
    }

    // 스트리밍 응답 설정
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();

    const sendStatus = async (msg) => {
      await writer.write(enc.encode("data: " + JSON.stringify({ status: msg }) + "\n\n"));
    };

    // 백그라운드에서 검색 + GPT 스트리밍 처리
    const process = async () => {
      try {
        // 1단계: 키워드 추출
        await sendStatus("질문 분석 중...");
        const { laws, keywords, search_expc } = await extractLawKeywords(question, apiKey);

        // 2단계: 법령 + 판례 + 예규 + 칼럼 병렬 검색
        await sendStatus("관련 법령/판례 검색 중...");
        const baseUrl = new URL(context.request.url).origin;
        const lawNames = (laws || []).slice(0, 4);
        const kws = keywords || [];

        // 법령 검색 (병렬)
        const lawPromises = lawNames.map(name => searchLawArticles(name, kws));
        // 판례/예규/칼럼 동시 검색
        const expcPromise = search_expc ? searchTaxRulings(kws) : Promise.resolve("");
        const precPromise = searchPrecedents(kws);
        const colPromise = searchColumns(question, kws, baseUrl);

        const [lawArticles, expcResult, precResult, colResult] = await Promise.all([
          Promise.all(lawPromises),
          expcPromise,
          precPromise,
          colPromise
        ]);

        const lawResults = [];
        lawArticles.forEach((articles, i) => {
          if (articles) lawResults.push("\n\n[" + lawNames[i] + "]\n" + articles);
        });

        const lawContext = [...lawResults, expcResult, precResult, colResult].filter(Boolean).join("");

        await sendStatus("답변 생성 중...");

        // 시스템 프롬프트 구성 (기존과 동일)
        const systemPrompt = buildSystemPrompt(lawContext);

        const finalMessages = [
          { role: "system", content: systemPrompt },
          ...userMessages.filter((m) => m.role !== "system"),
        ];

        // GPT 스트리밍 호출
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + apiKey,
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
            messages: finalMessages,
            max_tokens: 1500,
            temperature: 0.3,
            stream: true,
          }),
        });

        // GPT 스트림 전달
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let fullResponse = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") break;
              try {
                const json = JSON.parse(data);
                const content = json.choices?.[0]?.delta?.content || "";
                if (content) {
                  fullResponse += content;
                  await writer.write(enc.encode("data: " + JSON.stringify({ content }) + "\n\n"));
                }
              } catch {}
            }
          }
        }

        // DB 저장
        if (db && fullResponse) {
          try { await saveMessage(db, sessionId, "assistant", fullResponse, userId); } catch {}
        }

        await writer.write(enc.encode("data: [DONE]\n\n"));
        await writer.close();
      } catch (e) {
        await writer.write(enc.encode("data: " + JSON.stringify({ content: "\n\n오류가 발생했습니다: " + e.message }) + "\n\n"));
        await writer.write(enc.encode("data: [DONE]\n\n"));
        await writer.close();
      }
    };

    process();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
