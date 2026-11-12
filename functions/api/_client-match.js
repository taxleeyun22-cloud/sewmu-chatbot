/**
 * 거래처 매칭 2차 자동 검증 엔진 — 사장님 2026-10-20:
 *   "A 가 갑을병정 4개 사업체 (갑을 법인, 병정 개인) … 챗봇에 '내 무슨 업체 뭐가 얼마지?' 하면 답하게.
 *    매칭이 확실하게 돼야. 위하고랑 엮어서 2차 검증까지 자동화. 자동 연결은 하지 말고 내 버튼은 있어야."
 *
 * 하는 일: 카톡으로 들어온 사람이 직접 적은 값(실명·생년월일·휴대폰·사업자번호 하나)을 위하고에서 가져온 데이터
 * (businesses · business_members 의 대표자 · 그 대표자 users.birth_date) 와 대조해서
 *   1) 위하고 안의 "같은 사람" 후보
 *   2) 그 사람의 사업장 전부(갑·을·병·정) 와 사업장별 근거·등급
 * 을 만든다. **아무것도 바꾸지 않는다** — 읽기만. 연결은 사장님이 승인 화면 버튼으로 확정한다.
 *
 * 등급 (사업장마다 따로):
 *   sure   = 대표자 이름 일치 + 생년월일 일치                     (위하고 데이터 두 개가 독립적으로 맞음)
 *   likely = 대표자 이름 일치 + (휴대폰 일치 · 입력한 사업자번호 · 같은 법인번호) 중 하나
 *   check  = 그 밖 (이름이 다름 = 직원·경리일 수 있음, 또는 근거 부족) → 사장님이 보고 판단
 *
 * 개인정보: 생년월일 값은 응답에 싣지 않는다 (일치 여부만). 주민번호는 이 파일이 다루지 않는다.
 */

/** 고객이 가입 때 적은 값 — packages/db/migrations/0004_client_match_claims.sql 과 같은 DDL (lazy) */
export async function ensureClaimColumns(db) {
  for (const sql of [
    `ALTER TABLE users ADD COLUMN claim_birth_date TEXT`,
    `ALTER TABLE users ADD COLUMN claim_business_number TEXT`,
    `ALTER TABLE users ADD COLUMN claim_at TEXT`,
  ]) { try { await db.prepare(sql).run(); } catch {} }
}

export const digits = (s) => String(s || '').replace(/\D/g, '');
export const normName = (s) => String(s || '').replace(/\s+/g, '').trim();

/** 'YYYYMMDD' / 'YYYY-MM-DD' / 'YYYY.MM.DD' → 'YYYY-MM-DD' (달력에 없는 날·미래·1900 이전은 null) */
export function normBirth(s) {
  const d = digits(s);
  if (d.length !== 8) return null;
  const y = Number(d.slice(0, 4)), m = Number(d.slice(4, 6)), day = Number(d.slice(6, 8));
  if (y < 1900 || m < 1 || m > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, day));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== day) return null;
  if (dt.getTime() > Date.now()) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

const FORM = (f) => {
  const s = String(f || '');
  if (s.includes('법인')) return '법인';
  if (s.includes('간이')) return '간이';
  if (s.includes('개인')) return '개인';
  return s || '';
};

/** 합칠 수 있는 위하고 사람 = 카톡·네이버 계정이 아닌 사람 (위하고 가져오기·직접 등록). [연결] 버튼 서버 검증과 화면이 같이 씀 */
export const isMergeable = (p) => !['kakao', 'naver', 'merged'].includes(String((p && p.provider) || ''));

/** 순수 판정 — 한 사업장의 근거 묶음 → 등급 */
export function gradeOf(ev) {
  if (ev.name && ev.birth) return 'sure';
  if (ev.name && (ev.phone || ev.biz_no || ev.corp_group)) return 'likely';
  return 'check';
}

/**
 * claims: { real_name, birth_date('YYYY-MM-DD'|null), phone, business_number }
 * excludeUserId: 지금 매칭하려는 카톡 사용자 본인 (후보에서 뺀다)
 * 반환: { claims_ok, entered, persons[], businesses[], notes[] }
 */
