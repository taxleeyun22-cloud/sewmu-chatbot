/* 💼 영업 파이프라인 — 옛 admin 네이티브 모달 (2026-07-16 사장님: "그냥 한 곳에 있지 다른 사이트가 떠버리노")
 * 새 admin /admin/sales-pipeline 페이지와 같은 백엔드(/api/sales-pipeline) 사용.
 * 리스트(필터·검색) + 상세 타임라인 + 기록(결과→단계 자동) + 리드 추가 + 담당 변경 + 승인대기 배너.
 * 발굴(영업 타겟)은 검토표 tRPC 기반이라 당분간 새 admin — 여기서 [발굴 열기] 링크만 제공. */

var _spAll = [], _spSum = null, _spToday = '', _spTab = 'all', _spQ = '';
var _spSel = null, _spDetail = null, _spStaff = [], _spPending = [], _spNewMode = false;

var _SP_STAGE = { lead: '리드', contacted: '연락함', consulting: '상담중', proposal: '제안', won: '성사', hold: '보류', lost: '무산' };
var _SP_STAGE_CSS = {
  lead: 'background:#f2f4f6;color:#4e5968', contacted: 'background:#eff6ff;color:#2563eb',
  consulting: 'background:#f5f3ff;color:#7c3aed', proposal: 'background:#fffbeb;color:#b45309',
  won: 'background:#ecfdf5;color:#059669', hold: 'background:#fff7ed;color:#c2410c', lost: 'background:#fef2f2;color:#dc2626',
};
var _SP_TYPE = { pension: '연금 절세', insurance: '보험', incorporation: '법인전환', income: '소득률', new_biz: '신규 기장', referral: '소개', other: '기타' };
var _SP_RESULT = { called: '📞 통화됨', missed: '📵 부재중', meeting: '🗓 상담 잡힘', sent: '📄 견적·제안', won: '🎉 계약', lost: '✕ 거절', hold: '⏸ 보류', note: '✏️ 메모' };
var _SP_ACTIVE = ['lead', 'contacted', 'consulting', 'proposal'];

function _spKeyQS() { var k = (typeof KEY !== 'undefined' && KEY) ? KEY : ''; return k ? ('key=' + encodeURIComponent(k)) : ''; }
function _spUrl(extra) { var qs = [_spKeyQS(), extra || ''].filter(Boolean).join('&'); return '/api/sales-pipeline' + (qs ? ('?' + qs) : ''); }
function _spEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _spTodayStr() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function _spAddDays(n) { return new Date(Date.now() + 9 * 3600 * 1000 + n * 86400000).toISOString().slice(0, 10); }

function openSalesPipe() {
  var m = document.getElementById('salesPipeModal');
  if (!m) { window.open('https://sewmu-admin.pages.dev/admin/sales-pipeline', '_blank'); return; }
  m.style.display = 'flex';
  _spNewMode = false;
  _spFetch(); _spMeta();
}
function closeSalesPipe() {
  var m = document.getElementById('salesPipeModal');
  if (m) m.style.display = 'none';
}

async function _spFetch() {
  try {
    var r = await fetch(_spUrl('view=list'), { credentials: 'same-origin' });
    var d = await r.json();
    if (d.error) throw new Error(d.error);
    _spAll = d.leads || []; _spSum = d.summary || null; _spToday = d.today || _spTodayStr();
    if (_spSel && !_spAll.some(function (l) { return l.id === _spSel; })) _spSel = null;
    _spRender();
  } catch (e) {
    var el = document.getElementById('spList');
    if (el) el.innerHTML = '<div class="sp-empty">불러오기 실패: ' + _spEsc(e.message) + '</div>';
  }
}
async function _spMeta() {
  try {
    var r = await fetch(_spUrl('view=meta'), { credentials: 'same-origin' });
    var d = await r.json();
    _spStaff = d.staff || []; _spPending = d.pending || [];
    _spRenderHead();
  } catch (_) {}
}

