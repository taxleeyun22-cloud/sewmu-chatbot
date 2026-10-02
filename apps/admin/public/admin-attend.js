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
      + ' 유예 <input type="number" id="atSGrace" min="0" max="30" style="width:60px" value="' + _atEsc(s.grace_minutes) + '">분'
      + ' <button class="at-btn pri" onclick="_atSaveSettings()">저장</button></div>'
      + '<div style="color:var(--text-mute)">유예 1분 = 당번 09:01 까지 정상, 09:02 부터 지각.</div>';
  } else {
    h += '<div>당번 ' + _atEsc(s.duty_start) + ' · 일반 ' + _atEsc(s.normal_start) + ' · 유예 ' + _atEsc(s.grace_minutes) + '분</div>';
  }
  return h + _atLinkHtml();
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
function _atWeekdays(a, b) { var o = []; if (!a || !b || a > b) return o; for (var d = a, i = 0; d <= b && i < 62; d = _atAdd(d, 1), i++) { var w = _atWd(d); if (w >= 1 && w <= 5) o.push(d); } return o; }

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
    h += '<div class="ha-done"><span>오늘은 주말입니다</span></div>';
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
  else if (!d.weekday) h += '<div class="at-done">오늘은 주말입니다</div>';
  else h += '<button type="button" class="at-punch" id="atMePunch" onclick="_atMePunch()">출근</button>';
  h += '</div>';

  /* 당번 */
  var me = d.me.id, mine = (d.duty && d.duty.mine) || [];
  var pendingDates = {}; sent.forEach(function (s) { if (s.status === 'pending') pendingDates[s.duty_date] = 1; });
  var week = function (label, list) {
    return '<div class="at-wk-label">' + label + '</div><div class="at-week">' + (list || []).map(function (x) {
      return '<div class="' + (x.user_id === me ? 'me ' : '') + (x.date === d.today ? 'today' : '') + '">' + _AT_WDN[_atWd(x.date)] + '<b>' + _atEsc(x.name || '—') + '</b></div>';
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
  var reqs = (L.requests || []).filter(function (r) { return r.status !== 'cancelled'; }).slice(0, 10);
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
  h += '</div>';

  /* 이번 달 */
  h += '<div class="at-me-card"><div class="at-sec" style="margin-top:0">이번 달</div><div class="at-stats two"><div><b>' + ((d.month || {}).checked || 0) + '</b><span>출근</span></div>'
    + '<div><b' + ((d.month || {}).late ? ' style="color:var(--brand-danger)"' : '') + '>' + ((d.month || {}).late || 0) + '</b><span>지각</span></div></div>'
    + '<div style="color:var(--text-mute);margin-top:6px;font-size:.9em">지각 기준: 당번 ' + _atEsc((d.settings || {}).duty_start) + ' · 일반 ' + _atEsc((d.settings || {}).normal_start) + ' (유예 ' + _atEsc((d.settings || {}).grace_minutes) + '분)</div>'
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
function _atLeaveFormHtml(d, form, err) {
  return '<div class="at-form"><div class="at-form-title">연차 신청</div>'
    + '<label>시작일</label><input type="date" id="atLvFrom" min="' + _atEsc(d.today) + '" value="' + _atEsc(form.from || '') + '" onchange="_atMeLeavePreview()">'
    + '<label>종료일</label><input type="date" id="atLvTo" min="' + _atEsc(d.today) + '" value="' + _atEsc(form.to || '') + '" onchange="_atMeLeavePreview()">'
    + '<div id="atLvPrev" style="color:var(--text-mute);font-size:.9em;margin-top:4px">주말은 자동으로 빠집니다. 공휴일은 직접 빼고 신청해주세요.</div>'
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
function _atMeLeaveDates() {
  var a = (document.getElementById('atLvFrom') || {}).value, b = (document.getElementById('atLvTo') || {}).value || a;
  return _atWeekdays(a, b);
}
function _atMeLeavePreview() {
  var f = document.getElementById('atLvFrom'), t = document.getElementById('atLvTo'), p = document.getElementById('atLvPrev');
  if (!f || !t || !p) return;
  if (f.value && (!t.value || t.value < f.value)) t.value = f.value;
  var list = _atMeLeaveDates(), mine = (_atMe && _atMe.duty && _atMe.duty.mine) || [], L = (_atMe && _atMe.leave) || {};
  var duty = list.filter(function (x) { return mine.indexOf(x) >= 0; });
  p.innerHTML = list.length
    ? '평일 <b>' + list.length + '일</b> 신청 · 잔여 ' + _atDays((L.remaining || 0) - (L.pending || 0))
      + (duty.length ? '<br><span style="color:var(--brand-danger)">' + duty.map(_atMd).join(', ') + ' 은 내 당번 — 교체를 먼저 잡아야 해요</span>' : '')
    : '평일이 없습니다';
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
  var list = _atMeLeaveDates();
  var keep = { kind: 'leave', from: (document.getElementById('atLvFrom') || {}).value, to: (document.getElementById('atLvTo') || {}).value, reason: (document.getElementById('atLvReason') || {}).value };
  if (!list.length) { _atMeForm = keep; _atMyErr = '날짜를 골라주세요'; _atRender(); return; }
  var r = await _atMeApi('action=leave_request', { dates: list, reason: keep.reason });
  if (r.error) { keep.duty_date = r.duty_date || null; _atMeForm = keep; _atMyErr = r.error; _atRender(); return; }
  if (typeof showAdminToast === 'function') showAdminToast(r.count + '일 신청했어요 — 사장님 승인 대기');
  _atMeRefresh();
}