export async function findMatchCandidates(db, claims, excludeUserId) {
  const name = normName(claims.real_name);
  const birth = claims.birth_date || null;
  const phone = digits(claims.phone);
  const bn = digits(claims.business_number);
  const notes = [];
  const out = { claims_ok: !!(name && birth && phone && bn.length === 10), entered: null, persons: [], businesses: [], notes };
  if (!name) { notes.push('실명이 없습니다'); return out; }

  /* 1. 입력한 사업자번호의 사업장 (지운 것 제외) */
  let entered = null;
  if (bn.length === 10) {
    const { results } = await db.prepare(
      `SELECT * FROM businesses WHERE (deleted_at IS NULL OR deleted_at = '')
         AND REPLACE(REPLACE(business_number, '-', ''), ' ', '') = ? LIMIT 3`
    ).bind(bn).all();
    entered = (results || [])[0] || null;
    if (!entered) notes.push('입력한 사업자번호가 위하고 거래처 목록에 없습니다');
  } else {
    notes.push('사업자번호가 없습니다');
  }
  out.entered = entered ? { id: entered.id, company_name: entered.company_name } : null;

  /* 2. 위하고 쪽 "같은 사람" 후보 — 대표자로 연결된 사람 중 이름이 같은 사람.
   *    a) 입력한 사업장의 대표자   b) 이름(실명/이름)이 같은 대표자 전체 (사업자번호를 잘못 적어도 찾게)
   *    생년월일이 둘 다 있는데 다르면 동명이인 — 후보에서 뺀다. */
  const { results: reps } = await db.prepare(
    `SELECT DISTINCT u.id, u.name, u.real_name, u.birth_date, u.phone, u.provider, u.approval_status
       FROM users u
       JOIN business_members m ON m.user_id = u.id AND (m.removed_at IS NULL OR m.removed_at = '')
      WHERE (u.deleted_at IS NULL OR u.deleted_at = '')
        AND COALESCE(u.approval_status, 'pending') NOT IN ('merged', 'deleted', 'withdrawn')
        AND (REPLACE(COALESCE(u.real_name, ''), ' ', '') = ? OR REPLACE(COALESCE(u.name, ''), ' ', '') = ?)
        AND u.id != ?
        AND COALESCE(u.is_admin, 0) = 0
        AND (m.role = '대표자' OR COALESCE(m.is_primary, 0) = 1)
      LIMIT 20`
  ).bind(name, name, Number(excludeUserId) || 0).all();
  const persons = [];
  for (const u of reps || []) {
    const birthMatch = !!(birth && u.birth_date && u.birth_date === birth);
    const birthConflict = !!(birth && u.birth_date && u.birth_date !== birth);
    if (birthConflict) { notes.push('동명이인(같은 이름·생년월일 다름) 이 있어 제외했습니다'); continue; }
    persons.push({
      user_id: u.id, name: u.real_name || u.name, provider: u.provider || null,
      birth_match: birthMatch, phone_match: !!(phone && digits(u.phone) === phone),
      has_birth: !!u.birth_date,
      business_ids: [],
    });
  }
  /* 생년월일까지 맞는 사람이 있으면 그 사람만 남긴다 (동명이인 중 생년월일 없는 쪽은 버림) */
  const strong = persons.filter((p) => p.birth_match);
  out.persons = strong.length ? strong : persons;

  /* 3. 후보 사업장 = 입력 사업장 + 후보 사람이 대표자인 사업장 전부 + 입력 사업장과 같은 법인번호(본점·지점) */
  const ids = new Set();
  if (entered) ids.add(entered.id);
  const personIds = out.persons.map((p) => p.user_id);
  if (personIds.length) {
    const ph = personIds.map(() => '?').join(',');
    const { results } = await db.prepare(
      `SELECT DISTINCT business_id, user_id FROM business_members WHERE user_id IN (${ph}) AND (removed_at IS NULL OR removed_at = '')`
    ).bind(...personIds).all();
    for (const r of results || []) {
      ids.add(r.business_id);
      /* 이 사람과 합치면 따라오는 사업장 (승인 화면에서 "합치면 같이 연결" 로 보여줌) */
      const p = out.persons.find((x) => x.user_id === r.user_id);
      if (p) (p.business_ids = p.business_ids || []).push(r.business_id);
    }
  }
  const corpNo = entered ? digits(entered.corporate_number) : '';
  if (corpNo.length === 13) {
    const { results } = await db.prepare(
      `SELECT id FROM businesses WHERE (deleted_at IS NULL OR deleted_at = '') AND REPLACE(corporate_number, '-', '') = ?`
    ).bind(corpNo).all();
    for (const r of results || []) ids.add(r.id);
  }
  if (!ids.size) return out;

  /* 4. 사업장별 근거 */
  const idList = [...ids];
  const ph = idList.map(() => '?').join(',');
  const { results: bizRows } = await db.prepare(
    `SELECT * FROM businesses WHERE id IN (${ph}) AND (deleted_at IS NULL OR deleted_at = '')`
  ).bind(...idList).all();
  /* business_members.phone 은 lazy ALTER 컬럼 — 없는 DB 에서도 동작하도록 한 번 재시도 */
  const memSql = (phoneCol) =>
    `SELECT m.business_id, m.user_id, m.role, m.is_primary, ${phoneCol} AS m_phone,
            u.name, u.real_name, u.birth_date, u.phone AS u_phone, u.provider, u.is_admin
       FROM business_members m JOIN users u ON u.id = m.user_id
      WHERE m.business_id IN (${ph}) AND (m.removed_at IS NULL OR m.removed_at = '')
        AND (u.deleted_at IS NULL OR u.deleted_at = '')`;
  let memRows;
  try {
    ({ results: memRows } = await db.prepare(memSql('m.phone')).bind(...idList).all());
  } catch {
    ({ results: memRows } = await db.prepare(memSql('NULL')).bind(...idList).all());
  }
  const memBy = {};
  for (const m of memRows || []) (memBy[m.business_id] = memBy[m.business_id] || []).push(m);

  for (const b of bizRows || []) {
    const mems = memBy[b.id] || [];
    const reps2 = mems.filter((m) => m.role === '대표자' || m.is_primary);
    const repNames = reps2.map((m) => normName(m.real_name || m.name));
    const ev = {
      biz_no: !!(bn && digits(b.business_number) === bn),
      name: normName(b.ceo_name) === name || repNames.includes(name),
      birth: !!(birth && reps2.some((m) => normName(m.real_name || m.name) === name && m.birth_date === birth)),
      phone: !!(phone && (digits(b.phone) === phone || mems.some((m) => digits(m.m_phone) === phone || digits(m.u_phone) === phone))),
      corp_group: !!(corpNo.length === 13 && digits(b.corporate_number) === corpNo),
    };
    /* 이미 다른 카톡 계정이 붙어 있으면 표시 (같은 사업장에 두 사람이 붙는 건 가능하지만 사장님이 알아야 함) */
    const kakaoLinked = mems.filter((m) => (m.provider === 'kakao' || m.provider === 'naver') && m.user_id !== Number(excludeUserId) && !m.is_admin)
      .map((m) => m.real_name || m.name);
    out.businesses.push({
      business_id: b.id,
      company_name: b.company_name,
      business_number: b.business_number || null,
      form: FORM(b.company_form),
      closed: b.status === 'closed' || !!b.closed_date,
      branch: !!b.parent_business_id,
      evidence: ev,
      grade: gradeOf(ev),
      suggested_role: ev.name ? '대표자' : '담당자',
      already_linked_kakao: kakaoLinked,
    });
  }
  const order = { sure: 0, likely: 1, check: 2 };
  out.businesses.sort((a, b) => order[a.grade] - order[b.grade] || Number(b.evidence.biz_no) - Number(a.evidence.biz_no) || a.business_id - b.business_id);
  return out;
}