function _spVisible() {
  var t = _spToday;
  return _spAll.filter(function (l) {
    if (_spTab === 'todo') return _SP_ACTIVE.indexOf(l.stage) >= 0 && l.next_action_date && l.next_action_date <= t;
    if (_spTab === 'active') return _SP_ACTIVE.indexOf(l.stage) >= 0 || l.stage === 'hold';
    if (_spTab === 'won') return l.stage === 'won';
    if (_spTab === 'lost') return l.stage === 'lost';
    return true;
  }).filter(function (l) {
    if (!_spQ.trim()) return true;
    return ((l.name || '') + ' ' + (l.company || '') + ' ' + (l.phone || '')).indexOf(_spQ.trim()) >= 0;
  });
}

function _spRender() { _spRenderHead(); _spRenderList(); _spRenderDetail(); }

function _spRenderHead() {
  var el = document.getElementById('spHead');
  if (!el) return;
  var s = _spSum || {};
  var chips = '<span class="sp-chip blue">오늘 팔로업 ' + (s.today || 0) + '</span>'
    + ((s.overdue || 0) > 0 ? '<span class="sp-chip red">지남 ' + s.overdue + '</span>' : '')
    + ((s.noAction || 0) > 0 ? '<span class="sp-chip red" style="border:1px dashed #fca5a5">⚠ 액션없음 ' + s.noAction + '</span>' : '')
    + '<span class="sp-chip gray">진행중 ' + (s.active || 0) + '</span>'
    + '<span class="sp-chip green">이번달 성사 ' + (s.wonMonth || 0) + ' 🎉</span>';
  var pend = '';
  if (_spPending.length) {
    pend = '<div class="sp-pend">💬 챗봇 승인대기 ' + _spPending.length + '명 — 먼저 손 든 리드'
      + _spPending.slice(0, 4).map(function (p) {
        return ' <button type="button" onclick="_spAddPending(' + p.id + ')">＋ ' + _spEsc(p.name || ('#' + p.id)) + '</button>';
      }).join('') + '</div>';
  }
  el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' + chips
    + '<a href="https://sewmu-admin.pages.dev/admin/sales-targets" target="_blank" rel="noopener" class="sp-mini" title="검토표 기반 발굴 (연금·보험·법인전환·소득률)">🎯 발굴 열기 ↗</a>'
    + '<button type="button" class="sp-new" onclick="_spNewLead()">＋ 리드 추가</button>'
    + '</div>' + pend;
}

function _spRenderList() {
  var el = document.getElementById('spList');
  if (!el) return;
  var tabs = [['all', '전체'], ['todo', '오늘 할 일'], ['active', '진행중'], ['won', '성사'], ['lost', '무산']];
  var bar = '<div class="sp-tabs">' + tabs.map(function (t) {
    return '<button type="button" class="sp-tab' + (_spTab === t[0] ? ' on' : '') + '" onclick="_spSetTab(\'' + t[0] + '\')">' + t[1] + '</button>';
  }).join('')
    + '<input class="sp-search" placeholder="이름·업체·전화 검색" value="' + _spEsc(_spQ) + '" oninput="_spQ=this.value;_spRenderListOnly()">'
    + '</div>';
  el.innerHTML = bar + '<div class="sp-rows" id="spRows"></div>';
  _spRenderRows();
}
function _spRenderListOnly() { _spRenderRows(); }
function _spRenderRows() {
  var el = document.getElementById('spRows');
  if (!el) return;
  var v = _spVisible();
  if (!v.length) {
    el.innerHTML = '<div class="sp-empty">' + (_spTab === 'todo' ? '오늘 팔로업 없음 🎉' : '리드가 없습니다 — [＋ 리드 추가] 또는 🎯 발굴에서 담아오세요') + '</div>';
    return;
  }
  el.innerHTML = v.map(function (l) {
    var over = l.next_action_date && l.next_action_date < _spToday && _SP_ACTIVE.indexOf(l.stage) >= 0;
    var isToday = l.next_action_date === _spToday;
    var next;
    if (l.stage === 'won') next = '<span style="color:#059669">완료</span>';
    else if (l.stage === 'lost') next = '<span style="color:#9aa0a6">' + _spEsc(l.lost_reason || '—') + '</span>';
    else if (!l.next_action_date) next = '<span style="color:#dc2626;font-weight:800">⚠ 없음</span>';
    else next = '<span style="' + (over ? 'color:#dc2626;font-weight:800' : isToday ? 'color:#2563eb;font-weight:800' : 'color:#6b7280') + '">'
      + (over ? '🔥 ' : '') + (isToday ? '오늘' : _spEsc(l.next_action_date.slice(5).replace('-', '/'))) + ' ' + _spEsc(l.next_action || '') + '</span>';
    return '<button type="button" class="sp-row' + (l.id === _spSel ? ' on' : '') + '" onclick="_spOpen(' + l.id + ')">'
      + '<div style="flex:1;min-width:0"><div class="sp-nm">' + _spEsc(l.name) + (l.company ? ' <span class="sp-co">' + _spEsc(l.company) + '</span>' : '') + '</div>'
      + '<div class="sp-sub">' + _spEsc(_SP_TYPE[l.lead_type] || l.lead_type) + ' · ' + next + (l.assignee_name ? ' · ' + _spEsc(l.assignee_name) : '') + '</div></div>'
      + '<span class="sp-pill" style="' + (_SP_STAGE_CSS[l.stage] || '') + '">' + (_SP_STAGE[l.stage] || l.stage) + (l.stage === 'won' ? ' 🎉' : '') + '</span>'
      + '</button>';
  }).join('');
}
function _spSetTab(t) { _spTab = t; _spRenderList(); }

