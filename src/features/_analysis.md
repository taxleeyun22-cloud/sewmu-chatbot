# Stage 2-1: admin.js 4,039줄 전수 분석

> 작성일: 2026-04-28
> 출처: Explore 에이전트 분석 + admin.js 전수 읽기
> 목적: Phase 2 (admin.js → features/* 모듈 분해) 진행 시 모듈 경계 확정 + 위험 함수 식별

## 개요

- 총 줄 수: ~7,694 (실제 admin.js 는 ~4,039줄, 추가로 staff.html / business.html 의존 코드 포함)
- 총 함수: ~395 개
- 전역 변수: 25+ 개
- 권장 모듈: 9 개
- 순환 의존: 없음 ✅

## 9 개 모듈 분류

| 모듈 | 줄 수 | 핵심 함수 |
|---|---|---|
| **shared** (기반) | ~700 | login, doLogin, logout, tab, e/escAttr, linkify, mentionify, openSearch, doSearch, togglePcNotify |
| **rooms** (상담방) | ~1,200 | startRoomsPolling, loadRoomList, openRoom, loadRoomDetail, setRoomPriority, renameRoom, deleteCurrentRoom |
| **messages** (메시지) | ~800 | renderMsgBody, sendRoomMessage, sendRoomImage, sendRoomFile, uploadFileChunkedAdmin, showMsgCtxMenu, doReplyTo, doToggleBookmark, openRoomInfo |
| **documents** (문서) | ~600 | renderReceiptCardAdmin, approveDoc, rejectDocPrompt, revertDocApproval, convertMsgToReceiptAdmin, rcCheckDocSuspect, aiConfirmImage |
| **users** (사용자) | ~400 | refreshPendingBadge, loadUsers, approveUser, rejectUser, openProfileModal, openManualClientModal, cleanDupBiz |
| **clients** (거래처) | ~800 | openCustomerDashboard, loadBusinessList, setClientTabMode, openNewBusinessModal, openBizDocsPanel, openFinancePanel, openLabelManageModal, exportWehago |
| **memos** (메모·할일) | ~500 | openMyTodos, openTerminationRequests, addMemo, addSchedule, deleteSchedule, openRoomMemos |
| **batch** (단체발송) | ~300 | openBulkSend, submitBulkSend, openScheduleSend, submitScheduledSend |
| **review** (검증·실시간) | ~700 | loadReview, setReviewConfidence, startLivePolling, openLiveSession, sendLiveMessage, toggleAiMode |

## 의존성 그래프

```
shared (기반)
  ↑
  ├─ rooms
  │  ├─ messages
  │  │  ├─ documents
  │  │  └─ memos
  │  ├─ batch
  │  └─ clients
  ├─ users
  │  └─ clients
  └─ review + live (독립)
```

**순환 의존: 없음 ✅** — 모듈화 안전.

## 핵심 전역 변수 (모두 features/shared/state.ts 로 이전 권장)

| 변수 | 줄 | 타입 | 용도 |
|---|---|---|---|
| KEY | 13 | string | ADMIN_KEY 토큰 |
| IS_OWNER | 560 | boolean | true=admin / false=staff |
| currentRoomId | 613 | string \| null | 열린 방 ID |
| currentRoomStatus | 614 | string | active / closed |
| currentRoomPhone | 615 | string \| null | 직통번호 |
| currentRoomMembers | 616 | array | 방 멤버 |
| _roomsMode | 572 | string | external / internal |
| currentStatus | 2494 | string | 사용자 승인 필터 |
| currentProfileUserId | 2938 | number | 프로필 모달 대상 |
| currentEditingBizId | 2939 | number | 사업장 편집 |
| roomReplyingTo | 1272 | object | 답장 인용 |
| _pendingAttachments | 1566 | array | 첨부 대기 |
| curFilter | 3130 | string | 검증 탭 필터 |
| liveCurrentSession | 2342 | object | 실시간 세션 |
| livePollTimer | 2345 | number | 폴링 타이머 |

## ⚠️ 위험 함수 (모듈화 시 가장 신중히)

| 함수 | 모듈 | 위험도 | 이유 |
|---|---|---|---|
| doLogin | shared | 🔴 | ADMIN_KEY 검증, 세션 생성 |
| approveUser, rejectUser | users | 🔴 | 거래처 승인 (수익 영향) |
| approveDoc, rejectDocPrompt | documents | 🔴 | 영수증 승인 (회계 기록) |
| deleteCurrentRoom, deleteAdminMessage | rooms / messages | 🔴 | 영구 삭제 (복구 불가) |
| toggleRoomStatus, terminateCurrentRoomClient | rooms | 🟠 | 거래처 접근 차단 |
| convertMsgToReceiptAdmin | documents | 🟠 | 문서 타입 변경 |
| openRoom, loadRoomDetail | rooms | 🟠 | 폴링 시작 (리소스) |
| sendRoomMessage, sendRoomImage | messages | 🟠 | DB 기록 |
| openCustomerDashboard | clients | 🟠 | 거래처 정보 노출 |

## inline onclick 노출 필요 함수 (admin.html / staff.html)

총 130+ 개. 모듈화 후 `window.xxx = xxx` 로 노출 유지 필요. 점진 정리 (Phase 2 이후) 에서 addEventListener 로 전환.

대표 onclick:
- HTML line 25: `login()`
- HTML line 35-43: `tab(t)`
- HTML line 45-50: `openMyTodos()`, `openTerminationRequests()`, `openBulkSend()`, `openSearch()`, `togglePcNotify()`, `logout()`
- HTML line 82-93: `setClientTabMode()`, `userStatus()`
- HTML line 103: `openNewBusinessModal()`
- HTML line 376-399: `loadDocsTab()` 등 필터
- HTML line 417-447: `openCreateRoom()`, `openLabelManageModal()`, `openCustomerDashboardFromRoom()`, `openRoomSummary()`, `openRoomMemos()`, `callRoom()`, `renameRoom()`, `openRoomMembersModal()`, `toggleRoomStatus()`, `terminateCurrentRoomClient()`, `deleteCurrentRoom()`
- HTML line 483-499: `sendRoomImage()`, `sendRoomFile()` (file input onchange)

## staff.html / business.html 의존성

- **staff.html**: admin.js 통째 사용. IS_OWNER=false 분기로 일부 기능 비활성. 모듈화 시 features/shared/state 의 IS_OWNER 가 staff.html 진입 시 false 로 세팅되도록.
- **business.html**: admin.js **의존성 0** (자체 IIFE). admin/staff 에서 sessionStorage 로 ADMIN_KEY 받아서 자체 fetch. 모듈화 영향 없음. 단 features/clients/ 의 일부 코드와 중복되므로 Phase 2 후반에 통합 검토.

## Stage 2-2 우선 작업 (clients 모듈부터 시작)

가장 먼저 다룰 5 개 함수:
1. `openCustomerDashboard()` — 거래처 대시보드 진입 (이미 단독 페이지로 분리됨)
2. `loadBusinessList()` — 거래처 목록 (사용자 탭 기본)
3. `setClientTabMode()` — UI 전환 (사용자/업체)
4. `openProfileModal()` — 사용자 프로필 편집
5. `_csOpenFull()` — 고객 사이드패널 (회사·담당자 정보)

이 5 개를 features/clients/ 로 이전하면서 KEY/IS_OWNER 같은 전역 변수도 features/shared/state.ts 로 함께 이전.

## 모듈 분해 권장 순서

| Stage | 모듈 | 시간 | 난도 |
|---|---|---|---|
| 2-2a | shared (auth, utils, search, notify) | 3~4일 | 중 |
| 2-2b | clients (dashboard, list, labels) | 3~4일 | 중상 |
| 2-2c | users (profile, approval) | 2~3일 | 중 |
| 2-3 | rooms (polling, list, detail) | 4~5일 | 상 |
| 2-4 | messages (render, send, attach, ctx-menu) | 4~5일 | 상 |
| 2-5 | documents (receipt, approve, OCR) | 2~3일 | 중상 |
| 2-6 | memos / batch / review (골격만) | 1~2일 | 중 |
| 2-7 | pages/admin/staff/business entry + Vite 전환 | 1~2일 | 상 |
| 2-8 | 회귀 검증 + 본 운영 배포 | 1~2일 | 매우 상 |

총 약 3~4 주 (원래 추정 1.5~2주 보다 길어짐 — 4,039줄 + 위험 함수 다수로 신중함 필요).

## Phase 2 이후 추가 정리 (Phase 3~4)

- inline onclick → addEventListener 전환 (HTML 도 점진 정리)
- features/clients/ 와 business.html 의 중복 코드 통합
- nanostores 도입으로 상태 관리 일원화 (현재는 module 내 전역 변수)
- TypeScript strict 격상 (noUncheckedIndexedAccess, exactOptionalPropertyTypes)

## 검증 전략

각 Stage 끝마다:
1. 로컬 빌드 (`npm run build`) 통과
2. 로컬 wrangler pages dev (`npm run pages:dev`) 로 admin/staff 정상 로딩
3. Playwright 자동 회귀 (사용자 조작 없이 시각·기능 검증)
4. 위험 함수 영역 (로그인·승인·삭제) 별도 수동 점검

각 Stage main 머지 시:
1. feature branch push → Cloudflare Preview
2. Preview URL 회귀 점검 (Playwright + 수동)
3. main 머지 → 본 운영 5분 모니터링
4. 회귀 발견 시 즉시 Cloudflare Rollback

## 참고

- admin.js 원본 줄 번호는 분석 시점 (2026-04-28) 기준. 향후 main 변동 시 갱신 필요.
- 이 문서는 Phase 2 완료 시점에 archive 또는 삭제 예정.
