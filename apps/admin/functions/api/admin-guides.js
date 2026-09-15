/**
 * 📖 업무 가이드 (2026-07-07 사장님 명령: "부가세 주의사항 이런거 해서 직원들이 다 읽어볼수있도록"):
 * 사내 업무 매뉴얼/주의사항 게시판 — 읽음확인 없음, 콘텐츠+가독성 중심 (사장님 결정).
 *
 * Endpoints:
 *   GET    /api/admin-guides            → 목록 (pinned 우선 → updated_at desc). ?category= 필터.
 *                                         열람 = checkAdmin 통과 전원 (viewer 포함, 직원 열람용)
 *   POST   /api/admin-guides            body: { title, category, content, pinned? } → 생성
 *   PUT    /api/admin-guides            body: { id, title?, category?, content?, pinned? } → 수정
 *   DELETE /api/admin-guides?id=N       → soft delete (deleted_at)
 *                                         쓰기 3종 = hasAdminRole(auth, 'admin') (사장님 + admin)
 *
 * 서식: content 는 간단 마크다운 (# 제목 / - 불릿 / **강조** / > 주의박스 / ---) —
 *       렌더링은 프론트 admin-guides.js 의 XSS-safe 미니 렌더러가 담당. 서버는 원문 저장만.
 */

import { checkAdmin, adminUnauthorized, hasAdminRole, roleForbidden, checkOriginCsrf } from "./_adminAuth.js";
import { logAudit } from "./_audit.js";

const KST_OFFSET = 9 * 60 * 60 * 1000;
function kst() {
  return new Date(Date.now() + KST_OFFSET).toISOString().replace('T', ' ').substring(0, 19);
}

