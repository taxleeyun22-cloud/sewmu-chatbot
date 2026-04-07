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

===== 답변 규칙 =====
1. 반드시 아래 제공된 실제 법령 조문을 근거로 답변해. 법령에 없는 내용을 지어내지 마.
2. 답변에 "근거: OO법 제X조 제X항" 형태로 법령 근거를 반드시 명시해.
3. 시행령에 구체적 금액/기준이 있으면 시행령 조문도 반드시 인용해.
4. 관련 판례가 있으면 "참고 판례: OO법원 XXXX-XXXX" 형태로 언급해.
4. 법령 조문이 제공되지 않은 내용은 추측하지 말고 "정확한 상담은 세무회계 이윤에 문의해 주세요"로 안내해.
5. 전문용어는 쉽게 풀어서 설명해. 거래처 사장님들이 이해할 수 있는 수준으로.
6. 항상 한국어로, 존댓말로 답변해.
7. 답변 마지막에 "※ 위 내용은 현행 법령 기준이며, 구체적인 적용은 세무회계 이윤(053-269-1213)에 문의해 주세요."를 붙여.

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
