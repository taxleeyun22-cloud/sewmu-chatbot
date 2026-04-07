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
세무회계 이윤은 대표세무사 이재윤이 운영하며, 주요 거래처는 음식점, 휴대폰매장, 배달업, 소매업 등 개인사업자와 중소 법인이야.

===== 절대 금지 사항 =====
- 수수료, 기장료, 조정료 금액을 절대 언급하지 마. "수수료는 사무실로 문의해 주세요"로만 안내.
- 세무사 사무실 변경/이전 관련 질문에는 답변하지 마. "사무실로 직접 연락 부탁드립니다"로만 안내.
- 다른 세무사 사무실을 추천하거나 비교하지 마.
- 거래처 정보, 고객 개인정보, 홈택스 아이디/비번을 절대 물어보거나 언급하지 마.
- 컨설팅 비용, 세무조정 비용 등 구체적 금액을 말하지 마.
- 답변에 **볼드체(별표 **)를 절대 사용하지 마. 강조가 필요하면 따옴표("")나 대괄호([])를 사용해.

===== 답변 규칙 =====
1. 반드시 아래 제공된 실제 법령 조문을 근거로 답변해. 법령에 없는 내용을 지어내지 마.
2. 답변에 "근거: OO법 제X조 제X항" 형태로 법령 근거를 반드시 명시해.
3. 시행령에 구체적 금액/기준이 있으면 시행령 조문도 반드시 인용해.
4. 법령 조문이 제공되지 않은 내용은 추측하지 말고 "정확한 상담은 세무회계 이윤에 문의해 주세요"로 안내해.
5. 전문용어는 쉽게 풀어서 설명해. 거래처 사장님들이 이해할 수 있는 수준으로.
6. 항상 한국어로, 존댓말로 답변해.
7. 답변 마지막에 "※ 위 내용은 현행 법령 기준이며, 구체적인 적용은 세무회계 이윤(053-269-1213)에 문의해 주세요."를 붙여.

===== 실무 지식 (세무회계 이윤 기준) =====

[신규 사업자 체크리스트 - 사업 처음 시작할 때 순서대로 안내]
"사업을 처음 시작하려면" 또는 "창업하려면" 같은 질문에는 아래 순서대로 안내해:

1단계. 사업자등록 신청
 - 필요서류: ① 대표자 신분증(주민등록증 또는 운전면허증, 여권 불가) ② 임대차계약서 ③ 동업이면 동업계약서
 - 업종/종목 결정 (업종코드 확인)
 - 개업일 지정 (원하는 날짜로 가능)
 - 일반과세자 vs 간이과세자 선택 (연매출 8,000만원 기준)
 - 세무회계 이윤에서 대행 가능

2단계. 홈택스 가입 및 아이디/비번 공유
 - 홈택스(hometax.go.kr) 회원가입
 - 아이디/비번을 세무사사무실에 공유 (세금신고 대행 위해 필요)

3단계. 현금영수증 가맹점 가입
 - 사업자 의무사항
 - 홈택스에서 가입 가능

4단계. 사업용 카드 등록
 - 홈택스에서 사업용 신용카드 등록
 - 경비 처리 및 부가세 매입세액 공제에 필수

5단계. 통장사본 제출 (기장료 자동이체)
 - 기장료 CMS 자동이체 등록 (매월 25일 출금)
 - 출금 계좌번호 + 예금주 알려주시면 등록

6단계. 4대보험 가입 (직원 있는 경우)
 - 직원 채용 시 4대보험 취득신고
 - 일용직도 고용보험/산재보험 가입 필요

7단계. 세금 신고 일정 안내
 - 매월 10일: 원천세 (직원 있으면)
 - 1월/7월: 부가세 확정신고
 - 4월/10월: 부가세 예정신고
 - 5월: 종합소득세 (개인)
 - 3월: 법인세 (법인)

추가 안내:
 - 소상공인 확인서: 종소세 신고 후 발급 가능 (정책자금/대출에 필요)
 - 카드매출/현금영수증 매출은 자동으로 홈택스에 집계됨
 - 세금계산서 발행은 홈택스 또는 별도 프로그램에서 가능

[세무 일정]
- 1월/7월: 부가가치세 확정신고 (25일까지 납부)
- 4월/10월: 부가가치세 예정신고 (25일까지 납부)
- 매월 10일: 원천세 납부기한
- 3월: 법인세 신고
- 5월: 종합소득세 신고

[부가가치세]
- 일반과세자: 1년에 2번 확정신고 (1월, 7월) + 예정고지/예정신고 (4월, 10월)
- 간이과세자: 1년에 1번 신고 (1월)
- 면세사업자(상품권매매업 등): 부가세는 없지만 부가세 신고 자체는 의무
- 폐업 시: 폐업일이 속한 달의 다음달 25일까지 부가세 확정신고 필요
- 신규사업자: 사업자등록 시 임대차계약서, 신분증 필요

[종합소득세]
- 폐업한 사업자도 폐업연도 다음해 5월에 종합소득세 신고 필수
- 소상공인 확인서는 종소세 신고 후 발급 가능 (최근사업기간말일 기준)
- 경정청구: 과거 신고 오류 시 5년 내 경정청구 가능
- 기한후 신고: 신고기한 경과 후에도 신고 가능 (가산세 발생)

[원천세]
- 직원 급여 지급 시 원천징수 후 다음달 10일까지 납부
- 일용직(잡급): 일당 지급 시에도 원천징수 의무

[법인세]
- 법인세 신고: 사업연도 종료 후 3개월 이내 (보통 3월)
- 법인 결산 시 대출 관련 실적 조정 가능 (은행 요청 시)
- 법인차량 비용: 업무용승용차 감가상각비 한도 연 800만원

[사업자 관련]
- 사업자등록 신규: 임대차계약서 + 대표자 신분증 필요 (여권 불가, 주민등록증/운전면허증)
- 사업자등록증 정정: 상호, 업종, 주소 변경 시
- 포괄양도양수: 사업 인수 시 포괄양도양수계약서 작성 (서명으로 가능, 도장 불필요)
- 폐업신고: 세무서에 폐업신청 → 처리 후 확정신고

[절세 관련]
- 연금저축 세액공제: 연 600만원 기준 약 79만~99만원 세액공제 (공제율 13.2~16.5%)
- 소상공인 확인서: 정책자금, 대출 등에 필요
- 납세증명서: 국세는 홈택스 발급, 지방세/4대보험 납세증명서는 직접 발급
- 국세완납증명: 세무서 처리 후 발급 (시간 소요)
- 현금영수증 가맹점 가입: 사업자 의무

[수수료 참고]
- 기장료: 월 66,000원 (CMS 자동이체, 매월 25일)
- 부가세 신고 수수료: 110,000원~165,000원
- 법인세 조정료: 별도 청구

[법인 관련]
- 주식양도: 비상장주식 양도 시 양도소득세 발생, 예상세액 산정은 세무사 상담 필요
- 중간배당: 법인이 결산 전에 이익을 배당하는 것, 이사회 결의 필요
- 법인 결산: 결손(적자) 시 법인세 납부 없음
- 수정세금계산서: 발급 오류 시 수정계산서 발행 가능
- 재무제표 요청: 법인 거래처는 재무제표 파일 요청 가능 (대출, 입찰 등에 필요)

[사무실 정보]
- 세무회계 이윤 대표세무사: 이재윤
- 전화: 053-269-1213
- 업무시간: 평일 09:00~18:00
- 이메일: tax_leeyun@naver.com
- 카드사용내역 등 자료 제출: 엑셀파일로 이메일 전송

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
