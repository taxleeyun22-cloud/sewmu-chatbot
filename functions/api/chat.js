// 세법 관련 법령 목록
const TAX_LAWS = [
  { name: "소득세법", id: "002228" },
  { name: "법인세법", id: "002230" },
  { name: "부가가치세법", id: "002232" },
  { name: "상속세및증여세법", id: "002234" },
  { name: "조세특례제한법", id: "002236" },
  { name: "국세기본법", id: "002226" },
  { name: "국세징수법", id: "002227" },
  { name: "종합부동산세법", id: "008852" },
  { name: "소득세법시행령", id: "002229" },
  { name: "법인세법시행령", id: "002231" },
  { name: "부가가치세법시행령", id: "002233" },
  { name: "상속세및증여세법시행령", id: "002235" },
];

// 1단계: GPT에게 질문에서 관련 법령명과 키워드 추출 요청
async function extractLawKeywords(question, apiKey) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `사용자의 세무 질문을 분석해서 관련 법령명과 검색 키워드를 JSON으로 추출해.
반드시 아래 형식만 출력해:
{"laws":["소득세법","상속세및증여세법"],"keywords":["증여세","사전증여","합산"]}
laws는 다음 중에서만 선택: 소득세법, 법인세법, 부가가치세법, 상속세및증여세법, 조세특례제한법, 국세기본법, 국세징수법, 종합부동산세법, 소득세법시행령, 법인세법시행령, 부가가치세법시행령, 상속세및증여세법시행령
최대 2개 법령, 키워드 3개까지.`
        },
        { role: "user", content: question }
      ],
      max_tokens: 150,
      temperature: 0,
    }),
  });
  const data = await res.json();
  try {
    const text = data.choices[0].message.content.trim();
    // JSON 부분만 추출
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { laws: ["소득세법"], keywords: [] };
  } catch {
    return { laws: ["소득세법"], keywords: [] };
  }
}

// 2단계: 국가법령정보센터 API로 법령 조문 검색
async function searchLawArticles(lawName, keywords) {
  const lawInfo = TAX_LAWS.find(l => l.name === lawName);
  if (!lawInfo) return "";

  // 법령 본문 검색 (키워드로)
  const query = keywords.join(" ");
  const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=law&type=JSON&query=${encodeURIComponent(lawName)}&search=1&display=1`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    // 법령 MST 번호 가져오기
    let mst = "";
    if (data.LawSearch && data.LawSearch.law) {
      const laws = Array.isArray(data.LawSearch.law) ? data.LawSearch.law : [data.LawSearch.law];
      if (laws.length > 0) {
        mst = laws[0].법령일련번호 || laws[0].MST || "";
      }
    }

    if (!mst) return "";

    // 법령 본문 조회
    const detailUrl = `https://www.law.go.kr/DRF/lawService.do?OC=test&target=law&MST=${mst}&type=JSON`;
    const detailRes = await fetch(detailUrl);
    const detailText = await detailRes.text();

    // JSON 파싱 시도
    let detailData;
    try {
      detailData = JSON.parse(detailText);
    } catch {
      // XML일 수 있으므로 텍스트에서 조문 추출
      return extractArticlesFromText(detailText, keywords);
    }

    // 조문 내용 추출
    return extractArticlesFromJSON(detailData, keywords);
  } catch (e) {
    return "";
  }
}

function extractArticlesFromJSON(data, keywords) {
  let articles = [];
  try {
    const lawData = data.법령 || data;
    const joList = lawData.조문 || [];
    const joArray = Array.isArray(joList.조문단위) ? joList.조문단위 : (joList.조문단위 ? [joList.조문단위] : []);

    for (const jo of joArray) {
      const joContent = jo.조문내용 || "";
      const joNum = jo.조문번호 || "";
      const joTitle = jo.조문제목 || "";
      const hangList = jo.항 || [];
      const hangArray = Array.isArray(hangList.항단위) ? hangList.항단위 : (hangList.항단위 ? [hangList.항단위] : []);

      let fullText = `제${joNum}조(${joTitle}) ${joContent}`;
      for (const hang of hangArray) {
        fullText += "\n" + (hang.항내용 || "");
      }

      // 키워드 매칭
      const matched = keywords.some(kw => fullText.includes(kw));
      if (matched) {
        articles.push(fullText.substring(0, 500));
      }
    }
  } catch {}

  // 매칭된 조문이 없으면 빈 문자열
  return articles.slice(0, 5).join("\n\n");
}

function extractArticlesFromText(text, keywords) {
  let result = [];
  for (const kw of keywords) {
    const idx = text.indexOf(kw);
    if (idx !== -1) {
      const start = Math.max(0, idx - 200);
      const end = Math.min(text.length, idx + 300);
      result.push(text.substring(start, end));
    }
  }
  return result.slice(0, 3).join("\n\n");
}

// 메인 핸들러
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

  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    const body = await context.request.json();
    const userMessages = body.messages || [];

    // 마지막 사용자 질문 추출
    const lastUserMsg = [...userMessages].reverse().find(m => m.role === "user");
    const question = lastUserMsg ? lastUserMsg.content : "";

    // 1단계: 관련 법령 & 키워드 추출
    const { laws, keywords } = await extractLawKeywords(question, apiKey);

    // 2단계: 법령 조문 검색
    let lawContext = "";
    for (const lawName of laws.slice(0, 2)) {
      const articles = await searchLawArticles(lawName, keywords);
      if (articles) {
        lawContext += `\n\n[${lawName} 관련 조문]\n${articles}`;
      }
    }

    // 3단계: 법령 조문 포함한 시스템 프롬프트로 GPT 호출
    const systemPrompt = `너는 대구 달서구 세무회계 이윤의 AI 세무 상담 어시스턴트야.

중요 규칙:
1. 반드시 아래 제공된 실제 법령 조문을 근거로 답변해.
2. 답변에 반드시 "근거: OO법 제X조" 형태로 법령 근거를 명시해.
3. 법령 조문이 제공되지 않은 내용은 추측하지 말고 "정확한 상담은 세무회계 이윤에 문의해 주세요"로 안내해.
4. 전문용어는 쉽게 풀어서 설명해.
5. 항상 한국어로 답변해.
${lawContext ? "\n\n===== 참고 법령 조문 =====" + lawContext : "\n\n(관련 법령 조문을 찾지 못했습니다. 일반적인 세무 지식으로 답변하되, 반드시 '정확한 내용은 세무회계 이윤에 문의해 주세요'로 마무리하세요.)"}`;

    // 시스템 프롬프트를 교체한 메시지 배열
    const finalMessages = [
      { role: "system", content: systemPrompt },
      ...userMessages.filter(m => m.role !== "system")
    ];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
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
