/* business.js — business.html 인라인 JS 외부화 (Phase H6a, 2026-05-04) */

(function(){
  'use strict';
  const params = new URLSearchParams(location.search);
  const bid = parseInt(params.get('id'), 10);
  let KEY = params.get('key') || '';
  /* sessionStorage / localStorage 에서 ADMIN_KEY 확보 (admin.html 와 공유) */
  if (!KEY) {
    try { KEY = sessionStorage.getItem('ADMIN_KEY') || localStorage.getItem('ADMIN_KEY') || ''; } catch(_) {}
  }
  /* URL 에 key 가 들어왔으면 sessionStorage 에 저장 (다음 새로고침 시 query 없어도 동작) */
  if (params.get('key')) {
    try { sessionStorage.setItem('ADMIN_KEY', params.get('key')); } catch(_) {}
  }
  /* 5초 후 v 라벨 숨김 */
  setTimeout(function(){ const d = document.getElementById('diag'); if (d) d.remove(); }, 5000);

  function $(id) { return document.getElementById(id); }
  function e(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function kv(k, v) { return (v == null || v === '') ? '' : '<div class="kv"><b>'+e(k)+'</b>'+e(String(v))+'</div>'; }

  /* 편집 가능 필드 정의 — admin-businesses.js PUT 의 allow 리스트와 일치 */
  const FIELDS = [
    { k: 'company_name', label: '회사명' },
    { k: 'company_form', label: '회사구분', type: 'select', options: ['', '0.법인사업자', '1.개인사업자', '2.간이사업자', '3.기타'] },
    { k: 'business_number', label: '사업자등록번호', placeholder: '숫자만 (10자리)' },
    { k: 'sub_business_number', label: '종사업자번호' },
    { k: 'corporate_number', label: '법인등록번호' },
    { k: 'ceo_name', label: '대표자' },
    { k: 'business_category', label: '업태' },
    { k: 'industry', label: '업종' },
    { k: 'industry_code', label: '업종코드' },
    { k: 'tax_type', label: '과세유형', placeholder: '예: 일반/간이' },
    { k: 'address', label: '사업장주소' },
    { k: 'phone', label: '사업장전화' },
    { k: 'establishment_date', label: '개업일', type: 'date' },
    { k: 'contract_date', label: '수임일자', type: 'date' },
    { k: 'fiscal_year_start', label: '회계기간 시작', type: 'date' },
    { k: 'fiscal_year_end', label: '회계기간 종료', type: 'date' },
    { k: 'fiscal_term', label: '기수', type: 'number' },
    { k: 'hr_year', label: '인사연도', type: 'number' },
    { k: 'notes', label: '노트', type: 'textarea' }
  ];
  let _curBiz = null;       /* 마지막 fetch 한 biz 객체 */
  let _editing = false;

  function fetchJson(path, timeoutMs) {
    timeoutMs = timeoutMs || 10000;
    const url = path + (path.indexOf('?') > -1 ? '&' : '?') + 'key=' + encodeURIComponent(KEY);
    return Promise.race([
      fetch(url).then(function(r){ return r.json().then(function(j){ j.__status = r.status; return j; }); }),
      new Promise(function(_, rej){ setTimeout(function(){ rej(new Error(timeoutMs/1000+'초 응답 없음')); }, timeoutMs); })
    ]);
  }

  if (!bid) {
    $('bizName').textContent = '오류';
    $('bizBasic').innerHTML = '<div class="err">URL 에 ?id=N 파라미터가 필요합니다.\n예: /business.html?id=1&key=ADMIN_KEY</div>';
    return;
  }

  /* 헤더 + 기본정보 + 구성원 + 상담방 (admin-businesses ?id=X) */
  fetchJson('/api/admin-businesses?id=' + bid)
    .then(function(d){
      if (!d || d.error) {
        $('bizName').textContent = '오류';
        $('bizBasic').innerHTML = '<div class="err">' + e(d && d.error || ('status='+(d&&d.__status||'?'))) + '</div>';
        return;
      }
      if (!d.ok) {
        $('bizName').textContent = '오류';
        $('bizBasic').innerHTML = '<div class="err">응답 ok=false</div>';
        return;
      }
      const biz = d.business || {};
      _curBiz = biz;
      const members = d.members || [];
      const rooms = d.rooms || [];
      /* 헤더 */
      $('bizName').textContent = '🏢 ' + (biz.company_name || '#' + bid);
      $('bizSub').textContent = [
        biz.business_number ? '#' + biz.business_number : '',
        biz.ceo_name ? '대표 ' + biz.ceo_name : '',
        biz.company_form || ''
      ].filter(Boolean).join(' · ');
      try { document.title = biz.company_name || ('업체 #' + bid); } catch(_) {}
      /* 기본정보 그리드 — view 모드 */
      try { $('bizBasic').innerHTML = renderBasic(false); }
      catch (err) { $('bizBasic').innerHTML = '<div class="err">기본정보 렌더 실패: ' + e(err.message) + '</div>'; }
      /* 구성원 */
      if (!members.length) {
        $('memberList').innerHTML = '<div class="empty">구성원 없음</div>';
      } else {
        $('memberList').innerHTML = members.map(function(m){
          try {
            const nm = e(m.real_name || m.name || '#' + m.user_id);
            const roleBadge = m.role === '대표자'
              ? '<span class="badge badge-rep">🧑‍💼 대표자</span>'
              : '<span class="badge badge-staff">👤 담당자</span>';
            const primaryBadge = m.is_primary ? '<span class="badge badge-primary">주연락</span>' : '';
            const phone = m.phone || m.user_phone;
            return '<div class="member-row"><div style="flex:1;min-width:0"><b>' + nm + '</b>' + roleBadge + primaryBadge
              + (phone ? '<div style="font-size:.74em;color:#8b95a1">' + e(phone) + '</div>' : '')
              + '</div></div>';
          } catch (_) { return ''; }
        }).join('');
      }
      /* 상담방 */
      if (!rooms.length) {
        $('roomList').innerHTML = '<div class="empty">연결된 상담방 없음</div>';
      } else {
        $('roomList').innerHTML = rooms.map(function(r){
          try {
            const stClosed = r.status === 'closed' ? ' <span style="color:#9ca3af;font-size:.78em">종료</span>' : '';
            return '<div class="room-row" onclick="location.href=\'/admin.html#rooms?room_id=' + encodeURIComponent(r.id) + '\'">'
              + '<div style="flex:1"><b>' + e(r.name || r.id) + '</b>' + stClosed
              + '<div style="font-size:.72em;color:#8b95a1">ID: ' + e(r.id) + '</div></div>'
              + '<div style="color:#3182f6">›</div></div>';
          } catch (_) { return ''; }
        }).join('');
      }
    })
    .catch(function(err){
      $('bizName').textContent = '오류';
      $('bizBasic').innerHTML = '<div class="err">⚠️ 기본 정보 로드 실패\n' + e(err && err.message || 'unknown') + '</div>';
    });

  /* 기본정보 렌더 (view 또는 edit 모드) */
  function renderBasic(editMode) {
    if (!_curBiz) return '<div class="loading">데이터 없음</div>';
    if (!editMode) {
      const items = FIELDS.map(function(f){
        let v = _curBiz[f.k];
        if (f.k === 'company_form') return kv(f.label, v);
        return kv(f.label, v);
      }).filter(Boolean);
      /* 회계기간 합쳐서 한 줄 */
      const fyStart = _curBiz.fiscal_year_start;
      const fyEnd = _curBiz.fiscal_year_end;
      let html = '<div class="grid">';
      FIELDS.forEach(function(f){
        if (f.k === 'fiscal_year_start' || f.k === 'fiscal_year_end') return;
        html += kv(f.label, _curBiz[f.k]);
      });
      if (fyStart || fyEnd) html += kv('회계기간', [fyStart, fyEnd].filter(Boolean).join(' ~ '));
      html += '</div>';
      return html;
    }
    /* 편집 모드 */
    let html = '<div class="grid" style="gap:10px 14px">';
    FIELDS.forEach(function(f){
      const v = _curBiz[f.k] == null ? '' : String(_curBiz[f.k]);
      html += '<div>';
      html += '<label style="font-size:.74em;color:#6b7280;display:block;margin-bottom:3px;font-weight:600">' + e(f.label) + '</label>';
      if (f.type === 'select') {
        html += '<select data-k="' + escAttr(f.k) + '" style="width:100%;padding:7px 9px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit;font-size:.85em;background:#fff">';
        f.options.forEach(function(opt){
          const sel = (opt === v) ? ' selected' : '';
          html += '<option value="' + escAttr(opt) + '"' + sel + '>' + e(opt || '— 미지정') + '</option>';
        });
        html += '</select>';
      } else if (f.type === 'textarea') {
        html += '<textarea data-k="' + escAttr(f.k) + '" rows="2" style="width:100%;padding:7px 9px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit;font-size:.85em;resize:vertical;box-sizing:border-box">' + e(v) + '</textarea>';
      } else {
        const t = f.type || 'text';
        const ph = f.placeholder ? ' placeholder="' + escAttr(f.placeholder) + '"' : '';
        html += '<input data-k="' + escAttr(f.k) + '" type="' + t + '" value="' + escAttr(v) + '"' + ph + ' style="width:100%;padding:7px 9px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit;font-size:.85em;box-sizing:border-box">';
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  window.toggleEdit = function(on) {
    if (!_curBiz) { alert('데이터 로드 안됨'); return; }
    _editing = !!on;
    $('bizBasic').innerHTML = renderBasic(_editing);
    if (_editing) {
      $('basicActions').innerHTML = '<button class="btn-success" onclick="saveEdit()">💾 저장</button> <button class="btn-ghost" onclick="toggleEdit(false)" style="margin-left:6px">취소</button>';
    } else {
      $('basicActions').innerHTML = '<button class="btn-ghost" onclick="toggleEdit(true)">✏️ 편집</button>';
    }
  };

  window.saveEdit = function() {
    if (!_curBiz) return;
    const inputs = document.querySelectorAll('#bizBasic [data-k]');
    const body = {};
    let changed = 0;
    inputs.forEach(function(el){
      const k = el.getAttribute('data-k');
      let v = el.value;
      const orig = _curBiz[k] == null ? '' : String(_curBiz[k]);
      if (v !== orig) { body[k] = (v === '' ? null : v); changed++; }
    });
    if (!changed) { alert('변경된 필드 없음'); toggleEdit(false); return; }
    /* 사업자번호 검증 (숫자만 10자리) */
    if (body.business_number != null && body.business_number !== '') {
      const digits = String(body.business_number).replace(/\D/g, '');
      if (digits.length !== 10) { if (!confirm('사업자번호가 10자리 숫자가 아닙니다 (' + digits.length + '자리). 그래도 저장할까요?')) return; }
    }
    /* PUT 전송 */
    const btnArea = $('basicActions');
    if (btnArea) btnArea.innerHTML = '<span style="color:#8b95a1;font-size:.84em">💾 저장 중...</span>';
    fetch('/api/admin-businesses?id=' + bid + '&key=' + encodeURIComponent(KEY), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    .then(function(r){ return r.json().then(function(j){ j.__status = r.status; return j; }); })
    .then(function(d){
      if (!d.ok) {
        alert('저장 실패: ' + (d.error || 'status='+d.__status));
        if (btnArea) btnArea.innerHTML = '<button class="btn-success" onclick="saveEdit()">💾 저장</button> <button class="btn-ghost" onclick="toggleEdit(false)" style="margin-left:6px">취소</button>';
        return;
      }
      alert('✅ 저장됨 (' + changed + '개 필드)');
      Object.keys(body).forEach(function(k){ _curBiz[k] = body[k]; });
      toggleEdit(false);
      /* 헤더도 즉시 갱신 */
      $('bizName').textContent = '🏢 ' + (_curBiz.company_name || '#' + bid);
      $('bizSub').textContent = [
        _curBiz.business_number ? '#' + _curBiz.business_number : '',
        _curBiz.ceo_name ? '대표 ' + _curBiz.ceo_name : '',
        _curBiz.company_form || ''
      ].filter(Boolean).join(' · ');
      try { document.title = _curBiz.company_name || ('업체 #' + bid); } catch(_) {}
    })
    .catch(function(err){
      alert('오류: ' + err.message);
      if (btnArea) btnArea.innerHTML = '<button class="btn-success" onclick="saveEdit()">💾 저장</button> <button class="btn-ghost" onclick="toggleEdit(false)" style="margin-left:6px">취소</button>';
    });
  };

  /* ===== 메모 빡센 세팅 (2026-04-30) — admin.html cdMemoTabs 와 동일 수준 =====
     scope=business_all → 한 업체의 모든 메모 (할 일+거래처 정보+완료) 시간순 desc.
     카테고리 탭 + #태그 + 첨부 + D-day 배지 지원. */
  var _memosCache = [];
  var _memoCat = 'all';  /* 'all' | '할 일' | '거래처 정보' | '완료' | '전화'/'문서'/'이슈'/'약속' */
  var _memoPendingAttachments = [];

  function loadMemos() {
    fetchJson('/api/memos?scope=business_all&business_id=' + bid)
      .then(function(d){
        if (!d.ok) { $('memoList').innerHTML = '<div class="err">' + e(d.error || '메모 로드 실패') + '</div>'; return; }
        _memosCache = (d.memos || []).filter(function(m){ return !m.deleted_at; });
        var cnt = $('memoCount'); if (cnt) cnt.textContent = String(_memosCache.length);
        renderMemos();
      })
      .catch(function(err){
        $('memoList').innerHTML = '<div class="err">⚠️ 메모 로드 실패: ' + e(err && err.message || 'unknown') + '</div>';
      });
  }

  function renderMemos() {
    var box = $('memoList'); if (!box) return;
    var cat = _memoCat;
    var arr = _memosCache.slice();
    if (cat !== 'all') {
      if (cat === '할 일') arr = arr.filter(function(m){ return ['할 일','확인필요','고객요청'].indexOf(m.memo_type) >= 0; });
      else if (cat === '거래처 정보') arr = arr.filter(function(m){ return ['거래처 정보','사실메모','담당자판단','주의사항','참고'].indexOf(m.memo_type) >= 0; });
      else if (cat === '완료') arr = arr.filter(function(m){ return ['완료','완료처리'].indexOf(m.memo_type) >= 0; });
      else arr = arr.filter(function(m){ return m.category === cat; });
    }
    if (!arr.length) {
      box.innerHTML = '<div class="empty" style="text-align:center;padding:14px 0">'
        + (cat === 'all' ? '아직 메모 없음. 아래 입력 폼으로 첫 메모 추가.' : '이 카테고리 메모 없음.')
        + '</div>';
      return;
    }
    var TYPE_ICONS = {'할 일':'📌','확인필요':'📌','고객요청':'📌','거래처 정보':'🏢','사실메모':'🏢','담당자판단':'🏢','주의사항':'🏢','참고':'🏢','완료':'✅','완료처리':'✅'};
    var CAT_ICONS = {'전화':'📞','문서':'📁','이슈':'⚠️','약속':'📅','일반':'📝'};
    var TYPE_COLORS = {'할 일':'#b45309','확인필요':'#b45309','고객요청':'#b45309','거래처 정보':'#1e40af','사실메모':'#1e40af','담당자판단':'#1e40af','주의사항':'#dc2626','참고':'#1e40af','완료':'#10b981','완료처리':'#10b981'};
    box.innerHTML = arr.map(function(m){
      try {
        var ic = CAT_ICONS[m.category] || TYPE_ICONS[m.memo_type] || '📝';
        var tColor = TYPE_COLORS[m.memo_type] || '#4e5968';
        var created = (m.created_at || '').substring(0,16).replace('T',' ');
        var by = m.author_name || '';
        var due = m.due_date ? renderDDayBadge(m.due_date) : '';
        var catChip = m.category ? '<span class="memo-cat-chip">' + e(m.category) + '</span>' : '';
        var tags = (Array.isArray(m.tags) && m.tags.length)
          ? m.tags.map(function(t){ return '<span class="memo-tag-chip">#' + e(t) + '</span>'; }).join('')
          : '';
        var attach = (Array.isArray(m.attachments) && m.attachments.length) ? renderAttachments(m.attachments) : '';
        var contentHtml = e(m.content || '').replace(/#([\w가-힣]+)/g, '<span class="htag">#$1</span>');
        return '<div data-memo-id="' + m.id + '" class="memo-card">'
          + '<div class="memo-card-h">'
            + '<span style="font-size:1em;flex-shrink:0">' + ic + '</span>'
            + '<span class="memo-type-label" style="color:' + tColor + '">' + e(m.memo_type_display || m.memo_type) + '</span>'
            + catChip
            + (due ? '<span style="margin-left:2px">' + due + '</span>' : '')
            + '<span class="memo-card-meta">' + e(by) + ' · ' + e(created) + (m.is_edited ? ' (수정됨)' : '') + '</span>'
            + '<button class="memo-card-del" onclick="deleteMemo(' + m.id + ')" title="삭제">🗑️</button>'
          + '</div>'
          + '<div class="memo-content">' + contentHtml + '</div>'
          + (tags ? '<div style="margin-top:5px">' + tags + '</div>' : '')
          + (attach ? '<div class="memo-attach">' + attach + '</div>' : '')
        + '</div>';
      } catch(_) { return ''; }
    }).join('');
  }

  function renderDDayBadge(dueDate) {
    try {
      var today = new Date(Date.now() + 9 * 60 * 60 * 1000); today.setHours(0,0,0,0);
      var d = new Date(dueDate + 'T00:00:00+09:00');
      var diff = Math.round((d - today) / 86400000);
      var bg = '#94a3b8', label = '';
      if (diff < 0) { bg = '#991b1b'; label = '지남 ' + (-diff) + '일'; }
      else if (diff === 0) { bg = '#dc2626'; label = 'D-DAY'; }
      else if (diff <= 3) { bg = '#ea580c'; label = 'D-' + diff; }
      else if (diff <= 7) { bg = '#b45309'; label = 'D-' + diff; }
      else { bg = '#94a3b8'; label = 'D-' + diff; }
      return '<span class="dday-badge" style="background:' + bg + '">' + label + '</span>';
    } catch(_) { return ''; }
  }

  function renderAttachments(arr) {
    return arr.map(function(a){
      var url = '/api/' + (String(a.mime || '').indexOf('image/') === 0 ? 'image' : 'file') + '?k=' + encodeURIComponent(a.key) + (a.name ? '&name=' + encodeURIComponent(a.name) : '');
      if (String(a.mime || '').indexOf('image/') === 0) {
        return '<a class="img" href="' + escAttr(url) + '" target="_blank" rel="noopener"><img src="' + escAttr(url) + '" alt="' + escAttr(a.name || '') + '" loading="lazy"></a>';
      }
      var sz = a.size ? ' (' + Math.round(a.size / 1024) + 'KB)' : '';
      return '<a href="' + escAttr(url) + '" target="_blank" rel="noopener">📄 ' + e(a.name || '파일') + sz + '</a>';
    }).join('');
  }

  window.memoFilter = function(cat) {
    _memoCat = cat;
    var btns = document.querySelectorAll('#memoTabs button');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (b.dataset.mcat === cat) b.classList.add('on');
      else b.classList.remove('on');
    }
    renderMemos();
  };

  window.onMemoFileSelect = function(ev) {
    var files = Array.prototype.slice.call(ev.target.files || []);
    var lbl = $('memoNewFileLabel');
    if (!files.length) { if (lbl) lbl.textContent = ''; _memoPendingAttachments = []; return; }
    if (lbl) lbl.textContent = '업로드 중... (' + files.length + '개)';
    Promise.all(files.map(function(f){
      var fd = new FormData(); fd.append('file', f);
      return fetch('/api/upload-memo-attachment?key=' + encodeURIComponent(KEY), { method: 'POST', body: fd })
        .then(function(r){ return r.json(); })
        .then(function(d){
          if (d.ok) return { key: d.key, name: d.name, size: d.size, mime: d.mime };
          throw new Error(d.error || 'upload failed');
        })
        .catch(function(err){ alert('첨부 실패: ' + (f.name || '') + ' — ' + err.message); return null; });
    })).then(function(results){
      _memoPendingAttachments = results.filter(function(x){ return x; });
      if (lbl) lbl.textContent = '✅ ' + _memoPendingAttachments.length + '개 첨부됨';
    });
  };

  window.submitMemoNew = function() {
    var content = ($('memoNewContent').value || '').trim();
    if (!content) { alert('내용을 입력하세요'); return; }
    var memoType = $('memoNewType').value || '거래처 정보';
    var category = $('memoNewCategory').value || null;
    var due = $('memoNewDue').value || null;
    var attachments = _memoPendingAttachments.length ? _memoPendingAttachments : undefined;
    var body = {
      memo_type: memoType, content: content, target_business_id: bid,
      category: category || undefined,
      due_date: due || undefined,
      attachments: attachments
    };
    fetch('/api/memos?key=' + encodeURIComponent(KEY), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (!d.ok) { alert('저장 실패: ' + (d.error || 'unknown')); return; }
      $('memoNewContent').value = '';
      $('memoNewDue').value = '';
      var fileInput = $('memoNewFile'); if (fileInput) fileInput.value = '';
      var lbl = $('memoNewFileLabel'); if (lbl) lbl.textContent = '';
      _memoPendingAttachments = [];
      loadMemos();
    })
    .catch(function(err){ alert('오류: ' + err.message); });
  };

  loadMemos();
  /* Phase 2 — 재무·문서·일정 비동기 로드. 각 섹션 독립적으로 try/catch 격리. */
  setTimeout(loadFinance, 100);
  setTimeout(loadDocs, 150);
  setTimeout(loadSchedule, 200);

  /* 📊 재무 로드 */
  function loadFinance() {
    fetchJson('/api/admin-finance?business_id=' + bid + '&action=summary')
      .then(function(d){
        if (d.error) { $('financeList').innerHTML = '<div class="err">' + e(d.error) + '</div>'; return; }
        if (!d.has_data || !d.rows || !d.rows.length) {
          $('financeList').innerHTML = '<div class="empty">재무 데이터 없음. ＋ 새 기간 버튼으로 추가 또는 PDF 업로드 후 Claude 처리 요청.</div>';
          return;
        }
        const fmt = function(v){ return v == null ? '—' : Number(v).toLocaleString('ko-KR'); };
        let html = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.82em;min-width:600px">';
        html += '<thead><tr style="background:#f3f4f6;color:#374151"><th style="padding:6px 8px;text-align:left;border-bottom:1px solid #d1d5db">기간</th><th style="padding:6px 8px;text-align:right;border-bottom:1px solid #d1d5db">매출</th><th style="padding:6px 8px;text-align:right;border-bottom:1px solid #d1d5db">매입</th><th style="padding:6px 8px;text-align:right;border-bottom:1px solid #d1d5db">부가세</th><th style="padding:6px 8px;text-align:right;border-bottom:1px solid #d1d5db">소득세</th><th style="padding:6px 8px;text-align:right;border-bottom:1px solid #d1d5db">인건비</th><th style="padding:6px 8px;text-align:center;border-bottom:1px solid #d1d5db;width:40px"></th></tr></thead><tbody>';
        d.rows.slice(0, 12).forEach(function(r){
          try {
            html += '<tr>'
              + '<td style="padding:6px 8px;border-bottom:1px solid #f2f4f6;font-weight:600;color:#1e40af">' + e(r.period || '') + '</td>'
              + '<td style="padding:6px 8px;border-bottom:1px solid #f2f4f6;text-align:right">' + fmt(r.revenue) + '</td>'
              + '<td style="padding:6px 8px;border-bottom:1px solid #f2f4f6;text-align:right">' + fmt(r.cost) + '</td>'
              + '<td style="padding:6px 8px;border-bottom:1px solid #f2f4f6;text-align:right">' + fmt(r.vat_payable) + '</td>'
              + '<td style="padding:6px 8px;border-bottom:1px solid #f2f4f6;text-align:right">' + fmt(r.income_tax) + '</td>'
              + '<td style="padding:6px 8px;border-bottom:1px solid #f2f4f6;text-align:right">' + fmt(r.payroll_total) + '</td>'
              + '<td style="padding:6px 8px;border-bottom:1px solid #f2f4f6;text-align:center"><button onclick="deleteFinance(' + (r.id || 'null') + ',\'' + escAttr(r.period || '') + '\')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:.95em;padding:2px 5px" title="이 행 삭제">🗑️</button></td>'
              + '</tr>';
          } catch(_) {}
        });
        html += '</tbody></table></div>';
        $('financeList').innerHTML = html;
      })
      .catch(function(err){ $('financeList').innerHTML = '<div class="err">⚠️ 재무 로드 실패: ' + e(err && err.message || 'unknown') + '</div>'; });
  }

  /* 단건 삭제 */
  window.deleteFinance = function(rowId, period) {
    if (!rowId) { alert('이 행은 ID 없어 삭제 불가'); return; }
    if (!confirm('재무 기간 "' + period + '" 삭제하시겠습니까?\n되돌릴 수 없습니다.')) return;
    fetch('/api/admin-finance?action=delete&key=' + encodeURIComponent(KEY), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rowId })
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (!d.ok) { alert('삭제 실패: ' + (d.error || 'unknown')); return; }
      loadFinance();
    })
    .catch(function(err){ alert('오류: ' + err.message); });
  };

  /* 전체 비우기 — 이 사업장의 모든 재무 데이터 */
  window.clearAllFinance = function() {
    if (!_curBiz) { alert('데이터 로드 안됨'); return; }
    const name = _curBiz.company_name || ('사업장 #' + bid);
    if (!confirm('"' + name + '" 의 재무 데이터 모두 삭제\n되돌릴 수 없습니다. 진행하시겠습니까?')) return;
    if (!confirm('정말 모두 삭제? 이 작업은 복구 불가합니다.')) return;
    fetch('/api/admin-finance?action=clear&key=' + encodeURIComponent(KEY), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid })
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (!d.ok) { alert('삭제 실패: ' + (d.error || 'unknown')); return; }
      alert('✅ ' + (d.deleted || 0) + '건 삭제됨');
      loadFinance();
    })
    .catch(function(err){ alert('오류: ' + err.message); });
  };

  /* 재무 새 기간 추가 — prompt 시리즈 */
  window.addFinance = function() {
    const period = prompt('기간 (예: 2025-1기, 2025-2기, 2025-12, 2025)', '');
    if (!period || !period.trim()) return;
    const periodType = prompt('기간 타입 (vat / monthly / quarterly / yearly)', 'vat');
    if (!periodType) return;
    const num = function(label){
      const v = prompt(label + ' (숫자만, 비우면 skip)', '');
      if (v == null || v === '') return null;
      const n = Number(String(v).replace(/,/g, ''));
      return Number.isFinite(n) ? n : null;
    };
    const revenue = num('매출');
    const cost = num('매입');
    const vatPayable = num('부가세');
    const incomeTax = num('소득세');
    const payroll = num('인건비');
    const notes = prompt('노트 (선택)', '') || null;
    if (!_curBiz) { alert('데이터 로드 안 됨'); return; }
    /* user_id 자동: business_members 의 대표자 또는 첫 매핑된 사용자 */
    fetchJson('/api/admin-businesses?id=' + bid)
      .then(function(d){
        const members = (d && d.members) || [];
        const rep = members.find(function(m){ return m.role === '대표자'; }) || members[0];
        if (!rep || !rep.user_id) { alert('이 업체에 매핑된 사용자가 없어 재무 등록 불가. 먼저 구성원 추가.'); return null; }
        const body = {
          user_id: rep.user_id, business_id: bid, period: period.trim(), period_type: periodType.trim(),
          revenue: revenue, cost: cost, vat_payable: vatPayable, income_tax: incomeTax, payroll_total: payroll, notes: notes
        };
        return fetch('/api/admin-finance?action=upsert&key=' + encodeURIComponent(KEY), {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        }).then(function(r){ return r.json(); });
      })
      .then(function(d){
        if (!d) return;
        if (!d.ok) { alert('저장 실패: ' + (d.error || 'unknown')); return; }
        alert(d.updated ? '✅ 갱신' : '✅ 추가');
        loadFinance();
      })
      .catch(function(err){ alert('오류: ' + (err && err.message || err)); });
  };

  /* 📋 문서 로드 */
  function loadDocs() {
    fetchJson('/api/admin-documents?business_id=' + bid + '&limit=5')
      .then(function(d){
        const docs = d.documents || [];
        const counts = d.counts || {};
        const summary = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px">'
          + '<div style="padding:6px 9px;background:#fef3c7;border-radius:5px;font-size:.78em;text-align:center">⏳ 대기 <b>' + (counts.pending || 0) + '</b></div>'
          + '<div style="padding:6px 9px;background:#d1fae5;border-radius:5px;font-size:.78em;text-align:center">✅ 승인 <b>' + (counts.approved || 0) + '</b></div>'
          + '<div style="padding:6px 9px;background:#fee2e2;border-radius:5px;font-size:.78em;text-align:center">❌ 반려 <b>' + (counts.rejected || 0) + '</b></div>'
          + '</div>';
        if (!docs.length) { $('docList').innerHTML = summary + '<div class="empty">최근 문서 없음</div>'; return; }
        const TY = {receipt:'영수증',lease:'임대차',payroll:'근로',freelancer_payment:'프리랜서',tax_invoice:'세금계산서',insurance:'보험',utility:'공과금',property_tax:'지방세',bank_stmt:'은행내역',business_reg:'사업자등록증',identity:'신분증',contract:'계약서',other:'기타'};
        const ST = {pending:'⏳',approved:'✅',rejected:'❌'};
        $('docList').innerHTML = summary + docs.map(function(doc){
          try {
            const dt = (doc.created_at || '').slice(0, 10);
            const tp = TY[doc.doc_type] || doc.doc_type || '문서';
            const st = ST[doc.status] || '';
            const v = doc.vendor || doc.real_name || doc.name || '';
            const amt = doc.amount ? (Number(doc.amount).toLocaleString('ko-KR') + '원') : '';
            return '<div style="padding:7px 0;border-bottom:1px dashed #e5e8eb;font-size:.84em">' + st + ' ' + e(dt) + ' <b>' + e(tp) + '</b>' + (v ? ' · ' + e(v) : '') + (amt ? ' · ' + e(amt) : '') + '</div>';
          } catch(_) { return ''; }
        }).join('');
      })
      .catch(function(err){ $('docList').innerHTML = '<div class="err">⚠️ 문서 로드 실패: ' + e(err && err.message || 'unknown') + '</div>'; });
  }

  /* 📆 일정 로드 — D-day 색상 분기 */
  function loadSchedule() {
    fetchJson('/api/memos?scope=business_due&business_id=' + bid)
      .then(function(d){
        if (!d.ok) { $('scheduleList').innerHTML = '<div class="err">' + e(d.error || '일정 로드 실패') + '</div>'; return; }
        const sch = d.schedule || [];
        if (!sch.length) { $('scheduleList').innerHTML = '<div class="empty">예정된 일정 없음. ＋ 일정 버튼으로 추가.</div>'; return; }
        const today = new Date().toISOString().slice(0, 10);
        $('scheduleList').innerHTML = sch.map(function(m){
          try {
            const due = m.due_date || '';
            const diff = Math.floor((new Date(due + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000);
            let dDay, color, dim = '';
            if (diff < 0) { dDay = '⚪ 지남 ' + (-diff) + '일'; color = '#9ca3af'; dim = ';opacity:.55'; }
            else if (diff === 0) { dDay = '🔴 D-day'; color = '#dc2626'; }
            else if (diff <= 3) { dDay = '🔴 D-' + diff; color = '#dc2626'; }
            else if (diff <= 7) { dDay = '🟡 D-' + diff; color = '#f59e0b'; }
            else if (diff <= 30) { dDay = '🟢 D-' + diff; color = '#10b981'; }
            else { dDay = '⚪ D-' + diff; color = '#9ca3af'; }
            return '<div style="padding:8px 0;border-bottom:1px dashed #e5e8eb;font-size:.86em' + dim + '"><b style="color:' + color + ';margin-right:8px">' + dDay + '</b><span style="color:#6b7280;margin-right:6px">' + e(due) + '</span>' + e(String(m.content || '').slice(0, 80)) + '</div>';
          } catch(_) { return ''; }
        }).join('');
      })
      .catch(function(err){ $('scheduleList').innerHTML = '<div class="err">⚠️ 일정 로드 실패: ' + e(err && err.message || 'unknown') + '</div>'; });
  }

  /* ＋ 일정 추가 */
  window.addSchedule = function() {
    const due = prompt('마감일 (YYYY-MM-DD)', '');
    if (!due) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due.trim())) { alert('YYYY-MM-DD 형식'); return; }
    const content = prompt('일정 내용 (예: 부가세 신고)', '');
    if (!content || !content.trim()) return;
    fetch('/api/memos?key=' + encodeURIComponent(KEY), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memo_type: '할 일', content: content.trim(), due_date: due.trim(), target_business_id: bid })
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (!d.ok) { alert('추가 실패: ' + (d.error || 'unknown')); return; }
      loadSchedule();
    })
    .catch(function(err){ alert('오류: ' + err.message); });
  };

  /* 메모 추가 — 모달 방식 */
  /* 메모 별창 — 사장님 명령 2026-04-30 (A 방식): /memo-window.html?business_id=X 새 탭 */
  window.openMemoWindowBiz = function() {
    const url = '/memo-window.html?business_id=' + encodeURIComponent(bid) + '&key=' + encodeURIComponent(KEY || '');
    window.open(url, '_blank', 'noopener');
  };

  /* legacy 호환 — 인라인 폼 사용 후 모달 폐기. 호출되어도 안전하게 무시 또는 인라인으로 위임 */
  window.addMemo = function() {
    /* 인라인 폼 textarea 에 포커스 — 버튼 클릭 시 자연스럽게 이동 */
    var ta = $('memoNewContent');
    if (ta) { try { ta.focus(); ta.scrollIntoView({behavior:'smooth', block:'center'}); } catch(_) {} }
  };
  window.closeMemoModal = function() {};  /* 모달 폐기, no-op */
  window.submitMemo = function() { return submitMemoNew(); };  /* legacy alias */

  /* 메모 삭제 */
  window.deleteMemo = function(memoId) {
    if (!confirm('이 메모를 삭제하시겠습니까?')) return;
    fetch('/api/memos?id=' + memoId + '&key=' + encodeURIComponent(KEY), { method: 'DELETE' })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (!d.ok) { alert('삭제 실패: ' + (d.error || 'unknown')); return; }
        loadMemos();
      })
      .catch(function(err){ alert('오류: ' + err.message); });
  };

  /* AI 요약 */
  window.runSummary = function() {
    const range = prompt('요약 기간 선택 (recent / week / month / all)', 'recent');
    if (!range) return;
    if (['recent','week','month','all'].indexOf(range) === -1) { alert('recent / week / month / all 중 하나'); return; }
    $('summaryBody').innerHTML = '<div class="loading">🤖 요약 생성 중... (5~30초)</div>';
    fetch('/api/admin-customer-summary?business_id=' + bid + '&range=' + encodeURIComponent(range) + '&key=' + encodeURIComponent(KEY))
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d.error) { $('summaryBody').innerHTML = '<div class="err">' + e(d.error) + '</div>'; return; }
        const text = d.summary || '';
        if (!text) { $('summaryBody').innerHTML = '<div class="empty">결과 비어있음</div>'; return; }
        const meta = '<div style="font-size:.72em;color:#9ca3af;margin-bottom:8px">기간: ' + e(range) + ' · 메시지 ' + (d.message_count || 0) + '건 · 비용 ₩' + Math.round((d.cost_cents||0)*14) + '</div>';
        $('summaryBody').innerHTML = meta + '<div style="white-space:pre-wrap;line-height:1.7;font-size:.88em">' + e(text) + '</div>';
      })
      .catch(function(err){ $('summaryBody').innerHTML = '<div class="err">오류: ' + e(err.message) + '</div>'; });
  };

  /* Phase M6 (2026-05-05 사장님 명령): 업체 삭제 + 메모 cascade
   * "신중히 삭제하시겠습니까?" 1단계 confirm + 업체명 직접 입력 2단계 → DELETE API */
  window.deleteBusinessFromPage = async function(){
    if(!bid){ alert('업체 ID 누락'); return; }
    const bizName = ($('bizName')?.textContent || '').trim() || '업체';

    /* 1단계: 일반 confirm */
    const ok1 = confirm(
      '⚠️ 신중히 삭제하시겠습니까?\n\n' +
      '업체: ' + bizName + '\n\n' +
      '이 업체와 관련된 모든 메모도 함께 휴지통으로 이동합니다.\n' +
      '메모는 휴지통에서 복원 가능 / 업체 자체는 복원 불가.'
    );
    if(!ok1) return;

    /* 2단계: 업체명 직접 입력 (가장 신중) */
    const typed = prompt(
      '확실하면 업체명을 정확히 입력하세요 (대소문자·띄어쓰기 동일):\n\n"' + bizName + '"'
    );
    if(typed === null) return;
    if(typed.trim() !== bizName.trim()){
      alert('업체명이 일치하지 않습니다. 삭제 취소.');
      return;
    }

    /* 3. API 호출 */
    const btn = $('bizDeleteBtn');
    if(btn){ btn.disabled = true; btn.textContent = '삭제 중...'; }
    try{
      const r = await fetch('/api/admin-businesses?id=' + bid + '&key=' + encodeURIComponent(KEY), { method: 'DELETE' });
      const d = await r.json();
      if(!d.ok){
        alert('삭제 실패: ' + (d.error || 'unknown'));
        if(btn){ btn.disabled = false; btn.textContent = '🗑️ 업체 삭제'; }
        return;
      }
      alert('삭제 완료\n\n업체: ' + (d.deleted_business || bizName) + '\n휴지통으로 이동된 메모: ' + (d.cascaded_memos || 0) + '건');
      try { history.back(); } catch(_) { location.href = '/admin.html'; }
    }catch(err){
      alert('오류: ' + err.message);
      if(btn){ btn.disabled = false; btn.textContent = '🗑️ 업체 삭제'; }
    }
  };

})();
