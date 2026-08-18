/* 🗂️ 서식함 (2026-08-17 사장님 명령: "우리 업무 양식·서식 이런거도 여기서 보관하면 좋을듯")
 * 사내 공용 서식 보관함 — 위임장·확인서·계약서 양식 등 실제 파일 보관/다운로드.
 *
 * 업무 가이드(admin-guides.js = 설명글) 와 짝: 가이드 = 어떻게, 서식함 = 그때 쓰는 파일.
 *
 * 권한 (사장님 결정): 열람·다운로드·업로드 = 직원 전원(viewer 포함),
 *                     삭제 = 본인이 올린 것 또는 admin 이상 (서버 판정 can_delete).
 *
 * 업로드는 /api/upload-file?scope=form (R2 forms/ prefix) → 반환 key 를 /api/admin-forms 에 등록.
 * 다운로드는 /api/file?k=..&name=.. (forms/ 는 관리자 인증 필수 — 외부 유출 차단).
 */

/* ── 상태 ── */
var _fmAll = [];
var _fmCat = 'all';
var _fmQ = '';
var _fmEditId = null;      // null = 새 서식, 숫자 = 그 서식의 새 버전 올리기
var _fmSearchTimer = null;
var _fmBusy = false;

var _FM_CATS = ['부가세', '원천세', '종소세', '법인세', '연말정산', '4대보험', '계약·위임', '공통'];
var _FM_CAT_COLORS = {
  '부가세': '#3182f6', '원천세': '#8b5cf6', '종소세': '#f59e0b', '법인세': '#10b981',
  '연말정산': '#ec4899', '4대보험': '#0891b2', '계약·위임': '#e11d48', '공통': '#64748b'
};

function _fmKeyQS() {
  var k = (typeof KEY !== 'undefined' && KEY) ? KEY : '';
  return k ? ('key=' + encodeURIComponent(k)) : '';
}
function _fmUrl(extra) {
  var qs = [_fmKeyQS(), extra || ''].filter(Boolean).join('&');
  return '/api/admin-forms' + (qs ? ('?' + qs) : '');
}
function _fmEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 확장자 → 아이콘 색/라벨 (한눈에 파일 종류 구분) */
function _fmFileTag(name) {
  var ext = String(name || '').split('.').pop().toLowerCase();
  if (ext === 'hwp' || ext === 'hwpx') return { label: 'HWP', color: '#0d6efd' };
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return { label: 'XLS', color: '#107c41' };
  if (ext === 'doc' || ext === 'docx') return { label: 'DOC', color: '#2b579a' };
  if (ext === 'pdf') return { label: 'PDF', color: '#dc2626' };
  if (ext === 'ppt' || ext === 'pptx') return { label: 'PPT', color: '#c43e1c' };
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp'].indexOf(ext) >= 0) return { label: 'IMG', color: '#7c3aed' };
  if (['zip', 'rar', '7z'].indexOf(ext) >= 0) return { label: 'ZIP', color: '#64748b' };
  return { label: (ext || 'FILE').slice(0, 4).toUpperCase(), color: '#64748b' };
}

function _fmSize(bytes) {
  var n = Number(bytes);
  if (!n || n <= 0) return '';
  if (n < 1024) return n + 'B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + 'KB';
  return (n / 1024 / 1024).toFixed(1) + 'MB';
}

/* ── 열기/닫기 ── */
function openForms() {
  var m = document.getElementById('formsModal');
  if (!m) return;
  m.style.display = 'flex';
  _fmToggleForm(false);
  _fmFetch();
}
function closeForms() {
  var m = document.getElementById('formsModal');
  if (m) m.style.display = 'none';
}

/* ── 데이터 ── */
async function _fmFetch() {
  var el = document.getElementById('fmList');
  try {
    var extra = [];
    if (_fmCat !== 'all') extra.push('category=' + encodeURIComponent(_fmCat));
    if (_fmQ) extra.push('q=' + encodeURIComponent(_fmQ));
    var r = await fetch(_fmUrl(extra.join('&')), { credentials: 'same-origin' });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || '불러오기 실패');
    _fmAll = d.forms || [];
    _fmRenderChips();
    _fmRenderList();
  } catch (e) {
    if (el) el.innerHTML = '<div class="fm-empty">불러오지 못했습니다<br><span style="font-size:.85em">' + _fmEsc(e.message || e) + '</span></div>';
  }
}

function _fmSearchDebounced() {
  if (_fmSearchTimer) clearTimeout(_fmSearchTimer);
  _fmSearchTimer = setTimeout(function () {
    var i = document.getElementById('fmSearch');
    _fmQ = i ? i.value.trim() : '';
    _fmFetch();
  }, 300);
}

function _fmPickCat(c) {
  _fmCat = c;
  _fmFetch();
}

