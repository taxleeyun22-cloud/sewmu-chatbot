// _faq.js 하드코딩 FAQ를 D1 faqs 테이블로 이관 + 임베딩 생성 (1회 실행)
// owner 전용. 재실행 가능 (기존 행 UPSERT, 변경된 FAQ만 재임베딩)

import { checkAdmin, adminUnauthorized, ownerOnly } from "./_adminAuth.js";
import { ensureFaqsTable, embed } from "./_rag.js";
import { FAQ_SECTION } from "./_faq.js";

function kst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

// FAQ_SECTION 문자열을 파싱해서 개별 Q 배열로 변환
// 포맷:
//   [Q{N}. 제목]
//   본문 1줄 이상
//   (다음 Q 또는 섹션 헤더까지)
function parseFAQs(sectionText) {
  const items = [];
  // [QN. title] 단위로 split
  const blocks = sectionText.split(/\n\[Q(\d+)\. /);
  // blocks[0]은 첫 Q 앞 헤더, 이후 [qnum, body, qnum, body, ...] 형식
  for (let i = 1; i < blocks.length; i += 2) {
    const qNumber = parseInt(blocks[i], 10);
    const rawBody = blocks[i + 1] || "";
    // rawBody 첫 줄: "제목]" , 나머지: 답변
    const firstLineEnd = rawBody.indexOf("]\n");
    if (firstLineEnd < 0) continue;
    const title = rawBody.slice(0, firstLineEnd).trim();
    let body = rawBody.slice(firstLineEnd + 2);
    // "=====" 나오면 거기서 끊기 (섹션 경계)
    const sectionCut = body.indexOf("=====");
    if (sectionCut >= 0) body = body.slice(0, sectionCut);
    body = body.trim();

    // 근거 추출 (선택)
    let law_refs = null;
    const lawMatch = body.match(/근거[::]\s*(.+?)(?:\n|$)/);
    if (lawMatch) law_refs = lawMatch[1].trim();

    items.push({
      q_number: qNumber,
      question: title,
      answer: body,
      law_refs,
    });
  }
  return items;
}

// 주제(category) 자동 분류 — 키워드 기반
function inferCategory(text) {
  const t = text;
  if (/부가세|부가가치세|간이과세|면세|세금계산서/.test(t)) return "부가세";
  if (/법인세|법인사업자|이월결손|유보소득/.test(t)) return "법인세";
  if (/종합소득세|종소세|사업소득|단순경비율|기준경비율/.test(t)) return "종소세";
  if (/양도세|양도소득|1세대|비과세요건|장기보유특별/.test(t)) return "양도세";
  if (/상속세|증여세|증여재산|상속공제|증여공제/.test(t)) return "상속/증여";
  if (/원천세|원천징수|4대보험|근로소득세/.test(t)) return "원천세";
  if (/연말정산|의료비|신용카드|교육비|기부금/.test(t)) return "연말정산";
  if (/경비|비용처리|접대비|업무용|기부/.test(t)) return "경비";
  if (/세무조사|가산세|추정|경정|심사/.test(t)) return "조사·가산";
  if (/사업자등록|폐업|휴업|개업/.test(t)) return "사업자";
  if (/노무|퇴직|급여|근로자/.test(t)) return "노무";
  return "기타";
}

export async function onRequestPost(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!auth.owner) return ownerOnly();

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB 없음" }, { status: 500 });

  const url = new URL(context.request.url);
  const force = url.searchParams.get("force") === "1"; // 재임베딩 강제

  try {
    await ensureFaqsTable(db);

    // _faq.js 파싱
    const parsed = parseFAQs(FAQ_SECTION);
    if (parsed.length === 0) return Response.json({ error: "파싱된 FAQ 없음" }, { status: 500 });

    const now = kst();
    let inserted = 0, updated = 0, embedded = 0, skipped = 0, failed = 0;
    const errors = [];

    for (const item of parsed) {
      try {
        const category = inferCategory(`${item.question}\n${item.answer}`);
        // 기존 FAQ 조회 (q_number 기준)
        const existing = await db.prepare(
          `SELECT id, question, answer, embedding FROM faqs WHERE q_number = ?`
        ).bind(item.q_number).first();

        if (existing) {
          // 내용 동일 + force 아니면 스킵
          const sameContent = existing.question === item.question && existing.answer === item.answer;
          const hasEmbedding = !!existing.embedding;
          if (sameContent && hasEmbedding && !force) { skipped++; continue; }

          // 업데이트
          await db.prepare(
            `UPDATE faqs SET category = ?, question = ?, answer = ?, law_refs = ?, updated_at = ? WHERE id = ?`
          ).bind(category, item.question, item.answer, item.law_refs, now, existing.id).run();
          updated++;

          // 내용 바뀌거나 embedding 없으면 재임베딩
          if (!sameContent || !hasEmbedding || force) {
            const vec = await embed(`${item.question}\n${item.answer}`, context.env);
            if (vec) {
              await db.prepare(`UPDATE faqs SET embedding = ? WHERE id = ?`)
                .bind(JSON.stringify(vec), existing.id).run();
              embedded++;
            }
          }
        } else {
          // 신규 INSERT
          const r = await db.prepare(
            `INSERT INTO faqs (q_number, category, question, answer, law_refs, active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
          ).bind(item.q_number, category, item.question, item.answer, item.law_refs, now, now).run();
          inserted++;

          const vec = await embed(`${item.question}\n${item.answer}`, context.env);
          if (vec) {
            await db.prepare(`UPDATE faqs SET embedding = ? WHERE id = ?`)
              .bind(JSON.stringify(vec), r.meta.last_row_id).run();
            embedded++;
          }
        }
      } catch (e) {
        failed++;
        errors.push({ q: item.q_number, err: e.message });
      }
    }

    return Response.json({
      ok: true,
      parsed_count: parsed.length,
      inserted,
      updated,
      embedded,
      skipped,
      failed,
      errors: errors.slice(0, 10),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// GET: 현재 마이그레이션 상태 (참조용)
export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  if (!auth.owner) return ownerOnly();

  const db = context.env.DB;
  if (!db) return Response.json({ error: "DB 없음" }, { status: 500 });

  try {
    await ensureFaqsTable(db);
    const total = await db.prepare(`SELECT COUNT(*) as n FROM faqs`).first();
    const embedded = await db.prepare(`SELECT COUNT(*) as n FROM faqs WHERE embedding IS NOT NULL`).first();
    const active = await db.prepare(`SELECT COUNT(*) as n FROM faqs WHERE active = 1`).first();
    const parsedCount = parseFAQs(FAQ_SECTION).length;
    return Response.json({
      db_total: total?.n || 0,
      db_embedded: embedded?.n || 0,
      db_active: active?.n || 0,
      faq_js_count: parsedCount,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