async function _spOpen(id) {
  _spSel = id; _spNewMode = false;
  _spRenderRows();
  var el = document.getElementById('spDetail');
  if (el) el.innerHTML = '<div class="sp-empty">불러오는 중...</div>';
  try {
    var r = await fetch(_spUrl('id=' + id), { credentials: 'same-origin' });
    var d = await r.json();
    if (d.error) throw new Error(d.error);
    _spDetail = d;
    _spRenderDetail();
  } catch (e) {
    if (el) el.innerHTML = '<div class="sp-empty">오류: ' + _spEsc(e.message) + '</div>';
  }
}

function _spRenderDetail() {
  var el = document.getElementById('spDetail');
  if (!el) return;
  if (_spNewMode) { _spRenderNewForm(el); return; }
  if (!_spSel || !_spDetail || !_spDetail.lead || _spDetail.lead.id !== _spSel) {
    el.innerHTML = '<div class="sp-empty" style="padding:60px 16px">왼쪽에서 리드를 선택하세요<br>타임라인과 기록 입력이 여기 표시됩니다</div>';
    return;
  }
  var l = _spDetail.lead, logs = _spDetail.logs || [];
  var active = _SP_ACTIVE.indexOf(l.stage) >= 0 || l.stage === 'hold';
  var track = ['lead', 'contacted', 'consulting', 'proposal', 'won'];
  var ti = track.indexOf(l.stage);
  var staffOpts = '<option value="">담당 없음</option>' + _spStaff.map(function (s) {
    return '<option value="' + s.id + '"' + (l.assignee_user_id === s.id ? ' selected' : '') + '>' + _spEsc(s.name) + '</option>';
  }).join('');
  var html = '<div class="sp-dhead">'
    + '<b style="font-size:1.05em">' + _spEsc(l.name) + '</b>'
    + '<span class="sp-pill" style="' + (_SP_STAGE_CSS[l.stage] || '') + '">' + (_SP_STAGE[l.stage] || l.stage) + (l.stage === 'won' ? ' 🎉' : '') + '</span>'
    + '<select class="sp-staff" onchange="_spSetAssignee(' + l.id + ', this.value)">' + staffOpts + '</select>'
    + '</div>'
    + '<div class="sp-dmeta">' + (l.company ? _spEsc(l.company) + ' · ' : '') + _spEsc(_SP_TYPE[l.lead_type] || l.lead_type)
    + (l.phone ? ' · <a href="tel:' + _spEsc(l.phone) + '" style="color:#2563eb;font-weight:700;text-decoration:none">' + _spEsc(l.phone) + '</a>' : '')
    + (active && l.next_action_date ? ' · 다음: <b>' + _spEsc(l.next_action_date) + ' ' + _spEsc(l.next_action || '') + '</b>' : '') + '</div>'
    + '<div class="sp-track">' + track.map(function (s, i) {
      return '<span class="' + (ti === i ? 'cur' : (ti > i ? 'done' : '')) + '">' + _SP_STAGE[s] + '</span>';
    }).join('') + '</div>';
  if (l.stage === 'hold') html += '<div class="sp-note" style="background:#fff7ed;color:#c2410c">⏸ 보류 — ' + _spEsc(l.next_action_date || '') + ' 재접촉 예정</div>';
  if (l.stage === 'lost') html += '<div class="sp-note" style="background:#fef2f2;color:#dc2626">✕ 무산 — ' + _spEsc(l.lost_reason || '사유 미기록') + '</div>';
  if (l.stage === 'won') html += '<div class="sp-note" style="background:#ecfdf5;color:#059669">🎉 ' + _spEsc((l.won_at || '').slice(0, 10)) + ' 성사 — 신규 기장이면 사용자 탭에서 승인 + 업체 연결</div>';

  if (active) {
    html += '<div class="sp-rec">'
      + '<textarea id="spRecTxt" rows="2" placeholder=\'뭐 했는지 한 줄 — 예: "통화 8분, 노란우산 문의. 다음주 방문"\'></textarea>'
      + '<div class="sp-recnext">다음 액션 <input id="spRecAct" placeholder="예: 시뮬레이션 전달"> <input type="date" id="spRecDate" value="' + _spAddDays(3) + '"> <span>← 진행형 결과는 필수</span></div>'
      + '<div class="sp-btns">'
      + [['called', '📞 통화됨', '#eff6ff;color:#1d4ed8'], ['missed', '📵 부재중', '#f2f4f6;color:#4e5968'], ['meeting', '🗓 상담 잡힘', '#f5f3ff;color:#7c3aed'], ['sent', '📄 견적·제안', '#fffbeb;color:#b45309'], ['note', '✏️ 메모', '#f8f9fa;color:#6b7280'], ['won', '🎉 계약!', '#10b981;color:#fff'], ['hold', '⏸ 보류', '#fff7ed;color:#c2410c'], ['lost', '✕ 거절', '#fef2f2;color:#dc2626']]
        .map(function (b) { return '<button type="button" style="background:' + b[2] + '" onclick="_spLog(\'' + b[0] + '\')">' + b[1] + '</button>'; }).join('')
      + '</div></div>';
  }
  html += '<div class="sp-tl">' + (logs.length ? logs.map(function (g) {
    return '<div class="sp-tli"><div class="sp-tlh">' + (_SP_RESULT[g.result] || '단계 변경')
      + (g.stage_after && ['meeting', 'sent', 'won', 'lost', 'hold', 'called'].indexOf(g.result) >= 0 ? ' <span class="sp-pill sm" style="' + (_SP_STAGE_CSS[g.stage_after] || '') + '">' + (_SP_STAGE[g.stage_after] || '') + '</span>' : '')
      + ' <span class="sp-tld">' + _spEsc((g.created_at || '').slice(5, 16)) + ' · ' + _spEsc(g.actor_name || '') + '</span></div>'
      + (g.content ? '<div class="sp-tlb">' + _spEsc(g.content) + '</div>' : '') + '</div>';
  }).join('') : '<div class="sp-empty">기록이 없습니다</div>') + '</div>';
  el.innerHTML = html;
}