function _fmRenderChips() {
  var el = document.getElementById('fmChips');
  if (!el) return;
  var html = '<button type="button" class="fm-chip' + (_fmCat === 'all' ? ' on' : '') + '" onclick="_fmPickCat(\'all\')">전체</button>';
  html += _FM_CATS.map(function (c) {
    return '<button type="button" class="fm-chip' + (_fmCat === c ? ' on' : '') + '" onclick="_fmPickCat(\'' + c + '\')">' + _fmEsc(c) + '</button>';
  }).join('');
  el.innerHTML = html;
}

function _fmRenderList() {
  var el = document.getElementById('fmList');
  if (!el) return;
  if (!_fmAll.length) {
    var msg = (_fmQ || _fmCat !== 'all')
      ? '<div class="fm-empty"><b>찾는 서식이 없습니다</b>검색어나 분류를 바꿔보세요</div>'
      : '<div class="fm-empty"><b>아직 올라온 서식이 없습니다</b>위 [＋ 서식 올리기] 로 위임장·확인서 같은<br>자주 쓰는 양식을 올려두면 직원 전체가 받아 쓸 수 있습니다</div>';
    el.innerHTML = msg;
    return;
  }
  el.innerHTML = _fmAll.map(function (f) {
    var tag = _fmFileTag(f.file_name);
    var cc = _FM_CAT_COLORS[f.category] || '#64748b';
    var dl = '/api/file?k=' + encodeURIComponent(f.file_key) + '&name=' + encodeURIComponent(f.file_name);
    var metaBits = [];
    if (f.file_name) metaBits.push(_fmEsc(f.file_name));
    var sz = _fmSize(f.file_size);
    if (sz) metaBits.push(sz);
    if (f.uploader_name) metaBits.push(_fmEsc(f.uploader_name));
    metaBits.push(String(f.updated_at || '').slice(0, 10).replace(/-/g, '.'));
    if (f.download_count > 0) metaBits.push('받음 ' + f.download_count + '회');

    return '<div class="fm-row" id="fmRow' + f.id + '">'
      + '<div class="fm-ico" style="background:' + tag.color + '">' + tag.label + '</div>'
      + '<div class="fm-info">'
      +   '<div class="fm-title">'
      +     (f.pinned ? '<span>📌</span>' : '')
      +     '<span class="fm-cat" style="background:' + cc + '18;color:' + cc + '">' + _fmEsc(f.category) + '</span>'
      +     _fmEsc(f.title)
      +     (f.version > 1 ? '<span class="fm-ver">v' + f.version + '</span>' : '')
      +   '</div>'
      +   (f.description ? '<div class="fm-desc">' + _fmEsc(f.description) + '</div>' : '')
      +   '<div class="fm-meta">' + metaBits.join(' · ') + '</div>'
      +   '<div id="fmHist' + f.id + '"></div>'
      + '</div>'
      + '<div class="fm-acts">'
      +   '<a class="fm-dl" href="' + dl + '" download onclick="_fmHit(' + f.id + ')">↓ 받기</a>'
      +   (f.version > 1 ? '<button type="button" class="fm-mini" title="이전 버전 보기" onclick="_fmHistory(' + f.id + ')">🕘</button>' : '')
      +   '<button type="button" class="fm-mini" title="새 버전 올리기" onclick="_fmNewVersion(' + f.id + ')">⬆</button>'
      +   (f.can_delete ? '<button type="button" class="fm-mini danger" title="삭제" onclick="_fmDelete(' + f.id + ')">🗑</button>' : '')
      + '</div>'
      + '</div>';
  }).join('');
}

/* 다운로드 카운트 (실패해도 다운로드 자체엔 영향 없음) */
function _fmHit(id) {
  try {
    fetch(_fmUrl('action=hit'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify({ id: id })
    }).catch(function () {});
  } catch (_) {}
}

/* ── 버전 이력 ── */
async function _fmHistory(id) {
  var box = document.getElementById('fmHist' + id);
  if (!box) return;
  if (box.innerHTML) { box.innerHTML = ''; return; } // 토글
  box.innerHTML = '<div class="fm-hist">불러오는 중...</div>';
  try {
    var r = await fetch(_fmUrl('action=history&id=' + id), { credentials: 'same-origin' });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || '실패');
    if (!d.history.length) { box.innerHTML = '<div class="fm-hist">이전 버전이 없습니다</div>'; return; }
    box.innerHTML = '<div class="fm-hist">' + d.history.map(function (h) {
      var u = '/api/file?k=' + encodeURIComponent(h.file_key) + '&name=' + encodeURIComponent(h.file_name);
      return '<span>v' + h.version + ' · <a href="' + u + '" download>' + _fmEsc(h.file_name) + '</a>'
        + ' · ' + _fmEsc(h.replaced_by || '') + ' ' + String(h.replaced_at || '').slice(0, 10).replace(/-/g, '.') + '</span>';
    }).join('') + '</div>';
  } catch (e) {
    box.innerHTML = '<div class="fm-hist">' + _fmEsc(e.message || e) + '</div>';
  }
}

