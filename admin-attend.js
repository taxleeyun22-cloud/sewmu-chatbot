/* 🕘 근태·당번·연차 — 사장님 관리 모달 (2026-10-01)
 *   "직원들 근태 체크하게 출근시간 … 바로 찍을수있는거" / "연차도 같이 넣는 시스템으로 간다"
 *   "3명중 1명은 9시 나머지는 9시30분출근 한주단위로 당번" / "1분까진 봐준다고 하자"
 *
 * 직원은 /attend.html (폰) 에서 출근·교체·연차신청. 여기는 사장님이 보는 곳:
 *   오늘 / 월별·CSV / 당번표(순서·하루 지정) / 연차 승인함 / 연차 부여(입사일·확정·기준시각)
 * 판정은 전부 서버(/api/attendance → _attendance-core.js). 여기선 그리기만.
 * 수정·승인 버튼은 서버 응답의 owner 로 그린다 (IS_OWNER 는 whoami 전 기본값이 true 라 믿지 않는다).
 */

var _atTab = 'today', _atMonth = '', _atYear = 0, _atDutyFrom = '', _atData = null, _atOrder = null;
var _AT_WD = ['일', '월', '화', '수', '목', '금', '토'];

function _atKeyQS() { var k = (typeof KEY !== 'undefined' && KEY) ? KEY : ''; return k ? ('key=' + encodeURIComponent(k)) : ''; }
function _atUrl(extra) { var qs = [_atKeyQS(), extra || ''].filter(Boolean).join('&'); return '/api/attendance' + (qs ? ('?' + qs) : ''); }
function _atEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _atToday() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function _atWd(d) { return new Date(d + 'T00:00:00Z').getUTCDay(); }
function _atMd(d) { return Number(d.slice(5, 7)) + '/' + Number(d.slice(8, 10)) + '(' + _AT_WD[_atWd(d)] + ')'; }
function _atAdd(d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
function _atMonday(d) { var w = _atWd(d); return _atAdd(d, w === 0 ? -6 : 1 - w); }
function _atDays(n) { if (n == null) return '—'; var v = Math.round(Number(n) * 10) / 10; return (v % 1 === 0 ? String(v) : v.toFixed(1)) + '일'; }

function openAttend() {
  var m = document.getElementById('attendModal');
  if (!m) { alert('근태 화면 로딩 전입니다. 잠시 후 다시 시도해주세요.'); return; }
  m.style.display = 'flex';
  if (!_atMonth) _atMonth = _atToday().slice(0, 7);
  if (!_atYear) _atYear = Number(_atToday().slice(0, 4));
  if (!_atDutyFrom) _atDutyFrom = _atMonday(_atToday());
  /* 처음 열 때: 직원(세션 로그인 · 근태 대상)이면 '내 근태', 아니면 '오늘' (사장님) */
  /* 직원이 '오늘' 로 열리면 403 — 직원 기본은 내 근태, 그마저 없으면(사장님 세션·근태 대상 아님) 당번표 */
  if (!_atOpened) { _atOpened = true; _atTab = _atMeOk ? 'me' : (_atOwner ? 'today' : 'duty'); }
  _atGo(_atTab);
  _atBadge();            // 열 때마다 대기 건수 새로 — 5분 주기만 믿으면 방금 들어온 신청이 안 보인다
}
var _atOpened = false, _atOwner = null, _atMeOk = false, _atMe = null, _atMeForm = null, _atMyErr = '';
function closeAttend() {
  var m = document.getElementById('attendModal');
  if (m) m.style.display = 'none';
}

/* 탭은 사람에 따라 다르다 — 직원: 내 근태 + 조회 / 사장님: 조회 + 승인함·부여.
   owner 는 서버 응답(d.owner)으로 안다 (IS_OWNER 는 whoami 전 기본값 true 라 못 믿는다). */
function _atTabList(owner, meOk) {
  /* 직원 = 내 근태 · 당번표. 동료 출근·지각·연차는 사장님만 (사장님: "지는 지꺼만 보게").
     서버도 같은 기준으로 막는다 — 여기는 안 보이게만. */
  var t = [];
  if (meOk) t.push(['me', '내 근태']);
  if (owner) t.push(['today', '오늘'], ['month', '월별']);
  t.push(['duty', '당번표']);
  if (owner) t.push(['leave', '연차 승인함'], ['grant', '연차 현황·부여']);
  return t;
}
function _atTabsHtml(active, pending, owner, meOk, mySwaps) {
  if (owner === undefined) owner = _atOwner; if (meOk === undefined) meOk = _atMeOk; if (mySwaps === undefined) mySwaps = _atMySwaps;
  return _atTabList(!!owner, !!meOk).map(function (t) {
    var n = t[0] === 'leave' && owner ? pending : (t[0] === 'me' ? mySwaps : 0);
    return '<button type="button" class="at-tab' + (t[0] === active ? ' on' : '') + '" onclick="_atGo(\'' + t[0] + '\')">' + t[1]
      + (n ? '<span class="n">' + n + '</span>' : '') + '</button>';
  }).join('');
}

async function _atGo(tab) {
  _atTab = tab;
  var body = document.getElementById('atBody'), tabs = document.getElementById('atTabs');
  if (tabs) tabs.innerHTML = _atTabsHtml(tab, _atBadgeN);
  if (body) body.innerHTML = '<div class="at-empty">불러오는 중...</div>';
  var qs = { me: 'view=me', today: 'view=today', month: 'view=month&month=' + _atMonth, duty: 'view=duty&weeks=8&from=' + _atDutyFrom,
    leave: 'view=leave&year=' + _atYear, grant: 'view=leave&year=' + _atYear }[tab];
  try {
    var r = await fetch(_atUrl(qs), { credentials: 'same-origin', cache: 'no-store' });
    var d = await r.json();
    if (d.error) throw new Error(d.error);
    if (_atTab !== tab) return;           // 그 사이 다른 탭을 눌렀다
    if (tab === 'me') { _atMe = d; _atMeOk = true; _atMeForm = null; _atMyErr = ''; }
    else { _atData = d; if (typeof d.owner === 'boolean') _atOwner = d.owner; }
    if (tab === 'duty') _atOrder = null;
    if (tabs) tabs.innerHTML = _atTabsHtml(tab, _atBadgeN);   // owner 를 이제 알았으니 탭 다시
    _atRender();
  } catch (e) {
    if (body) body.innerHTML = '<div class="at-empty">불러오기 실패: ' + _atEsc(e.message) + '</div>';
  }
}
function _atRender() {
  var body = document.getElementById('atBody');
  if (!body) return;
  if (_atTab === 'me') { if (_atMe) body.innerHTML = _atMeHtml(_atMe, _atMeForm, _atMyErr); return; }
  if (!_atData) return;
  var d = _atData;
  body.innerHTML = _atTab === 'today' ? _atTodayHtml(d)
    : _atTab === 'month' ? _atMonthHtml(d)
    : _atTab === 'duty' ? _atDutyHtml(d, _atOrder)
    : _atTab === 'leave' ? _atLeaveHtml(d)
    : _atGrantHtml(d);
}

/* ── 렌더 (순수 — d 만 보고 HTML 을 만든다. 테스트가 이 함수들을 떼어 돌린다) ── */

function _atCellHtml(c) {
  if (!c) return '';
  var s = '';
  if (c.duty) s += '<span class="dot" title="당번"></span>';
  if (c.check_in) s += '<span class="' + (c.late ? 'late' : '') + '">' + _atEsc(c.check_in) + '</span>';
  else if (c.leave === 'approved') s += '<span class="pill leave">연차</span>';
  else if (c.leave === 'pending') s += '<span class="pill gray">연차?</span>';
  else s += '<span class="miss">·</span>';
  if (c.check_in && c.leave === 'approved') s += ' <span class="pill leave">연차</span>';
  return s;
}

/* 주말 / 공휴일 안내 문구 (오늘 화면·홈 카드·내 근태 공통) */
function _atOffdayText(d) {
  return d.holiday ? '오늘은 공휴일입니다 (' + _atEsc(d.holiday) + ')' : '오늘은 주말입니다';
}
function _atTodayHtml(d) {
  var h = '<div class="at-bar"><b>' + _atMd(d.today) + '</b>'
    + (d.duty_name ? '<span class="pill duty">당번 ' + _atEsc(d.duty_name) + ' · ' + _atEsc(d.settings.duty_start) + '</span>' : '')
    + '<span style="color:var(--text-mute)">일반 ' + _atEsc(d.settings.normal_start) + ' · 1분이라도 늦으면 지각</span>'
    + '<span class="sp"></span><button class="at-btn" onclick="_atGo(\'today\')">새로고침</button></div>';
  if (!d.weekday) h += '<div class="at-note">' + _atOffdayText(d) + '.</div>';
  if (!d.rows.length) return h + _atNoStaffHtml();
  /* 사장님 2026-10-02 "출근시간 내가 수정하는 거 없어졌네?" — 월별 탭뿐 아니라 오늘 탭에서도 출근 칸을 누르면 수정 */
  h += '<table><thead><tr><th>직원</th><th>기준</th><th>출근' + (d.owner ? ' <span style="color:var(--text-mute);font-weight:400">(누르면 수정)</span>' : '') + '</th><th>상태</th></tr></thead><tbody>';
  d.rows.forEach(function (r) {
    var st = r.check_in ? (r.late ? '<span class="pill late">지각</span>' : '<span class="pill ok">정상</span>')
      : r.leave === 'approved' ? '<span class="pill leave">연차</span>'
      : r.leave === 'pending' ? '<span class="pill gray">연차 대기</span>'
      : '<span class="pill gray">미출근</span>';
    h += '<tr><td><b>' + _atEsc(r.name) + '</b>' + (r.duty ? ' <span class="pill duty">당번</span>' : '') + '</td>'
      + '<td>' + _atEsc(r.start) + '</td>'
      + '<td' + (d.owner ? ' class="click" onclick="_atEdit(' + r.id + ',\'' + d.today + '\')" title="출근시각 수정"' : '') + '>'
      + (r.check_in ? '<span class="' + (r.late ? 'late' : '') + '">' + _atEsc(r.check_in) + '</span>' : '<span class="miss">—</span>')
      + (r.edited ? ' <span style="color:var(--text-mute);font-size:.85em">(수정)</span>' : '') + (d.owner ? ' <span class="at-editico">✎</span>' : '') + '</td>'
      + '<td>' + st + (r.note ? ' <span style="color:var(--text-mute)">' + _atEsc(r.note) + '</span>' : '') + '</td></tr>';
  });
  return h + '</tbody></table>' + _atLinkHtml();
}

function _atMonthHtml(d) {
  var dates = d.days.filter(function (x) { return d.rows.some(function (r) { return r.cells[x]; }); });
  var h = '<div class="at-bar"><input type="month" value="' + _atEsc(d.month) + '" onchange="_atMonth=this.value;_atGo(\'month\')">'
    + '<span style="color:var(--text-mute)"><span class="dot"></span>당번 · <span class="late">빨강</span> 지각' + (d.owner ? ' · 칸을 누르면 수정' : '') + '</span>'
    + '<span class="sp"></span><button class="at-btn pri" onclick="_atCsv()">엑셀(CSV) 받기</button></div>';
  if (!d.rows.length) return h + _atNoStaffHtml();
  var hol = d.holidays || {};
  h += '<div style="overflow-x:auto"><table class="at-grid"><thead><tr><th class="nm">직원</th>';
  dates.forEach(function (x) { h += '<th' + (hol[x] ? ' class="holi" title="' + _atEsc(hol[x]) + '"' : '') + '>' + Number(x.slice(8)) + '<br>' + _AT_WD[_atWd(x)] + '</th>'; });
  h += '<th>출근</th><th>지각</th><th>연차</th><th>당번</th></tr></thead><tbody>';
  d.rows.forEach(function (r) {
    h += '<tr><td class="nm"><b>' + _atEsc(r.name) + '</b></td>';
    dates.forEach(function (x) {
      var c = r.cells[x], we = _atWd(x) === 0 || _atWd(x) === 6 || !!hol[x];
      h += '<td class="' + (we ? 'we ' : '') + (d.owner ? 'click' : '') + '"'
        + (d.owner ? ' onclick="_atEdit(' + r.id + ',\'' + x + '\')"' : '')
        + (c && c.note ? ' title="' + _atEsc(c.note) + '"' : '') + '>' + _atCellHtml(c) + '</td>';
    });
    h += '<td>' + r.sum.checked + '</td><td class="' + (r.sum.late ? 'late' : '') + '">' + r.sum.late + '</td><td>' + r.sum.leave + '</td><td>' + r.sum.duty + '</td></tr>';
  });
  h += '</tbody></table></div>';
  var holList = Object.keys(hol).sort();
  if (holList.length) h += '<div style="color:var(--text-mute);font-size:.9em;margin-top:6px">공휴일: ' + holList.map(function (x) { return _atMd(x) + ' ' + _atEsc(hol[x]); }).join(' · ') + '</div>';
  return h + _atMonthLeaveHtml(d);
}
/* 사장님 2026-10-02: "월별로 직원별로 연차 언제 썼는지 체크 좀 하자" */
function _atMonthLeaveHtml(d) {
  var h = '<div class="at-sec">이달 연차 — 직원별</div>';
  var any = false;
  h += '<table><thead><tr><th>직원</th><th>연차(승인)</th><th>대기</th><th>합계</th></tr></thead><tbody>';
  d.rows.forEach(function (r) {
    var ap = [], pd = [];
    Object.keys(r.cells).sort().forEach(function (x) { var c = r.cells[x]; if (c.leave === 'approved') ap.push(x); else if (c.leave === 'pending') pd.push(x); });
    if (ap.length || pd.length) any = true;
    h += '<tr><td><b>' + _atEsc(r.name) + '</b></td>'
      + '<td>' + (ap.length ? ap.map(function (x) { return '<span class="pill leave" style="margin:1px 2px 1px 0">' + _atMd(x) + '</span>'; }).join('') : '<span style="color:var(--text-mute)">—</span>') + '</td>'
      + '<td>' + (pd.length ? pd.map(function (x) { return '<span class="pill gray" style="margin:1px 2px 1px 0">' + _atMd(x) + '</span>'; }).join('') : '') + '</td>'
      + '<td><b>' + ap.length + '</b>일' + (pd.length ? ' <span style="color:var(--text-mute)">(+대기 ' + pd.length + ')</span>' : '') + '</td></tr>';
  });
  h += '</tbody></table>';
  if (!any) h += '<div style="color:var(--text-mute)">이달에 쓴 연차가 없습니다</div>';
  return h;
}

function _atDutyHtml(d, order) {
  var h = '<div class="at-bar"><button class="at-btn" onclick="_atDutyFrom=_atAdd(_atDutyFrom,-28);_atGo(\'duty\')">◀ 4주</button>'
    + '<b>' + _atMd(d.from) + ' 부터 ' + d.weeks + '주</b>'
    + '<button class="at-btn" onclick="_atDutyFrom=_atAdd(_atDutyFrom,28);_atGo(\'duty\')">4주 ▶</button>'
    + '<span class="sp"></span><span style="color:var(--text-mute)">당번 ' + '09:00 · 나머지 09:30</span></div>';
  if (!d.staff.length) return h + _atNoStaffHtml();

  /* 순서 */
  var cur = d.rotation;
  h += '<div class="at-note" style="background:#f8fafc;border-color:#e5e8eb;color:var(--text-sub)">'
    + (cur ? '현재 순서 (' + _atMd(cur.effective_from) + ' 부터): <b>' + cur.names.map(_atEsc).join(' → ') + '</b>' : '아직 당번 순서가 없습니다.')
    + (d.upcoming.length ? '<br>예정: ' + d.upcoming.map(function (u) { return _atMd(u.effective_from) + ' 부터 ' + u.names.map(_atEsc).join(' → '); }).join(' / ') : '')
    + '</div>';

  if (d.owner) {
    var ids = order || (d.upcoming.length ? d.upcoming[d.upcoming.length - 1].members : (cur ? cur.members : [])).slice();
    var inList = {}; ids.forEach(function (i) { inList[i] = 1; });
    var nameOf = {}; d.staff.forEach(function (s) { nameOf[s.id] = s.name; });
    var nextMon = _atAdd(_atMonday(d.today), 7);
    h += '<div class="at-sec">순서 정하기 — 저장하면 그 월요일부터 매주 자동으로 돕니다 (지난 주는 안 바뀜)</div><div class="at-ord">';
    ids.forEach(function (id, i) {
      h += '<div><span>' + (i + 1) + '</span><b>' + _atEsc(nameOf[id] || ('#' + id)) + '</b>'
        + '<button class="at-btn" onclick="_atOrdMove(' + i + ',-1)"' + (i === 0 ? ' disabled' : '') + '>▲</button>'
        + '<button class="at-btn" onclick="_atOrdMove(' + i + ',1)"' + (i === ids.length - 1 ? ' disabled' : '') + '>▼</button>'
        + '<button class="at-btn dng" onclick="_atOrdDel(' + i + ')">빼기</button></div>';
    });
    var rest = d.staff.filter(function (s) { return !inList[s.id]; });
    h += '</div><div class="at-bar" style="margin-top:8px">'
      + (rest.length ? '<select id="atOrdAdd"><option value="">+ 직원 추가</option>' + rest.map(function (s) { return '<option value="' + s.id + '">' + _atEsc(s.name) + '</option>'; }).join('') + '</select>'
        + '<button class="at-btn" onclick="_atOrdAdd()">추가</button>' : '')
      + '<span>적용 시작 월요일</span><input type="date" id="atOrdFrom" value="' + nextMon + '">'
      + '<button class="at-btn pri" onclick="_atSaveRotation()">순서 저장</button></div>';
    /* 지금 화면의 순서를 기억 — 다시 그릴 때 유지 */
    _atOrder = ids;
  }

  /* 표 */
  h += '<div class="at-sec">당번표' + (d.owner ? ' — 칸에서 하루만, [주 전체] 로 그 주 월~금을 한 번에 바꿀 수 있습니다' : '') + '</div>'
    + '<table class="at-grid"><thead><tr><th class="nm">주</th>' + (d.owner ? '<th>주 전체</th>' : '') + '<th>월</th><th>화</th><th>수</th><th>목</th><th>금</th></tr></thead><tbody>';
  d.grid.forEach(function (w) {
    var wkLabel = _atMd(w.monday).replace(/\(.\)/, '');
    h += '<tr><td class="nm">' + wkLabel + '~</td>';
    if (d.owner) {
      /* 월~금 전부 사장님 지정이고 같은 사람이면 그 사람이 선택된 상태로 */
      var ov = w.days.map(function (x) { return x.override === 'owner' ? x.user_id : null; });
      var wkUser = ov.length && ov.every(function (u) { return u && u === ov[0]; }) ? ov[0] : null;
      var anyOv = w.days.some(function (x) { return x.override; });
      h += '<td><select onchange="_atDutySetWeek(\'' + w.monday + '\',this.value)" aria-label="' + wkLabel + ' 주 전체 당번">'
        + '<option value="">' + (anyOv ? '↺ 순서대로' : '주 전체') + '</option>'
        + d.staff.map(function (s) { return '<option value="' + s.id + '"' + (s.id === wkUser ? ' selected' : '') + '>' + _atEsc(s.name) + '</option>'; }).join('')
        + '</select></td>';
    }
    w.days.forEach(function (x) {
      var tag = x.override === 'swap' ? ' <span class="pill gray">교체</span>' : x.override === 'owner' ? ' <span class="pill gray">지정</span>' : '';
      var warn = x.on_leave ? ' <span class="pill late">연차</span>' : '';
      var today = x.date === d.today ? ' style="outline:2px solid var(--brand-primary);outline-offset:-2px"' : '';
      if (x.holiday) {
        h += '<td class="we holi"' + today + ' title="' + _atEsc(x.holiday) + '"><span class="pill late">휴</span><div style="font-size:.78em;color:var(--text-mute);white-space:normal;max-width:90px">' + _atEsc(x.holiday) + '</div></td>';
        return;
      }
      if (d.owner) {
        h += '<td' + today + '><select onchange="_atDutySet(\'' + x.date + '\',this.value)">'
          + '<option value="">' + (x.override ? '↺ 순서대로' : '—') + '</option>'
          + d.staff.map(function (s) { return '<option value="' + s.id + '"' + (s.id === x.user_id ? ' selected' : '') + '>' + _atEsc(s.name) + '</option>'; }).join('')
          + '</select>' + tag + warn + '</td>';
      } else {
        h += '<td' + today + '>' + _atEsc(x.name || '—') + tag + warn + '</td>';
      }
    });
    h += '</tr>';
  });
  h += '</tbody></table>';

  /* 교체 기록 */
  var ST = { pending: '대기', accepted: '수락', declined: '거절', cancelled: '취소' };
  h += '<div class="at-sec">교체 기록</div>';
  if (!d.swaps.length) h += '<div style="color:var(--text-mute)">아직 없습니다</div>';
  else {
    h += '<table><thead><tr><th>요청일</th><th>날짜</th><th>요청</th><th>대신</th><th>맞교환</th><th>사유</th><th>상태</th></tr></thead><tbody>';
    d.swaps.forEach(function (s) {
      h += '<tr><td>' + _atEsc(String(s.requested_at || '').slice(5, 16)) + '</td><td>' + _atMd(s.duty_date) + '</td><td>' + _atEsc(s.from_name)
        + '</td><td>' + _atEsc(s.to_name) + '</td><td>' + (s.return_date ? _atMd(s.return_date) : '') + '</td><td>' + _atEsc(s.reason || '')
        + '</td><td>' + (ST[s.status] || _atEsc(s.status)) + '</td></tr>';
    });
    h += '</tbody></table>';
  }
  return h;
}

/* ── 연차 승인함 — 사장님 2026-10-02 "뭔가 확실하게 … 깔쌈하게": 요약 띠 · 직원별 잔여 막대 · 묶음 카드 · 팀 달력 · 필터 ── */
var _atLvFilter = 'all', _atTeamMonth = null;
var _AT_COLORS = ['#1d4ed8', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#ea580c'];
/* 날짜 목록 → "10/13(화)~10/14(수), 10/20(화)" (주말만 건너뛴 연속은 한 묶음) */
function _atLvRuns(dates) {
  var runs = [];
  dates.slice().sort().forEach(function (x) {
    var r = runs[runs.length - 1];
    if (r && (_atAdd(r.to, 1) === x || (_atWd(r.to) === 5 && _atAdd(r.to, 3) === x))) r.to = x;
    else runs.push({ from: x, to: x });
  });
  return runs.map(function (r) { return r.from === r.to ? _atMd(r.from) : _atMd(r.from) + '~' + _atMd(r.to); }).join(', ');
}
/* 같은 사람 · 같은 신청 시각 · 같은 상태 = 한 번에 신청한 묶음 */
function _atLvGroups(list) {
  var m = {}, out = [];
  (list || []).forEach(function (r) {
    var k = r.user_id + '|' + (r.requested_at || '') + '|' + r.status;
    if (!m[k]) {
      m[k] = { user_id: r.user_id, name: r.name, status: r.status, reason: r.reason || null, review_note: r.review_note || null,
        requested_at: r.requested_at || null, reviewed_at: r.reviewed_at || null, remaining: r.remaining, items: [] };
      out.push(m[k]);
    }
    m[k].items.push(r);
  });
  out.forEach(function (g) { g.items.sort(function (a, b) { return a.leave_date < b.leave_date ? -1 : 1; }); g.dates = g.items.map(function (x) { return x.leave_date; }); });
  return out;
}
function _atLeaveHtml(d) {
  var today = d.today || _atToday(), thisMonth = today.slice(0, 7);
  var rows = d.rows || [], pending = d.pending || [], recent = d.recent || [];
  var color = {}; rows.forEach(function (r, i) { color[r.id] = _AT_COLORS[i % _AT_COLORS.length]; });
  var allReq = [];
  rows.forEach(function (r) { (r.requests || []).forEach(function (x) { allReq.push({ user_id: r.id, name: r.name, leave_date: x.leave_date, status: x.status }); }); });
  var monthUsed = allReq.filter(function (x) { return x.status === 'approved' && x.leave_date.slice(0, 7) === thisMonth; }).length;
  var yearUsed = allReq.filter(function (x) { return x.status === 'approved'; }).length;

  /* 1. 요약 띠 */
  var h = '<div class="at-bar"><select onchange="_atYear=Number(this.value);_atTeamMonth=null;_atGo(\'leave\')">' + _atYearOpts(d.year) + '</select>'
    + '<span class="at-kpi"><b>' + pending.length + '</b>건 승인 대기</span>'
    + '<span class="at-kpi"><b>' + monthUsed + '</b>일 이달 연차</span>'
    + '<span class="at-kpi"><b>' + yearUsed + '</b>일 올해 사용</span>'
    + '<span class="sp"></span><button class="at-btn" onclick="_atGo(\'leave\')">새로고침</button></div>';
  var tracked = rows.filter(function (r) { return r.tracked !== false && r.days != null; });
  if (tracked.length) {
    h += '<div class="at-bars">' + tracked.map(function (r) {
      var pct = r.days ? Math.min(100, Math.round(100 * r.approved / r.days)) : 0;
      return '<div class="at-barrow"><span class="at-dotc" style="background:' + color[r.id] + '"></span><span class="nm">' + _atEsc(r.name) + '</span>'
        + '<span class="at-track"><span class="at-fill" style="width:' + pct + '%;background:' + color[r.id] + '"></span></span>'
        + '<span class="num">' + _atDays(r.approved) + ' / ' + _atDays(r.days) + ' · 잔여 <b>' + _atDays(r.remaining) + '</b>' + (r.pending ? ' <span class="pill gray">대기 ' + r.pending + '</span>' : '') + '</span></div>';
    }).join('') + '</div>';
  }

  /* 2. 승인 대기 — 묶음 카드 */
  var groups = _atLvGroups(pending);
  var okIds = pending.filter(function (r) { return !r.is_duty; }).map(function (r) { return r.id; });
  h += '<div class="at-sec at-sec-row">승인 대기 <span class="pill ' + (pending.length ? 'late' : 'gray') + '">' + pending.length + '</span><span class="sp"></span>'
    + (d.owner && okIds.length > 1 ? '<button class="at-btn pri" onclick="_atReviewMany([' + okIds.join(',') + '],true)">전부 승인 (' + okIds.length + ')</button>' : '') + '</div>';
  if (!groups.length) {
    var next = allReq.filter(function (x) { return x.status === 'approved' && x.leave_date >= today; }).sort(function (a, b) { return a.leave_date < b.leave_date ? -1 : 1; })[0];
    h += '<div class="at-empty">대기 중인 신청이 없어요 🎉' + (next ? '<div style="margin-top:4px;color:var(--text-sub)">다음 연차: <b>' + _atMd(next.leave_date) + ' ' + _atEsc(next.name) + '</b></div>' : '') + '</div>';
  } else {
    h += '<div class="at-cards">';
    groups.forEach(function (g) {
      var dutyDays = g.items.filter(function (x) { return x.is_duty; });
      var okItems = g.items.filter(function (x) { return !x.is_duty; });
      var overlaps = [];
      g.dates.forEach(function (dt) {
        allReq.forEach(function (x) { if (x.leave_date === dt && x.user_id !== g.user_id && (x.status === 'approved' || x.status === 'pending')) overlaps.push(_atMd(dt) + ' ' + _atEsc(x.name) + (x.status === 'pending' ? '(대기)' : '')); });
      });
      h += '<div class="at-card"><div class="at-card-head"><span class="at-dotc" style="background:' + (color[g.user_id] || '#999') + '"></span><b>' + _atEsc(g.name) + '</b>'
        + '<span style="color:var(--text-mute)">잔여 ' + _atDays(g.remaining) + '</span><span class="sp"></span>'
        + '<span style="color:var(--text-mute);font-size:.85em">' + _atEsc(String(g.requested_at || '').slice(5, 10)) + ' 신청</span></div>'
        + '<div class="at-card-dates"><b>' + _atLvRuns(g.dates) + '</b> <span class="pill leave">' + g.dates.length + '일</span></div>'
        + (g.reason ? '<div style="color:var(--text-sub)">사유: ' + _atEsc(g.reason) + '</div>' : '')
        + (dutyDays.length ? '<div class="at-warn">⚠ ' + dutyDays.map(function (x) { return _atMd(x.leave_date); }).join(', ') + ' 당번 — 교체가 먼저입니다</div>' : '')
        + (overlaps.length ? '<div class="at-warn soft">⚠ 같은 날 연차: ' + overlaps.join(' · ') + '</div>' : '')
        + (d.owner
          ? '<div class="at-card-acts"><button class="at-btn dng" onclick="_atReviewMany([' + g.items.map(function (x) { return x.id; }).join(',') + '],false)">반려</button>'
            + (okItems.length ? '<button class="at-btn pri" onclick="_atReviewMany([' + okItems.map(function (x) { return x.id; }).join(',') + '],true)">승인' + (okItems.length < g.items.length ? ' (' + okItems.length + '일만)' : '') + '</button>' : '') + '</div>'
          : '<div style="color:var(--text-mute)">사장님 승인</div>')
        + '</div>';
    });
    h += '</div>';
  }

  /* 3. 팀 연차 달력 */
  h += _atTeamCalHtml(d, rows, allReq, color, today);

  /* 4. 최근 처리 — 필터 + 묶음 */
  var FL = [['all', '전체'], ['approved', '승인'], ['rejected', '반려'], ['cancelled', '취소']];
  var rec = recent.filter(function (r) { return _atLvFilter === 'all' ? r.status !== 'cancelled' : r.status === _atLvFilter; });
  h += '<div class="at-sec at-sec-row">최근 처리<span class="sp"></span>'
    + FL.map(function (f) { return '<button type="button" class="at-chipbtn' + (_atLvFilter === f[0] ? ' on' : '') + '" onclick="_atLvFilter=\'' + f[0] + '\';_atRender()">' + f[1] + '</button>'; }).join('') + '</div>';
  if (!rec.length) h += '<div style="color:var(--text-mute)">' + (_atLvFilter === 'all' ? '처리한 건이 없습니다' : '없습니다') + '</div>';
  else {
    var ST = { approved: ['승인', 'ok'], rejected: ['반려', 'late'], cancelled: ['취소', 'gray'] };
    h += '<table><thead><tr><th>직원</th><th>날짜</th><th>상태</th><th>처리</th><th>메모</th>' + (d.owner ? '<th></th>' : '') + '</tr></thead><tbody>';
    _atLvGroups(rec).forEach(function (g) {
      var st = ST[g.status] || [g.status, 'gray'];
      var who = g.status === 'cancelled' ? (g.review_note === '사장님 취소' ? '사장님' : '본인') : '사장님';
      var note = g.review_note === '사장님 취소' ? '' : (g.review_note || '');
      h += '<tr><td><span class="at-dotc" style="background:' + (color[g.user_id] || '#999') + '"></span><b>' + _atEsc(g.name) + '</b></td>'
        + '<td>' + _atLvRuns(g.dates) + ' <span class="pill gray">' + g.dates.length + '일</span></td>'
        + '<td><span class="pill ' + st[1] + '">' + st[0] + '</span></td>'
        + '<td style="color:var(--text-mute)">' + _atEsc(String(g.reviewed_at || '').slice(5, 10)) + ' ' + who + '</td>'
        + '<td>' + _atEsc(note) + '</td>'
        + (d.owner ? '<td>' + (g.status === 'approved' ? '<button class="at-btn dng" onclick="_atLeaveCancelMany([' + g.items.map(function (x) { return x.id; }).join(',') + '])">승인 취소</button>' : '') + '</td>' : '')
        + '</tr>';
    });
    h += '</tbody></table>';
  }
  return h;
}
/* 팀 연차 달력 — 날마다 직원 색 점 (빈 점 = 대기), 공휴일 빨강 */
function _atTeamCalHtml(d, rows, allReq, color, today) {
  var Y = String(d.year);
  var month = _atTeamMonth && _atTeamMonth.slice(0, 4) === Y ? _atTeamMonth : (today.slice(0, 4) === Y ? today.slice(0, 7) : Y + '-01');
  _atTeamMonth = month;
  var hol = {}; (d.holidays || []).forEach(function (x) { hol[x.ymd] = x.name; });
  var byDay = {}; allReq.forEach(function (x) { if (x.status === 'approved' || x.status === 'pending') (byDay[x.leave_date] = byDay[x.leave_date] || []).push(x); });
  var first = month + '-01', lead = _atWd(first);
  var h = '<div class="at-sec">팀 연차 달력</div><div class="at-cal at-teamcal"><div class="at-cal-head">'
    + '<button type="button" class="at-btn" onclick="_atTeamMonthGo(-1)" aria-label="이전 달"' + (month <= Y + '-01' ? ' disabled' : '') + '>‹</button>'
    + '<b>' + Y + '년 ' + Number(month.slice(5)) + '월</b>'
    + '<button type="button" class="at-btn" onclick="_atTeamMonthGo(1)" aria-label="다음 달"' + (month >= Y + '-12' ? ' disabled' : '') + '>›</button></div>'
    + '<div class="at-cal-grid">' + _AT_WD.map(function (n, i) { return '<span class="at-cal-wd' + (i === 0 || i === 6 ? ' we' : '') + '">' + n + '</span>'; }).join('');
  for (var i = 0; i < lead; i++) h += '<span></span>';
  for (var day = first; day.slice(0, 7) === month; day = _atAdd(day, 1)) {
    var w = _atWd(day), n = Number(day.slice(8));
    var cls = 'at-cal-d' + (w === 0 || w === 6 ? ' we' : '') + (hol[day] ? ' holi' : '') + (day === today ? ' today' : '');
    var dots = (byDay[day] || []).map(function (x) {
      var c = color[x.user_id] || '#999';
      return '<i class="at-dot' + (x.status === 'pending' ? ' pend' : '') + '" style="' + (x.status === 'pending' ? 'border-color:' : 'background:') + c + '" title="' + _atEsc(x.name) + (x.status === 'pending' ? ' (대기)' : '') + '"></i>';
    }).join('');
    h += '<span class="' + cls + '"' + (hol[day] ? ' title="' + _atEsc(hol[day]) + '"' : '') + '><span>' + n + '</span><span class="at-dots">' + dots + '</span></span>';
  }
  h += '</div><div class="at-legend">' + rows.filter(function (r) { return r.tracked !== false; }).map(function (r) { return '<span><span class="at-dotc" style="background:' + color[r.id] + '"></span>' + _atEsc(r.name) + '</span>'; }).join('')
    + '<span style="color:var(--text-mute)">빈 점 = 승인 대기 · 빨강 = 공휴일</span></div></div>';
  return h;
}
function _atTeamMonthGo(n) {
  var p = (_atTeamMonth || _atToday().slice(0, 7)).split('-');
  _atTeamMonth = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1 + n, 1)).toISOString().slice(0, 7);
  _atRender();
}

