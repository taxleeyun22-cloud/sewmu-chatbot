# 🔄 Mutation 후 UI 갱신 절대 룰

**시행**: 2026-05-08 (사장님 결정)

## 룰

모든 admin UI mutation 함수 (POST/PUT/DELETE) 호출 후 **무조건 `mutationDone()` 호출**.

```js
const r = await fetch(...);
const d = await r.json();
if (d.ok) {
  if (typeof mutationDone === 'function') {
    mutationDone({
      users: true,        // 사용자 list 갱신 필요?
      businesses: false,  // 업체 list 갱신 필요?
      rooms: false,       // 상담방 list 갱신 필요?
      memos: false,       // 거래처 dashboard 메모 갱신 필요?
      messages: false,    // 메시지 갱신 필요? (Phase 3.8)
      filings: false,     // 신고 Case 갱신 필요? (Phase 3.10)
      // sidebar: true (default — 사이드바 카운트 자동)
    });
  }
}
```

## 핵심

1. fetch (POST/PUT/DELETE) 호출 후 → **무조건 `mutationDone()` 호출**
2. 영향받는 영역만 옵션으로 (users / businesses / rooms / memos / messages / filings)
3. sidebar 카운트는 default true (대부분 mutation 영향)
4. 30초 polling 에 의존 X — 즉시 갱신
5. cross-page 변경 (예: business.html 의 삭제 → admin.html) 은 `localStorage.setItem('_bizListDirty', String(Date.now()))` signal → admin focus/pageshow 시 자동 reload

## 구현 위치

- `admin.js` 의 `mutationDone(opts)` — 공통 헬퍼
- `admin.js` 의 `_checkCrossPageDirty()` — focus/pageshow/storage 이벤트 listener (cross-page signal 처리)

## 향후 (3단계 React 마이그레이션)

nanostores store + React 컴포넌트로 자동 reactive update. mutation 시 `$store.set(...)` 만 → UI 자동 갱신. mutationDone 호출 누락 가능성 0.

## 과거 사고

9건 발견 (업체 삭제 후 list 안 사라짐 / 사용자 status 변경 후 사이드바 카운트 옛값 / 메모 삭제 후 휴지통 배지 안 갱신 / 단체발송 후 상담방 last_message 옛값 / etc).

**원인**: admin UI 의 mutation 함수마다 reload 호출 수동 — 누락 쉬움. 30초 polling 의 가짜 안전감.