/* ── 업로드 폼 ── */
function _fmToggleForm(force) {
  var box = document.getElementById('fmForm');
  if (!box) return;
  var show = (force === undefined) ? !box.classList.contains('on') : !!force;
  box.classList.toggle('on', show);
  if (!show) {
    _fmEditId = null;
    _fmSetStatus('');
    ['fmTitle', 'fmDesc'].forEach(function (id) { var e = document.getElementById(id); if (e) e.value = ''; });
    var fi = document.getElementById('fmFile'); if (fi) fi.value = '';
    var h = document.getElementById('fmFormHead'); if (h) h.textContent = '＋ 새 서식 올리기';
    var t = document.getElementById('fmTitle'); if (t) t.style.display = '';
    var c = document.getElementById('fmCat'); if (c) c.style.display = '';
    var d = document.getElementById('fmDesc'); if (d) d.parentElement.style.display = '';
  }
}

/* 기존 서식의 새 버전 올리기 — 제목/분류 입력 숨기고 파일만 */
function _fmNewVersion(id) {
  var f = _fmAll.filter(function (x) { return x.id === id; })[0];
  if (!f) return;
  _fmEditId = id;
  _fmToggleForm(true);
  var h = document.getElementById('fmFormHead');
  if (h) h.textContent = '⬆ 새 버전 올리기 — ' + f.title + ' (현재 v' + f.version + ')';
  var t = document.getElementById('fmTitle'); if (t) t.style.display = 'none';
  var c = document.getElementById('fmCat'); if (c) c.style.display = 'none';
  var d = document.getElementById('fmDesc'); if (d) d.parentElement.style.display = 'none';
  _fmSetStatus('예전 파일은 이력에 보관됩니다');
  var fi = document.getElementById('fmFile'); if (fi) fi.focus();
}

function _fmSetStatus(msg) {
  var s = document.getElementById('fmStatus');
  if (s) s.textContent = msg || '';
}

async function _fmSave() {
  if (_fmBusy) return;
  var fileInput = document.getElementById('fmFile');
  var file = fileInput && fileInput.files && fileInput.files[0];
  var title = (document.getElementById('fmTitle') || {}).value || '';
  var cat = (document.getElementById('fmCat') || {}).value || '공통';
  var desc = (document.getElementById('fmDesc') || {}).value || '';

  if (!file) { alert('올릴 파일을 선택해주세요'); return; }
  if (!_fmEditId && !title.trim()) { alert('서식 이름을 입력해주세요'); return; }

  _fmBusy = true;
  var btn = document.getElementById('fmSaveBtn');
  if (btn) btn.disabled = true;
  _fmSetStatus('업로드 중...');

  try {
    /* 1) R2 업로드 (forms/ prefix) */
    var fd = new FormData();
    fd.append('file', file);
    var upQs = [_fmKeyQS(), 'scope=form'].filter(Boolean).join('&');
    var ur = await fetch('/api/upload-file?' + upQs, { method: 'POST', credentials: 'same-origin', body: fd });
    var ud = await ur.json();
    if (!ud.ok) throw new Error(ud.error || '파일 업로드 실패');

    /* 2) 메타 등록 (신규) 또는 버전 교체 */
    var payload = { file_key: ud.key, file_name: ud.name, file_size: ud.size, mime: ud.type };
    var action = 'create';
    if (_fmEditId) {
      action = 'replace';
      payload.id = _fmEditId;
    } else {
      payload.title = title.trim();
      payload.category = cat;
      payload.description = desc.trim();
    }
    _fmSetStatus('저장 중...');
    var r = await fetch(_fmUrl('action=' + action), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify(payload)
    });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || '저장 실패');

    _fmToggleForm(false);
    await _fmFetch();
  } catch (e) {
    _fmSetStatus('');
    alert('실패: ' + (e.message || e));
  } finally {
    _fmBusy = false;
    if (btn) btn.disabled = false;
  }
}

async function _fmDelete(id) {
  var f = _fmAll.filter(function (x) { return x.id === id; })[0];
  if (!f) return;
  if (!confirm('"' + f.title + '" 서식을 삭제할까요?\n(휴지통 없이 목록에서 사라집니다)')) return;
  try {
    var r = await fetch(_fmUrl('id=' + id), { method: 'DELETE', credentials: 'same-origin' });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || '삭제 실패');
    await _fmFetch();
  } catch (e) {
    alert('삭제 실패: ' + (e.message || e));
  }
}