function _atGrantHtml(d) {
  var s = d.settings || {};
  var h = '<div class="at-bar"><select onchange="_atYear=Number(this.value);_atGo(\'grant\')">' + _atYearOpts(d.year) + '</select><b>연차 부여</b></div>'
    + '<div class="at-note">제안값은 입사일 기준 자동계산(근로기준법 제60조 · 회계연도 환산)입니다. <b>사장님이 [확정]해야 부여되고</b>, 확정 전에는 직원이 신청할 수 없습니다.'
    + ' 80% 출근율·5인 미만 사업장 적용 제외·퇴사 정산은 판단하지 않으니 필요하면 일수를 조정하세요.</div>';
  if (!d.rows.length) return h + _atNoStaffHtml();
  h += '<table><thead><tr><th>직원</th><th>근태 대상</th><th>입사일</th><th>제안</th><th>부여(확정)</th><th>사용</th><th>대기</th><th>잔여</th></tr></thead><tbody>';
  d.rows.forEach(function (r) {
    var own = d.owner;
    h += '<tr><td><b>' + _atEsc(r.name) + '</b></td>'
      + '<td>' + (own ? '<input type="checkbox"' + (r.tracked ? ' checked' : '') + ' onchange="_atProfile(' + r.id + ',{tracked:this.checked})">' : (r.tracked ? '예' : '아니오')) + '</td>'
      + '<td>' + (own ? '<input type="date" value="' + _atEsc(r.hire_date || '') + '" onchange="_atProfile(' + r.id + ',{hire_date:this.value||null})">' : _atEsc(r.hire_date || '—')) + '</td>'
      + '<td title="' + _atEsc(r.basis || '') + '">' + (r.suggested == null ? '<span style="color:var(--text-mute)">입사일 필요</span>' : _atDays(r.suggested)
        + '<div style="color:var(--text-mute);font-size:.85em;white-space:normal;max-width:260px">' + _atEsc(r.basis || '') + '</div>') + '</td>'
      + '<td>' + (own ? '<input type="number" step="0.5" min="0" max="40" style="width:70px" id="atG' + r.id + '" value="' + (r.days != null ? r.days : (r.suggested != null ? r.suggested : '')) + '">'
        + ' <button class="at-btn pri" onclick="_atGrant(' + r.id + ')">' + (r.days != null ? '수정' : '확정') + '</button>'
        + (r.days == null ? ' <span class="pill late">미확정</span>' : '') : _atDays(r.days)) + '</td>'
      + '<td>' + _atDays(r.approved)
      + ((r.requests || []).length ? ' <button type="button" class="at-btn" style="padding:3px 8px" onclick="_atGrantToggle(' + r.id + ')">' + (_atGrantOpen[r.id] ? '접기 ▴' : '내역 ▾') + '</button>' : '')
      + '</td><td>' + (r.pending || '') + '</td><td><b>' + _atDays(r.remaining) + '</b></td></tr>';
    if (_atGrantOpen[r.id]) h += '<tr class="at-sub"><td colspan="8">' + _atLeaveDetailHtml(r, d.owner) + '</td></tr>';
  });
  h += '</tbody></table>';
  h += '<div class="at-sec">출근 기준</div>';
  if (d.owner) {
    h += '<div class="at-bar">당번 <input type="time" id="atSDuty" value="' + _atEsc(s.duty_start) + '">'
      + ' 일반 <input type="time" id="atSNorm" value="' + _atEsc(s.normal_start) + '">'
      + ' <button class="at-btn pri" onclick="_atSaveSettings()">저장</button></div>'
      + '<div style="color:var(--text-mute)">유예 없음 — 당번 ' + _atEsc(s.duty_start) + ' · 일반 ' + _atEsc(s.normal_start) + ' 정각까지 정상, 1분이라도 늦으면 지각.</div>';
  } else {
    h += '<div>당번 ' + _atEsc(s.duty_start) + ' · 일반 ' + _atEsc(s.normal_start) + ' · 유예 없음</div>';
  }
  return h + _atHolidaysHtml(d) + _atLinkHtml();
}

