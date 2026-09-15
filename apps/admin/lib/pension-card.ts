/**
 * 💰 연금 안내물 카드 생성 (2026-09-14 사장님: "일괄 출력할 수 있게")
 *
 * [영업 타겟 › 연금 절세] 명단 → 거래처별 개인화 PNG 를 브라우저에서 직접 생성.
 *
 * 왜 Canvas 직접 그리기인가:
 *   Cloudflare Pages 에서는 브라우저(Chromium)를 못 돌려 서버 렌더가 불가.
 *   html2canvas 는 142장에 3~5분 + 폰트 로드 실패 시 조용히 깨짐.
 *   Canvas 직접 그리기 = 142장 ~7초, 외부 의존 0, 결과 결정적.
 *
 * ⚠️ 세무 정확성 (사장님 지시 반영):
 *   - "환급" 표현 금지 — 세액공제는 산출세액에서 차감되는 것이지 환급이 아님
 *   - 상품 추천·자금 배분 문구 금지 — 세무사 업무 범위 밖 (투자자문)
 *   - 산출세액 < 세액공제액 인 거래처는 호출부에서 제외 (안내물이 과장이 됨)
 *   근거: 소득세법 제59조의3 (2026년 기준 확인 완료)
 */

export type PensionTarget = {
  name: string;
  total_income: number;    // 종합소득금액 — 구간 판정
  calculated_tax: number;  // 산출세액 — 공제 한도
};

/** 소득세법 제59조의3 — 지방소득세 10% 포함 실질 공제율 */
export const BRACKETS = {
  low:  { cut: 45_000_000, rate: '16.5', nat: '15', credit: 1_485_000, label: '종합소득금액 4,500만원 이하' },
  high: { cut: Infinity,   rate: '13.2', nat: '12', credit: 1_188_000, label: '종합소득금액 4,500만원 초과' },
} as const;

export type Bracket = (typeof BRACKETS)[keyof typeof BRACKETS];

export function bracketOf(totalIncome: number): Bracket {
  return totalIncome <= BRACKETS.low.cut ? BRACKETS.low : BRACKETS.high;
}

/** 산출세액이 공제액에 못 미치면 안내물 수치가 과장 → 제외 대상 */
export function isUnderCredit(t: PensionTarget): boolean {
  return t.calculated_tax < bracketOf(t.total_income).credit;
}

const NAVY = '#143657';   // logo.png 실측 추출
const GOLD = '#C8A45C';
const INK = '#111827';
const INK2 = '#374151';
const MUTE = '#8B92A0';
const LINE = '#E8EAEE';
const TINT = '#F7F8FA';

const W = 860;            // CSS 폭 (실제 출력은 ×SCALE)
const SCALE = 2;          // @2x 고해상도
const PADX = 76;
const FONT = '"Pretendard","Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';

const f = (size: number, weight = 400) => `${weight} ${size}px ${FONT}`;
const man = (n: number) => Math.floor(n / 10000).toLocaleString('ko-KR'); // 내림 — 과대표시 금지

/** 로고는 한 번만 로드해 재사용 (142장 반복 로드 방지) */
let logoPromise: Promise<HTMLImageElement | null> | null = null;
function loadLogo(): Promise<HTMLImageElement | null> {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null); // 로고 실패해도 카드는 나오게
      img.src = '/logo.png';
    });
  }
  return logoPromise;
}

/** 자동 줄바꿈 — 그린 뒤의 y 를 반환 */
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): number {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      y += lh;
      line = w;
    } else {
      line = test;
    }
  }
  if (line) { ctx.fillText(line, x, y); y += lh; }
  return y;
}

function hr(ctx: CanvasRenderingContext2D, y: number, color = LINE, wgt = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(PADX, y, W - PADX * 2, wgt);
}

/**
 * 카드 1장 생성 → PNG Blob.
 * 2-pass: 1차로 높이를 재고, 2차에 실제로 그린다 (내용 길이에 따라 높이가 변하므로).
 */
