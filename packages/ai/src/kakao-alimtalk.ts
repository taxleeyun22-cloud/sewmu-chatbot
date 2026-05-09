/**
 * Phase Next-Day24 (2026-05-09): 카카오 알림톡 (Kakao Biz API).
 *
 * 사장님 사용처:
 * - 단체 발송 (📢) — 거래처 N명 에게 동시 알림
 * - 신고 마감 임박 자동 알림 (cron)
 * - 영수증 승인/반려 알림
 *
 * 카카오 Biz 등록 사전 작업 (사장님 직접):
 * 1. https://business.kakao.com 등록
 * 2. 발신 프로필 (PF_ID) 생성
 * 3. 템플릿 사전 등록 (사용자별 변수 포함)
 * 4. API key 발급 → Cloudflare 환경변수 등록 (KAKAO_BIZ_API_KEY, KAKAO_BIZ_PF_ID)
 *
 * NHN Cloud / Aligo / Kakao Biz Center 중 사장님이 선택. 이 코드는 "Aligo" 호환.
 * (사장님 결정 후 다른 vendor 로 swap 가능).
 */

export interface AlimtalkMessage {
  /** 수신자 휴대폰 (010-XXXX-XXXX 또는 01012345678) */
  to: string;
  /** 발송 본문 — 템플릿 변수 치환 후 */
  message: string;
  /** 사전 등록된 템플릿 코드 */
  template_code: string;
  /** 템플릿 변수 (사장님이 미리 등록한 #{이름} 등) */
  variables?: Record<string, string>;
  /** 버튼 (선택 — 챗봇 진입 등) */
  buttons?: Array<{
    name: string;
    type: 'WL' | 'AL' | 'DS';
    url_mobile?: string;
    url_pc?: string;
  }>;
}

export interface AlimtalkSendOptions {
  apiKey: string;
  pfId: string;
  /** Vendor endpoint. Default: Aligo. 다른 vendor 시 swap. */
  endpoint?: string;
  /** 발신 가능 시간 (08:00~21:00 외에는 야간 알림톡 차단) */
  allowAfterHours?: boolean;
}

export interface AlimtalkResult {
  ok: boolean;
  message_id?: string;
  error?: string;
  /** 차단 사유 (시간외 등) */
  blocked?: string;
}

const DEFAULT_ENDPOINT = 'https://kakaoapi.aligo.in/akv10/alimtalk/send/';

/** 휴대폰 번호 정규화 — 하이픈 제거 + 한국 번호 검증. */
export function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const stripped = phone.replace(/[^0-9]/g, '');
  // 010XXXXXXXX (11) / 01012345678
  if (/^010\d{8}$/.test(stripped)) return stripped;
  // +82 10 ... → 01012345678
  if (/^8210\d{8}$/.test(stripped)) return '0' + stripped.slice(2);
  return null;
}

/** 템플릿 변수 치환 — #{이름} → values['이름']. */
export function renderTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/#\{([^}]+)\}/g, (_, key) => values[key.trim()] ?? '');
}

/** 발송 가능 시간 체크 (한국 표준 시각 08:00~21:00). */
export function isWithinSendHours(now: Date = new Date()): boolean {
  // KST = UTC+9
  const kstHour = (now.getUTCHours() + 9) % 24;
  return kstHour >= 8 && kstHour < 21;
}

/** 알림톡 1건 발송. */
export async function sendAlimtalk(
  msg: AlimtalkMessage,
  options: AlimtalkSendOptions,
): Promise<AlimtalkResult> {
  if (!options.allowAfterHours && !isWithinSendHours()) {
    return { ok: false, blocked: '08:00~21:00 외 발송 차단' };
  }

  const phone = normalizePhone(msg.to);
  if (!phone) {
    return { ok: false, error: 'invalid phone number' };
  }

  const body = new URLSearchParams({
    apikey: options.apiKey,
    senderkey: options.pfId,
    tpl_code: msg.template_code,
    receiver_1: phone,
    subject_1: msg.template_code,
    message_1: msg.message,
    button_1: msg.buttons ? JSON.stringify({ button: msg.buttons }) : '',
  });

  try {
    const r = await fetch(options.endpoint ?? DEFAULT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = (await r.json()) as { code: number; message: string; mid?: string };
    if (data.code !== 0) {
      return { ok: false, error: data.message || `code ${data.code}` };
    }
    return { ok: true, message_id: data.mid };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** 일괄 발송 — Promise.all 병렬 (단, vendor rate limit 주의). */
export async function sendAlimtalkBulk(
  messages: AlimtalkMessage[],
  options: AlimtalkSendOptions,
): Promise<AlimtalkResult[]> {
  return Promise.all(messages.map((m) => sendAlimtalk(m, options)));
}
