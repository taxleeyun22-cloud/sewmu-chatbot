# @sewmu/admin — 사장님 admin (Next.js 15)

**Status**: Week 4-5 시작 예정 (현재 Week 1 골격만)

## 마이그레이션 대상

기존 `admin.html` + `admin.js` (4500줄) + `admin-*.js` (10+ 파일) → Next.js App Router.

## 페이지 구조 (계획)

```
app/admin/
  layout.tsx              # 사이드바 + 헤더
  dashboard/page.tsx       # 대시보드 (실시간 count)
  users/
    page.tsx               # 사용자 list (status 별 탭)
    [id]/page.tsx          # 거래처 dashboard
  businesses/
    page.tsx               # 업체 list
    [id]/page.tsx          # 업체 dashboard
  rooms/
    page.tsx               # 상담방 list
    [roomId]/page.tsx      # 상담방 상세 (메시지)
  memos/page.tsx           # 메모 통합
  filings/page.tsx         # 신고 검토표
  docs/page.tsx            # 문서
  search/page.tsx          # 전역 검색 (Cmd+K)
  bulk-send/page.tsx       # 단체발송
  analytics/page.tsx       # 분석
```

## Week 4 우선순위

1. layout + 사이드바 (shadcn/ui)
2. dashboard (실시간 count)
3. users (사장님 매일 워크플로 핵심)
4. businesses