/* 사장님 2026-10-02: "법정공휴일은 체크 안되나" — 공휴일엔 당번·연차가 없다.
 * 날짜 고정 공휴일·대체공휴일은 코드가 계산하고, 음력 명절·선거일·임시공휴일은 여기서 등록한다. */
function _atHolidaysHtml(d) {
  var list = d.holidays || [], y = d.year;
  var SRC = { fixed: ['법정', 'gray'], substitute: ['대체', 'gray'], seed: ['등록', 'leave'], owner: ['등록', 'leave'] };
  var h = '<div class="at-sec">' + y + '년 공휴일 — 당번 없음 · 연차에서 빠짐</div>'
    + '<div class="at-note">날짜가 정해진 공휴일(신정·삼일절·어린이날·현충일·광복절·개천절·한글날·성탄절)과 대체공휴일은 자동입니다. '
    + '<b>설날·추석·부처님오신날(음력)과 선거일·임시공휴일은 해마다 여기서 등록</b>해주세요. 2026년 명절은 넣어 두었으니 틀린 게 있으면 지우고 다시 넣으면 됩니다.</div>';
  if (!list.length) h += '<div style="color:var(--text-mute)">등록된 공휴일이 없습니다</div>';
  else {
    h += '<div style="display:flex;flex-wrap:wrap;gap:4px 10px">';
    list.forEach(function (x) {
      var s = SRC[x.source] || [x.source, 'gray'];
      h += '<span class="at-row" style="border:0;padding:3px 0;gap:6px"><span style="min-width:62px">' + _atMd(x.ymd) + '</span><b>' + _atEsc(x.name) + '</b>'
        + '<span class="pill ' + s[1] + '">' + s[0] + '</span>'
        + (d.owner && (x.source === 'owner' || x.source === 'seed') ? '<button type="button" class="at-btn dng" style="padding:2px 7px" onclick="_atHolidayDel(\'' + x.ymd + '\')" aria-label="' + _atMd(x.ymd) + ' 공휴일 삭제">삭제</button>' : '')
        + '</span>';
    });
    h += '</div>';
  }
  if (d.owner) {
    h += '<div class="at-bar" style="margin-top:8px"><input type="date" id="atHolYmd" min="' + y + '-01-01" max="' + (y + 1) + '-12-31">'
      + '<input type="text" id="atHolName" placeholder="이름 (예: 설날 연휴)" maxlength="30" style="width:160px">'
      + '<select id="atHolSub"><option value="">대체공휴일 없음</option><option value="weekend">토·일 겹치면 대체</option><option value="sunday">일요일·다른 공휴일 겹치면 대체 (설·추석)</option></select>'
      + '<button class="at-btn pri" onclick="_atHolidayAdd()">공휴일 추가</button></div>';
  }
  return h;
}
async function _atHolidayAdd() {
  var ymd = (document.getElementById('atHolYmd') || {}).value, name = ((document.getElementById('atHolName') || {}).value || '').trim();
  var sub = (document.getElementById('atHolSub') || {}).value || null;
  if (!ymd) { alert('날짜를 골라주세요'); return; }
  if (!name) { alert('공휴일 이름을 적어주세요'); return; }
  if (await _atPost('holiday_add', { ymd: ymd, name: name, sub: sub }, '✅ ' + _atMd(ymd) + ' ' + name + ' 등록')) _atGo('grant');
}
async function _atHolidayDel(ymd) {
  if (!confirm(_atMd(ymd) + ' 공휴일 등록을 지울까요? (그날 당번이 다시 생기고 연차 신청이 됩니다)')) return;
  if (await _atPost('holiday_del', { ymd: ymd }, '삭제됨')) _atGo('grant');
}

