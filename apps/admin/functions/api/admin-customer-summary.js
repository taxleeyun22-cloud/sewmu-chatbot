// 거래처 단위 AI 요약 — user_id 기준
// 그 거래처에 속한 모든 방의 대화 + 거래처 영구 메모 + 방 단위 메모를 합쳐서 요약
//
// 수동 거래처 (방 0개) 도 동작 — 메모만 기반 요약 가능
//
// GET /api/admin-customer-summary?user_id=X&range=recent|week|month|all|custom&from=&to=
//
// 응답 형식은 admin-rooms summarizeRoom 과 동일 (summary, summary_json, message_count, ...)
// 프론트가 동일한 _renderSummaryJson 으로 렌더 가능

import { checkAdmin, adminUnauthorized } from "./_adminAuth.js";

function kst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

/* 거래처 요약 캐시 테이블 — user_id 또는 business_id 기준 + range. 24h 또는 메시지/메모 변화 시 갱신 */
async function ensureSummaryCacheTable(db){
  try{
    await db.prepare(`CREATE TABLE IF NOT EXISTS customer_summary_cache (
      scope TEXT NOT NULL,        -- 'user' | 'business'
      target_id INTEGER NOT NULL,
      range_key TEXT NOT NULL,    -- 'recent' | 'week' | 'month' | 'all'
      summary_json TEXT,
      summary_text TEXT,
      message_count INTEGER,
      memo_count INTEGER,
      generated_at TEXT,
      PRIMARY KEY (scope, target_id, range_key)
    )`).run();
  }catch(_){}
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth) return adminUnauthorized();
  const db = context.env.DB;
  const apiKey = context.env.OPENAI_API_KEY;
  if (!db) return Response.json({ error: "DB error" }, { status: 500 });

  const url = new URL(context.request.url);
  const userId = Number(url.searchParams.get("user_id") || 0);
  const businessId = Number(url.searchParams.get("business_id") || 0);
  const range = url.searchParams.get("range") || 'recent';
  const fromDate = url.searchParams.get("from") || '';
  const toDate = url.searchParams.get("to") || '';
  const cacheOnly = url.searchParams.get("cache_only") === '1';
  if (!userId && !businessId) return Response.json({ error: "user_id 또는 business_id 필요" }, { status: 400 });

  await ensureSummaryCacheTable(db);

  /* === cache_only 모드 — DB 캐시만 반환, GPT 호출 X === */
  if (cacheOnly) {
    try {
      const cached = await db.prepare(
        `SELECT summary_text, summary_json, message_count, memo_count, generated_at
           FROM customer_summary_cache
          WHERE scope = ? AND target_id = ? AND range_key = ?`
      ).bind(userId ? 'user' : 'business', userId || businessId, range).first();
      if (cached) {
        return Response.json({
          summary: cached.summary_text,
          summary_json: cached.summary_json ? JSON.parse(cached.summary_json) : null,
          message_count: cached.message_count,
          memo_count: cached.memo_count,
          generated_at: cached.generated_at,
          from_cache: true,
        });
      }
      return Response.json({ summary: null, from_cache: true, has_cache: false });
    } catch (e) {
      return Response.json({ error: 'cache lookup: ' + e.message }, { status: 500 });
    }
  }

  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY 미설정" }, { status: 500 });

  /* 1. 대상(거래처/업체) 기본 정보 */
  let customerName = '';
  let scopeKind = userId ? 'user' : 'business';
  if (userId) {
    let userInfo;
    try {
      userInfo = await db.prepare(
        `SELECT id, real_name, name, phone, email, provider, approval_status FROM users WHERE id = ?`
      ).bind(userId).first();
    } catch (e) { return Response.json({ error: "user lookup: " + e.message }, { status: 500 }); }
    if (!userInfo) return Response.json({ error: "user not found" }, { status: 404 });
    customerName = userInfo.real_name || userInfo.name || ('#' + userId);
  } else {
    let bizInfo;
    try {
      bizInfo = await db.prepare(
        `SELECT id, company_name, business_number, ceo_name, company_form FROM businesses WHERE id = ?`
      ).bind(businessId).first();
    } catch (e) { return Response.json({ error: "business lookup: " + e.message }, { status: 500 }); }
    if (!bizInfo) return Response.json({ error: "business not found" }, { status: 404 });
    customerName = bizInfo.company_name || ('#biz-' + businessId);
  }

  /* 2. 대상에 속한 모든 방 id */
  let roomIds = [];
  if (userId) {
    try {
      const { results } = await db.prepare(
        `SELECT DISTINCT room_id FROM room_members
         WHERE user_id = ? AND left_at IS NULL`
      ).bind(userId).all();
      roomIds = (results || []).map(r => r.room_id).filter(Boolean);
    } catch {}
  } else {
    /* business_id 매핑된 모든 방 — chat_rooms.business_id 직접 매칭 */
    try {
      const { results } = await db.prepare(
        `SELECT DISTINCT id AS room_id FROM chat_rooms WHERE business_id = ?`
      ).bind(businessId).all();
      roomIds = (results || []).map(r => r.room_id).filter(Boolean);
    } catch {}
  }

  /* 3. 기간별 메시지 쿼리 (모든 방 통합) */
  let msgs = [];
  if (roomIds.length > 0) {
    const placeholders = roomIds.map(() => '?').join(',');
    let whereTime = '';
    let timeBinds = [];
    if (range === 'week') { whereTime = ` AND datetime(c.created_at) >= datetime('now','-7 days')`; }
    else if (range === 'month') {
      const ym = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().substring(0, 7);
      whereTime = ` AND substr(c.created_at,1,7) = ?`; timeBinds.push(ym);
    } else if (range === 'custom') {
      const fromOK = /^\d{4}-\d{2}-\d{2}$/.test(fromDate);
      const toOK = /^\d{4}-\d{2}-\d{2}$/.test(toDate);
      if (!fromOK || !toOK) return Response.json({ error: "기간을 YYYY-MM-DD 로 지정" }, { status: 400 });
      if (fromDate > toDate) return Response.json({ error: "시작일이 종료일보다 늦음" }, { status: 400 });
      whereTime = ` AND substr(c.created_at,1,10) >= ? AND substr(c.created_at,1,10) <= ?`;
      timeBinds.push(fromDate, toDate);
    }
    /* 'recent' 와 'all' 은 시간 필터 없음 (limit 으로 조절) */
    const limit = range === 'recent' ? 100 : (range === 'all' ? 1000 : 500);
    const sql = `SELECT c.id, c.role, c.content, c.created_at, c.room_id, u.real_name, u.name, c.deleted_at
                 FROM conversations c LEFT JOIN users u ON c.user_id = u.id
                 WHERE c.room_id IN (${placeholders}) ${whereTime}
                 ORDER BY c.created_at DESC LIMIT ${limit}`;
    try {
      const { results } = await db.prepare(sql).bind(...roomIds, ...timeBinds).all();
      msgs = results || [];
    } catch {}
  }
  const chrono = msgs.slice().reverse();

  /* 4. 문서 집계 */
  const docIds = [];
  let imgCount = 0, fileCount = 0;
  for (const m of chrono) {
    const s = String(m.content || '');
    const mm = /^\[DOC:(\d+)\]/.exec(s);
    if (mm) docIds.push(parseInt(mm[1], 10));
    else if (/^\[IMG\]/.test(s)) imgCount++;
    else if (/^\[FILE\]/.test(s)) fileCount++;
  }
  const docTypeCounts = {};
  const topDocs = [];
  if (docIds.length) {
    try {
      const ph = docIds.map(() => '?').join(',');
      const { results: docRows } = await db.prepare(
        `SELECT id, doc_type, vendor, amount FROM documents WHERE id IN (${ph})`
      ).bind(...docIds).all();
      const TY = { receipt:'영수증',lease:'임대차',payroll:'근로',freelancer_payment:'프리랜서',tax_invoice:'세금계산서',insurance:'보험',utility:'공과금',property_tax:'지방세',bank_stmt:'은행내역',business_reg:'사업자등록증',identity:'신분증',contract:'계약서',other:'기타' };
      for (const d of (docRows||[])) {
        const typ = TY[d.doc_type] || d.doc_type || '문서';
        docTypeCounts[typ] = (docTypeCounts[typ]||0)+1;
        topDocs.push({ type: typ, vendor: d.vendor||'', amount: Number(d.amount||0) });
      }
      topDocs.sort((a,b)=>b.amount-a.amount);
    } catch {}
  }
  const docSummary = Object.keys(docTypeCounts).map(k=>`${k} ${docTypeCounts[k]}건`).join(' · ')
    + (imgCount?` · 사진 ${imgCount}건`:'') + (fileCount?` · 파일 ${fileCount}건`:'');
  const top5Str = topDocs.slice(0,5).filter(t=>t.amount>0).map(t=>{
    const bits=[t.type]; if(t.vendor)bits.push(t.vendor); bits.push(t.amount.toLocaleString('ko-KR')+'원');
    return '  · ' + bits.join(' · ');
  }).join('\n');

  /* 5. 거래처 영구 메모 — user 면 target_user_id, business 면 target_business_id */
  let customerInfoBlock = '(등록된 기본 정보 없음)';
  try {
    const memoSql = userId
      ? `SELECT content, author_name, created_at FROM memos
         WHERE target_user_id = ? AND memo_type = '거래처 정보' AND deleted_at IS NULL
         ORDER BY created_at ASC LIMIT 30`
      : `SELECT content, author_name, created_at FROM memos
         WHERE target_business_id = ? AND memo_type = '거래처 정보' AND deleted_at IS NULL
         ORDER BY created_at ASC LIMIT 30`;
    const { results: cinfo } = await db.prepare(memoSql).bind(userId || businessId).all();
    if (cinfo && cinfo.length) {
      customerInfoBlock = cinfo.map(m=>{
        const t=(m.created_at||'').substring(0,10);
        const by=m.author_name?`(${m.author_name})`:'';
        return `- ${by} ${t}: ${String(m.content||'').slice(0,400)}`;
      }).join('\n');
    }
  } catch {}

  /* 6. 방 단위 메모 (할 일·완료 등 거래처정보 외) */
  let memoBlock = '(없음)';
  if (roomIds.length > 0) {
    try {
      const ph = roomIds.map(() => '?').join(',');
      const { results: mr } = await db.prepare(
        `SELECT memo_type, content, author_name, created_at, due_date, linked_message_id, room_id
         FROM memos
         WHERE room_id IN (${ph}) AND memo_type != '거래처 정보' AND deleted_at IS NULL
         ORDER BY created_at ASC LIMIT 100`
      ).bind(...roomIds).all();
      if (mr && mr.length) {
        const LMAP = { '사실메모':'거래처 정보','확인필요':'할 일','고객요청':'할 일','담당자판단':'거래처 정보','주의사항':'거래처 정보','완료처리':'완료','참고':'거래처 정보' };
        memoBlock = mr.map(m=>{
          const t=(m.created_at||'').substring(5,16);
          const typ=LMAP[m.memo_type]||m.memo_type||'할 일';
          const by=m.author_name?`(${m.author_name})`:'';
          const due=m.due_date?` 📅${m.due_date}`:'';
          return `- [${typ}]${due} ${by} ${t}: ${String(m.content||'').slice(0,400)}`;
        }).join('\n');
      }
    } catch {}
  }

  /* 7. 대화 라인 빌드 */
  const lines = [];
  for (const m of chrono) {
    if (m.deleted_at) continue;
    let content = (m.content||'').trim();
    if (!content) continue;
    if (/^\[IMG\]/.test(content)) content = '(사진)';
    else if (/^\[FILE\]/.test(content)) content = '(파일)';
    else if (/^\[DOC:\d+\]/.test(content)) content = '(문서/영수증 업로드)';
    else if (/^\[ALERT\]/.test(content)) content = '(시스템 알림)';
    else if (/^\[REPLY\]/.test(content)) {
      const mm = /^\[REPLY\]\{[^\n]+\}\n([\s\S]*)$/.exec(content);
      if (mm) content = mm[1];
    }
    if (content.length > 400) content = content.substring(0, 400) + '…';
    const who = m.role==='assistant'?'🤖 AI'
              : m.role==='human_advisor'?'👨‍💼 세무사'
              : '👤 ' + (m.real_name || m.name || '고객');
    const t = (m.created_at||'').substring(0,16);
    lines.push(`[${t}]#${m.id} ${who}: ${content}`);
  }
  const conversation = lines.length ? lines.join('\n') : '(이 기간 대화 없음)';
  const firstAt = (chrono.find(m=>!m.deleted_at)?.created_at||'').substring(0,16);
  const lastAt = ([...chrono].reverse().find(m=>!m.deleted_at)?.created_at||'').substring(0,16);

  /* 8. 프롬프트 — admin-rooms summarizeRoom 과 동일 톤. 단, 거래처 단위임을 명시 */
  const prompt = `당신은 세무회계 사무실의 내부 업무 보조자이다.
아래는 거래처 "${customerName}" (user_id=${userId}) 의 모든 상담방 대화 + 메모를 합친 자료이다.
방이 여러 개라도 거래처 단위로 통합 요약한다. 방이 없으면 메모만으로 요약한다.

원칙:
- 고객 응대 문체 금지. 짧은 항목형. 추정 금지 (대화·메모 근거만).
- 자료 업로드 섹션은 개별 나열 금지. "자료 업로드 요약" 블록의 숫자 옮기고 Top 1~3 만 언급.
- "거래처 기본 정보" 블록 → 상담 개요·확정사실 상단에 한두 줄로 녹임.
- [할 일] 메모 → "다음 액션". [완료] → "이미 처리됨" 으로 확정사실에. [거래처 정보] → 상단 블록에서 처리됨.
- 각 항목 끝에 근거 메시지 ID "(#123)" 붙임. 메모 근거는 "(memo)".
- 대화 0건이면 메모만 기반으로 작성, "최근 상담 대화 없음 — 메모 기반 요약" 명시.

출력은 정확히 두 블록:

=== JSON ===
{
  "overview": {"period":"YYYY-MM-DD HH:MM ~ YYYY-MM-DD HH:MM","messageCount":${lines.length},"customerName":"${customerName}","purpose":"한 줄"},
  "confirmedFacts": [{"text":"...","msgIds":[]}],
  "customerRequests": [{"text":"...","msgIds":[]}],
  "uploadedMaterials": [{"text":"...","msgIds":[]}],
  "needCheck": [{"text":"...","msgIds":[]}],
  "nextActions": [{"text":"...","msgIds":[]}],
  "risks": [{"text":"...","msgIds":[]}]
}
=== MARKDOWN ===
## ⏱ 요약 시점
${firstAt || '(대화없음)'} ~ ${lastAt || '(대화없음)'}

## 상담 개요
- 거래처: ${customerName}
- 상담방 ${roomIds.length}개 · 메시지 ${lines.length}건
- 상담 목적: ...

## 확정된 핵심 사실
- ...

## 고객 요청 / 질문
- ...

## 자료 업로드 / 제출 흐름
- ...

## 확인 필요 사항
- ...

## 다음 액션
- ...

## 특이사항 / 주의사항
- ...

내용 없는 섹션은 "- 없음".

---거래처 기본 정보 (영구·인수인계용)---
${customerInfoBlock}

---자료 업로드 요약---
${docSummary || '(업로드 없음)'}${top5Str?'\n주요 건(금액 큰 순):\n'+top5Str:''}

---방 단위 메모 (할 일/완료)---
${memoBlock}

---대화 기록 (${roomIds.length}개 방 통합)---
${conversation}`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1400,
        temperature: 0.2,
        messages: [
          { role: 'system', content: '세무사무실 내부 업무 보조. 거래처 단위 통합 요약. 대화·메모 근거 외 추측 금지.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    const d = await res.json();
    if (!res.ok) return Response.json({ error: d?.error?.message || 'OpenAI error' }, { status: 500 });
    const raw = d.choices?.[0]?.message?.content || '';

    let summaryJson = null;
    let summaryMd = raw;
    const jsonMatch = raw.match(/===\s*JSON\s*===\s*([\s\S]*?)\s*===\s*MARKDOWN\s*===/i);
    const mdMatch = raw.match(/===\s*MARKDOWN\s*===\s*([\s\S]*)$/i);
    if (jsonMatch) {
      try { summaryJson = JSON.parse(jsonMatch[1].trim()); } catch { summaryJson = null; }
    }
    if (mdMatch) summaryMd = mdMatch[1].trim();
    const usage = d.usage || {};
    const costCents = (usage.prompt_tokens || 0) * 0.15 / 10000 + (usage.completion_tokens || 0) * 0.60 / 10000;
    /* 캐시 저장 — 다음 호출 시 cache_only=1 로 GPT 비용 0 */
    try {
      await db.prepare(
        `INSERT OR REPLACE INTO customer_summary_cache
         (scope, target_id, range_key, summary_json, summary_text, message_count, memo_count, generated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        userId ? 'user' : 'business',
        userId || businessId,
        range,
        summaryJson ? JSON.stringify(summaryJson) : null,
        summaryMd || raw,
        lines.length,
        0,
        kst()
      ).run();
    } catch (_) {}
    return Response.json({
      ok: true,
      summary: summaryMd || raw,
      summary_json: summaryJson,
      message_count: lines.length,
      room_count: roomIds.length,
      customer_name: customerName,
      first_at: firstAt,
      last_at: lastAt,
      usage,
      cost_cents: costCents,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
