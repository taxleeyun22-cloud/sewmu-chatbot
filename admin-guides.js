/* 📖 업무 가이드 (2026-07-07 사장님 명령: "부가세 주의사항 이런거 해서 직원들이 다 읽어볼수있도록")
 * 사내 업무 매뉴얼 열람/작성 — 읽음확인 없음, "알찬 내용 + 가독성" 중심 (사장님 결정).
 *
 * - 열람: admin 진입 가능 전원 (직원 포함)
 * - 작성/수정/삭제: 사장님 + admin (서버 hasAdminRole 기준, GET 응답 canWrite 로 버튼 토글)
 * - 서식: XSS-safe 미니 마크다운 — # 제목 / ## 소제목 / - 불릿 / 1. 번호 / **강조** / > 주의박스 / ---
 *          + 표 (| a | b |) · 이미지 (![설명](R2키)) — 2026-08-17 추가 (홈택스 캡처·판단표용)
 *   (escape 먼저 → 자체 태그 생성. innerHTML 에 사용자 원문 직접 주입 절대 없음)
 */

/* ── 상태 ── */
var _gdAll = [];          // 전체 목록 (서버가 pinned 우선 정렬)
var _gdCat = 'all';       // 현재 카테고리 필터
var _gdCur = null;        // 열람 중인 글 id
var _gdCanWrite = false;  // 서버 판정 (admin 이상)
var _gdEditId = null;     // 수정 중인 글 id (null = 새 글)

var _GD_CATS = ['부가세', '원천세', '종소세', '법인세', '연말정산', '공통', '사용법'];
var _GD_CAT_COLORS = { '부가세': '#3182f6', '원천세': '#8b5cf6', '종소세': '#f59e0b', '법인세': '#10b981', '연말정산': '#ec4899', '공통': '#64748b', '사용법': '#0891b2' };

function _gdKeyQS() {
  var k = (typeof KEY !== 'undefined' && KEY) ? KEY : '';
  return k ? ('key=' + encodeURIComponent(k)) : '';
}
function _gdUrl(extra) {
  var qs = [_gdKeyQS(), extra || ''].filter(Boolean).join('&');
  return '/api/admin-guides' + (qs ? ('?' + qs) : '');
}
function _gdEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── 미니 마크다운 렌더러 (XSS-safe: 내용 텍스트는 전부 _gdEsc 통과) ── */
function _gdInline(escaped) {
  return escaped.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
}

/* 이미지 키 검증 (2026-08-17) — R2 키만 허용. 외부 URL·javascript: 등 원천 차단.
 * 사용자 입력을 src 에 그대로 넣지 않고, 검증 통과한 키로 URL 을 우리가 조립. */
var _GD_IMGKEY_RE = /^[A-Za-z0-9_\-]+(?:\/[A-Za-z0-9_\-.]+)+$/;
function _gdImgOk(k) {
  return !!k && k.length <= 200 && _GD_IMGKEY_RE.test(k) && k.indexOf('..') === -1;
}