/* 사람별 연차 내역 (사장님: "누가 몇 개 남았고 언제 썼고 이런 걸 개별로 좀 보면") */
var _atGrantOpen = {};
function _atGrantToggle(id) { _atGrantOpen[id] = !_atGrantOpen[id]; _atRender(); }
function _atLeaveDetailHtml(r, owner) {
  var ST = { approved: ['승인', 'ok'], pending: ['대기', 'gray'], rejected: ['반려', 'late'] };
  var used = (r.requests || []).filter(function (x) { return x.status === 'approved'; }).map(function (x) { return x.leave_date; }).sort();
  var h = '<div style="background:#fafbfc;border-radius:10px;padding:10px 12px;margin:2px 0 6px">'
    + '<div style="margin-bottom:6px"><b>' + _atEsc(r.name) + '</b> · 부여 ' + _atDays(r.days) + ' · 사용 ' + _atDays(r.approved) + ' · 잔여 <b>' + _atDays(r.remaining) + '</b>'
    + (used.length ? ' <span style="color:var(--text-mute)">— 쓴 날: ' + used.map(_atMd).join(', ') + '</span>' : '') + '</div>';
  if (!(r.requests || []).length) return h + '<div style="color:var(--text-mute)">신청 내역 없음</div></div>';
  h += '<table style="width:auto"><thead><tr><th>날짜</th><th>상태</th><th>사유</th><th>신청</th><th>처리</th><th>메모</th>' + (owner ? '<th></th>' : '') + '</tr></thead><tbody>';
  r.requests.forEach(function (x) {
    var st = ST[x.status] || [x.status, 'gray'];
    h += '<tr><td>' + _atMd(x.leave_date) + '</td><td><span class="pill ' + st[1] + '">' + _atEsc(st[0]) + '</span></td><td>' + _atEsc(x.reason || '') + '</td>'
      + '<td style="color:var(--text-mute)">' + _atEsc(String(x.requested_at || '').slice(5, 10)) + '</td>'
      + '<td style="color:var(--text-mute)">' + _atEsc(String(x.reviewed_at || '').slice(5, 10)) + '</td><td>' + _atEsc(x.review_note || '') + '</td>'
      + (owner ? '<td>' + (x.status === 'approved' ? '<button class="at-btn dng" onclick="_atLeaveCancel(' + x.id + ')">승인 취소</button>'
        : x.status === 'pending' ? '<button class="at-btn pri" onclick="_atReview(' + x.id + ',true)">승인</button> <button class="at-btn dng" onclick="_atReview(' + x.id + ',false)">반려</button>' : '') + '</td>' : '')
      + '</tr>';
  });
  return h + '</tbody></table></div>';
}
function _atYearOpts(y) {
  var now = Number(_atToday().slice(0, 4)), o = '';
  for (var i = now - 2; i <= now + 1; i++) o += '<option value="' + i + '"' + (i === y ? ' selected' : '') + '>' + i + '년</option>';
  return o;
}
function _atNoStaffHtml() {
  return '<div class="at-empty">근태 대상 직원이 없습니다.<br>사용자 탭에서 👑 관리자로 등록된 사람이 직원입니다.</div>';
}
function _atLinkHtml() {
  return '<div style="margin-top:16px;color:var(--text-mute)">직원 출근 화면: <b>' + _atEsc(location.origin) + '/attend.html</b> — 직원 폰에서 열고 홈 화면에 추가하게 해주세요</div>';
}

