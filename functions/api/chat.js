// ===== 세법 법령 전체 목록 (법률 + 시행령 + 시행규칙) =====
const TAX_LAWS = [
  // 소득세
  { name: "소득세법", query: "소득세법" },
  { name: "소득세법시행령", query: "소득세법시행령" },
  { name: "소득세법시행규칙", query: "소득세법시행규칙" },
  // 법인세
  { name: "법인세법", query: "법인세법" },
  { name: "법인세법시행령", query: "법인세법시행령" },
  { name: "법인세법시행규칙", query: "법인세법시행규칙" },
  // 부가가치세
  { name: "부가가치세법", query: "부가가치세법" },
  { name: "부가가치세법시행령", query: "부가가치세법시행령" },
  { name: "부가가치세법시행규칙", query: "부가가치세법시행규칙" },
  // 상속세 및 증여세
  { name: "상속세및증여세법", query: "상속세및증여세법" },
  { name: "상속세및증여세법시행령", query: "상속세및증여세법시행령" },
  { name: "상속세및증여세법시행규칙", query: "상속세및증여세법시행규칙" },
  // 조세특례제한법
  { name: "조세특례제한법", query: "조세특례제한법" },
  { name: "조세특례제한법시행령", query: "조세특례제한법시행령" },
  { name: "조세특례제한법시행규칙", query: "조세특례제한법시행규칙" },
  // 국세기본법
  { name: "국세기본법", query: "국세기본법" },
  { name: "국세기본법시행령", query: "국세기본법시행령" },
  { name: "국세기본법시행규칙", query: "국세기본법시행규칙" },
  // 국세징수법
  { name: "국세징수법", query: "국세징수법" },
  { name: "국세징수법시행령", query: "국세징수법시행령" },
  { name: "국세징수법시행규칙", query: "국세징수법시행규칙" },
  // 종합부동산세
  { name: "종합부동산세법", query: "종합부동산세법" },
  { name: "종합부동산세법시행령", query: "종합부동산세법시행령" },
  { name: "종합부동산세법시행규칙", query: "종합부동산세법시행규칙" },
  // 지방세
  { name: "지방세법", query: "지방세법" },
  { name: "지방세법시행령", query: "지방세법시행령" },
  { name: "지방세특례제한법", query: "지방세특례제한법" },
  // 기타
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
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `사용자의 세무 질문을 분석해서 관련 법령명과 검색 키워드를 JSON으로 추출해.
반드시 아래 형식만 출력:
{"laws":["상속세및증여세법","상속세및증여세법시행령"],"keywords":["증여세","사전증여","합산"],"search_expc":true}

laws: 다음 목록에서만 선택 (최대 3개, 시행령/시행규칙도 포함): ${ALL_LAW_NAMES}
keywords: 법령 본문에서 검색할 키워드 (최대 4개)
search_expc: 예규/해석례 검색이 필요하면 true (실무 적용 기준, 금액 기준, 판단 기준 관련 질문일 때)

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

// ===== 2단계: 국가법령정보센터 API로 법령 조문 검색 =====
async function searchLawArticles(lawName, keywords) {
  const lawInfo = TAX_LAWS.find((l) => l.name === lawName);
  if (!lawInfo) return "";

  try {
    // 법령 목록 검색
    const searchUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=law&type=JSON&query=${encodeURIComponent(lawInfo.query)}&search=1&display=1`;
    const searchRes = await fetch(searchUrl);
    const searchText = await searchRes.text();

    let mst = "";
    try {
      const searchData = JSON.parse(searchText);
      if (searchData.LawSearch && searchData.LawSearch.law) {
        const laws = Array.isArray(searchData.LawSearch.law)
          ? searchData.LawSearch.law
          : [searchData.LawSearch.law];
        for (const law of laws) {
          // 현행 법령만
          if (law.법령구분 === "현행" || !law.법령구분) {
            mst = law.법령일련번호 || law.MST || "";
            break;
          }
        }
        if (!mst && laws.length > 0) {
          mst = laws[0].법령일련번호 || laws[0].MST || "";
        }
      }
    } catch {
      // XML 파싱 시도
      const mstMatch = searchText.match(/<법령일련번호>(\d+)<\/법령일련번호>/);
      if (mstMatch) mst = mstMatch[1];
    }

    if (!mst) return "";

    // 법령 본문 조회
    const detailUrl = `https://www.law.go.kr/DRF/lawService.do?OC=test&target=law&MST=${mst}&type=JSON`;
    const detailRes = await fetch(detailUrl);
    const detailText = await detailRes.text();

    let articles = "";
    try {
      const detailData = JSON.parse(detailText);
      articles = extractArticlesFromJSON(detailData, keywords);
    } catch {
      articles = extractArticlesFromText(detailText, keywords);
    }

    return articles;
  } catch (e) {
    return "";
  }
}

