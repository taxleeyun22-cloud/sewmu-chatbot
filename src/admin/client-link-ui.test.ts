/**
 * 🔗 위하고 대조·연결 모달 (admin-users-tab.js openClientLink) — 화면 계약.
 *
 * admin-users-tab.js 는 classic script 라 import 할 수 없어, 실제 배포 파일에서 이 모달 부분을 잘라 평가한다.
 *
 * 여기서 지키는 것:
 *  1. 생년월일까지 맞는 위하고 사람이 1명이면 기본으로 "합치기" 선택 — 그 사람의 사업장은 체크 고정 ("합치면 같이 연결")
 *  2. 확실·유력은 기본 체크, 확인 필요는 기본 해제 (사장님이 직접 판단)
 *  3. 카톡·네이버 계정인 사람은 고를 수 없다
 *  4. [연결] 은 사장님 확인 후 한 번만 POST — 합치면 따라오는 사업장은 links 에 다시 넣지 않는다
 *  5. 이름은 escape
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync('admin-users-tab.js', 'utf8');
const s = src.indexOf('let _clm=null;');
const eIdx = src.indexOf('}finally{btn.disabled=false;btn.textContent=\'🔗 연결\';}\n}', s);
const chunk = src.slice(s, eIdx + '}finally{btn.disabled=false;btn.textContent=\'🔗 연결\';}\n}'.length);
const jsArgSrc = src.slice(src.indexOf('function jsArg('), src.indexOf('\n', src.indexOf('function jsArg(')));

type Api = Record<string, (...a: any[]) => any> & { state: () => any };
let calls: { url: string; init?: any }[];
let api: Api;
let confirmSpy: ReturnType<typeof vi.fn>;
let mutation: ReturnType<typeof vi.fn>;

const esc = (x: unknown) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const DATA = {
  ok: true,
  user: { id: 500, real_name: '홍길동', phone: '010-1111-2222', claim_business_number: '2010000003', has_birth: true },
  claims_ok: true,
  entered: { id: 3, company_name: '병식당' },
  notes: ['동명이인(같은 이름·생년월일 다름) 이 있어 제외했습니다'],
  persons: [
    { user_id: 100, name: '홍길동', birth_match: true, phone_match: true, has_birth: true, business_ids: [1, 3], mergeable: true },
    { user_id: 600, name: '<b>홍</b>', birth_match: false, has_birth: false, business_ids: [], mergeable: false },
  ],
  businesses: [
    { business_id: 1, company_name: '(주)갑', business_number: '1018100001', form: '법인', grade: 'sure', evidence: { name: true, birth: true }, suggested_role: '대표자', already_linked_kakao: [] },
    { business_id: 3, company_name: '병식당', business_number: '2010000003', form: '개인', grade: 'sure', evidence: { biz_no: true, name: true, birth: true }, suggested_role: '대표자', already_linked_kakao: [] },
    { business_id: 5, company_name: '(주)갑 대구지점', business_number: '1018100005', form: '법인', branch: true, grade: 'likely', evidence: { name: true, corp_group: true }, suggested_role: '대표자', already_linked_kakao: [] },
    { business_id: 7, company_name: '<script>x</script>상사', business_number: '3000000007', form: '개인', grade: 'check', evidence: {}, suggested_role: '담당자', already_linked_kakao: ['김카톡'] },
  ],
};

beforeEach(() => {
  document.body.innerHTML = '<div id="clientLinkModal" style="display:none"></div><div id="clmBody"></div><span id="clmSummary"></span><button id="clmSubmit"></button>';
  calls = [];
  confirmSpy = vi.fn(() => true);
  mutation = vi.fn();
  const fetchStub = async (url: string, init?: any) => {
    calls.push({ url, init });
    if (url.startsWith('/api/admin-client-match')) return { ok: true, json: async () => JSON.parse(JSON.stringify(DATA)) };
    return { ok: true, json: async () => ({ ok: true, total_businesses: 3, rooms_joined: 1 }) };
  };
  const $g = (id: string) => document.getElementById(id);
  api = new Function('fetch', 'confirm', 'alert', 'mutationDone', 'refreshPendingBadge', 'loadUsers', 'openApproveWithBusiness', '$g', 'e', 'escAttr', 'KEY',
    jsArgSrc + '\n' + chunk + '\nreturn {openClientLink, closeClientLink, submitClientLink, _clmRender, _clmPicked, state: () => _clm};')(
    fetchStub, confirmSpy, vi.fn(), mutation, vi.fn(), vi.fn(), vi.fn(), $g, esc, esc, 'K') as Api;
});

const box = (bid: number) => {
  const all = [...document.querySelectorAll('#clmBody input[type=checkbox]')] as HTMLInputElement[];
  return all.find((x) => (x.getAttribute('onchange') || '').includes('[' + bid + ']'))!;
};

describe('위하고 대조·연결 모달', () => {
  it('생년월일 맞는 위하고 사람이 1명이면 합치기 기본 선택 + 그 사람 사업장은 체크 고정', async () => {
    await api.openClientLink(500, '홍길동', '010-1111-2222');
    expect(api.state().mergeId).toBe(100);
    expect(box(1).checked && box(1).disabled).toBe(true);
    expect(box(3).checked && box(3).disabled).toBe(true);
    expect(document.getElementById('clmBody')!.innerHTML).toContain('합치면 같이 연결');
  });

  it('유력(지점)은 기본 체크, 확인 필요는 기본 해제', async () => {
    await api.openClientLink(500, '홍길동', '');
    expect(box(5).checked).toBe(true);
    expect(box(5).disabled).toBe(false);
    expect(box(7).checked).toBe(false);
    expect(document.getElementById('clmBody')!.innerHTML).toContain('이미 연결된 카톡 계정: 김카톡');
  });

  it('카톡 계정인 사람은 고를 수 없고, 이름은 escape', async () => {
    await api.openClientLink(500, '홍길동', '');
    const radios = [...document.querySelectorAll('input[name=clmPerson]')] as HTMLInputElement[];
    expect(radios).toHaveLength(3);                     /* 합치지 않음 + 2명 */
    expect(radios[2].disabled).toBe(true);
    const html = document.getElementById('clmBody')!.innerHTML;
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>홍</b>');
  });

  it('합치지 않음을 고르면 고정이 풀리고 직접 체크한 것만 보낸다', async () => {
    await api.openClientLink(500, '홍길동', '');
    api.state().mergeId = null;
    api._clmRender();
    expect(box(1).disabled).toBe(false);
    expect(api._clmPicked().map((l: any) => l.business_id)).toEqual([1, 3, 5]);
  });

  it('[연결]: 확인 후 POST 한 번 — 합치면 따라오는 사업장은 links 에 넣지 않는다', async () => {
    await api.openClientLink(500, '홍길동', '');
    await api.submitClientLink();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('(주)갑 대구지점');
    const p = calls.filter((c) => c.url.startsWith('/api/admin-client-link'));
    expect(p).toHaveLength(1);
    expect(JSON.parse(p[0].init.body)).toEqual({
      user_id: 500, merge_user_id: 100, links: [{ business_id: 5, role: '대표자' }], join_rooms: true,
    });
    expect(mutation).toHaveBeenCalledWith(expect.objectContaining({ users: true }));
  });

  it('확인 창에서 취소하면 아무것도 안 보낸다', async () => {
    confirmSpy.mockReturnValue(false);
    await api.openClientLink(500, '홍길동', '');
    await api.submitClientLink();
    expect(calls.some((c) => c.url.startsWith('/api/admin-client-link'))).toBe(false);
  });
});