/* ── 사장님 액션 ── */

async function _atPost(action, body, okMsg) {
  try {
    var r = await fetch(_atUrl('action=' + action), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body),
    });
    var d = await r.json();
    if (d.need_force) {
      if (!confirm(d.error)) return false;
      body.force = true;
      return _atPost(action, body, okMsg);
    }
    if (!d.ok) throw new Error(d.error || '실패');
    if (typeof mutationDone === 'function') mutationDone({});
    if (okMsg && typeof showAdminToast === 'function') showAdminToast(okMsg);
    _atBadge();
    return true;
  } catch (e) {
    alert('처리 실패: ' + (e.message || e));
    return false;
  }
}

/* 출근시각 수정 — 월별 탭(칸) · 오늘 탭(출근 칸) 공용. 오늘 탭 행은 cells 없이 바로 check_in/note 를 가진다 */
async function _atEdit(userId, date) {
  var row = (_atData.rows || []).find(function (r) { return r.id === userId; });
  var c = row ? (row.cells ? row.cells[date] : row) : null;
  var v = prompt((row ? row.name : '') + ' ' + _atMd(date) + ' 출근시각 (HH:MM, 비우면 삭제)', c && c.check_in ? c.check_in : '');
  if (v === null) return;
  v = v.trim();
  if (v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) { alert('HH:MM 형식으로 입력해주세요 (예: 09:05)'); return; }
  var note = prompt('메모 (선택 — 외근·반차 사유 등)', c && c.note ? c.note : '');
  if (note === null) return;
  if (await _atPost('edit', { user_id: userId, work_date: date, check_in: v || null, note: note }, '✏️ 출근 기록 수정됨')) _atGo(_atTab === 'today' ? 'today' : 'month');
}