/* 표 구분줄 판정 — | --- | :--- | ---: | 형태 */
function _gdIsTableSep(cells) {
  return cells.length > 0 && cells.every(function (c) { return /^:?-{2,}:?$/.test(c.trim()); });
}
/* | a | b | → ['a','b'] (앞뒤 파이프 제거) */
function _gdRowCells(line) {
  var t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.split('|').map(function (c) { return c.trim(); });
}
function _gdRender(src) {
  var lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  var out = [], para = [], list = null, quote = null, table = null;
  function flushPara() { if (para.length) { out.push('<p class="gdm-p">' + para.join('<br>') + '</p>'); para = []; } }
  function flushList() { if (list) { out.push('<' + list.tag + ' class="gdm-list">' + list.items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</' + list.tag + '>'); list = null; } }
  function flushQuote() { if (quote) { out.push('<div class="gdm-callout">' + quote.join('<br>') + '</div>'); quote = null; } }
  /* 표 (2026-08-17) — | a | b | 형태. 구분줄(| --- |) 있으면 첫 줄이 머리글.
   * 넓은 표는 가로 스크롤 래퍼로 감싸 본문이 밀리지 않게 함. */
  function flushTable() {
    if (!table) return;
    var rows = table, head = null;
    if (rows.length >= 2 && _gdIsTableSep(rows[1])) { head = rows[0]; rows = rows.slice(2); }
    var h = head ? '<thead><tr>' + head.map(function (c) { return '<th>' + _gdInline(_gdEsc(c)) + '</th>'; }).join('') + '</tr></thead>' : '';
    var b = rows.length ? '<tbody>' + rows.map(function (r) {
      return '<tr>' + r.map(function (c) { return '<td>' + _gdInline(_gdEsc(c)) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody>' : '';
    out.push('<div class="gdm-tw"><table class="gdm-table">' + h + b + '</table></div>');
    table = null;
  }
  function flushAll() { flushPara(); flushList(); flushQuote(); flushTable(); }
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].replace(/\s+$/, '').trim();
    if (!t) { flushAll(); continue; }
    var m;
    if ((m = t.match(/^(#{1,3})\s+(.*)$/))) {
      flushAll();
      var lv = m[1].length; // 1→큰 제목(h2), 2→소제목(h3), 3→h4
      out.push('<h' + (lv + 1) + ' class="gdm-h' + lv + '">' + _gdInline(_gdEsc(m[2])) + '</h' + (lv + 1) + '>');
      continue;
    }
    if (/^(---+|\*\*\*+|___+)$/.test(t)) { flushAll(); out.push('<hr class="gdm-hr">'); continue; }
    /* 이미지 — ![설명](R2키) 한 줄. 키 검증 통과분만 렌더, src 는 우리가 조립 (XSS 차단). */
    if ((m = t.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) {
      flushAll();
      var cap = m[1], key = m[2];
      if (_gdImgOk(key)) {
        out.push('<figure class="gdm-fig"><img class="gdm-img" src="/api/image?k=' + encodeURIComponent(key) + '" alt="' + _gdEsc(cap) + '" loading="lazy">'
          + (cap ? '<figcaption class="gdm-cap">' + _gdInline(_gdEsc(cap)) + '</figcaption>' : '') + '</figure>');
      } else {
        out.push('<p class="gdm-p gdm-imgbad">[이미지를 표시할 수 없습니다]</p>');
      }
      continue;
    }
    /* 표 줄 — | 로 시작 */
    if (t.charAt(0) === '|' && t.indexOf('|', 1) > 0) {
      flushPara(); flushList(); flushQuote();
      (table = table || []).push(_gdRowCells(t));
      continue;
    }
    if (t.charAt(0) === '>') {
      flushPara(); flushList(); flushTable();
      (quote = quote || []).push(_gdInline(_gdEsc(t.replace(/^>\s?/, ''))));
      continue;
    }
    if ((m = t.match(/^[-•]\s+(.*)$/))) {
      flushPara(); flushQuote(); flushTable();
      if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; }
      list.items.push(_gdInline(_gdEsc(m[1])));
      continue;
    }
    if ((m = t.match(/^\d+[.)]\s+(.*)$/))) {
      flushPara(); flushQuote(); flushTable();
      if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; }
      list.items.push(_gdInline(_gdEsc(m[1])));
      continue;
    }
    flushList(); flushQuote(); flushTable();
    para.push(_gdInline(_gdEsc(t)));
  }
  flushAll();
  return out.join('');
}

/* ── 이미지 삽입 (2026-08-17 사장님: "홈택스 캡처 넣는 느낌으로") ──
 * 업로드 = 기존 /api/upload-image?scope=guide (R2 guides/ prefix, 직원만).
 * 편집창에 커서 위치로 ![](키) 삽입. Ctrl+V 붙여넣기도 동일 경로. */
var _gdImgBusy = false;

function _gdPickImage() {
  var f = document.getElementById('gdImgFile');
  if (f) { f.value = ''; f.click(); }
}
function _gdImgChosen(input) {
  var f = input && input.files && input.files[0];
  if (f) _gdUploadImage(f);
}

/* 편집창 커서 위치에 텍스트 삽입 */
function _gdInsertAtCursor(text) {
  var ta = document.getElementById('gdContent');
  if (!ta) return;
  var s = ta.selectionStart || 0, e = ta.selectionEnd || 0, v = ta.value;
  var before = v.slice(0, s), after = v.slice(e);
  /* 앞뒤로 빈 줄 보장 — 이미지는 한 줄 블록이어야 렌더됨 */
  if (before && !/\n$/.test(before)) before += '\n';
  if (after && !/^\n/.test(after)) after = '\n' + after;
  ta.value = before + text + '\n' + after;
  var pos = (before + text + '\n').length;
  ta.selectionStart = ta.selectionEnd = pos;
  ta.focus();
  _gdPreview();
}

function _gdImgStatus(msg, busy) {
  var b = document.getElementById('gdImgBtn');
  if (b) { b.disabled = !!busy; b.textContent = msg || '🖼 이미지'; }
}

async function _gdUploadImage(file) {
  if (_gdImgBusy) return;
  if (!file || !/^image\//.test(file.type)) { alert('이미지 파일만 넣을 수 있습니다'); return; }
  if (file.size > 10 * 1024 * 1024) { alert('10MB 이하 이미지만 가능합니다'); return; }
  _gdImgBusy = true;
  _gdImgStatus('올리는 중...', true);
  try {
    var fd = new FormData();
    fd.append('file', file); /* 서버(upload-image.js) 가 읽는 필드명 */
    var qs = [_gdKeyQS(), 'scope=guide'].filter(Boolean).join('&');
    var r = await fetch('/api/upload-image?' + qs, { method: 'POST', credentials: 'same-origin', body: fd });
    var d = await r.json();
    if (!d.ok || !d.key) throw new Error(d.error || '업로드 실패');
    _gdInsertAtCursor('![](' + d.key + ')');
  } catch (e) {
    alert('이미지 업로드 실패: ' + (e.message || e));
  } finally {
    _gdImgBusy = false;
    _gdImgStatus('🖼 이미지', false);
  }
}

/* 편집창 붙여넣기 — 캡처 이미지를 클립보드에서 바로 */
function _gdBindPaste() {
  var ta = document.getElementById('gdContent');
  if (!ta || ta._gdPasteBound) return;
  ta._gdPasteBound = true;
  ta.addEventListener('paste', function (ev) {
    var items = (ev.clipboardData || {}).items || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
        var f = items[i].getAsFile();
        if (f) { ev.preventDefault(); _gdUploadImage(f); return; }
      }
    }
  });
}

/* 본문 이미지 클릭 → 기존 전역 이미지 뷰어로 확대 */
function _gdImgZoom(ev) {
  var el = ev.target;
  if (!el || !el.classList || !el.classList.contains('gdm-img')) return;
  if (typeof window.openImgViewer === 'function') window.openImgViewer(el.src);
  else window.open(el.src, '_blank', 'noopener');
}

/* ── 열기/닫기 ── */
function openGuides() {
  var mo = document.getElementById('guidesModal');
  if (!mo) { alert('가이드 모달 로딩 전입니다. 잠시 후 다시 시도해주세요.'); return; }
  mo.style.display = 'flex';
  _gdShowReader(); // 편집 폼 닫힌 초기 상태
  _gdFetch();
}
function closeGuides() {
  var mo = document.getElementById('guidesModal');
  if (mo) mo.style.display = 'none';
}

/* ── 데이터 ── */
async function _gdFetch() {
  var list = document.getElementById('gdList');
  if (list && !_gdAll.length) list.innerHTML = '<div class="gd-empty">불러오는 중...</div>';
  try {
    var r = await fetch(_gdUrl(), { credentials: 'same-origin' });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'load fail');
    _gdAll = d.guides || [];
    _gdCanWrite = !!d.canWrite;
  } catch (e) {
    if (list) list.innerHTML = '<div class="gd-empty">목록을 불러오지 못했습니다<br><span style="font-size:.85em;color:var(--text-mute)">' + _gdEsc(e.message || '') + '</span></div>';
    return;
  }
  var nb = document.getElementById('gdNewBtn');
  if (nb) nb.style.display = _gdCanWrite ? 'inline-flex' : 'none';
  /* 열람 중이던 글이 삭제됐으면 해제 */
  if (_gdCur && !_gdAll.some(function (g) { return g.id === _gdCur; })) _gdCur = null;
  if (!_gdCur && _gdAll.length) _gdCur = _gdVisible()[0] ? _gdVisible()[0].id : null;
  _gdRenderChips();
  _gdRenderList();
  _gdRenderReader();
}
function _gdVisible() {
  return _gdCat === 'all' ? _gdAll : _gdAll.filter(function (g) { return g.category === _gdCat; });
}

/* ── 좌측: 카테고리 칩 + 목록 ── */
function _gdRenderChips() {
  var el = document.getElementById('gdChips');
  if (!el) return;
  var cats = ['all'].concat(_GD_CATS);
  el.innerHTML = cats.map(function (c) {
    var n = c === 'all' ? _gdAll.length : _gdAll.filter(function (g) { return g.category === c; }).length;
    var on = _gdCat === c;
    return '<button type="button" class="gd-chip' + (on ? ' on' : '') + '" onclick="_gdSetCat(\'' + c + '\')">'
      + (c === 'all' ? '전체' : _gdEsc(c)) + (n ? ' <span class="gd-chip-n">' + n + '</span>' : '') + '</button>';
  }).join('');
  /* 📌 필수(고정) 글 중 안 읽은 게 있으면 배너 */
  var unread = _gdAll.filter(function (g) { return g.pinned && !g.my_read; });
  if (unread.length) {
    el.innerHTML += '<div style="flex-basis:100%;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:8px 12px;font-size:.76em;font-weight:700;color:#c2410c;cursor:pointer" onclick="_gdOpen(' + unread[0].id + ')">📌 안 읽은 필수 가이드 <b>' + unread.length + '편</b> — 눌러서 읽고 체크해주세요</div>';
  }
}
function _gdSetCat(c) {
  _gdCat = c;
  var v = _gdVisible();
  if (!v.some(function (g) { return g.id === _gdCur; })) _gdCur = v.length ? v[0].id : null;
  _gdRenderChips();
  _gdRenderList();
  _gdRenderReader();
}
function _gdRenderList() {
  var el = document.getElementById('gdList');
  if (!el) return;
  var v = _gdVisible();
  /* 설명서 원클릭 설치 제안 (2026-07-16).
   * 2026-08-17: 조건을 "사용법 카테고리 비었을 때" → "0편(온보딩)이 없을 때" 로 변경.
   * 기존 6편을 이미 설치한 사무실도 새로 추가된 편을 받을 수 있어야 함 (seed 는 제목 기준 idempotent). */
  var seedBtn = '';
  if (_gdCanWrite && !_gdAll.some(function (g) { return String(g.title || '').indexOf('0. 신입 직원 온보딩') === 0; })) {
    seedBtn = '<button type="button" class="gd-seed" onclick="_gdSeedManual(this)">📖 관리자 사용설명서 설치<br><span style="font-weight:500;font-size:.86em;opacity:.8">신입 온보딩 + 홈·할일·상담방·검토표·사용자·영업 — 클릭 한 번</span></button>';
  }
  if (!v.length) {
    el.innerHTML = '<div class="gd-empty">아직 글이 없습니다' + (_gdCanWrite ? '<br><span style="font-size:.85em;color:var(--text-mute)">우측 상단 [＋ 새 글] 로 첫 가이드를 작성해보세요</span>' : '') + '</div>' + seedBtn;
    return;
  }
  el.innerHTML = seedBtn + v.map(function (g) {
    var c = _GD_CAT_COLORS[g.category] || '#64748b';
    var date = String(g.updated_at || '').slice(0, 10).replace(/-/g, '.');
    var unread = g.pinned && !g.my_read;
    return '<button type="button" class="gd-item' + (g.id === _gdCur ? ' on' : '') + '" onclick="_gdOpen(' + g.id + ')">'
      + '<div class="gd-item-top">'
      + (g.pinned ? '<span class="gd-pin">📌</span>' : '')
      + '<span class="gd-item-cat" style="background:' + c + '1a;color:' + c + '">' + _gdEsc(g.category) + '</span>'
      + (unread ? '<span style="background:#fef2f2;color:#dc2626;font-size:.66em;font-weight:800;border-radius:6px;padding:2px 7px">미확인</span>' : (g.my_read ? '<span style="color:#10b981;font-size:.7em;font-weight:800">✓</span>' : ''))
      + '<span class="gd-item-date">' + _gdEsc(date) + '</span>'
      + '</div>'
      + '<div class="gd-item-title">' + _gdEsc(g.title) + '</div>'
      + '</button>';
  }).join('');
}
function _gdOpen(id) {
  _gdCur = id;
  _gdShowReader();
  _gdRenderList();
  _gdRenderReader();
  var body = document.getElementById('gdBody');
  if (body) body.classList.add('gd-reading'); // 모바일: 리더로 전환
}
function _gdBackToList() {
  var body = document.getElementById('gdBody');
  if (body) body.classList.remove('gd-reading');
}

/* ── 우측: 리더 ── */
function _gdRenderReader() {
  var el = document.getElementById('gdReader');
  if (!el) return;
  var g = null;
  for (var i = 0; i < _gdAll.length; i++) if (_gdAll[i].id === _gdCur) { g = _gdAll[i]; break; }
  if (!g) {
    el.innerHTML = '<div class="gd-empty" style="padding:60px 20px">📖<br><span style="font-size:.9em">왼쪽에서 글을 선택하세요</span></div>';
    return;
  }
  var c = _GD_CAT_COLORS[g.category] || '#64748b';
  var date = String(g.updated_at || '').slice(0, 16);
  el.innerHTML =
    '<div class="gd-read-head">'
    + '<button type="button" class="gd-back" onclick="_gdBackToList()">‹ 목록</button>'
    + '<div class="gd-read-meta-row">'
    + (g.pinned ? '<span class="gd-pin">📌</span>' : '')
    + '<span class="gd-item-cat" style="background:' + c + '1a;color:' + c + '">' + _gdEsc(g.category) + '</span>'
    + '</div>'
    + '<h2 class="gd-read-title">' + _gdEsc(g.title) + '</h2>'
    + '<div class="gd-read-meta">' + _gdEsc(g.author_name || '') + ' · ' + _gdEsc(date)
    + (_gdCanWrite
      ? ' <span class="gd-read-acts"><button type="button" class="gd-mini-btn" onclick="_gdEdit(' + g.id + ')">✏️ 수정</button>'
      + '<button type="button" class="gd-mini-btn danger" onclick="_gdDelete(' + g.id + ')">삭제</button></span>'
      : '')
    + '</div>'
    + '</div>'
    + '<div class="gd-article">' + _gdRender(g.content) + '</div>'
    /* ✅ 읽음 체크 (2026-07-16 사장님: "들어가면 체크체크 하면서 한번은 읽도록") */
    + '<div style="max-width:660px;margin-top:26px;padding-top:16px;border-top:1px solid var(--neutral-border)">'
    + (g.my_read
      ? '<div style="display:inline-flex;align-items:center;gap:7px;background:#ecfdf5;color:#059669;border-radius:10px;padding:10px 16px;font-size:.85em;font-weight:800">✅ 읽음 확인 완료</div>'
      : '<button type="button" onclick="_gdMarkRead(' + g.id + ', this)" style="background:var(--brand-primary);color:#fff;border:none;border-radius:10px;padding:11px 20px;font-size:.88em;font-weight:800;cursor:pointer;font-family:inherit">✅ 다 읽었습니다 — 확인 체크</button>'
        + '<div style="font-size:.72em;color:var(--text-mute);margin-top:6px">체크하면 읽은 사람 명단에 이름이 남습니다</div>')
    + (_gdCanWrite && g.read_count
      ? '<div style="font-size:.76em;color:var(--text-sub);margin-top:10px">👀 읽음 <b>' + g.read_count + '명</b>' + (g.readers && g.readers.length ? ' — ' + g.readers.map(_gdEsc).join(', ') : '') + '</div>'
      : '')
    + '</div>';
  el.onclick = _gdImgZoom; /* 본문 이미지 클릭 → 확대 (2026-08-17) */
  el.scrollTop = 0;
}
async function _gdMarkRead(id, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '체크 중...'; }
  try {
    var r = await fetch(_gdUrl('action=mark_read'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ id: id }) });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'fail');
    await _gdFetch();
  } catch (e) {
    alert('읽음 체크 실패: ' + (e.message || e));
    if (btn) { btn.disabled = false; btn.textContent = '✅ 다 읽었습니다 — 확인 체크'; }
  }
}

