# 🚨 UI 박살 방지 절대 규칙

**시행**: 2026-04-21

## 룰

**"뭐 수정했을 때 UI 박살나면 안 된다."** 코드 로직만 고치다가 스타일·레이아웃이 망가져 사용자가 고생한 사고 반복됨.

## 수정 전 필수 체크

### 엘리먼트 태그 교체 시 (`<input>`→`<textarea>`, `<button>`→`<a>` 등)
- 관련 CSS 셀렉터를 `grep`으로 전부 확인 (`.wrap input{}`, `#id`, `tag{}`)
- **태그 기반 셀렉터**는 교체 후 무효화됨 → `.wrap input, .wrap textarea {}` 처럼 **selector grouping** 으로 확장

### 헤더/툴바에 버튼 추가 시
- 타이틀 영역에 `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` 있는지 확인 없으면 먼저 추가
- 부모 `flex-wrap` 요소는 `flex:1; min-width:0; overflow:hidden` 세 개 모두 있어야 안전
- 모바일(360-400px) 기준 버튼 총 너비가 헤더를 넘기지 않는지

### CSS 기본값 차이 주의
- `<input>` vs `<textarea>`: 기본 `line-height`·`rows`·`resize handle` 다름 → `resize:none; line-height:1.4` 명시
- `<a>` vs `<button>`: `<a>`는 기본 `display:inline` → 필요 시 `display:inline-flex`

### 캐시 버스팅 (Phase Infra-1 이후 자동)
- 매 build 시 git commit hash 자동 적용 (vite.config.ts autoCacheBustPlugin)
- 수동 ++ 폐기

## 과거 사고

- 2026-04-21: input→textarea 교체 시 `.input-bar input{}`·`.rc-input-area input{}` 셀렉터가 input 전용이라 textarea 찌그러짐 → 복구 커밋 `dfafdab`
- 2026-04-21: 헤더에 📞 버튼 추가했더니 `#rcTitle`에 nowrap/ellipsis 없어 모바일에서 한글이 세로로 한 글자씩 접힘 → 복구 커밋 `3e48f65`

## 수정 후 필수 확인

- 입력창 폭·높이 정상인지 (모바일·PC)
- 헤더 타이틀 말줄임 정상 동작인지 (좁은 폭에서 "세무회계 이윤 이재윤대표" 같은 긴 이름)
- 기존 기능 회귀 없는지 (보낸 메시지 렌더·스크롤·탭 전환)