async function _atCsv() {
  try {
    var r = await fetch(_atUrl('view=month&format=csv&month=' + _atMonth), { credentials: 'same-origin' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var blob = await r.blob(), name = 'attendance_' + _atMonth + '.csv';
    if (typeof saveBlobAs === 'function') return saveBlobAs(blob, name, 'text/csv');
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 200);
  } catch (e) { alert('CSV 받기 실패: ' + e.message); }
}

function _atOrdMove(i, dir) {
  var o = _atOrder.slice(), j = i + dir;
  if (j < 0 || j >= o.length) return;
  var t = o[i]; o[i] = o[j]; o[j] = t; _atOrder = o; _atRender();
}
function _atOrdDel(i) { var o = _atOrder.slice(); o.splice(i, 1); _atOrder = o; _atRender(); }
function _atOrdAdd() {
  var el = document.getElementById('atOrdAdd'); var v = el && Number(el.value);
  if (!v) return; _atOrder = _atOrder.concat([v]); _atRender();
}
async function _atSaveRotation() {
  var from = (document.getElementById('atOrdFrom') || {}).value;
  if (!_atOrder || !_atOrder.length) { alert('순서에 직원을 넣어주세요'); return; }
  if (!from || _atMonday(from) !== from) { alert('적용 시작일은 월요일이어야 합니다'); return; }
  var names = _atOrder.map(function (id) { var s = _atData.staff.find(function (x) { return x.id === id; }); return s ? s.name : '#' + id; });
  if (!confirm(_atMd(from) + ' 주부터 ' + names.join(' → ') + ' 순서로 매주 돌아갑니다. 저장할까요?')) return;
  if (await _atPost('rotation', { members: _atOrder, effective_from: from }, '✅ 당번 순서 저장됨')) _atGo('duty');
}
async function _atDutySet(date, val) {
  var ok = val ? await _atPost('duty_set', { duty_date: date, user_id: Number(val) }, '✅ ' + _atMd(date) + ' 당번 지정됨')
    : await _atPost('duty_set', { duty_date: date, clear: true }, '↺ ' + _atMd(date) + ' 순서대로');
  _atGo('duty');
  return ok;
}
/* 사장님 2026-10-02: "한주씩 일괄지정" — 그 주 월~금 5칸을 한 번에 */
async function _atDutySetWeek(monday, val) {
  var wk = _atMd(monday).replace(/\(.\)/, '') + ' 주';
  if (!val && !confirm(wk + ' 월~금 지정(교체 포함)을 모두 지우고 순서대로 돌릴까요?')) { _atGo('duty'); return false; }
  var ok = val ? await _atPost('duty_set_week', { monday: monday, user_id: Number(val) }, '✅ ' + wk + ' 월~금 당번 지정됨')
    : await _atPost('duty_set_week', { monday: monday, clear: true }, '↺ ' + wk + ' 순서대로');
  _atGo('duty');
  return ok;
}

async function _atReview(id, approve) {
  var note = '';
  if (!approve) { note = prompt('반려 사유 (직원에게 보입니다)', ''); if (note === null) return; }
  if (await _atPost('leave_review', { id: id, approve: approve, note: note }, approve ? '✅ 연차 승인' : '반려됨')) _atGo(_atTab === 'grant' ? 'grant' : 'leave');
}
async function _atLeaveCancel(id) {
  if (!confirm('승인된 연차를 취소할까요? 잔여 일수가 돌아갑니다.')) return;
  if (await _atPost('leave_cancel', { id: id }, '연차 취소됨')) _atGo(_atTab === 'grant' ? 'grant' : 'leave');
}
/* 묶음 승인·반려 (승인함 카드) — 한 번에 신청한 여러 날을 한 번에 */
async function _atReviewMany(ids, approve) {
  var note = '';
  if (!approve) { note = prompt('반려 사유 (직원에게 보입니다)', ''); if (note === null) return; }
  else if (ids.length > 1 && !confirm(ids.length + '일을 한 번에 승인할까요?')) return;
  var r = await _atPostBody('leave_review_many', { ids: ids, approve: approve, note: note });
  if (!r) return;
  var failed = r.failed || [];
  if (failed.length) alert((r.done || 0) + '일 처리, ' + failed.length + '일 실패:\n' + failed.map(function (f) { return '· ' + f.error; }).join('\n'));
  else if (typeof showAdminToast === 'function') showAdminToast((approve ? '✅ ' : '') + (r.done || 0) + '일 ' + (approve ? '승인' : '반려'));
  _atGo(_atTab === 'grant' ? 'grant' : 'leave');
}
async function _atLeaveCancelMany(ids) {
  if (!confirm('승인된 연차 ' + ids.length + '일을 취소할까요? 잔여 일수가 돌아갑니다.')) return;
  var n = 0;
  for (var i = 0; i < ids.length; i++) { var r = await _atPostBody('leave_cancel', { id: ids[i] }); if (r && r.ok) n++; }
  if (typeof showAdminToast === 'function') showAdminToast(n + '일 취소됨');
  _atGo(_atTab === 'grant' ? 'grant' : 'leave');
}
/* 응답 본문이 필요한 POST (묶음 처리 결과) — 실패면 alert 후 null */
async function _atPostBody(action, body) {
  try {
    var r = await fetch(_atUrl('action=' + action), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || '실패');
    if (typeof mutationDone === 'function') mutationDone({});
    _atBadge();
    return d;
  } catch (e) { alert('처리 실패: ' + (e.message || e)); return null; }
}
async function _atGrant(userId) {
  var v = Number((document.getElementById('atG' + userId) || {}).value);
  if (!Number.isFinite(v) || v < 0) { alert('일수를 입력해주세요'); return; }
  if (await _atPost('leave_grant', { user_id: userId, year: _atYear, days: v }, '✅ ' + _atYear + '년 연차 ' + v + '일 확정')) _atGo('grant');
}
async function _atProfile(userId, patch) {
  patch.user_id = userId;
  if (await _atPost('profile', patch, '저장됨')) _atGo('grant');
}
async function _atSaveSettings() {
  var body = { duty_start: document.getElementById('atSDuty').value, normal_start: document.getElementById('atSNorm').value };
  if (await _atPost('settings', body, '✅ 출근 기준 저장됨')) _atGo('grant');
}

/* ── 사이드바 뱃지 — 연차 승인 대기 ── */
var _atBadgeN = 0, _atMySwaps = 0;
async function _atBadge() {
  try {
    var r = await fetch(_atUrl('view=badge'), { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) return;
    var d = await r.json();
    if (typeof d.owner === 'boolean') _atOwner = d.owner;
    _atBadgeN = Number(d.pending_leave) || 0;
    _atMySwaps = Number(d.my_swaps) || 0;
    /* 사이드바 숫자 = 내가 처리할 것: 직원은 나에게 온 교체, 사장님은 그것 + 승인 대기 */
    var n = _atMySwaps + (_atOwner ? _atBadgeN : 0);
    var el = document.getElementById('sbCntLeave');
    if (el) { el.textContent = n; el.style.display = n ? '' : 'none'; }
    var tabs = document.getElementById('atTabs');
    if (tabs && document.getElementById('attendModal') && document.getElementById('attendModal').style.display === 'flex') tabs.innerHTML = _atTabsHtml(_atTab, _atBadgeN);
  } catch (_) {}
}
setTimeout(_atBadge, 2000);
setInterval(function () { if (!document.hidden) _atBadge(); }, 5 * 60 * 1000);

/* ═══════════════════════ 직원 — 홈 출근 카드 · 내 근태 탭 ═══════════════════════
 * 2026-10-01 사장님: "나를 관리자로 보냈어 바로떠야지 관리자만 근태 출첵이라니까"
 * 직원 = 👑 관리자 = admin.html 사용자. 출근 버튼은 admin 홈을 열면 그 자리에 있어야 한다.
 * 데이터는 전부 /api/attendance?view=me (세션 직원만 성공). 사장님 비번 접속·근태 대상 아님 → 조용히 비움. */

var _AT_WDN = _AT_WD;   /* _atDays · _AT_WD 는 파일 상단 공용 */

async function _atMeApi(qs, body) {
  var r = await fetch(_atUrl(qs), { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  var d = {}; try { d = await r.json(); } catch (_) {}
  d._status = r.status;
  return d;
}

/* ── 홈 카드 ── */
function _atHomeCardHtml(d) {
  if (!d || !d.ok) return '';
  var t = d.today_cell || {};
  var h = '';
  var rec = (d.swaps && d.swaps.received) || [];
  if (rec.length) {
    var s = rec[0];
    h += '<div class="ha-band"><span>' + _atEsc(s.from_name) + ' 님이 ' + _atMd(s.duty_date) + ' 당번 교체를 요청했어요' + (rec.length > 1 ? ' 외 ' + (rec.length - 1) + '건' : '') + '</span>'
      + '<button type="button" class="ha-mini" onclick="_atOpenMe()">보기</button></div>';
  }
  var badge = t.duty ? '<span class="ha-pill duty">오늘 당번 · ' + _atEsc(t.start) + '</span>' : '<span class="ha-pill">오늘 기준 ' + _atEsc(t.start) + '</span>';
  if (t.leave === 'approved') badge += ' <span class="ha-pill leave">오늘 연차</span>';
  h += '<div class="ha-card"><div class="ha-head"><div class="ha-who"><b>' + _atEsc(d.me.name) + ' 님</b><span>' + _atMd(d.today) + '</span></div>' + badge + '</div>';
  if (t.check_in) {
    h += '<div class="ha-done"><span>출근 완료</span><b>' + _atEsc(t.check_in) + '</b>' + (t.late ? '<span class="ha-pill late">지각</span>' : '<span class="ha-pill ok">정상</span>') + '</div>';
  } else if (!d.weekday) {
    h += '<div class="ha-done"><span>' + _atOffdayText(d) + '</span></div>';
  } else {
    h += '<button type="button" class="ha-punch" id="haPunch" onclick="_atHomePunch()">출근</button>';
  }
  var L = d.leave || {};
  h += '<div class="ha-foot"><span>' + (L.days == null ? '연차 확정 전' : '연차 잔여 <b>' + _atDays(L.remaining) + '</b>')
    + (d.month ? ' · 이번 달 출근 ' + d.month.checked + '일' + (d.month.late ? ' · 지각 <b style="color:var(--brand-danger)">' + d.month.late + '</b>' : '') : '') + '</span>'
    + '<button type="button" class="ha-mini" onclick="_atOpenMe()">당번·연차 →</button></div></div>';
  return h;
}
var _atHomeBusy = false;
async function _atHomeCard(force) {
  var el = document.getElementById('homeAttend');
  if (!el) return;
  if (el.dataset.loaded && !force) return;
  if (_atMe && !force) { el.innerHTML = _atHomeCardHtml(_atMe); el.dataset.loaded = '1'; return; }   // 캐시로 먼저
  if (_atHomeBusy) return;
  _atHomeBusy = true;
  try {
    var d = await _atMeApi('view=me');
    el = document.getElementById('homeAttend'); if (!el) return;
    if (!d.ok) { el.innerHTML = ''; el.dataset.loaded = '1'; _atMeOk = false; return; }   // 사장님 비번·대상 아님·직원 아님
    _atMe = d; _atMeOk = true;
    el.innerHTML = _atHomeCardHtml(d); el.dataset.loaded = '1';
    if (_atTab === 'me' && document.getElementById('attendModal') && document.getElementById('attendModal').style.display === 'flex') _atRender();
    _atBadge();   /* 받은 교체 요청이 있으면 사이드바 숫자도 바로 — 2초 타이머·5분 주기만으론 늦다 */
  } catch (_) {} finally { _atHomeBusy = false; }
}
async function _atHomePunch() {
  var b = document.getElementById('haPunch'); if (b) { b.disabled = true; b.textContent = '찍는 중...'; }
  var r = await _atMeApi('action=punch', {});
  if (r.error) { alert(r.error); if (b) { b.disabled = false; b.textContent = '출근'; } return; }
  if (typeof showAdminToast === 'function') showAdminToast(r.already ? '이미 ' + r.check_in + ' 에 출근했어요' : '✅ ' + r.check_in + ' 출근 완료');
  _atHomeCard(true);
}
function _atOpenMe() { _atOpened = true; _atTab = 'me'; openAttend(); }
/* 홈 히어로와 같은 훅 — 모달 주입 이벤트 + 백업 폴링 (멱등: 그려져 있으면 skip) */
try { document.addEventListener('adminModalsLoaded', function () { try { _atHomeCard(); } catch (_) {} }); } catch (_) {}
try { [800, 1800, 3500, 6000].forEach(function (ms) { setTimeout(function () { try { _atHomeCard(); } catch (_) {} }, ms); }); } catch (_) {}
/* 다음 날 폰에서 다시 열면 어제 카드가 남아 있다 — 다시 보일 때 새로 */
try { document.addEventListener('visibilitychange', function () { if (!document.hidden && _atMe) _atHomeCard(true); }); } catch (_) {}

/* ── 내 근태 탭 (렌더는 순수 — d·form·err 만 본다) ── */
function _atMeHtml(d, form, err) {
  var t = d.today_cell || {}, h = '';
  var rec = (d.swaps && d.swaps.received) || [], sent = (d.swaps && d.swaps.sent) || [];
  rec.forEach(function (s) {
    h += '<div class="at-band"><div><b>' + _atEsc(s.from_name) + ' 님이 ' + _atMd(s.duty_date) + ' 당번 교체를 요청했어요</b>'
      + (s.return_date ? '<div>대신 ' + _atMd(s.return_date) + ' 내 당번을 ' + _atEsc(s.from_name) + ' 님이 서요 (맞교환)</div>' : '')
      + (s.reason ? '<div>사유: ' + _atEsc(s.reason) + '</div>' : '') + '</div>'
      + '<div class="at-band-acts"><button class="at-btn pri" onclick="_atMeSwapRespond(' + s.id + ',true)">수락</button><button class="at-btn" onclick="_atMeSwapRespond(' + s.id + ',false)">거절</button></div></div>';
  });

  /* 오늘 */
  var badge = t.duty ? '<span class="pill duty">오늘 당번 · ' + _atEsc(t.start) + '</span>' : '<span class="pill gray">오늘 기준 ' + _atEsc(t.start) + '</span>';
  if (t.leave === 'approved') badge += ' <span class="pill leave">오늘 연차</span>';
  h += '<div class="at-me-card"><div class="at-bar" style="margin-bottom:6px"><b style="font-size:1.1em">' + _atEsc(d.me.name) + ' 님</b><span style="color:var(--text-mute)">' + _atMd(d.today) + '</span><span class="sp"></span>' + badge + '</div>';
  if (t.check_in) h += '<div class="at-done">출근 완료 <b>' + _atEsc(t.check_in) + '</b> ' + (t.late ? '<span class="pill late">지각</span>' : '<span class="pill ok">정상</span>') + '</div>';
  else if (!d.weekday) h += '<div class="at-done">' + _atOffdayText(d) + '</div>';
  else h += '<button type="button" class="at-punch" id="atMePunch" onclick="_atMePunch()">출근</button>';
  h += '</div>';

  /* 당번 */
  var me = d.me.id, mine = (d.duty && d.duty.mine) || [];
  var pendingDates = {}; sent.forEach(function (s) { if (s.status === 'pending') pendingDates[s.duty_date] = 1; });
  var week = function (label, list) {
    return '<div class="at-wk-label">' + label + '</div><div class="at-week">' + (list || []).map(function (x) {
      return '<div class="' + (x.holiday ? 'holi ' : x.user_id === me ? 'me ' : '') + (x.date === d.today ? 'today' : '') + '"' + (x.holiday ? ' title="' + _atEsc(x.holiday) + '"' : '') + '>'
        + _AT_WDN[_atWd(x.date)] + '<b>' + (x.holiday ? '휴' : _atEsc(x.name || '—')) + '</b></div>';
    }).join('') + '</div>';
  };
  h += '<div class="at-me-card"><div class="at-sec" style="margin-top:0">당번 (' + _atEsc((d.settings || {}).duty_start || '09:00') + ' 출근)</div>'
    + week('이번 주', d.duty && d.duty.this_week) + week('다음 주', d.duty && d.duty.next_week);
  if (form && form.kind === 'swap') h += _atSwapFormHtml(d, form.date, err);
  if (mine.length) {
    var byWeek = {};
    mine.forEach(function (x) { var w = _atMonday(x); (byWeek[w] = byWeek[w] || []).push(x); });
    h += '<div class="at-wk-label" style="margin-top:10px">내 당번 날 — 바꿀 날을 누르세요</div>';
    Object.keys(byWeek).sort().forEach(function (w) {
      h += '<div class="at-chips-row"><span class="at-chips-wk">' + _atMd(w).replace(/\(.\)/, '') + ' 주</span><span class="at-chips">'
        + byWeek[w].map(function (x) {
          return pendingDates[x] ? '<span class="at-chip wait" title="교체 요청 중">' + _AT_WDN[_atWd(x)] + '</span>'
            : '<button type="button" class="at-chip' + (form && form.kind === 'swap' && form.date === x ? ' on' : '') + '" onclick="_atMeOpenSwap(\'' + x + '\')" aria-label="' + _atMd(x) + ' 교체 요청">' + _AT_WDN[_atWd(x)] + '</button>';
        }).join('') + '</span></div>';
    });
    if (Object.keys(pendingDates).length) h += '<div style="color:var(--text-mute);font-size:.9em">회색 = 교체 요청 중</div>';
  } else if (d.duty && (d.duty.this_week || []).every(function (x) { return !x.user_id; })) {
    h += '<div style="color:var(--text-mute)">아직 당번 순서가 정해지지 않았어요</div>';
  }
  var sentShow = sent.slice(0, 5);
  if (sentShow.length) {
    var ST = { pending: '대기', accepted: '수락됨', declined: '거절됨', cancelled: '취소' };
    h += '<div class="at-wk-label" style="margin-top:10px">보낸 교체 요청</div>';
    sentShow.forEach(function (s) {
      h += '<div class="at-row"><span class="sp">' + _atMd(s.duty_date) + ' → ' + _atEsc(s.to_name) + (s.return_date ? ' (맞교환 ' + _atMd(s.return_date) + ')' : '') + '</span>'
        + '<span class="pill ' + (s.status === 'accepted' ? 'ok' : 'gray') + '">' + (ST[s.status] || _atEsc(s.status)) + '</span>'
        + (s.status === 'pending' ? '<button class="at-btn dng" onclick="_atMeSwapCancel(' + s.id + ')">취소</button>' : '') + '</div>';
    });
  }
  h += '</div>';

  /* 연차 */
  var L = d.leave || {};
  h += '<div class="at-me-card"><div class="at-sec" style="margin-top:0">' + L.year + '년 연차</div>';
  if (L.days == null) h += '<div style="color:var(--text-mute)">사장님이 올해 연차를 아직 확정하지 않았어요. 확정되면 신청할 수 있습니다.</div>';
  else {
    h += '<div class="at-stats"><div><b>' + _atDays(L.days) + '</b><span>부여</span></div><div><b>' + _atDays(L.approved) + '</b><span>사용</span></div><div><b style="color:var(--brand-primary)">' + _atDays(L.remaining) + '</b><span>잔여</span></div></div>'
      + (L.pending ? '<div style="color:var(--text-mute);margin-top:4px">승인 대기 ' + L.pending + '일</div>' : '');
    if (form && form.kind === 'leave') h += _atLeaveFormHtml(d, form, err);
    else h += '<button type="button" class="at-btn pri" style="width:100%;margin-top:10px;padding:11px" onclick="_atMeOpenLeave()">연차 신청</button>';
  }
  /* 대기·반려 건은 줄로 (취소 가능), 승인 건은 아래 달력·월별 묶음에서 */
  var reqs = (L.requests || []).filter(function (r) { return r.status === 'pending' || r.status === 'rejected'; }).slice(0, 10);
  if (reqs.length) {
    var LS = { pending: '대기', approved: '승인', rejected: '반려' };
    h += '<div style="margin-top:8px">';
    reqs.forEach(function (r) {
      h += '<div class="at-row"><span class="sp">' + _atMd(r.leave_date) + (r.review_note ? ' <span style="color:var(--text-mute)">· ' + _atEsc(r.review_note) + '</span>' : '') + '</span>'
        + '<span class="pill ' + (r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'late' : 'gray') + '">' + (LS[r.status] || _atEsc(r.status)) + '</span>'
        + (r.status === 'pending' ? '<button class="at-btn dng" onclick="_atMeLeaveCancel(' + r.id + ')">취소</button>' : '') + '</div>';
    });
    h += '</div>';
  }
  if (!(form && form.kind === 'leave')) h += _atMyLeaveHtml(d);
  h += '</div>';

  /* 이번 달 */
  h += '<div class="at-me-card"><div class="at-sec" style="margin-top:0">이번 달</div><div class="at-stats two"><div><b>' + ((d.month || {}).checked || 0) + '</b><span>출근</span></div>'
    + '<div><b' + ((d.month || {}).late ? ' style="color:var(--brand-danger)"' : '') + '>' + ((d.month || {}).late || 0) + '</b><span>지각</span></div></div>'
    + '<div style="color:var(--text-mute);margin-top:6px;font-size:.9em">지각 기준: 당번 ' + _atEsc((d.settings || {}).duty_start) + ' · 일반 ' + _atEsc((d.settings || {}).normal_start) + ' (1분이라도 늦으면 지각)</div>'
    + '<div style="color:var(--text-mute);margin-top:6px;font-size:.9em">폰 홈 화면 바로가기: <b>' + _atEsc(location.origin) + '/attend.html</b></div></div>';
  return h;
}
function _atSwapFormHtml(d, date, err) {
  var opts = (d.colleagues || []).map(function (c) { return '<option value="' + c.id + '">' + _atEsc(c.name) + '</option>'; }).join('');
  return '<div class="at-form"><div class="at-form-title">' + _atMd(date) + ' 당번 교체 요청</div>'
    + (opts ? '<label>대신 서줄 동료</label><select id="atSwTo">' + opts + '</select>' : '<div style="color:var(--brand-danger)">교체할 동료가 없습니다</div>')
    + '<label>맞교환 (선택) — 상대 당번 날을 내가 대신</label><input type="date" id="atSwRet" min="' + _atEsc(d.today) + '">'
    + '<label>사유 (선택)</label><textarea id="atSwReason" rows="2" maxlength="200"></textarea>'
    + '<div style="color:var(--text-mute);font-size:.9em;margin-top:4px">상대가 수락하면 바로 바뀝니다</div>'
    + (err ? '<div class="at-err">' + _atEsc(err) + '</div>' : '')
    + '<div class="at-form-acts"><button type="button" class="at-btn" onclick="_atMeCloseForm()">닫기</button>'
    + (opts ? '<button type="button" class="at-btn pri" onclick="_atMeSendSwap(\'' + date + '\')">요청 보내기</button>' : '') + '</div></div>';
}
/* 사장님 2026-10-02: "연차 시작일·종료일 … 걍 달력 들어가서 체크체크 — 한번에 뛰엄뛰엄 두곳 들어갈 수 있음"
 * 월 달력에서 쉴 날을 눌러 고른다. 주말·지난 날·이미 신청(대기/승인)한 날은 못 누르고, 내 당번 날엔 점. */
var _AT_CAL_WD = ['일', '월', '화', '수', '목', '금', '토'];
/* mode 'pick' = 연차 신청(눌러 고르기, 오늘 이후만) · 'view' = 내 연차 달력(올해 전체 보기, 사장님: "직원 본인도 본인 건 언제 쓰는지") */
function _atCalHtml(d, form, mode) {
  var pick = mode !== 'view';
  var month = form.month || d.today.slice(0, 7), sel = form.dates || [];
  var taken = {}; ((d.leave && d.leave.requests) || []).forEach(function (r) { if (r.status === 'pending' || r.status === 'approved') taken[r.leave_date] = r.status; });
  var mine = {}; ((d.duty && d.duty.mine) || []).forEach(function (x) { mine[x] = 1; });
  var hol = d.holidays || {};
  var first = month + '-01', lead = _atWd(first);
  var minMonth = pick ? d.today.slice(0, 7) : d.today.slice(0, 4) + '-01', maxMonth = _atAdd(d.today, 365).slice(0, 7);
  var nav = pick ? '_atLvMonth' : '_atLvViewMonth';
  var h = '<div class="at-cal"><div class="at-cal-head">'
    + '<button type="button" class="at-btn" onclick="' + nav + '(-1)" aria-label="이전 달"' + (month <= minMonth ? ' disabled' : '') + '>‹</button>'
    + '<b>' + month.slice(0, 4) + '년 ' + Number(month.slice(5)) + '월</b>'
    + '<button type="button" class="at-btn" onclick="' + nav + '(1)" aria-label="다음 달"' + (month >= maxMonth ? ' disabled' : '') + '>›</button></div>'
    + '<div class="at-cal-grid">' + _AT_CAL_WD.map(function (n, i) { return '<span class="at-cal-wd' + (i === 0 || i === 6 ? ' we' : '') + '">' + n + '</span>'; }).join('');
  for (var i = 0; i < lead; i++) h += '<span></span>';
  for (var day = first; day.slice(0, 7) === month; day = _atAdd(day, 1)) {
    var n = Number(day.slice(8)), w = _atWd(day), tod = day === d.today ? ' today' : '';
    if (w === 0 || w === 6) { h += '<span class="at-cal-d we' + tod + '">' + n + '</span>'; continue; }
    if (hol[day]) { h += '<span class="at-cal-d holi' + tod + '" title="' + _atEsc(hol[day]) + '">' + n + '</span>'; continue; }
    if (taken[day]) { h += '<span class="at-cal-d taken' + (taken[day] === 'pending' ? ' wait' : '') + tod + '" title="' + (taken[day] === 'approved' ? '승인된 연차' : '승인 대기') + '">' + n + '</span>'; continue; }
    if (!pick || day < d.today) { h += '<span class="at-cal-d' + (pick ? ' past' : '') + (mine[day] ? ' duty' : '') + tod + '">' + n + '</span>'; continue; }
    var on = sel.indexOf(day) >= 0;
    h += '<button type="button" class="at-cal-d' + (on ? ' on' : '') + (mine[day] ? ' duty' : '') + tod
      + '" onclick="_atLvToggle(\'' + day + '\')" aria-pressed="' + on + '" aria-label="' + _atMd(day) + (mine[day] ? ' 내 당번' : '') + '">' + n + '</button>';
  }
  /* 이 달 공휴일 이름 */
  var holNames = Object.keys(hol).filter(function (x) { return x.slice(0, 7) === month; }).sort().map(function (x) { return Number(x.slice(8)) + '일 ' + _atEsc(hol[x]); });
  return h + '</div><div style="color:var(--text-mute);font-size:.82em;margin-top:6px">보라 = 연차(승인) · 연보라 = 승인 대기 · 빨강 = 공휴일' + (pick ? ' · 점 = 내 당번 (교체 먼저)' : '')
    + (holNames.length ? '<br>공휴일: ' + holNames.join(', ') : '') + '</div></div>';
}
/* 내 연차 달력 (보기 전용) — 사장님 2026-10-02: "직원 본인도 본인 건 언제 쓰는지 볼 수 있도록" */
var _atLvView = null;   // { month }
function _atLvViewMonth(n) {
  if (!_atLvView) _atLvView = { month: _atMe.today.slice(0, 7) };
  var p = _atLvView.month.split('-');
  _atLvView.month = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1 + n, 1)).toISOString().slice(0, 7);
  _atRender();
}
function _atMyLeaveHtml(d) {
  var L = d.leave || {};
  var reqs = (L.requests || []).filter(function (r) { return r.status === 'approved' || r.status === 'pending'; });
  var byMonth = {};
  reqs.forEach(function (r) { var m = r.leave_date.slice(0, 7); (byMonth[m] = byMonth[m] || []).push(r); });
  var h = '<div class="at-wk-label" style="margin-top:12px">내 연차 달력 — 언제 썼고 언제 쓰는지</div>'
    + _atCalHtml(d, { month: (_atLvView || {}).month || d.today.slice(0, 7) }, 'view');
  var months = Object.keys(byMonth).sort();
  if (months.length) {
    h += '<div style="margin-top:8px;font-size:.92em">' + months.map(function (m) {
      var list = byMonth[m].sort(function (a, b) { return a.leave_date < b.leave_date ? -1 : 1; });
      return '<div class="at-row"><span style="min-width:44px;color:var(--text-sub);font-weight:700">' + Number(m.slice(5)) + '월</span><span class="sp">'
        + list.map(function (r) { return '<span class="pill ' + (r.status === 'approved' ? 'leave' : 'gray') + '" style="margin:1px 2px 1px 0">' + _atMd(r.leave_date) + (r.status === 'pending' ? ' 대기' : '') + '</span>'; }).join('')
        + '</span><span style="color:var(--text-mute)">' + list.filter(function (r) { return r.status === 'approved'; }).length + '일</span></div>';
    }).join('') + '</div>';
  }
  return h;
}
function _atLeaveFormHtml(d, form, err) {
  var sel = (form.dates || []).slice().sort(), mine = (d.duty && d.duty.mine) || [], L = d.leave || {};
  var duty = sel.filter(function (x) { return mine.indexOf(x) >= 0; });
  return '<div class="at-form"><div class="at-form-title">연차 신청</div>'
    + '<div style="color:var(--text-mute);font-size:.9em">쉴 날을 눌러 고르세요. 떨어진 날도 한 번에 됩니다. 주말·공휴일은 자동으로 빠집니다.</div>'
    + _atCalHtml(d, form, 'pick')
    + '<div id="atLvPrev" style="font-size:.9em;margin-top:8px">' + (sel.length
      ? '<b>' + sel.length + '일</b> 선택 — ' + sel.map(function (x) { return '<button type="button" class="at-lv-sel" onclick="_atLvToggle(\'' + x + '\')" aria-label="' + _atMd(x) + ' 빼기">' + _atMd(x) + ' ×</button>'; }).join(' ')
        + '<div style="color:var(--text-mute);margin-top:4px">잔여 ' + _atDays((L.remaining || 0) - (L.pending || 0)) + '</div>'
        + (duty.length ? '<div style="color:var(--brand-danger)">' + duty.map(_atMd).join(', ') + ' 은 내 당번 — 교체를 먼저 잡아야 해요</div>' : '')
      : '<span style="color:var(--text-mute)">아직 고른 날이 없어요</span>') + '</div>'
    + '<label>사유 (선택)</label><textarea id="atLvReason" rows="2" maxlength="200">' + _atEsc(form.reason || '') + '</textarea>'
    + (err ? '<div class="at-err">' + _atEsc(err) + '</div>' : '')
    + (form.duty_date ? '<button type="button" class="at-btn" style="margin-top:6px" onclick="_atMeOpenSwap(\'' + form.duty_date + '\')">' + _atMd(form.duty_date) + ' 교체 요청하기</button>' : '')
    + '<div class="at-form-acts"><button type="button" class="at-btn" onclick="_atMeCloseForm()">닫기</button><button type="button" class="at-btn pri" onclick="_atMeSendLeave()">신청</button></div></div>';
}

/* ── 내 근태 액션 ── */
async function _atMeRefresh() { await _atGo('me'); _atHomeCard(true); _atBadge(); }
async function _atMePunch() {
  var b = document.getElementById('atMePunch'); if (b) { b.disabled = true; b.textContent = '찍는 중...'; }
  var r = await _atMeApi('action=punch', {});
  if (r.error) { alert(r.error); if (b) { b.disabled = false; b.textContent = '출근'; } return; }
  if (typeof showAdminToast === 'function') showAdminToast(r.already ? '이미 ' + r.check_in + ' 에 출근했어요' : '✅ ' + r.check_in + ' 출근 완료');
  _atMeRefresh();
}
async function _atMeSwapRespond(id, accept) {
  if (!accept && !confirm('거절할까요?')) return;
  var r = await _atMeApi('action=swap_respond', { id: id, accept: accept });
  if (r.error) return alert(r.error);
  if (typeof showAdminToast === 'function') showAdminToast(accept ? '교체를 수락했어요' : '거절했어요');
  _atMeRefresh();
}
async function _atMeSwapCancel(id) {
  if (!confirm('교체 요청을 취소할까요?')) return;
  var r = await _atMeApi('action=swap_cancel', { id: id });
  if (r.error) return alert(r.error);
  _atMeRefresh();
}
async function _atMeLeaveCancel(id) {
  if (!confirm('연차 신청을 취소할까요?')) return;
  var r = await _atMeApi('action=leave_cancel', { id: id });
  if (r.error) return alert(r.error);
  _atMeRefresh();
}
function _atMeOpenSwap(date) { _atMeForm = { kind: 'swap', date: date }; _atMyErr = ''; _atRender(); var f = document.querySelector('#atBody .at-form'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' }); }
function _atMeOpenLeave() { _atMeForm = { kind: 'leave' }; _atMyErr = ''; _atRender(); }
function _atMeCloseForm() { _atMeForm = null; _atMyErr = ''; _atRender(); }
/* 달력 다시 그리기 전에 적어둔 사유를 잃지 않게 */
function _atLvKeep() {
  if (!_atMeForm || _atMeForm.kind !== 'leave') return false;
  var t = document.getElementById('atLvReason'); if (t) _atMeForm.reason = t.value;
  return true;
}
function _atLvToggle(date) {
  if (!_atLvKeep()) return;
  var s = (_atMeForm.dates || []).slice(), i = s.indexOf(date);
  if (i >= 0) s.splice(i, 1); else s.push(date);
  _atMeForm.dates = s; _atMyErr = ''; _atRender();
}
function _atLvMonth(n) {
  if (!_atLvKeep()) return;
  var p = (_atMeForm.month || _atMe.today.slice(0, 7)).split('-');
  _atMeForm.month = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1 + n, 1)).toISOString().slice(0, 7);
  _atRender();
}
async function _atMeSendSwap(date) {
  var body = { duty_date: date, to_user: Number((document.getElementById('atSwTo') || {}).value),
    return_date: (document.getElementById('atSwRet') || {}).value || null, reason: (document.getElementById('atSwReason') || {}).value };
  var r = await _atMeApi('action=swap_request', body);
  if (r.error) { _atMyErr = r.error; _atRender(); return; }
  if (typeof showAdminToast === 'function') showAdminToast('교체 요청을 보냈어요');
  _atMeRefresh();
}
async function _atMeSendLeave() {
  if (!_atLvKeep()) return;
  var keep = _atMeForm, list = (keep.dates || []).slice().sort();
  if (!list.length) { _atMyErr = '달력에서 쉴 날을 눌러주세요'; _atRender(); return; }
  var r = await _atMeApi('action=leave_request', { dates: list, reason: keep.reason || '' });
  if (r.error) { keep.duty_date = r.duty_date || null; _atMeForm = keep; _atMyErr = r.error; _atRender(); return; }
  if (typeof showAdminToast === 'function') showAdminToast(r.count + '일 신청했어요 — 사장님 승인 대기');
  _atMeRefresh();
}