const CATEGORIES = ['부가세', '원천세', '종소세', '법인세', '연말정산', '공통', '사용법'];

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS work_guides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '공통',
    content TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    author_user_id INTEGER,
    author_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`).run();
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_work_guides_list ON work_guides(deleted_at, pinned DESC, updated_at DESC)`).run(); } catch (_) {}
  /* 읽음 확인 (2026-07-16 사장님: "올리고 들어가면 체크체크 하면서 한번은 읽도록") —
   * ident = 세션 사용자 'u{id}', owner 키 로그인 'owner' */
  await db.prepare(`CREATE TABLE IF NOT EXISTS work_guide_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guide_id INTEGER NOT NULL,
    ident TEXT NOT NULL,
    user_id INTEGER,
    user_name TEXT,
    created_at TEXT NOT NULL
  )`).run();
  try { await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wgr_uniq ON work_guide_reads(guide_id, ident)`).run(); } catch (_) {}
}

function readerIdent(auth) {
  return auth.userId ? ('u' + auth.userId) : (auth.owner ? 'owner' : 'anon');
}

/** 작성자 표기 — owner(ADMIN_KEY/HMAC 쿠키) 는 사장님, 세션이면 real_name 조회. */
async function actorName(db, auth) {
  if (auth.userId) {
    try {
      const row = await db.prepare(`SELECT real_name, name FROM users WHERE id = ?`).bind(auth.userId).first();
      if (row) return row.real_name || row.name || ('user#' + auth.userId);
    } catch (_) {}
    return 'user#' + auth.userId;
  }
  return auth.owner ? '사장님' : 'admin';
}

export async function onRequestGet(context) {
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return adminUnauthorized();

  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const category = url.searchParams.get('category');

  try {
    let q = `SELECT id, title, category, content, pinned, author_name, created_at, updated_at
             FROM work_guides WHERE deleted_at IS NULL`;
    const binds = [];
    if (category && CATEGORIES.includes(category)) {
      q += ` AND category = ?`;
      binds.push(category);
    }
    q += ` ORDER BY pinned DESC, updated_at DESC LIMIT 300`;
    const { results } = await db.prepare(q).bind(...binds).all();
    const guides = results || [];

    /* 읽음 정보: 내가 읽은 글 + (canWrite) 글별 읽은 사람 명단 */
    const ident = readerIdent(auth);
    const myRead = new Set();
    const readMap = {};
    try {
      const { results: reads } = await db.prepare(
        `SELECT guide_id, ident, user_name, created_at FROM work_guide_reads`
      ).all();
      for (const r of (reads || [])) {
        if (r.ident === ident) myRead.add(r.guide_id);
        (readMap[r.guide_id] = readMap[r.guide_id] || []).push(r.user_name || r.ident);
      }
    } catch (_) {}
    const canWrite = hasAdminRole(auth, 'admin');
    for (const g of guides) {
      g.my_read = myRead.has(g.id) ? 1 : 0;
      g.read_count = (readMap[g.id] || []).length;
      if (canWrite) g.readers = (readMap[g.id] || []).slice(0, 30);
    }
    return Response.json({ ok: true, guides, categories: CATEGORIES, canWrite });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/* 📖 관리자 사용설명서 시리즈 (2026-07-16 사장님: "관리자 사용설명서 시리즈 만들자")
 * — action=seed_manual 로 원클릭 설치. 제목 기준 idempotent (이미 있으면 skip).
 * 2026-08-17 사장님: "새로운 직원 오면 보고 어떻게 하는지" → 0편 온보딩 추가 (7편). */
const MANUAL_GUIDES = [
  {
    title: '0. 신입 직원 온보딩 — 첫 출근이면 이 글부터',
    pinned: 1,
    content: [
      '# 처음 오신 분, 환영합니다',
      '세무회계 이윤 업무 시스템 안내입니다. 이 글 하나로 "뭐가 어디 있는지"를 잡고, 화면별 자세한 사용법은 아래 1~6편으로 이어집니다.',
      '',
      '## 시스템은 두 개입니다',
      '1. **거래처 챗봇** — 거래처 사장님들이 세무 질문을 하는 곳. AI가 법령 원문을 근거로 답합니다',
      '2. **관리자** (지금 이 화면) — 우리가 일하는 곳. 상담·검토표·메모·문서·영업 전부 여기서',
      '',
      '> 둘은 연결돼 있습니다. **우리가 검토표에 넣은 숫자로 챗봇이 거래처에게 답합니다.** 검토표를 정확히 쓰는 것이 곧 서비스 품질입니다 (4편).',
      '',
      '## 첫날 체크리스트',
      '1. 거래처 챗봇 페이지에서 카카오 또는 네이버로 가입',
      '2. 사장님께 말씀 → 관리자 권한을 받습니다 (권한·승인은 항상 사장님이 직접 관리)',
      '3. 관리자 접속 → 홈 화면이 보이면 성공',
      '4. 이 글 아래 ✅ 읽음 누르기 → 1편부터 차례로 읽기',
      '',
      '## 내 권한 등급',
      '사이드바 내 이름 옆 배지가 내 등급입니다.',
      '- viewer — 열람만',
      '- editor — 메모·검토표 등 작성 가능',
      '- admin — 사용자·업체 관리까지',
      '- owner — 사장님',
      '',
      '버튼이 안 보이거나 안 눌리면 등급 차이일 수 있습니다. 필요하면 사장님께 요청하세요.',
      '',
      '## 사이드바 지도 — 뭐가 어디 있나',
      '- **홈** — 오늘의 브리핑 (마감·할일·안읽은방·미수금·영업 팔로업) → 1편',
      '- **전역 검색** (Ctrl+K) — 거래처·업체·메모, 이름 몇 글자로 다 찾기',
      '- **문서** — 거래처가 올린 서류 확인·승인',
      '- **메모 / 메모 모아보기** — 거래처·업체 업무 기록. 종류를 "할 일"로 저장하면 일정에 자동 등록',
      '- **업무 가이드** — 지금 이 화면. 실무 매뉴얼·주의사항',
      '- **검토표 모아보기** — 종소세·법인세 검토표 전체 현황 → 4편',
      '- **청구서 (조정료)** — 조정료 청구·미납 관리 (새 탭)',
      '- **영업 타겟 / 영업 파이프라인** — 검토표 기반 후보 발굴 → 리드 진행 관리 → 6편',
      '- **상담방** — 거래처와 대화 → 3편',
      '- **관리자방** — 직원끼리 내부 채팅. 궁금한 건 여기서 물어보세요',
      '- **사용자 / 업체** — 거래처 사람·사업장 관리 → 5편',
      '- **대화 / 실시간 / 분석** — 챗봇 대화 기록·모니터링·통계',
      '- **검증** — AI 답변 중 검토 필요한 것 (신뢰도 낮은 답변 자동 수집)',
      '- **FAQ** — 챗봇이 참조하는 문답 관리',
      '- **내 일정** — 내 할일 + 세무일정 달력 → 2편',
      '- **종료 요청 / 단체발송 / 휴지통 / 에러 로그** — 운영 도구',
      '',
      '## 철칙 세 가지',
      '1. **검토표 숫자는 거래처에게 그대로 나갑니다.** 확실하지 않으면 비워두고 물어보세요',
      '2. **권한·승인 상태는 임의로 바꾸지 않습니다.** 사장님 결정 사항입니다',
      '3. **모르면 관리자방에 물어보세요.** 추측으로 처리하지 않기',
      '',
      '---',
      '다음: 1편 "홈 화면 읽는 법"부터 순서대로. 각 편을 읽고 ✅ 읽음을 눌러주세요.',
    ].join('\n'),
  },
  {
    title: '1. 홈 화면 읽는 법 — 출근하면 여기부터',
    pinned: 1,
    content: [
      '# 홈 화면 = 오늘의 브리핑',
      '관리자에 들어오면 처음 보이는 화면입니다. 출근해서 이것만 봐도 오늘 할 일이 정리됩니다.',
      '',
      '## 카드 5장',
      '- 다가오는 법정 마감: 7일 내 신고·납부 마감 (주말 순연 반영). 클릭하면 달력',
      '- 내 할 일: 지남/오늘/전체 개수. 아래 입력창에 치고 Enter = 즉시 할일 추가',
      '- 안 읽은 상담방: 미응답 방 상위 3개. 방 이름 클릭 = 바로 그 방으로',
      '- 미수금 청구서: 청구 전·미납 합계. 클릭 = 청구서 시스템(새 탭)',
      '- 오늘 영업 팔로업: 오늘 연락할 영업 리드. 클릭 = 영업 파이프라인(새 탭)',
      '',
      '> 왼쪽 위 "세무회계 이윤" 로고를 누르면 어느 화면에서든 홈으로 돌아옵니다.',
      '',
      '## 꼭 외울 것 하나',
      '- **Ctrl + K** = 전역 검색. 거래처든 업체든 메모든 이름 몇 글자면 다 찾습니다',
    ].join('\n'),
  },
  {
    title: '2. 내 할일 · 세무일정 달력',
    pinned: 0,
    content: [
      '# 내 할일 열기',
      '사이드바 알림 그룹의 "내 일정" 클릭. 위 탭에서 [내 할 일 / 팀 전체], [목록 / 달력 / 연간] 전환.',
      '',
      '## 달력 뷰',
      '- 상단 [세무일정] 버튼을 켜면 법정 마감(부가세·원천세·지급명세서 등)이 회색 칩으로 자동 표시됩니다. 주말이면 다음 영업일로 순연 계산돼 있습니다',
      '- 날짜 클릭 = 그 날 상세가 아래에. 입력창에 적고 Enter = 그 날짜로 할일 추가',
      '- 완료한 할일은 ✓ 흐린 칩으로 남습니다. 상세에서 체크 다시 누르면 되돌리기',
      '',
      '## 할일은 어디서 생기나',
      '- 홈/달력의 빠른 추가',
      '- 거래처·업체 메모에서 종류를 "할 일"로 저장하면 자동으로 여기 모임',
      '- 담당자를 지정하면 그 직원 목록에 뜸',
      '',
      '> 기한 지난 할일은 빨간 "N일 지남"으로 표시됩니다. 지난 게 쌓이면 홈에서도 보이니 그날그날 처리하세요.',
    ].join('\n'),
  },
  {
    title: '3. 상담방 응대 순서',
    pinned: 0,
    content: [
      '# 기본 흐름',
      '1. 홈 "안 읽은 상담방" 또는 사이드바 [상담방]에서 빨간 숫자 있는 방 클릭',
      '2. 대화 확인 후 답장. 사진·파일은 붙여넣기(Ctrl+V)로 바로 전송됩니다',
      '3. 처리할 일이 생겼으면 그 자리에서 메모 → 종류 "할 일" + 담당자 지정',
      '',
      '## AI 모드',
      '- 방마다 AI 자동응답을 켜고 끌 수 있습니다. 직접 상담 중일 땐 끄고, 끝나면 다시 켜두세요',
      '',
      '## 라벨',
      '- 방에 담당자·우선순위 라벨을 붙일 수 있습니다 (방 목록에서 구분용)',
      '',
      '> 거래처가 챗봇에 "내 매출/세금" 을 물으면 검토표 숫자로 자동 답변됩니다. 상담방에서 같은 질문이 오면 검토표를 열어 같은 숫자로 답하면 됩니다.',
    ].join('\n'),
  },
  {
    title: '4. 검토표 작성 — 쓸수록 챗봇이 똑똑해집니다',
    pinned: 0,
    content: [
      '# 검토표가 중요한 이유',
      '검토표의 숫자는 세 군데서 재사용됩니다:',
      '1. **거래처 챗봇** — 거래처가 "작년 매출? 소득률?" 물으면 검토표 숫자로 자동 답변',
      '2. **영업 타겟** — 연금 절세·법인전환·소득률 명단이 검토표에서 자동 추출',
      '3. 결재/보관 — 사무실 공식 기록',
      '',
      '## 작성 흐름',
      '- 거래처(개인=종소세) 또는 업체(법인=법인세) 대시보드에서 검토표 작성',
      '- 수입금액 → 종합소득금액 → 과세표준 → 산출세액 → 결정세액 → 납부할세액 순서로 입력',
      '- 상태: 작성중 → 결재대기 → 보관완료 (보관완료는 사장님 결재)',
      '',
      '> **수입금액·종합소득금액(법인은 당기순이익)은 꼭 채우세요.** 이 두 칸이 비면 챗봇이 그 거래처 질문에 "자료 없음"으로 답하게 됩니다.',
      '',
      '- 모아보기: 사이드바 [검토표 모아보기]에서 전체 현황 확인',
    ].join('\n'),
  },
  {
    title: '5. 사용자·업체 관리 기본',
    pinned: 0,
    content: [
      '# 신규 거래처가 챗봇에 가입하면',
      '1. 사이드바 [사용자]에 승인대기(pending)로 뜸 — 하루 5회만 질문 가능한 상태',
      '2. 기장 계약된 거래처면 **승인 + 업체 연결** — 기장거래처(무제한)로 전환',
      '3. 업체(사업장)와 연결해야 검토표·문서·챗봇 데이터가 그 사람에게 이어집니다',
      '',
      '## 원칙',
      '- 권한(관리자/직원)과 승인 상태 변경은 **사장님이 결정**합니다. 임의로 바꾸지 마세요',
      '- 한 사람이 사업장 여러 개면 업체를 복수로 연결 (대표자/담당자 구분)',
      '',
      '## 문서',
      '- [문서] 탭에서 거래처가 올린 서류(신분증·사업자등록증 등) 확인·승인',
      '- 만료 임박 서류는 알림으로 뜸',
    ].join('\n'),
  },
  {
    title: '6. 영업 — 발굴에서 성사까지',
    pinned: 0,
    content: [
      '# 영업 허브 (새 admin)',
      '사이드바 [영업 타겟] = 발굴, [영업 파이프라인] = 진행 관리. 상단 탭으로 서로 오갑니다.',
      '',
      '## 발굴 → 담기',
      '- 연금 절세 / 보험 / 법인전환 / 소득률 탭 = 검토표에서 자동 추출된 영업 후보',
      '- 각 줄의 [＋담기] 클릭 = 파이프라인에 리드로 등록 (첫 연락일 오늘로 자동)',
      '- 이미 담긴 사람은 단계와 다음 액션이 그 줄에 바로 보입니다',
      '',
      '## 기록이 곧 관리',
      '- 통화·미팅 후 그 사람 열어서 한 줄 기록 + 결과 버튼 (통화됨/상담 잡힘/견적 보냄/계약!/보류/거절)',
      '- 결과에 따라 단계가 자동으로 이동합니다 — 체크로 옮기는 게 아닙니다',
      '- **진행 중 리드는 반드시 다음 연락 날짜가 있어야 저장됩니다** (잊혀 죽는 리드 방지)',
      '',
      '> 다음 액션 날짜가 되면 홈 "오늘 영업 팔로업" 카드에 자동으로 올라옵니다. 아침에 홈만 보면 됩니다.',
    ].join('\n'),
  },
];

export async function onRequestPost(context) {
  const __csrf = checkOriginCsrf(context.request, context.env);
  if (__csrf) return __csrf;
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return adminUnauthorized();

  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);

  const __url = new URL(context.request.url);

  /* ✅ 읽음 체크 — 열람 가능한 전원(viewer 직원 포함). admin 권한 불필요 */
  if (__url.searchParams.get('action') === 'mark_read') {
    try {
      let body2;
      try { body2 = await context.request.json(); } catch { body2 = {}; }
      const gid = Number(body2.id);
      if (!gid) return Response.json({ error: 'id required' }, { status: 400 });
      const g = await db.prepare(`SELECT id FROM work_guides WHERE id = ? AND deleted_at IS NULL`).bind(gid).first();
      if (!g) return Response.json({ error: '글을 찾을 수 없습니다' }, { status: 404 });
      const name = await actorName(db, auth);
      await db.prepare(
        `INSERT OR IGNORE INTO work_guide_reads (guide_id, ident, user_id, user_name, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(gid, readerIdent(auth), auth.userId || null, name, kst()).run();
      return Response.json({ ok: true });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  if (!hasAdminRole(auth, 'admin')) return roleForbidden('admin');

  /* 사용설명서 6편 원클릭 설치 — 제목 기준 idempotent */
  if (__url.searchParams.get('action') === 'seed_manual') {
    try {
      const now = kst();
      const name = await actorName(db, auth);
      let inserted = 0;
      for (const g of MANUAL_GUIDES) {
        const dup = await db.prepare(`SELECT id FROM work_guides WHERE title = ? AND deleted_at IS NULL`).bind(g.title).first();
        if (dup) continue;
        await db.prepare(
          `INSERT INTO work_guides (title, category, content, pinned, author_user_id, author_name, created_at, updated_at)
           VALUES (?, '사용법', ?, ?, ?, ?, ?, ?)`
        ).bind(g.title, g.content, g.pinned, auth.userId || null, name, now, now).run();
        inserted++;
      }
      logAudit(db, { actor: name, action: 'guide_seed_manual', entity_type: 'guide', entity_id: null, after: String(inserted) + '편 설치', request: context.request });
      return Response.json({ ok: true, inserted, total: MANUAL_GUIDES.length });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  let body;
  try { body = await context.request.json(); }
  catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }

  const title = String(body.title || '').trim().slice(0, 200);
  const content = String(body.content || '').slice(0, 50000);
  const category = CATEGORIES.includes(body.category) ? body.category : '공통';
  const pinned = body.pinned ? 1 : 0;
  if (!title) return Response.json({ error: '제목을 입력해주세요' }, { status: 400 });
  if (!content.trim()) return Response.json({ error: '내용을 입력해주세요' }, { status: 400 });

  try {
    const now = kst();
    const name = await actorName(db, auth);
    const r = await db.prepare(
      `INSERT INTO work_guides (title, category, content, pinned, author_user_id, author_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(title, category, content, pinned, auth.userId || null, name, now, now).run();
    const id = r?.meta?.last_row_id;
    logAudit(db, { actor: name, action: 'guide_create', entity_type: 'guide', entity_id: id, after: title, request: context.request });
    return Response.json({ ok: true, id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPut(context) {
  const __csrf = checkOriginCsrf(context.request, context.env);
  if (__csrf) return __csrf;
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return adminUnauthorized();
  if (!hasAdminRole(auth, 'admin')) return roleForbidden('admin');

  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);

  let body;
  try { body = await context.request.json(); }
  catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }

  const id = Number(body.id);
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  try {
    const prev = await db.prepare(`SELECT id, title, category, content, pinned FROM work_guides WHERE id = ? AND deleted_at IS NULL`).bind(id).first();
    if (!prev) return Response.json({ error: '글을 찾을 수 없습니다' }, { status: 404 });

    const title = body.title !== undefined ? String(body.title || '').trim().slice(0, 200) : prev.title;
    const content = body.content !== undefined ? String(body.content || '').slice(0, 50000) : prev.content;
    const category = body.category !== undefined
      ? (CATEGORIES.includes(body.category) ? body.category : '공통')
      : prev.category;
    const pinned = body.pinned !== undefined ? (body.pinned ? 1 : 0) : prev.pinned;
    if (!title) return Response.json({ error: '제목을 입력해주세요' }, { status: 400 });
    if (!content.trim()) return Response.json({ error: '내용을 입력해주세요' }, { status: 400 });

    await db.prepare(
      `UPDATE work_guides SET title = ?, category = ?, content = ?, pinned = ?, updated_at = ? WHERE id = ?`
    ).bind(title, category, content, pinned, kst(), id).run();

    const name = await actorName(db, auth);
    logAudit(db, { actor: name, action: 'guide_update', entity_type: 'guide', entity_id: id, before: prev.title, after: title, request: context.request });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const __csrf = checkOriginCsrf(context.request, context.env);
  if (__csrf) return __csrf;
  const auth = await checkAdmin(context);
  if (!auth || !auth.ok) return adminUnauthorized();
  if (!hasAdminRole(auth, 'admin')) return roleForbidden('admin');

  const db = context.env.DB;
  if (!db) return Response.json({ error: 'DB error' }, { status: 500 });
  await ensureTable(db);

  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get('id'));
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  try {
    const prev = await db.prepare(`SELECT id, title FROM work_guides WHERE id = ? AND deleted_at IS NULL`).bind(id).first();
    if (!prev) return Response.json({ error: '글을 찾을 수 없습니다' }, { status: 404 });

    await db.prepare(`UPDATE work_guides SET deleted_at = ? WHERE id = ?`).bind(kst(), id).run();
    const name = await actorName(db, auth);
    logAudit(db, { actor: name, action: 'guide_delete', entity_type: 'guide', entity_id: id, before: prev.title, request: context.request });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