/* ── 에디터 (작성/수정 + 실시간 미리보기) ── */
function _gdShowReader() {
  var ed = document.getElementById('gdEditor'), rd = document.getElementById('gdReader');
  if (ed) ed.style.display = 'none';
  if (rd) rd.style.display = 'block';
  _gdEditId = null;
}
function _gdShowEditor() {
  var ed = document.getElementById('gdEditor'), rd = document.getElementById('gdReader');
  if (rd) rd.style.display = 'none';
  if (ed) ed.style.display = 'flex';
  var body = document.getElementById('gdBody');
  if (body) body.classList.add('gd-reading');
  _gdBindPaste(); /* 캡처 Ctrl+V 업로드 */
}
function _gdNew() {
  _gdEditId = null;
  _gdFillEditor({ title: '', category: _gdCat !== 'all' ? _gdCat : '공통', content: '', pinned: 0 });
  _gdShowEditor();
  var t = document.getElementById('gdTitle');
  if (t) t.focus();
}
function _gdEdit(id) {
  var g = null;
  for (var i = 0; i < _gdAll.length; i++) if (_gdAll[i].id === id) { g = _gdAll[i]; break; }
  if (!g) return;
  _gdEditId = id;
  _gdFillEditor(g);
  _gdShowEditor();
}
function _gdFillEditor(g) {
  var t = document.getElementById('gdTitle'), c = document.getElementById('gdCatSel'), p = document.getElementById('gdPin'), x = document.getElementById('gdContent'), del = document.getElementById('gdDelBtn'), h = document.getElementById('gdEdHead');
  if (t) t.value = g.title || '';
  if (c) c.value = _GD_CATS.indexOf(g.category) >= 0 ? g.category : '공통';
  if (p) p.checked = !!g.pinned;
  if (x) x.value = g.content || '';
  if (del) del.style.display = _gdEditId ? 'inline-flex' : 'none';
  if (h) h.textContent = _gdEditId ? '✏️ 가이드 수정' : '＋ 새 가이드';
  _gdPreview();
}
function _gdPreview() {
  var x = document.getElementById('gdContent'), pv = document.getElementById('gdPreview');
  if (!x || !pv) return;
  var src = x.value;
  pv.innerHTML = src.trim()
    ? '<div class="gd-article">' + _gdRender(src) + '</div>'
    : '<div class="gd-empty" style="padding:40px 16px;font-size:.85em">여기에 미리보기가 실시간으로 표시됩니다<br><br><span style="color:var(--text-mute);text-align:left;display:inline-block"># 큰 제목<br>## 소제목<br>- 항목<br>1. 순서 항목<br>**강조**<br>&gt; 주의/경고 박스<br>--- 구분선<br><br>| 항목 | 부가세 | 조건 |<br>| --- | --- | --- |<br>| 식당 | O | 직원등록 |<br><br>이미지 = [🖼 이미지] 버튼 / Ctrl+V</span></div>';
}
async function _gdSave() {
  var t = document.getElementById('gdTitle'), c = document.getElementById('gdCatSel'), p = document.getElementById('gdPin'), x = document.getElementById('gdContent'), btn = document.getElementById('gdSaveBtn');
  var title = (t && t.value || '').trim();
  var content = (x && x.value || '');
  if (!title) { alert('제목을 입력해주세요'); if (t) t.focus(); return; }
  if (!content.trim()) { alert('내용을 입력해주세요'); if (x) x.focus(); return; }
  var payload = { title: title, category: c ? c.value : '공통', content: content, pinned: p && p.checked ? 1 : 0 };
  var method = 'POST';
  if (_gdEditId) { payload.id = _gdEditId; method = 'PUT'; }
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
  try {
    var r = await fetch(_gdUrl(), { method: method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload) });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'save fail');
    var savedId = _gdEditId || d.id;
    _gdEditId = null;
    _gdShowReader();
    await _gdFetch();
    if (savedId) _gdOpen(savedId);
  } catch (e) {
    alert('저장 실패: ' + (e.message || e));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '저장'; }
  }
}
async function _gdDelete(id) {
  var g = null;
  for (var i = 0; i < _gdAll.length; i++) if (_gdAll[i].id === id) { g = _gdAll[i]; break; }
  if (!confirm('이 가이드를 삭제할까요?' + (g ? '\n\n"' + g.title + '"' : ''))) return;
  try {
    var r = await fetch(_gdUrl('id=' + id), { method: 'DELETE', credentials: 'same-origin' });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'delete fail');
    if (_gdCur === id) _gdCur = null;
    if (_gdEditId === id) { _gdEditId = null; _gdShowReader(); }
    await _gdFetch();
  } catch (e) {
    alert('삭제 실패: ' + (e.message || e));
  }
}
function _gdCancelEdit() {
  _gdShowReader();
  _gdRenderReader();
}
/* 📖 관리자 사용설명서 원클릭 설치 (서버 seed_manual — 제목 기준 중복 방지) */
async function _gdSeedManual(btn) {
  if (btn) { btn.disabled = true; btn.textContent = '설치 중...'; }
  try {
    var r = await fetch(_gdUrl('action=seed_manual'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: '{}' });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || 'seed fail');
    _gdCat = '사용법';
    await _gdFetch();
  } catch (e) {
    alert('설치 실패: ' + (e.message || e));
    if (btn) { btn.disabled = false; btn.textContent = '📖 관리자 사용설명서 설치'; }
  }
}