async function _spLog(result) {
  if (!_spSel) return;
  var txt = (document.getElementById('spRecTxt') || {}).value || '';
  var act = (document.getElementById('spRecAct') || {}).value || '';
  var date = (document.getElementById('spRecDate') || {}).value || '';
  var body = { lead_id: _spSel, content: txt, result: result };
  if (['called', 'missed', 'meeting', 'sent', 'note'].indexOf(result) >= 0) {
    if (!date) { alert('다음 액션 날짜를 잡아주세요 — 리드가 잊히지 않게'); return; }
    if (result === 'note' && !txt.trim()) { alert('내용을 입력해주세요'); return; }
    body.next_action = act || undefined; body.next_action_date = date;
  }
  if (result === 'hold') {
    var hu = prompt('언제 다시 접촉할까요? (YYYY-MM-DD)', _spAddDays(30));
    if (!hu) return;
    body.hold_until = hu;
  }
  if (result === 'lost') {
    var reason = prompt('거절 사유 (통계용 — 예: 수수료 / 타사무소 / 폐업)', txt || '');
    if (reason === null) return;
    body.lost_reason = reason;
  }
  try {
    var r = await fetch(_spUrl('action=log'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'fail');
    await _spFetch();
    _spOpen(_spSel);
  } catch (e) { alert('기록 실패: ' + (e.message || e)); }
}

async function _spSetAssignee(id, val) {
  try {
    var r = await fetch(_spUrl(), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ id: id, assignee_user_id: Number(val) || null }) });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'fail');
    _spFetch(); if (_spSel === id) _spOpen(id);
  } catch (e) { alert('담당 변경 실패: ' + (e.message || e)); }
}

