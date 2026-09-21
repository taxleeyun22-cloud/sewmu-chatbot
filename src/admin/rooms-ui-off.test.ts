/**
 * 상담방 화면 내리기 (2026-09-21 사장님: "상담방 내리고 카톡연결로 가자")
 *
 * 사장님이 상담방 채팅을 안 쓰는 상태라 화면에서만 내렸다.
 * ⚠ 방은 채팅 말고도 5가지의 배관이다 — 웹푸시 · D-day 알림 · 단체발송 ·
 *   영수증/서류 업로드 · 검토표 ↔ 거래처 연결. 이것들을 같이 끄면 안 된다.
 *
 * classic script 라 import 할 수 없어 소스로 검사한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const adminJs = readFileSync('admin.js', 'utf8');
const indexJs = readFileSync('index.js', 'utf8');
const chatJs = readFileSync('functions/api/chat.js', 'utf8');

describe('상담방 — 화면에서만 내린다', () => {
  it('플래그 하나로 되살릴 수 있다', () => {
    expect(adminJs).toContain('var ROOMS_UI = false;');
    expect(indexJs).toContain('var ROOMS_UI = false;');
  });

  it('admin 사이드바·탭을 숨긴다', () => {
    expect(adminJs).toContain('[data-admin-tab="rooms"]');
    expect(adminJs).toContain("getElementById('tabRooms')");
  });

  it('관리자방(내부 업무방)은 안 내린다', () => {
    /* 거래처 상담방만 내리는 것이지 직원 내부방은 그대로다.
       admin.js 다른 곳에서는 internal 탭을 정상적으로 쓰므로 숨김 함수만 본다. */
    const i = adminJs.indexOf('function _hideRoomsUi()');
    const fn = adminJs.slice(i, adminJs.indexOf('\nfunction tab(t){', i));
    expect(fn).toContain('[data-admin-tab="rooms"]');
    expect(fn).not.toContain('[data-admin-tab="internal"]');
  });

  it('딥링크·푸시 클릭 경로는 살려 둔다', () => {
    /* 이미 나간 알림을 눌렀을 때 방이 열려야 한다 */
    expect(adminJs).toContain('function tab(t){');
    expect(indexJs).toContain('function openMyRoom(');
    /* 방을 아예 못 열게 막아 버리면 안 된다 */
    expect(indexJs).not.toMatch(/function openMyRoom\([^)]*\)\{\s*return;/);
  });

  it('거래처 화면에서 상담방 목록을 안 그린다', () => {
    const fn = indexJs.slice(indexJs.indexOf('async function loadMyRooms('));
    expect(fn.slice(0, 400)).toContain('if(!ROOMS_UI)');
  });
});

describe('문의 창구 — 카톡', () => {
  it('링크가 상수 하나다 (바꿀 때 한 줄만 고친다)', () => {
    expect(indexJs).toMatch(/var KAKAO_CHAT_URL = '[^']+';/);
    expect(chatJs).toMatch(/const KAKAO_CHAT_URL = "[^"]+";/);
    /* 하드코딩된 링크가 흩어져 있으면 바꿀 때 빠뜨린다 */
    expect((chatJs.match(/pf\.kakao\.com/g) || []).length).toBeLessThanOrEqual(1);
  });

  it('챗봇 답변 버튼이 카톡으로 간다', () => {
    expect(indexJs).toContain('function askTaxAccountantOnKakao(');
    expect(indexJs).toContain('이 내용으로 세무사에게 문의');
  });

  it('프롬프트가 더 이상 상담방으로 유도하지 않는다', () => {
    const body = chatJs.slice(chatJs.indexOf('const FIL_FIELDS_PERSON'));
    expect(body).not.toContain('상담방');
  });
});
