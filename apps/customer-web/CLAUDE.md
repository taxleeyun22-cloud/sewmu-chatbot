# apps/customer-web — Claude 작업 규약 (거래처 챗봇 Next.js)

거래처 사장님이 진입하는 챗봇 사이트. **현재 stage 만, prod 배포 X** — 옛 챗봇 (`sewmu-chatbot.pages.dev/index.html`) 그대로 prod 매일 사용.

## 영역
- `app/` — Next.js App Router (마이페이지 / 채팅 / 문서함)
- `lib/trpc.ts` — tRPC client (query=GET / mutation=POST 자동 분기)
- `components/` — React 컴포넌트
- `public/` — 정적 자산

## 거래처 챗봇의 옛/새 분리

| 항목 | 옛 (prod 매일 작동) | 새 (stage) |
|---|---|---|
| Domain | sewmu-chatbot.pages.dev | (미배포) |
| Entry | index.html | apps/customer-web/app/page.tsx |
| Chat API | `/api/chat` (chat.js 843줄) | tRPC `chat.send` (예정) |
| Auth | 카톡 OAuth (functions/api/auth/kakao.js) | Auth.js v5 |
| Session | `session` cookie (sessions 테이블) | `authjs.session-token` |
| DB | 같은 D1 인스턴스 | 같은 D1 인스턴스 (공유) |

## 같은 D1 공유 (apps/admin/auth.ts 명시)
> "거래처 사이트 (apps/customer-web) 와 같은 코드 패턴, 다른 AUTH_URL. 같은 D1 DB 공유 — 사장님 카톡 = 양쪽에서 같은 user_id"

= cutover 시 옛 거래처 데이터 그대로 보임.

## Cutover 시점 (사장님 결정 후)

1. apps/customer-web 의 Next.js page 들 완성
2. Cloudflare Pages 별도 project 생성 (예: `sewmu-customer.pages.dev`)
3. 옛 카톡 OAuth callback URL 을 새 도메인으로 변경
4. 옛 챗봇 URL → 새 챗봇 URL redirect

**현재**: 거래처 사장님은 옛 챗봇 그대로 사용. cutover 명령 받기 전까지 옛 코드 유지.

## 승인 시스템 (chat.js 라인 156-163, 2026-05-02 정책)

- **비회원: 사용 불가** (로그인 필수, chat.js 라인 503 → 401)
- `pending` (가입 후 승인 대기): 일 **5건** (2026-05-02 인상)
- `approved_guest` (일반승인): **DEPRECATED** — 폐지 카테고리
- `approved_client` (기장거래처): **무제한** (코드값 999999)
- `rejected`: 0건
- 본명 확인 필수 (카톡 닉네임이 가명인 경우 많음)

## 외부 발신 (광고 / 문서)
- 광고 후크: "가입만 하면 5회/일", "기장거래처는 무제한"
- chat.js 룰 (수수료 금지 / 다른 세무사 추천 금지 / 볼드체 금지) 모두 그대로

## React 컴포넌트 룰
- 신규 마이페이지 위젯은 React (.tsx)
- TypeScript strict
- Tailwind utility class (브랜드 토큰 사용)
- 단위 테스트 (Vitest + RTL)
