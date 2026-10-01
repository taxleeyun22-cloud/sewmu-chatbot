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
  _atGo(_atTab);
  _atBadge();            // 열 때마다 대기 건수 새로 — 5분 주기만 믿으면 방금 들어온 신청이 안 보인다
}
function closeAttend() {
  var m = document.getElementById('attendModal');
  if (m) m.style.display = 'none';
}

var _AT_TABS = [['today', '오늘'], ['month', '월별'], ['duty', '당번표'], ['leave', '연차 승인함'], ['grant', '연차 부여']];
function _atTabsHtml(active, pending) {
  return _AT_TABS.map(function (t) {
    return '<button type="button" class="at-tab' + (t[0] === active ? ' on' : '') + '" onclick="_atGo(\'' + t[0] + '\')">' + t[1]
      + (t[0] === 'leave' && pending ? '<span class="n">' + pending + '</span>' : '') + '</button>';
  }).join('');
}

async function _atGo(tab) {
  _atTab = tab;
  var body = document.getElementById('atBody'), tabs = document.getElementById('atTabs');
  if (tabs) tabs.innerHTML = _atTabsHtml(tab, _atBadgeN);
  if (body) body.innerHTML = '<div class="at-empty">불러오는 중...</div>';
  var qs = { today: 'view=today', month: 'view=month&month=' + _atMonth, duty: 'view=duty&weeks=8&from=' + _atDutyFrom,
    leave: 'view=leave&year=' + _atYear, grant: 'view=leave&year=' + _atYear }[tab];
  try {
    var r = await fetch(_atUrl(qs), { credentials: 'same-origin', cache: 'no-store' });
    var d = await r.json();
    if (d.error) throw new Error(d.error);
    if (_atTab !== tab) return;           // 그 사이 다른 탭을 눌렀다
    _atData = d;
    if (tab === 'duty') _atOrder = null;
    _atRender();
  } catch (e) {
    if (body) body.innerHTML = '<div class="at-empty">불러오기 실패: ' + _atEsc(e.message) + '</div>';
  }
}
function _atRender() {
  var body = document.getElementById('atBody');
  if (!body || !_atData) return;
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

function _atTodayHtml(d) {
  var h = '<div class="at-bar"><b>' + _atMd(d.today) + '</b>'
    + (d.duty_name ? '<span class="pill duty">당번 ' + _atEsc(d.duty_name) + ' · ' + _atEsc(d.settings.duty_start) + '</span>' : '')
    + '<span style="color:var(--text-mute)">일반 ' + _atEsc(d.settings.normal_start) + ' · 유예 ' + d.settings.grace_minutes + '분</span>'
    + '<span class="sp"></span><button class="at-btn" onclick="_atGo(\'today\')">새로고침</button></div>';
  if (!d.weekday) h += '<div class="at-note">오늘은 주말입니다.</div>';
  if (!d.rows.length) return h + _atNoStaffHtml();
  h += '<table><thead><tr><th>직원</th><th>기준</th><th>출근</th><th>상태</th></tr></thead><tbody>';
  d.rows.forEach(function (r) {
    var st = r.check_in ? (r.late ? '<span class="pill late">지각</span>' : '<span class="pill ok">정상</span>')
      : r.leave === 'approved' ? '<span class="pill leave">연차</span>'
      : r.leave === 'pending' ? '<span class="pill gray">연차 대기</span>'
      : '<span class="pill gray">미출근</span>';
    h += '<tr><td><b>' + _atEsc(r.name) + '</b>' + (r.duty ? ' <span class="pill duty">당번</span>' : '') + '</td>'
      + '<td>' + _atEsc(r.start) + '</td>'
      + '<td>' + (r.check_in ? '<span class="' + (r.late ? 'late' : '') + '">' + _atEsc(r.check_in) + '</span>' : '<span class="miss">—</span>')
      + (r.edited ? ' <span style="color:var(--text-mute);font-size:.85em">(수정)</span>' : '') + '</td>'
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
  h += '<div style="overflow-x:auto"><table class="at-grid"><thead><tr><th class="nm">직원</th>';
  dates.forEach(function (x) { h += '<th>' + Number(x.slice(8)) + '<br>' + _AT_WD[_atWd(x)] + '</th>'; });
  h += '<th>출근</th><th>지각</th><th>연차</th><th>당번</th></tr></thead><tbody>';
  d.rows.forEach(function (r) {
    h += '<tr><td class="nm"><b>' + _atEsc(r.name) + '</b></td>';
    dates.forEach(function (x) {
      var c = r.cells[x], we = _atWd(x) === 0 || _atWd(x) === 6;
      h += '<td class="' + (we ? 'we ' : '') + (d.owner ? 'click' : '') + '"'
        + (d.owner ? ' onclick="_atEdit(' + r.id + ',\'' + x + '\')"' : '')
        + (c && c.note ? ' title="' + _atEsc(c.note) + '"' : '') + '>' + _atCellHtml(c) + '</td>';
    });
    h += '<td>' + r.sum.checked + '</td><td class="' + (r.sum.late ? 'late' : '') + '">' + r.sum.late + '</td><td>' + r.sum.leave + '</td><td>' + r.sum.duty + '</td></tr>';
  });
  return h + '</tbody></table></div>';
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
  h += '<div class="at-sec">당번표' + (d.owner ? ' — 칸에서 하루만 다른 사람으로 바꿀 수 있습니다' : '') + '</div>'
    + '<table class="at-grid"><thead><tr><th class="nm">주</th><th>월</th><th>화</th><th>수</th><th>목</th><th>금</th></tr></thead><tbody>';
  d.grid.forEach(function (w) {
    h += '<tr><td class="nm">' + _atMd(w.monday).replace(/\(.\)/, '') + '~</td>';
    w.days.forEach(function (x) {
      var tag = x.override === 'swap' ? ' <span class="pill gray">교체</span>' : x.override === 'owner' ? ' <span class="pill gray">지정</span>' : '';
      var warn = x.on_leave ? ' <span class="pill late">연차</span>' : '';
      var today = x.date === d.today ? ' style="outline:2px solid var(--brand-primary);outline-offset:-2px"' : '';
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

function _atLeaveHtml(d) {
  var h = '<div class="at-bar"><select onchange="_atYear=Number(this.value);_atGo(\'leave\')">' + _atYearOpts(d.year) + '</select>'
    + '<span class="sp"></span><button class="at-btn" onclick="_atGo(\'leave\')">새로고침</button></div>';
  h += '<div class="at-sec">승인 대기 ' + d.pending.length + '건</div>';
  if (!d.pending.length) h += '<div style="color:var(--text-mute)">대기 중인 신청이 없습니다</div>';
  else {
    h += '<table><thead><tr><th>직원</th><th>날짜</th><th>사유</th><th>잔여</th><th></th></tr></thead><tbody>';
    d.pending.forEach(function (r) {
      var act = !d.owner ? '<span style="color:var(--text-mute)">사장님 승인</span>'
        : r.is_duty ? '<span class="pill late">이날 당번 — 교체 먼저</span> <button class="at-btn dng" onclick="_atReview(' + r.id + ',false)">반려</button>'
        : '<button class="at-btn pri" onclick="_atReview(' + r.id + ',true)">승인</button> <button class="at-btn dng" onclick="_atReview(' + r.id + ',false)">반려</button>';
      h += '<tr><td><b>' + _atEsc(r.name) + '</b></td><td>' + _atMd(r.leave_date) + '</td><td>' + _atEsc(r.reason || '') + '</td>'
        + '<td>' + _atDays(r.remaining) + '</td><td>' + act + '</td></tr>';
    });
    h += '</tbody></table>';
  }
  var ST = { approved: '승인', rejected: '반려', cancelled: '취소' };
  h += '<div class="at-sec">최근 처리</div>';
  if (!d.recent.length) h += '<div style="color:var(--text-mute)">없습니다</div>';
  else {
    h += '<table><thead><tr><th>직원</th><th>날짜</th><th>상태</th><th>메모</th><th></th></tr></thead><tbody>';
    d.recent.forEach(function (r) {
      h += '<tr><td>' + _atEsc(r.name) + '</td><td>' + _atMd(r.leave_date) + '</td><td>' + (ST[r.status] || _atEsc(r.status)) + '</td>'
        + '<td>' + _atEsc(r.review_note || '') + '</td><td>'
        + (d.owner && r.status === 'approved' ? '<button class="at-btn dng" onclick="_atLeaveCancel(' + r.id + ')">승인 취소</button>' : '') + '</td></tr>';
    });
    h += '</tbody></table>';
  }
  return h;
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
      + '<td>' + _atDays(r.approved) + '</td><td>' + (r.pending || '') + '</td><td><b>' + _atDays(r.remaining) + '</b></td></tr>';
  });
  h += '</tbody></table>';
  h += '<div class="at-sec">출근 기준</div>';
  if (d.owner) {
    h += '<div class="at-bar">당번 <input type="time" id="atSDuty" value="' + _atEsc(s.duty_start) + '">'
      + ' 일반 <input type="time" id="atSNorm" value="' + _atEsc(s.normal_start) + '">'
      + ' 유예 <input type="number" id="atSGrace" min="0" max="30" style="width:60px" value="' + _atEsc(s.grace_minutes) + '">분'
      + ' <button class="at-btn pri" onclick="_atSaveSettings()">저장</button></div>'
      + '<div style="color:var(--text-mute)">유예 1분 = 당번 09:01 까지 정상, 09:02 부터 지각.</div>';
  } else {
    h += '<div>당번 ' + _atEsc(s.duty_start) + ' · 일반 ' + _atEsc(s.normal_start) + ' · 유예 ' + _atEsc(s.grace_minutes) + '분</div>';
  }
  return h + _atLinkHtml();
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

async function _atEdit(userId, date) {
  var row = (_atData.rows || []).find(function (r) { return r.id === userId; });
  var c = row && row.cells[date];
  var v = prompt((row ? row.name : '') + ' ' + _atMd(date) + ' 출근시각 (HH:MM, 비우면 삭제)', c && c.check_in ? c.check_in : '');
  if (v === null) return;
  v = v.trim();
  if (v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) { alert('HH:MM 형식으로 입력해주세요 (예: 09:05)'); return; }
  var note = prompt('메모 (선택 — 외근·반차 사유 등)', c && c.note ? c.note : '');
  if (note === null) return;
  if (await _atPost('edit', { user_id: userId, work_date: date, check_in: v || null, note: note }, '✏️ 출근 기록 수정됨')) _atGo('month');
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

async function _atReview(id, approve) {
  var note = '';
  if (!approve) { note = prompt('반려 사유 (직원에게 보입니다)', ''); if (note === null) return; }
  if (await _atPost('leave_review', { id: id, approve: approve, note: note }, approve ? '✅ 연차 승인' : '반려됨')) _atGo('leave');
}
async function _atLeaveCancel(id) {
  if (!confirm('승인된 연차를 취소할까요? 잔여 일수가 돌아갑니다.')) return;
  if (await _atPost('leave_cancel', { id: id }, '연차 취소됨')) _atGo('leave');
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
  var body = { duty_start: document.getElementById('atSDuty').value, normal_start: document.getElementById('atSNorm').value,
    grace_minutes: Number(document.getElementById('atSGrace').value) };
  if (await _atPost('settings', body, '✅ 출근 기준 저장됨')) _atGo('grant');
}

/* ── 사이드바 뱃지 — 연차 승인 대기 ── */
var _atBadgeN = 0;
async function _atBadge() {
  try {
    var r = await fetch(_atUrl('view=badge'), { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) return;
    var d = await r.json();
    _atBadgeN = Number(d.pending_leave) || 0;
    var el = document.getElementById('sbCntLeave');
    if (el) { el.textContent = _atBadgeN; el.style.display = _atBadgeN ? '' : 'none'; }
    var tabs = document.getElementById('atTabs');
    if (tabs && document.getElementById('attendModal') && document.getElementById('attendModal').style.display === 'flex') tabs.innerHTML = _atTabsHtml(_atTab, _atBadgeN);
  } catch (_) {}
}
setTimeout(_atBadge, 2000);
setInterval(function () { if (!document.hidden) _atBadge(); }, 5 * 60 * 1000);
