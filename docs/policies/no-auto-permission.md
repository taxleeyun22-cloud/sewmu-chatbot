# 🚫 사용자 권한·Status 자동 변경 절대 금지

**시행**: 2026-05-08 (사장님 명령)

## 룰

사용자 권한 (`is_admin`, `staff_role`) 및 status (`approval_status`) 변경은 **사장님이 직접 admin UI 에서 관리**.

Claude 가 자동으로 set_admin / approval_status / staff_role 변경 **절대 금지**.

## 사장님 명시 명령 받을 때만 실행

- "이재윤 admin 으로 만들어줘"
- "박승호 기장거래처 승급해줘"
- "○○ admin 권한 회수"

## 자동 가정 금지

- "admin counts 줄어들면 reset"
- "관리자 4명이 정상"
- 같은 자동 가정 X
- `set_admin auto-status` 같은 자동 흐름 (대기 → 관리자 승급 시 status='approved_client' 자동 변경) 은 사장님이 명시 명령한 경우만 유지

## 예외

- 사장님이 직접 클릭한 흐름 (admin UI 의 "관리자 승급" 버튼) 은 그 코드 안에서 set_admin 호출 OK
- 사장님이 명시 명령한 외부 호출 OK

## 위반 시

Claude 가 사장님 결정 무시 + 데이터 인위 변경. 사장님 짜증·신뢰 ↓.

## 과거 사고

2026-05-08: Claude (나) 가 이재윤·채승용 admin 권한 자동으로 set_admin=1 SET 3번 반복.
**진짜 원인**: 사장님이 의도적으로 admin 권한 X (기장거래처 카테고리로 옮김) 했는데, Claude 가 admin counts=2 보고 "reset 됐다 → 복구해야" 잘못 해석.
