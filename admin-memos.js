/* ===== admin-memos.js — 거래처 dashboard 통합 메모 (메모 빡센 세팅 분리 모듈) =====
 * 사장님 명령 (2026-04-30): admin.js 7000줄 쪼개기 — Step 1.
 * 분리: cdMemo* 영역 (~200줄) → 자체 파일.
 *
 * 의존 (admin.js 에 정의되어 있고 globally 공유):
 *  - KEY                  (let, admin.js 에서 정의 — 클래식 스크립트 lexical share)
 *  - _cdCurrentUserId     (let, openCustomerDashboard 가 set)
 *  - e(s)                 (function, HTML escape)
 *  - escAttr(s)           (function, attribute-safe escape)
 *  - $g(id)               (function, document.getElementById alias)
 *
 * 노출 (window 에 자동 등록 — 함수 선언 + var 사용):
 *  - 상태: _cdMemosCache, _cdMemoCategory, _cdPendingAttachments
 *  - 로더: _loadCustomerInfo (alias), _loadCdAllMemos
 *  - 렌더: _renderCdMemos, _renderCdDDayBadge, _renderCdAttachments
 *  - UI:   cdMemoFilter, onCdMemoFileSelect, addCdMemo, deleteCdMemo
 *  - 호환: addCustomerInfo, deleteCustomerInfo
 *
 * 로드 순서: admin.html / staff.html 에서 admin.js 다음에 로드. */

/* var 사용 — 클래식 스크립트 top-level 에서 window.* 자동 attach (cross-script 안전) */
var _cdMemosCache = [];
var _cdMemoCategory = 'all';  /* 'all' | '할 일' | '거래처 정보' | '완료' | '전화' | '문서' | '이슈' | '약속' */
var _cdPendingAttachments = [];  /* 업로드 완료된 첨부 (POST 시 같이 보냄) */
/* 메모 빡센 세팅 commit 3 — #태그 클릭 필터 + 정렬 + 일괄 액션 */
var _cdActiveTag = null;       /* '부가세' 같은 단일 태그 필터 (chip 클릭 시 set) */
var _cdSortMode = 'recent';    /* 'recent' (기본 시간순 desc) | 'due' (기한순 asc, 없는 거 끝) | 'type' (타입순) */
var _cdSelectedIds = {};       /* { 12: true, 34: true } — 일괄 액션 대상 */

async function _loadCustomerInfo(userId){
  /* 기존 호출 호환 — 통합 메모 로더로 위임 */
  return _loadCdAllMemos(userId);
}

async function _loadCdAllMemos(userId){
  const list=$g('cdMemoList');
  const cnt=$g('cdMemoCount');
  if(!list||!userId)return;
  list.innerHTML='<div style="color:#8b95a1;padding:10px 0;font-size:.85em">불러오는 중...</div>';
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&scope=customer_all&user_id='+userId);
    const d=await r.json();
    _cdMemosCache=(d.memos||[]).filter(m=>!m.deleted_at);
    if(cnt) cnt.textContent=String(_cdMemosCache.length);
    _renderCdMemos();
  }catch(err){
    list.innerHTML='<div style="color:#f04452">오류: '+e(err.message)+'</div>';
  }
}