export async function renderPensionCard(t: PensionTarget): Promise<Blob> {
  const logo = await loadLogo();
  const b = bracketOf(t.total_income);

  const measure = document.createElement('canvas').getContext('2d')!;
  const height = draw(measure, t, b, logo, true);

  const cv = document.createElement('canvas');
  cv.width = W * SCALE;
  cv.height = height * SCALE;
  const ctx = cv.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  draw(ctx, t, b, logo, false);

  return new Promise<Blob>((resolve, reject) => {
    cv.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob 실패'))), 'image/png');
  });
}

/** measureOnly=true 면 그리지 않고 최종 높이만 계산 */
function draw(
  ctx: CanvasRenderingContext2D,
  t: PensionTarget,
  b: Bracket,
  logo: HTMLImageElement | null,
  measureOnly: boolean,
): number {
  const on = !measureOnly;
  const CW = W - PADX * 2;

  if (on) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, 5000); }
  ctx.textBaseline = 'alphabetic';

  let y = 72;

  /* ── 머리: 로고 + 연도 ── */
  if (on && logo) {
    const h = 38, w = (logo.width / logo.height) * h;
    ctx.drawImage(logo, PADX, y - 28, w, h);
  }
  if (on) {
    ctx.font = f(12); ctx.fillStyle = MUTE; ctx.textAlign = 'right';
    ctx.fillText('2026 연말 절세 안내', W - PADX, y - 4);
    ctx.textAlign = 'left';
  }
  y += 26;
  if (on) hr(ctx, y, NAVY, 2);
  y += 46;

  /* ── 받는 분 ── */
  if (on) { ctx.font = f(14); ctx.fillStyle = MUTE; ctx.fillText('받는 분', PADX, y); }
  y += 29;
  if (on) { ctx.font = f(22, 700); ctx.fillStyle = NAVY; ctx.fillText(`${t.name} 사장님`, PADX, y); }
  y += 74;

  /* ── 헤드라인 ── */
  if (on) { ctx.font = f(42, 800); ctx.fillStyle = INK; ctx.fillText('올해 세금,', PADX, y); }
  y += 56;
  if (on) {
    ctx.font = f(42, 800);
    const head = `${man(b.credit)}만원`;
    ctx.fillStyle = NAVY; ctx.fillText(head, PADX, y);
    ctx.fillStyle = INK; ctx.fillText('까지 줄일 수 있습니다', PADX + ctx.measureText(head).width, y);
  }
  y += 44;

  if (on) { ctx.font = f(15.5); ctx.fillStyle = INK2; }
  y = on
    ? wrap(ctx, '연금저축·IRP는 납입한 금액의 일부를 그해 세금에서 직접 빼주는 제도입니다. 12월 31일까지 넣은 금액만 올해 공제 대상입니다.', PADX, y, CW - 180, 29)
    : y + 58;
  y += 30;

  /* ── 핵심 숫자 박스 ── */
  const boxTop = y, boxH = 172;
  if (on) {
    ctx.fillStyle = TINT; ctx.fillRect(PADX, boxTop, CW, boxH);
    ctx.fillStyle = GOLD; ctx.fillRect(PADX, boxTop, CW, 3);
    ctx.strokeStyle = LINE; ctx.lineWidth = 1;
    ctx.strokeRect(PADX + 0.5, boxTop + 0.5, CW - 1, boxH - 1);

    ctx.font = f(13); ctx.fillStyle = MUTE;
    ctx.fillText('사장님 소득 구간 기준 · 900만원 납입 시 세액공제액', PADX + 40, boxTop + 46);

    ctx.font = f(62, 800); ctx.fillStyle = NAVY;
    const num = man(b.credit);
    /* ⚠️ 폭은 반드시 '그린 그 폰트' 상태에서 재야 함 (폰트 바꾼 뒤 재면 겹침) */
    const numW = ctx.measureText(num).width;
    ctx.fillText(num, PADX + 40, boxTop + 108);
    ctx.font = f(22, 700);
    ctx.fillText('만원 세금 감소', PADX + 40 + numW + 10, boxTop + 108);

    ctx.fillStyle = LINE; ctx.fillRect(PADX + 40, boxTop + 126, CW - 80, 1);

    const cols: [string, string][] = [
      ['적용 구간', b.label], ['공제율', `${b.rate}%`], ['납입 한도', '연 900만원'],
    ];
    let cx = PADX + 40;
    for (const [k, v] of cols) {
      ctx.font = f(13); ctx.fillStyle = MUTE; ctx.fillText(k, cx, boxTop + 146);
      ctx.font = f(15, 700); ctx.fillStyle = INK; ctx.fillText(v, cx, boxTop + 166);
      cx += Math.max(ctx.measureText(v).width, 90) + 44;
    }
  }
  y = boxTop + boxH + 52;

  /* ── STEP 3단 ── */
  if (on) { ctx.font = f(18, 700); ctx.fillStyle = INK; ctx.fillText('쓰는 돈이 아니라, 내 계좌에 쌓이는 돈입니다', PADX, y); }
  y += 12;
  if (on) hr(ctx, y);
  y += 34;

  const steps: [string, string, string][] = [
    ['STEP 1', '납입할 때', `납입액의 ${b.rate}%가 그해 낼 세금에서 그만큼 차감됩니다.`],
    ['STEP 2', '굴리는 동안', '이자·수익에 붙는 세금 없이 그대로 재투자되어 불어납니다.'],
    ['STEP 3', '55세 이후', '연금으로 나눠 받으면 3.3~5.5%의 낮은 세율만 적용됩니다.'],
  ];
  const colW = (CW - 52) / 3;
  if (on) {
    steps.forEach(([n, ttl, body], i) => {
      const x = PADX + i * (colW + 26);
      ctx.font = f(11, 700); ctx.fillStyle = GOLD; ctx.fillText(n, x, y);
      ctx.font = f(16, 700); ctx.fillStyle = INK; ctx.fillText(ttl, x, y + 25);
      ctx.font = f(13.5); ctx.fillStyle = INK2;
      wrap(ctx, body, x, y + 50, colW, 23);
    });
  }
  y += 50 + 23 * 3 + 12;

  if (on) { ctx.font = f(12.5); ctx.fillStyle = MUTE; }
  y = on
    ? wrap(ctx, '※ 55세 이전에 중도 해지하면 16.5%의 세금이 부과됩니다. 여유자금 범위 안에서 납입하셔야 합니다.', PADX, y, CW, 22)
    : y + 22;
  y += 42;

  /* ── 계좌 3종 표 ── */
  if (on) { ctx.font = f(18, 700); ctx.fillStyle = INK; ctx.fillText('계좌는 세 가지, 혜택은 동일합니다', PADX, y); }
  y += 12;
  if (on) hr(ctx, y);
  y += 30;

  const C1 = PADX, C2 = PADX + 170, C3 = PADX + 300;
  if (on) {
    ctx.font = f(11.5); ctx.fillStyle = MUTE;
    ctx.fillText('종류', C1, y); ctx.fillText('가입처', C2, y); ctx.fillText('특징', C3, y);
  }
  y += 14;

  const accounts: [string, string, string, string][] = [
    ['연금저축보험', '보험사', '원금 보장형', '저희 사무실을 통해 온라인 가입 가능'],
    ['연금저축펀드', '증권사', '본인이 직접 상품 선택', '한도 연 600만원'],
    ['IRP', '은행·증권사', '연금저축과 합산해 900만원까지', '본인이 직접 개설'],
  ];
  for (const [a, bb, c, d] of accounts) {
    if (on) hr(ctx, y);
    y += 26;
    if (on) {
      ctx.font = f(14, 700); ctx.fillStyle = INK; ctx.fillText(a, C1, y);
      ctx.font = f(14); ctx.fillStyle = INK2; ctx.fillText(bb, C2, y); ctx.fillText(c, C3, y);
      ctx.font = f(12.5); ctx.fillStyle = MUTE; ctx.fillText(d, C3, y + 21);
    }
    y += 40;
  }
  if (on) hr(ctx, y);
  y += 30;

  if (on) { ctx.font = f(12.5); ctx.fillStyle = MUTE; }
  y = on
    ? wrap(ctx, '계좌만 만들어 입금해두어도 올해 공제 대상입니다. 계좌 개설과 상품 선택은 사장님이 직접 하셔야 합니다. 대신 사장님 세금 기준으로 얼마까지 넣어야 공제를 다 받는지는 저희가 계산해 드립니다.', PADX, y, CW, 22)
    : y + 66;
  y += 46;

  /* ── 협업 ── */
  const ptTop = y;
  if (on) {
    ctx.font = f(11.5, 700); ctx.fillStyle = GOLD; ctx.fillText('온라인 간편 가입', PADX + 24, y);
    ctx.font = f(19, 700); ctx.fillStyle = INK; ctx.fillText('신한라이프 × 세무회계 이윤', PADX + 24, y + 30);
    ctx.font = f(14); ctx.fillStyle = INK2;
    ctx.fillText('연금보험은 방문 없이 온라인으로 바로 가입하실 수 있습니다.', PADX + 24, y + 60);
    ctx.fillText('가입 절차는 신한라이프에서, 세액공제 한도 계산은 저희가 안내해 드립니다.', PADX + 24, y + 84);
    ctx.fillStyle = NAVY; ctx.fillRect(PADX, ptTop - 16, 3, 112);
  }
  y += 130;

  /* ── 근거 ── */
  const srcTop = y;
  if (on) ctx.font = f(12);
  const srcLines = [
    `근거 · 소득세법 제59조의3(연금계좌세액공제) — 종합소득금액 4,500만원 이하 ${BRACKETS.low.nat}%, 초과 ${BRACKETS.high.nat}%. 본 안내의 ${b.rate}%는 지방소득세 10%를 포함한 실질 공제율입니다.`,
    '세액공제는 종합소득산출세액에서 차감되는 것으로, 이미 납부한 세금을 돌려받는 환급과는 다릅니다.',
    '공제액은 산출세액 범위 안에서 적용되며, 개인별 상황에 따라 달라질 수 있습니다.',
    '본 안내는 세무 상담이며, 특정 금융상품의 추천이나 자금 배분에 관한 투자자문이 아닙니다.',
  ];
  let sy = srcTop + 30;
  if (on) {
    ctx.fillStyle = TINT; ctx.fillRect(PADX, srcTop, CW, 30 + srcLines.length * 22 + 14);
    ctx.font = f(12); ctx.fillStyle = MUTE;
    for (const l of srcLines) sy = wrap(ctx, l, PADX + 22, sy, CW - 44, 22);
  } else {
    sy = srcTop + 30 + srcLines.length * 22;
  }
  y = srcTop + 30 + srcLines.length * 22 + 30;

  /* ── 꼬리 ── */
  if (on) hr(ctx, y);
  y += 30;
  if (on) {
    ctx.font = f(14, 700); ctx.fillStyle = NAVY; ctx.fillText('세무회계 이윤', PADX, y);
    ctx.font = f(12); ctx.fillStyle = MUTE;
    ctx.fillText('대구 달서구 · 대표세무사 이재윤', PADX, y + 22);
    ctx.fillText('053-269-1213', PADX, y + 42);
    ctx.textAlign = 'right';
    ctx.fillText('2026년 소득세법 기준', W - PADX, y + 22);
    ctx.fillText(`작성 ${new Date().toISOString().slice(0, 10).replace(/-/g, '.')}`, W - PADX, y + 42);
    ctx.textAlign = 'left';
  }
  y += 42 + 56;

  return y;
}