async function _spAddPending(uid) {
  var p = null;
  for (var i = 0; i < _spPending.length; i++) if (_spPending[i].id === uid) { p = _spPending[i]; break; }
  if (!p) return;
  try {
    var r = await fetch(_spUrl(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ name: p.name, phone: p.phone, lead_type: 'new_biz', source: 'chatbot', ref_owner_type: 'User', ref_owner_id: p.id, next_action: '첫 연락 — 기장 니즈 확인', next_action_date: _spTodayStr() }),
    });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'fail');
    await _spMeta(); await _spFetch();
    if (d.id) _spOpen(d.id);
  } catch (e) { alert('리드 추가 실패: ' + (e.message || e)); }
}

function _spNewLead() { _spNewMode = true; _spSel = null; _spRenderRows(); _spRenderDetail(); }
function _spRenderNewForm(el) {
  var typeOpts = Object.keys(_SP_TYPE).map(function (k) { return '<option value="' + k + '"' + (k === 'new_biz' ? ' selected' : '') + '>' + _SP_TYPE[k] + '</option>'; }).join('');
  var staffOpts = '<option value="">담당 없음</option>' + _spStaff.map(function (s) { return '<option value="' + s.id + '">' + _spEsc(s.name) + '</option>'; }).join('');
  el.innerHTML = '<div class="sp-dhead"><b style="font-size:1.05em">＋ 새 리드</b></div>'
    + '<div class="sp-form">'
    + '<div class="row"><input id="spNName" placeholder="이름 *"><input id="spNCo" placeholder="업체명"></div>'
    + '<div class="row"><input id="spNPhone" placeholder="전화번호"><select id="spNType">' + typeOpts + '</select></div>'
    + '<div class="row"><select id="spNStaff">' + staffOpts + '</select><input id="spNAct" value="첫 연락"><input type="date" id="spNDate" value="' + _spTodayStr() + '"></div>'
    + '<textarea id="spNNote" rows="2" placeholder="메모 — 예: 김영수 사장님 소개, 2호점 오픈 예정"></textarea>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">'
    + '<button type="button" class="sp-mini" onclick="_spNewMode=false;_spRenderDetail()">취소</button>'
    + '<button type="button" class="sp-new" onclick="_spCreate()">등록</button>'
    + '</div></div>';
}
async function _spCreate() {
  var g = function (id) { return (document.getElementById(id) || {}).value || ''; };
  if (!g('spNName').trim()) { alert('이름을 입력해주세요'); return; }
  if (!g('spNDate')) { alert('첫 연락 날짜가 필요합니다'); return; }
  try {
    var r = await fetch(_spUrl(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({
        name: g('spNName').trim(), company: g('spNCo') || undefined, phone: g('spNPhone') || undefined,
        lead_type: g('spNType') || 'new_biz', source: 'manual',
        assignee_user_id: Number(g('spNStaff')) || undefined,
        next_action: g('spNAct') || '첫 연락', next_action_date: g('spNDate'), note: g('spNNote') || undefined,
      }),
    });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'fail');
    _spNewMode = false;
    await _spFetch();
    if (d.id) _spOpen(d.id);
  } catch (e) { alert('등록 실패: ' + (e.message || e)); }
}