function _renderCdMemos(){
  const list=$g('cdMemoList'); if(!list) return;
  const cat=_cdMemoCategory;
  let arr=_cdMemosCache.slice();
  /* 카테고리 / 타입 필터 */
  if(cat!=='all'){
    if(cat==='할 일') arr=arr.filter(m=>['할 일','확인필요','고객요청'].includes(m.memo_type));
    else if(cat==='거래처 정보') arr=arr.filter(m=>['거래처 정보','사실메모','담당자판단','주의사항','참고'].includes(m.memo_type));
    else if(cat==='완료') arr=arr.filter(m=>['완료','완료처리'].includes(m.memo_type));
    else arr=arr.filter(m=>m.category===cat);  /* 전화/문서/이슈/약속/일반 */
  }
  /* 태그 필터 (chip 클릭 시 set) */
  if(_cdActiveTag){
    arr=arr.filter(m=>Array.isArray(m.tags)&&m.tags.indexOf(_cdActiveTag)>=0);
  }
  /* 정렬 */
  const TYPE_ORDER={'할 일':0,'확인필요':0,'고객요청':0,'거래처 정보':1,'사실메모':1,'담당자판단':1,'주의사항':1,'참고':1,'완료':2,'완료처리':2};
  if(_cdSortMode==='due'){
    /* 기한순 asc — 없는 건 맨 뒤. 같은 날짜면 created_at desc */
    arr.sort((a,b)=>{
      const ad=a.due_date||'9999-99-99', bd=b.due_date||'9999-99-99';
      if(ad!==bd) return ad.localeCompare(bd);
      return String(b.created_at||'').localeCompare(String(a.created_at||''));
    });
  } else if(_cdSortMode==='type'){
    arr.sort((a,b)=>{
      const at=TYPE_ORDER[a.memo_type]??9, bt=TYPE_ORDER[b.memo_type]??9;
      if(at!==bt) return at-bt;
      return String(b.created_at||'').localeCompare(String(a.created_at||''));
    });
  } else {
    /* recent (default) — 시간순 desc. 백엔드가 이미 desc 로 줘서 변경 X */
  }

  /* 헤더에 active tag pill + 일괄 액션 바 추가 */
  _renderCdMemoHeader(arr.length);

  if(!arr.length){
    let msg = '아직 메모가 없습니다.<br>아래 입력 폼으로 첫 메모를 추가해보세요.';
    if(cat!=='all') msg = '이 카테고리 메모가 없습니다.';
    if(_cdActiveTag) msg = '#'+_cdActiveTag+' 태그 메모가 없습니다.';
    list.innerHTML='<div style="color:#adb5bd;padding:14px 0;font-size:.84em;line-height:1.6;text-align:center">'+msg+'</div>';
    return;
  }
  const TYPE_ICONS={'할 일':'📌','확인필요':'📌','고객요청':'📌','거래처 정보':'🏢','사실메모':'🏢','담당자판단':'🏢','주의사항':'🏢','참고':'🏢','완료':'✅','완료처리':'✅'};
  const CAT_ICONS={'전화':'📞','문서':'📁','이슈':'⚠️','약속':'📅','일반':'📝'};
  const TYPE_COLORS={'할 일':'#b45309','확인필요':'#b45309','고객요청':'#b45309','거래처 정보':'#1e40af','사실메모':'#1e40af','담당자판단':'#1e40af','주의사항':'#dc2626','참고':'#1e40af','완료':'#10b981','완료처리':'#10b981'};
  list.innerHTML=arr.map(m=>{
    const ic=CAT_ICONS[m.category]||TYPE_ICONS[m.memo_type]||'📝';
    const tColor=TYPE_COLORS[m.memo_type]||'#4e5968';
    const created=(m.created_at||'').substring(0,16).replace('T',' ');
    const by=m.author_name||'';
    const due=m.due_date?_renderCdDDayBadge(m.due_date):'';
    const catChip=m.category?'<span onclick="cdMemoFilter(\''+escAttr(m.category)+'\');event.stopPropagation()" style="background:#eff6ff;color:#1e40af;font-size:.7em;font-weight:600;padding:1px 7px;border-radius:99px;margin-right:4px;cursor:pointer" title="이 카테고리만 보기">'+e(m.category)+'</span>':'';
    /* 태그 chip — 클릭 시 _cdActiveTag set + filter */
    const tags=Array.isArray(m.tags)&&m.tags.length?m.tags.map(t=>'<span onclick="cdSetTagFilter(\''+escAttr(t)+'\');event.stopPropagation()" style="background:#dbeafe;color:#1e40af;font-size:.7em;font-weight:600;padding:1px 7px;border-radius:99px;margin-right:3px;cursor:pointer" title="이 태그만 보기">#'+e(t)+'</span>').join(''):'';
    const attach=Array.isArray(m.attachments)&&m.attachments.length?_renderCdAttachments(m.attachments):'';
    /* content 안 #태그 는 chip 으로 따로 표시했으니 본문에는 그대로 두되 시각 강조 */
    const contentHtml=e(m.content||'').replace(/#([\w가-힣]+)/g,'<span style="color:#1e40af;font-weight:600">#$1</span>');
    /* 일괄 액션 체크박스 */
    const checked = _cdSelectedIds[m.id] ? 'checked' : '';
    const cardBg = _cdSelectedIds[m.id] ? '#fef3c7' : '';
    return '<div data-memo-id="'+m.id+'" style="padding:10px 0;border-bottom:1px dashed #e5e8eb;background:'+cardBg+'">'
      +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">'
        +'<input type="checkbox" '+checked+' onchange="cdToggleSelect('+m.id+',this.checked)" style="width:14px;height:14px;cursor:pointer;accent-color:#3182f6;flex-shrink:0" title="일괄 액션 선택">'
        +'<span style="font-size:1em;flex-shrink:0">'+ic+'</span>'
        +'<span style="color:'+tColor+';font-size:.74em;font-weight:700">'+e(m.memo_type_display||m.memo_type)+'</span>'
        +catChip
        +(due?'<span style="margin-left:2px">'+due+'</span>':'')
        +'<span style="margin-left:auto;font-size:.7em;color:#8b95a1">'+e(by)+' · '+e(created)+(m.is_edited?' (수정됨)':'')+'</span>'
        +'<button onclick="deleteCdMemo('+m.id+')" style="background:none;border:none;color:#f04452;font-size:.78em;cursor:pointer;font-family:inherit;padding:0 4px" title="삭제">🗑️</button>'
      +'</div>'
      +'<div style="white-space:pre-wrap;word-break:break-word;color:#191f28;line-height:1.5">'+contentHtml+'</div>'
      +(tags?'<div style="margin-top:5px">'+tags+'</div>':'')
      +(attach?'<div style="margin-top:6px">'+attach+'</div>':'')
    +'</div>';
  }).join('');
}

/* 헤더 영역 (카테고리 탭 위) — active tag pill + 정렬 select + 일괄 액션 바 */
function _renderCdMemoHeader(filteredCount){
  /* 헤더 plumbing — cdMemoTabs 위에 _cdMemoHeaderBar 추가 (없으면 생성). active tag / 정렬 / 일괄 표시 */
  const tabs = $g('cdMemoTabs'); if(!tabs) return;
  let bar = $g('cdMemoHeaderBar');
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'cdMemoHeaderBar';
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px;font-size:.78em';
    tabs.parentNode.insertBefore(bar, tabs);
  }
  const tagPill = _cdActiveTag
    ? '<span style="background:#1e40af;color:#fff;padding:3px 9px;border-radius:99px;font-weight:600;cursor:pointer" onclick="cdClearTagFilter()" title="태그 필터 해제">#'+e(_cdActiveTag)+' ✕</span>'
    : '';
  const selCount = Object.keys(_cdSelectedIds).filter(id=>_cdSelectedIds[id]).length;
  const bulkBar = selCount > 0
    ? '<span style="background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:99px;font-weight:600;margin-left:auto">선택 '+selCount+'건</span>'
      +'<button onclick="cdBulkComplete()" style="background:#10b981;color:#fff;border:none;padding:5px 11px;border-radius:6px;font-size:.78em;font-weight:600;cursor:pointer;font-family:inherit">✅ 일괄 완료</button>'
      +'<button onclick="cdBulkDelete()" style="background:#dc2626;color:#fff;border:none;padding:5px 11px;border-radius:6px;font-size:.78em;font-weight:600;cursor:pointer;font-family:inherit">🗑️ 일괄 삭제</button>'
      +'<button onclick="cdClearSelection()" style="background:#fff;color:#6b7280;border:1px solid #e5e8eb;padding:5px 11px;border-radius:6px;font-size:.78em;cursor:pointer;font-family:inherit">선택 해제</button>'
    : '';
  const sortSel = '<select onchange="cdSortChange(this.value)" style="background:#fff;border:1px solid #e5e8eb;border-radius:6px;padding:4px 8px;font-size:.74em;font-family:inherit;cursor:pointer'+(selCount>0?'':';margin-left:auto')+'" title="정렬 기준">'
    +'<option value="recent"'+(_cdSortMode==='recent'?' selected':'')+'>🕒 최신순</option>'
    +'<option value="due"'+(_cdSortMode==='due'?' selected':'')+'>📅 기한순</option>'
    +'<option value="type"'+(_cdSortMode==='type'?' selected':'')+'>🗂️ 타입순</option>'
    +'</select>';
  bar.innerHTML = tagPill + bulkBar + sortSel;
}

