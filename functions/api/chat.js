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
      created_at TEXT DEFAULT (datetime('now'))
    )`)
  ]);
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

async function saveMessage(db, sessionId, role, content, userId) {
  try {
    await db.prepare(
      `INSERT INTO conversations (session_id, user_id, role, content) VALUES (?, ?, ?, ?)`
    ).bind(sessionId, userId || null, role, content).run();
  } catch (e) {
    console.error("DB saveMessage error:", e);
  }
}

// ===== 세법 법령 전체 목록 (법률 + 시행령 + 시행규칙) =====
const TAX_LAWS = [
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
          content: `사용자의 세무 질문을 분석해서 관련 법령명과 검색 키워드를 JSON으로 추출해.
반드시 아래 형식만 출력:
{"laws":["상속세및증여세법","상속세및증여세법시행령"],"keywords":["증여세","사전증여","합산"],"search_expc":true}

laws: 다음 목록에서만 선택 (최대 3개, 시행령/시행규칙도 포함): ${ALL_LAW_NAMES}
keywords: 법령 본문에서 검색할 키워드 (최대 4개)
search_expc: 예규/해석례 검색이 필요하면 true

중요: 금액 기준, 적용 범위, 계산 방법 등은 시행령에 규정되어 있으므로 반드시 시행령도 포함해.`
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
async function searchLawArticles(lawName, keywords) {
  const lawInfo = TAX_LAWS.find((l) => l.name === lawName);
  if (!lawInfo) return "";
  try {
    const searchUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=law&type=JSON&query=${encodeURIComponent(lawInfo.query)}&search=1&display=1`;
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
    const detailUrl = `https://www.law.go.kr/DRF/lawService.do?OC=test&target=law&MST=${mst}&type=JSON`;
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
    const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=expc&type=JSON&query=${encodeURIComponent(query)}&display=3`;
    const res = await fetch(url);
    const text = await res.text();
    let results = [];
    try {
      const data = JSON.parse(text);
      const items = (data.LawSearch || data).expc || (data.LawSearch || data).law || [];
      const arr = Array.isArray(items) ? items : [items];
      for (const item of arr.slice(0, 3)) {
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
    const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=prec&type=JSON&query=${encodeURIComponent(query)}&display=3`;
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
            const detailUrl = `https://www.law.go.kr/DRF/lawService.do?OC=test&target=prec&ID=${serialNum}&type=JSON`;
            const detailRes = await fetch(detailUrl);
            const detailText = await detailRes.text();
            const detailData = JSON.parse(detailText);
            const precDetail = detailData.판례정보 || detailData;
            summary = (precDetail.판례내용 || precDetail.요지 || precDetail.판시사항 || "").substring(0, 300);
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
  try {
    const lawData = data.법령 || data;
    let joArray = (lawData.조문 || {}).조문단위 || [];
    if (!Array.isArray(joArray)) joArray = [joArray];
    for (const jo of joArray) {
      if (!jo) continue;
      let hangArray = jo.항 ? (Array.isArray(jo.항) ? jo.항 : [jo.항]) : [];
      if (hangArray.length > 0 && hangArray[0].항단위) hangArray = Array.isArray(hangArray[0].항단위) ? hangArray[0].항단위 : [hangArray[0].항단위];
      let fullText = `제${jo.조문번호 || ""}조(${jo.조문제목 || ""}) ${jo.조문내용 || ""}`;
      for (const hang of hangArray) { if (hang && hang.항내용) fullText += "\n" + hang.항내용; }
      if (keywords.some((kw) => fullText.includes(kw))) articles.push(fullText.substring(0, 600));
    }
  } catch {}
  return articles.slice(0, 5).join("\n\n");
}

function extractArticlesFromText(text, keywords) {
  let result = [];
  for (const kw of keywords) {
    const idx = text.indexOf(kw);
    if (idx !== -1) result.push(text.substring(Math.max(0, idx - 300), Math.min(text.length, idx + 400)));
  }
  return result.slice(0, 3).join("\n\n");
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

    // 1단계: 관련 법령 & 키워드 추출
    const { laws, keywords, search_expc } = await extractLawKeywords(question, apiKey);

    // 2단계: 법령 + 칼럼 + 예규 병렬 검색
    const lawPromises = (laws || []).slice(0, 3).map((lawName) =>
      searchLawArticles(lawName, keywords || []).then((a) => a ? `\n\n[${lawName}]\n${a}` : "")
    );
    const expcPromise = search_expc ? searchTaxRulings(keywords || []) : Promise.resolve("");
    const precPromise = searchPrecedents(keywords || []);

    // 칼럼 검색
    const baseUrl = new URL(context.request.url).origin;
    const columnPromise = searchColumns(question, keywords || [], baseUrl);

    const results = await Promise.all([...lawPromises, expcPromise, precPromise, columnPromise]);
    const lawContext = results.filter(Boolean).join("");

    // 3단계: GPT 답변
    const systemPrompt = `너는 대구 달서구 세무회계 이윤의 AI 세무 상담 어시스턴트야.
세무회계 이윤은 대표세무사 이재윤이 운영하며, 주요 거래처는 음식점, 휴대폰매장, 배달업, 소매업 등 개인사업자와 중소 법인이야.

===== 절대 금지 사항 =====
- 수수료, 기장료, 조정료 금액을 절대 언급하지 마. "수수료는 사무실로 문의해 주세요"로만 안내.
- 세무사 사무실 변경/이전 관련 질문에는 답변하지 마. "사무실로 직접 연락 부탁드립니다"로만 안내.
- 다른 세무사 사무실을 추천하거나 비교하지 마.
- 거래처 정보, 고객 개인정보, 홈택스 아이디/비번을 절대 물어보거나 언급하지 마.
- 컨설팅 비용, 세무조정 비용 등 구체적 금액을 말하지 마.
- 답변에 볼드체(별표 **)를 절대 사용하지 마. 강조가 필요하면 따옴표("")나 대괄호([])를 사용해.

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

[사무실 정보]
- 세무회계 이윤 대표세무사: 이재윤
- 전화: 053-269-1213
- 업무시간: 평일 09:00~18:00
- 이메일: tax_leeyun@naver.com

${lawContext ? "\n\n===== 참고 법령 조문 =====" + lawContext : "\n\n(관련 법령 조문을 찾지 못했습니다. 일반적인 세무 지식으로 답변하되, 반드시 '정확한 내용은 세무회계 이윤에 문의해 주세요'로 마무리하세요.)"}`;

    const finalMessages = [
      { role: "system", content: systemPrompt },
      ...userMessages.filter((m) => m.role !== "system"),
    ];

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
      }),
    });

    const data = await res.json();

    // DB에 대화 저장 (optional)
    if (db && data.choices && data.choices[0]) {
      try {
        await saveMessage(db, sessionId, "user", question, userId);
        await saveMessage(db, sessionId, "assistant", data.choices[0].message.content, userId);
      } catch (e) { console.error("DB save error:", e); }
    }

    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
