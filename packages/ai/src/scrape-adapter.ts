/**
 * Phase 신고서스크래핑-0 (2026-06-17): 외부 신고서 스크래핑 제공사 어댑터 추상화.
 *
 * 목적: 거래처(사업자)의 홈택스/위택스/4대보험 신고서를 외부 API(하이픈·CODEF 등)로
 *       가져온다. 제공사가 아직 미선정·법무 검토 중이므로, 이 인터페이스 뒤에
 *       제공사 구현을 숨기고 우선 Mock 으로 전 파이프라인을 개발·테스트한다.
 *       제공사 확정 시 이 파일의 어댑터 1개만 구현하면 다운스트림은 무변경.
 *
 * 설계 불변식 (보안):
 * - 인증정보(공동인증서·간편인증 비밀번호·ID/PW)는 절대 우리가 저장하지 않는다.
 *   제공사가 인증을 보유하며, 우리는 제공사 측 식별자(connectionRef, 예: CODEF connectedId)만 쥔다.
 * - 미검증 스크래핑 수치는 챗봇에 노출하지 않는다 (검증 게이트는 _scrape.js / admin-scrape-review).
 *
 * 사장님 대시보드 설정 (코드 아님):
 * - 전역변수 SCRAPE_PROVIDER = 'mock' (기본) → 추후 'codef' | 'hyphen'
 * - 제공사 선정 후: CODEF_* / HYPHEN_* API 키 (시크릿)
 */

/** 지원 세목. 초기엔 3종 — 부가세/종소세/법인세. */
export type ScrapeFilingType = '부가세' | '종소세' | '법인세';

/** 단일 신고서 조회 질의. */
export interface ScrapeQuery {
  type: ScrapeFilingType;
  /** 귀속연도 (예: 2025). */
  fiscalYear: number;
  /** 기간 라벨 (부가세 분기 구분 등, 예: '2026-1기예정'). 선택. */
  periodLabel?: string;
}

/**
 * 제공사별 필드명 차이를 어댑터가 흡수해 만든 정규화 결과.
 * filings.auto_fields 로 reconcile 될 때 _scrape.js 의 normalizeToAutoFields 가 이 형태를 받는다.
 */
export interface NormalizedFiling {
  /** 수입금액 (원). */
  revenue?: number;
  /** 결정세액 = 실제 낸 세금 (원). */
  decisive_tax?: number;
  /** 납부세액 (원) — 결정세액과 다를 수 있음. */
  paid_tax?: number;
  /** 신고 제출 여부. */
  submitted?: boolean;
  /** 제출 시각 (ISO) — submitted=true 일 때. */
  submitted_at?: string;
  /** 부가세 세부 (매출세액·매입세액·납부세액 등) — 제공사 원본 구조 보존. */
  vat?: Record<string, unknown>;
}

/** 조회 실패 정보. retryable 이 큐 재시도 여부를 좌우한다. */
export interface ScrapeError {
  /** 기계 판독용 코드 (예: 'auth_timeout', 'auth_denied', 'not_implemented'). */
  code: string;
  message: string;
  /** true 면 큐가 백오프 후 재시도 (예: 간편인증 timeout). false 면 종료 (예: 인증 거부). */
  retryable: boolean;
}

/** 어댑터 1회 조회 결과 (원본 + 정규화). */
export interface RawFilingResult {
  ok: boolean;
  providerName: ScrapeAdapter['name'];
  /** 제공사 측 연결 식별자 (우리 DB key 아님, 인증정보 아님). */
  connectionRef: string;
  query: ScrapeQuery;
  /** 제공사 원본 응답 — 그대로 scraped_filings_raw 에 저장 (증거/재정규화용). */
  rawPayload: unknown;
  /** 정규화 결과 — ok=true 일 때. */
  normalized?: NormalizedFiling;
  /** 조회 시각 (ISO). */
  fetchedAt: string;
  /** ok=false 일 때. */
  error?: ScrapeError;
}

/** 제공사 어댑터 공통 인터페이스. */
export interface ScrapeAdapter {
  readonly name: 'mock' | 'codef' | 'hyphen';
  /** 신고서 1건 조회. 동기 응답 모델. (실제 제공사가 콜백/폴링형이면 추후 pollFilings 추가.) */
  fetchFilings(connectionRef: string, query: ScrapeQuery): Promise<RawFilingResult>;
}

const CURRENT_YEAR = () => new Date().getUTCFullYear();