function _renderCdDDayBadge(dueDate){
  try{
    const today=new Date(Date.now()+9*60*60*1000); today.setHours(0,0,0,0);
    const d=new Date(dueDate+'T00:00:00+09:00');
    const diff=Math.round((d-today)/86400000);
    let bg='#94a3b8', tx='#fff', label='';
    if(diff<0){ bg='#991b1b'; label='지남 '+(-diff)+'일'; }
    else if(diff===0){ bg='#dc2626'; label='D-DAY'; }
    else if(diff<=3){ bg='#ea580c'; label='D-'+diff; }
    else if(diff<=7){ bg='#b45309'; label='D-'+diff; }
    else{ bg='#94a3b8'; label='D-'+diff; }
    return '<span style="background:'+bg+';color:'+tx+';font-size:.68em;font-weight:700;padding:1px 7px;border-radius:99px">'+label+'</span>';
  }catch{ return ''; }
}

function _renderCdAttachments(arr){
  return '<div style="display:flex;flex-wrap:wrap;gap:6px">'+arr.map(a=>{
    const url='/api/'+(String(a.mime||'').startsWith('image/')?'image':'file')+'?k='+encodeURIComponent(a.key)+(a.name?'&name='+encodeURIComponent(a.name):'');
    if(String(a.mime||'').startsWith('image/')){
      return '<a href="'+escAttr(url)+'" target="_blank" rel="noopener" style="display:block;border:1px solid #e5e8eb;border-radius:6px;overflow:hidden;width:80px;height:80px"><img src="'+escAttr(url)+'" alt="'+escAttr(a.name||'')+'" style="width:100%;height:100%;object-fit:cover" loading="lazy"></a>';
    }
    const sz=a.size?' ('+(Math.round(a.size/1024))+'KB)':'';
    return '<a href="'+escAttr(url)+'" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;background:#f9fafb;border:1px solid #e5e8eb;border-radius:6px;padding:5px 10px;font-size:.8em;color:#374151;text-decoration:none;font-family:inherit">📄 '+e(a.name||'파일')+sz+'</a>';
  }).join('')+'</div>';
}

