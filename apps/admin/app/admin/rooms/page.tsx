/**
 * Phase Next-Week5 (2026-05-09): /admin/rooms.
 * 기존 admin-rooms-list.js + admin-rooms-msg.js + admin-rooms-misc.js 마이그레이션.
 */
'use client';

export default function RoomsPage() {
  return (
    <div className="flex h-full">
      {/* 왼쪽: 상담방 list */}
      <div className="w-80 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <input
            type="text"
            placeholder="🔍 상담방 검색"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-xs text-gray-400 text-center py-12">
            Day 2 마이그레이션:
            <br />· 라벨별 필터
            <br />· 미읽음 카운트
            <br />· 최근 메시지 미리보기
          </p>
        </div>
      </div>

      {/* 오른쪽: 메시지 영역 */}
      <div className="flex-1 flex flex-col bg-gray-50">
        <div className="p-4 border-b border-gray-200 bg-white">
          <p className="text-sm text-gray-500">상담방을 선택하세요</p>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Phase Next-Week5 — 상담방 메시지 영역 (Day 2 본격)
        </div>
      </div>
    </div>
  );
}