// ===== 예규/해석례 검색 =====
async function searchTaxRulings(keywords) {
  try {
    const query = keywords.slice(0, 2).join(" ");
    const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=expc&type=JSON&query=${encodeURIComponent(query)}&display=3`;
    const res = await fetch(url);
    const text = await res.text();

    let results = [];
    try {
      const data = JSON.parse(text);
      const expcData = data.LawSearch || data;
      const items = expcData.expc || expcData.law || [];
      const arr = Array.isArray(items) ? items : [items];

      for (const item of arr.slice(0, 3)) {
        const title = item.사건명 || item.제목 || "";
        const date = item.선고일자 || item.해석일자 || "";
        const num = item.사건번호 || "";
        if (title) {
          results.push(`[${num}] ${title} (${date})`);
        }
      }
    } catch {
      // XML에서 추출
      const matches = text.match(/<사건명>([^<]+)<\/사건명>/g);
      if (matches) {
        results = matches.slice(0, 3).map((m) => m.replace(/<\/?사건명>/g, ""));
      }
    }

    if (results.length === 0) return "";
    return "\n\n[관련 예규/해석례]\n" + results.join("\n");
  } catch {
    return "";
  }
}

// ===== 조문 추출 헬퍼 =====
function extractArticlesFromJSON(data, keywords) {
  let articles = [];
  try {
    const lawData = data.법령 || data;
    const joList = lawData.조문 || {};
    let joArray = joList.조문단위 || [];
    if (!Array.isArray(joArray)) joArray = [joArray];

    for (const jo of joArray) {
      if (!jo) continue;
      const joContent = jo.조문내용 || "";
      const joNum = jo.조문번호 || "";
      const joTitle = jo.조문제목 || "";

      let hangArray = jo.항 ? (Array.isArray(jo.항) ? jo.항 : [jo.항]) : [];
      // 항단위가 있는 경우
      if (hangArray.length > 0 && hangArray[0].항단위) {
        hangArray = Array.isArray(hangArray[0].항단위) ? hangArray[0].항단위 : [hangArray[0].항단위];
      }

      let fullText = `제${joNum}조(${joTitle}) ${joContent}`;
      for (const hang of hangArray) {
        if (hang && hang.항내용) {
          fullText += "\n" + hang.항내용;
        }
      }

      // 키워드 매칭
      if (keywords.some((kw) => fullText.includes(kw))) {
        articles.push(fullText.substring(0, 600));
      }
    }
  } catch {}

  return articles.slice(0, 5).join("\n\n");
}

function extractArticlesFromText(text, keywords) {
  let result = [];
  for (const kw of keywords) {
    const idx = text.indexOf(kw);
    if (idx !== -1) {
      const start = Math.max(0, idx - 300);
      const end = Math.min(text.length, idx + 400);
      result.push(text.substring(start, end));
    }
  }
  return result.slice(0, 3).join("\n\n");
}

// ===== 메인 핸들러 =====
export async function onRequestPost(context) {
  // 토큰 검증
  const auth = context.request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "");

  const password = context.env.SITE_PASSWORD;
  const secret = context.env.TOKEN_SECRET || "sewmu2025";

  const encoder = new TextEncoder();
  const verifyData = encoder.encode(password + secret);
  const verifyHash = await crypto.subtle.digest("SHA-256", verifyData);
  const expectedToken = Array.from(new Uint8Array(verifyHash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (token !== expectedToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    const body = await context.request.json();
    const userMessages = body.messages || [];

    // 마지막 사용자 질문
    const lastUserMsg = [...userMessages].reverse().find((m) => m.role === "user");
    const question = lastUserMsg ? lastUserMsg.content : "";

    // 1단계: 관련 법령 & 키워드 추출
    const { laws, keywords, search_expc } = await extractLawKeywords(question, apiKey);

    // 2단계: 법령 조문 검색 (병렬)
    const lawPromises = (laws || []).slice(0, 3).map((lawName) =>
      searchLawArticles(lawName, keywords || []).then((articles) =>
        articles ? `\n\n[${lawName}]\n${articles}` : ""
      )
    );

    // 예규 검색 (필요시)
    const expcPromise = search_expc
      ? searchTaxRulings(keywords || [])
      : Promise.resolve("");

    const results = await Promise.all([...lawPromises, expcPromise]);
    const lawContext = results.filter(Boolean).join("");

    // 3단계: 법령 근거 기반 GPT 답변
    const systemPrompt = `너는 대구 달서구 세무회계 이윤의 AI 세무 상담 어시스턴트야.

핵심 규칙:
1. 반드시 아래 제공된 실제 법령 조문을 근거로 답변해.
2. 답변에 "근거: OO법 제X조 제X항" 형태로 법령 근거를 반드시 명시해.
3. 시행령에 구체적 금액/기준이 있으면 시행령 조문도 인용해.
4. 법령 조문이 제공되지 않은 내용은 추측하지 말고 "정확한 상담은 세무회계 이윤(054-336-0312)에 문의해 주세요"로 안내해.
5. 전문용어는 쉽게 풀어서 설명해.
6. 항상 한국어로 답변해.
7. 답변 마지막에 "※ 위 내용은 현행 법령 기준이며, 구체적인 적용은 세무회계 이윤에 문의해 주세요."를 붙여.
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
        model: "gpt-4o-mini",
        messages: finalMessages,
        max_tokens: 1500,
        temperature: 0.3,
      }),
    });

    const data = await res.json();
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