function cdMemoFilter(cat){
  _cdMemoCategory=cat;
  /* tab active 갱신 */
  document.querySelectorAll('#cdMemoTabs button').forEach(b=>{
    const isOn=b.dataset.cdmcat===cat;
    if(isOn){ b.classList.add('on'); b.style.background='#191f28'; b.style.color='#fff'; b.style.border='none'; b.style.fontWeight='600'; }
    else{ b.classList.remove('on'); b.style.background='#fff'; b.style.color='#4e5968'; b.style.border='1px solid #e5e8eb'; b.style.fontWeight='500'; }
  });
  _renderCdMemos();
}

function onCdMemoFileSelect(ev){
  const files=Array.from(ev.target.files||[]);
  const lbl=$g('cdMemoNewFileLabel');
  if(!files.length){ if(lbl)lbl.textContent=''; _cdPendingAttachments=[]; return; }
  if(lbl)lbl.textContent='업로드 중... ('+files.length+'개)';
  Promise.all(files.map(async f=>{
    try{
      const fd=new FormData(); fd.append('file', f);
      const r=await fetch('/api/upload-memo-attachment?key='+encodeURIComponent(KEY),{ method:'POST', body:fd });
      const d=await r.json();
      if(d.ok) return { key:d.key, name:d.name, size:d.size, mime:d.mime };
      throw new Error(d.error||'upload failed');
    }catch(err){ alert('첨부 실패: '+(f.name||'')+' — '+err.message); return null; }
  })).then(results=>{
    _cdPendingAttachments=results.filter(Boolean);
    if(lbl)lbl.textContent='✅ '+_cdPendingAttachments.length+'개 첨부됨';
  });
}