/** 결정적 문자열 해시 (FNV-1a 32bit) — Mock 데이터를 안정적으로 생성하기 위함. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Mock 어댑터 — connectionRef + query 기반 결정적 가짜 신고서.
 * 법무/RFQ 와 무관하게 enqueue→worker→reconcile→챗봇 전 구간을 개발·테스트하게 한다.
 *
 * 테스트용 connectionRef 접두사:
 * - 'fail-...'  → 종료성 오류 (retryable=false)
 * - 'retry-...' → 재시도성 오류 (retryable=true)
 * - 'empty-...' → 무실적 (ok=true, normalized 비어있음)
 * - 그 외        → 정상 데이터
 */
export class MockScrapeAdapter implements ScrapeAdapter {
  readonly name = 'mock' as const;

  async fetchFilings(connectionRef: string, query: ScrapeQuery): Promise<RawFilingResult> {
    const fetchedAt = new Date().toISOString();
    const ref = connectionRef || '';

    if (ref.startsWith('fail-')) {
      return {
        ok: false,
        providerName: this.name,
        connectionRef: ref,
        query,
        rawPayload: { mock: true, simulated: 'auth_denied' },
        fetchedAt,
        error: { code: 'auth_denied', message: 'mock: 인증 거부 (종료)', retryable: false },
      };
    }
    if (ref.startsWith('retry-')) {
      return {
        ok: false,
        providerName: this.name,
        connectionRef: ref,
        query,
        rawPayload: { mock: true, simulated: 'auth_timeout' },
        fetchedAt,
        error: { code: 'auth_timeout', message: 'mock: 간편인증 시간초과 (재시도)', retryable: true },
      };
    }

    const seed = hash32(`${ref}|${query.type}|${query.fiscalYear}|${query.periodLabel ?? ''}`);

    if (ref.startsWith('empty-')) {
      return {
        ok: true,
        providerName: this.name,
        connectionRef: ref,
        query,
        rawPayload: { mock: true, 무실적: true, type: query.type, year: query.fiscalYear },
        normalized: { revenue: 0, decisive_tax: 0, submitted: false },
        fetchedAt,
      };
    }

    const revenue = (seed % 90000) * 10000 + 10000000; // 1천만~약 9억, 만원 단위
    const decisive_tax = Math.round(revenue * 0.012); // 대략적 가짜 세액
    const submitted = query.fiscalYear < CURRENT_YEAR();

    const normalized: NormalizedFiling = {
      revenue,
      decisive_tax,
      paid_tax: submitted ? decisive_tax : 0,
      submitted,
      submitted_at: submitted ? `${query.fiscalYear + 1}-05-31T00:00:00.000Z` : undefined,
    };
    if (query.type === '부가세') {
      const salesVat = Math.round(revenue * 0.1);
      const purchaseVat = Math.round(salesVat * 0.6);
      normalized.vat = {
        매출세액: salesVat,
        매입세액: purchaseVat,
        납부세액: salesVat - purchaseVat,
      };
    }

    return {
      ok: true,
      providerName: this.name,
      connectionRef: ref,
      query,
      rawPayload: { mock: true, seed, type: query.type, year: query.fiscalYear, normalized },
      normalized,
      fetchedAt,
    };
  }
}

/** 종료성(미구현) 오류를 내는 스텁 — 제공사 선정 전까지. */
class NotImplementedAdapter implements ScrapeAdapter {
  constructor(readonly name: 'codef' | 'hyphen') {}
  async fetchFilings(connectionRef: string, query: ScrapeQuery): Promise<RawFilingResult> {
    return {
      ok: false,
      providerName: this.name,
      connectionRef,
      query,
      rawPayload: null,
      fetchedAt: new Date().toISOString(),
      error: {
        code: 'not_implemented',
        message: `${this.name} 어댑터 미구현 — 제공사 선정·법무 통과 후 구현`,
        retryable: false,
      },
    };
  }
}

/**
 * env.SCRAPE_PROVIDER 에 따라 어댑터 선택. 미설정/미지원 시 Mock (안전 기본값).
 * 제공사 확정 시 CodefScrapeAdapter / HyphenScrapeAdapter 를 이 파일에 구현해 교체.
 */
export function getScrapeAdapter(env?: Record<string, unknown>): ScrapeAdapter {
  const provider = String(env?.SCRAPE_PROVIDER ?? 'mock').toLowerCase();
  switch (provider) {
    case 'codef':
      return new NotImplementedAdapter('codef');
    case 'hyphen':
      return new NotImplementedAdapter('hyphen');
    case 'mock':
    default:
      return new MockScrapeAdapter();
  }
}