async function addCdMemo(){
  const userId=_cdCurrentUserId;
  if(!userId){alert('거래처가 선택되지 않았습니다');return}
  const content=($g('cdMemoNewContent')?.value||'').trim();
  if(!content){alert('내용을 입력하세요');return}
  const memoType=$g('cdMemoNewType')?.value||'거래처 정보';
  const category=$g('cdMemoNewCategory')?.value||null;
  const due=$g('cdMemoNewDue')?.value||null;
  const attachments=_cdPendingAttachments.length?_cdPendingAttachments:undefined;
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        memo_type:memoType, content, target_user_id:userId,
        category: category||undefined,
        due_date: due||undefined,
        attachments,
      })
    });
    const d=await r.json();
    if(!d.ok){alert('저장 실패: '+(d.error||'unknown'));return}
    /* 입력 폼 reset */
    $g('cdMemoNewContent').value='';
    $g('cdMemoNewDue').value='';
    if($g('cdMemoNewFile'))$g('cdMemoNewFile').value='';
    if($g('cdMemoNewFileLabel'))$g('cdMemoNewFileLabel').textContent='';
    _cdPendingAttachments=[];
    /* 카테고리 select 는 유지 (연속 입력 편의) */
    await _loadCdAllMemos(userId);
  }catch(err){alert('오류: '+err.message)}
}

async function deleteCdMemo(id){
  if(!confirm('이 메모를 삭제할까요?'))return;
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&id='+id,{method:'DELETE'});
    const d=await r.json();
    if(!d.ok){alert('삭제 실패: '+(d.error||'unknown'));return}
    if(_cdCurrentUserId) await _loadCdAllMemos(_cdCurrentUserId);
  }catch(err){alert('오류: '+err.message)}
}

/* 호환: 기존 호출자가 있을 수 있어 alias 유지 */
async function addCustomerInfo(){
  const userId=_cdCurrentUserId;
  if(!userId){alert('거래처가 선택되지 않았습니다');return}
  /* 신규 통합 입력 사용. 빈 cdInfoNew (legacy hidden) 무시. */
  const newContent=$g('cdMemoNewContent');
  if(newContent && newContent.value.trim()) return addCdMemo();
  /* legacy fallback */
  const content=($g('cdInfoNew')?.value||'').trim();
  if(!content){alert('내용을 입력하세요');return}
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({memo_type:'거래처 정보', content, target_user_id:userId})
    });
    const d=await r.json();
    if(!d.ok){alert('저장 실패: '+(d.error||'unknown'));return}
    $g('cdInfoNew').value='';
    await _loadCdAllMemos(userId);
  }catch(err){alert('오류: '+err.message)}
}
async function deleteCustomerInfo(id, userId){ return deleteCdMemo(id); }

/* ===== 🗑️ 휴지통 (메모 빡센 세팅 — 사장님 명령 2026-04-30) =====
 * scope=trash_list 로 deleted_at IS NOT NULL 메모 200건 조회.
 * 복원: POST ?action=restore&id=N (deleted_at=NULL)
 * 영구 삭제: POST ?action=purge&id=N (DELETE row) */

function openTrash(){
  const m = $g('trashModal'); if(!m){ alert('휴지통 모달 element 없음'); return; }
  m.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  loadTrash();
}

function closeTrash(){
  const m = $g('trashModal'); if(m) m.style.display = 'none';
  document.body.style.overflow = '';
}

async function loadTrash(){
  const list = $g('trashList'); const meta = $g('trashMeta');
  if(!list) return;
  list.innerHTML = '<div style="text-align:center;color:#8b95a1;padding:30px 0;font-size:.88em">불러오는 중...</div>';
  try{
    const r = await fetch('/api/memos?scope=trash_list&key=' + encodeURIComponent(KEY));
    const d = await r.json();
    if(!d.ok){ list.innerHTML = '<div style="color:#f04452;padding:14px">' + e(d.error || '휴지통 로드 실패') + '</div>'; return; }
    const memos = d.memos || [];
    if(meta) meta.textContent = memos.length ? memos.length + '건' : '';
    if(!memos.length){
      list.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:40px 0;font-size:.88em">휴지통이 비어 있습니다.</div>';
      return;
    }
    const TYPE_ICONS = {'할 일':'📌','확인필요':'📌','고객요청':'📌','거래처 정보':'🏢','사실메모':'🏢','담당자판단':'🏢','주의사항':'🏢','참고':'🏢','완료':'✅','완료처리':'✅'};
    const CAT_ICONS = {'전화':'📞','문서':'📁','이슈':'⚠️','약속':'📅','일반':'📝'};
    list.innerHTML = memos.map(m => {
      const ic = CAT_ICONS[m.category] || TYPE_ICONS[m.memo_type] || '📝';
      const ctx = m.target_user_real_name || m.target_user_name || m.target_business_name || m.room_name || '';
      const ctxHtml = ctx ? '<span style="background:#eff6ff;color:#1e40af;font-size:.7em;font-weight:600;padding:1px 7px;border-radius:99px;margin-right:4px">' + e(ctx) + '</span>' : '';
      const cat = m.category ? '<span style="background:#fef3c7;color:#92400e;font-size:.7em;font-weight:600;padding:1px 7px;border-radius:99px;margin-right:4px">' + e(m.category) + '</span>' : '';
      const tags = (Array.isArray(m.tags) && m.tags.length) ? m.tags.slice(0,4).map(t => '<span style="background:#dbeafe;color:#1e40af;font-size:.66em;font-weight:600;padding:1px 6px;border-radius:99px;margin-right:3px">#' + e(t) + '</span>').join('') : '';
      const deletedAt = (m.deleted_at || '').substring(0, 16).replace('T', ' ');
      const created = (m.created_at || '').substring(0, 10);
      const content = e(m.content || '').replace(/#([\w가-힣]+)/g, '<span style="color:#1e40af;font-weight:600">#$1</span>');
      return '<div style="padding:10px 0;border-bottom:1px dashed #e5e8eb">'
        + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;font-size:.85em">'
          + '<span style="font-size:1em">' + ic + '</span>'
          + '<span style="color:#4e5968;font-size:.74em;font-weight:700">' + e(m.memo_type_display || m.memo_type) + '</span>'
          + cat + ctxHtml
          + '<span style="margin-left:auto;font-size:.7em;color:#dc2626">🗑️ ' + e(deletedAt) + '</span>'
        + '</div>'
        + '<div style="white-space:pre-wrap;word-break:break-word;color:#191f28;line-height:1.5;font-size:.85em">' + content + '</div>'
        + (tags ? '<div style="margin-top:5px">' + tags + '</div>' : '')
        + '<div style="margin-top:6px;display:flex;gap:6px;justify-content:flex-end">'
          + '<button onclick="restoreMemo(' + m.id + ')" style="background:#10b981;color:#fff;border:none;padding:5px 12px;border-radius:6px;font-size:.76em;font-weight:600;cursor:pointer;font-family:inherit">↶ 복원</button>'
          + '<button onclick="purgeMemo(' + m.id + ')" style="background:#fff;color:#dc2626;border:1px solid #dc2626;padding:5px 12px;border-radius:6px;font-size:.76em;font-weight:600;cursor:pointer;font-family:inherit">✕ 영구 삭제</button>'
        + '</div>'
      + '</div>';
    }).join('');
  }catch(err){
    list.innerHTML = '<div style="color:#f04452;padding:14px">오류: ' + e(err.message) + '</div>';
  }
}

async function restoreMemo(id){
  if(!confirm('이 메모를 복원할까요?')) return;
  try{
    const r = await fetch('/api/memos?action=restore&id=' + id + '&key=' + encodeURIComponent(KEY), { method: 'POST' });
    const d = await r.json();
    if(!d.ok){ alert('복원 실패: ' + (d.error || 'unknown')); return; }
    loadTrash();
    /* 만약 거래처 dashboard 가 열려있으면 그 메모 리스트도 갱신 */
    if(typeof _cdCurrentUserId !== 'undefined' && _cdCurrentUserId && typeof _loadCdAllMemos === 'function') _loadCdAllMemos(_cdCurrentUserId);
  }catch(err){ alert('오류: ' + err.message); }
}

async function purgeMemo(id){
  if(!confirm('이 메모를 영구 삭제할까요?\n\n⚠️ 되돌릴 수 없습니다.')) return;
  try{
    const r = await fetch('/api/memos?action=purge&id=' + id + '&key=' + encodeURIComponent(KEY), { method: 'POST' });
    const d = await r.json();
    if(!d.ok){ alert('삭제 실패: ' + (d.error || 'unknown')); return; }
    loadTrash();
  }catch(err){ alert('오류: ' + err.message); }
}

/* ===== 메모 빡센 세팅 commit 3 — 태그 chip 클릭 / 정렬 / 일괄 액션 ===== */

/* #태그 chip 클릭 → 그 태그 필터 활성 */
function cdSetTagFilter(tag){
  _cdActiveTag = tag || null;
  _renderCdMemos();
}
function cdClearTagFilter(){
  _cdActiveTag = null;
  _renderCdMemos();
}

/* 정렬 변경 */
function cdSortChange(mode){
  _cdSortMode = (mode === 'due' || mode === 'type') ? mode : 'recent';
  _renderCdMemos();
}

/* 일괄 액션 — 체크박스 토글 */
function cdToggleSelect(id, checked){
  if(checked) _cdSelectedIds[id] = true;
  else delete _cdSelectedIds[id];
  /* 헤더만 갱신 (전체 재렌더는 무거움). 카드 배경색만 토글 */
  const card = document.querySelector('#cdMemoList [data-memo-id="'+id+'"]');
  if(card) card.style.background = checked ? '#fef3c7' : '';
  _renderCdMemoHeader();
}
function cdClearSelection(){
  _cdSelectedIds = {};
  _renderCdMemos();
}
async function cdBulkDelete(){
  const ids = Object.keys(_cdSelectedIds).filter(id=>_cdSelectedIds[id]).map(Number);
  if(!ids.length){ alert('선택된 메모 없음'); return; }
  if(!confirm(ids.length + '건 일괄 삭제? (휴지통으로 이동, 복원 가능)')) return;
  try{
    /* 병렬 DELETE 호출 — 각각 soft delete */
    await Promise.all(ids.map(id =>
      fetch('/api/memos?id=' + id + '&key=' + encodeURIComponent(KEY), { method: 'DELETE' })
    ));
    _cdSelectedIds = {};
    if(_cdCurrentUserId) await _loadCdAllMemos(_cdCurrentUserId);
  }catch(err){ alert('일괄 삭제 오류: ' + err.message); }
}
async function cdBulkComplete(){
  const ids = Object.keys(_cdSelectedIds).filter(id=>_cdSelectedIds[id]).map(Number);
  if(!ids.length){ alert('선택된 메모 없음'); return; }
  if(!confirm(ids.length + '건 일괄 완료 처리?')) return;
  try{
    await Promise.all(ids.map(id =>
      fetch('/api/memos?id=' + id + '&key=' + encodeURIComponent(KEY), {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ memo_type: '완료' })
      })
    ));
    _cdSelectedIds = {};
    if(_cdCurrentUserId) await _loadCdAllMemos(_cdCurrentUserId);
  }catch(err){ alert('일괄 완료 오류: ' + err.message); }
}
