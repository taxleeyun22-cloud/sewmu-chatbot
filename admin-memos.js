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

/* Phase #6 적용 (2026-05-06): nanostores sync helper.
 * window.__memoStore 가 main.ts (vite ES module entry) 에서 노출됨.
 * admin-memos.js 의 var 캐시 변경 시 store 도 같이 업데이트 → 다른 화면 자동 sync.
 * 양방향: store 변경 시 var 도 업데이트 (다른 모듈이 store 변경하면 여기 반영). */
function _syncMemoStore(){
  try{
    var s = window.__memoStore;
    if(!s) return;
    s.$cdMemoCache.set(_cdMemosCache);
    s.$cdMemoCategory.set(_cdMemoCategory);
    s.$cdSelectedMemoIds.set(_cdSelectedIds || {});
  }catch(_){}
}
/* main.ts ES module 로드 후 store subscribe — store 변경 시 var 갱신 */
(function(){
  function bind(){
    var s = window.__memoStore;
    if(!s){ setTimeout(bind, 200); return; }
    /* store → var (다른 모듈이 store.set 하면 여기서 반영) */
    s.$cdMemoCategory.subscribe(function(v){
      if(v !== _cdMemoCategory){ _cdMemoCategory = v; if(typeof _renderCdMemos === 'function') _renderCdMemos(); }
    });
  }
  bind();
})();
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
    _syncMemoStore();  /* Phase #6 적용: nanostores sync */
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
    /* Phase M2-b (2026-05-05): 업체 메모 prefix — 거래처 dashboard 에 "🏢 [업체명]" 칩으로 표시.
     * source=='business' 이면 그 메모는 업체에서 작성된 것 (target_business_id != null). */
    const bizChip=(m.source==='business'&&m.business_name)?'<span style="background:#e0f5ec;color:#0f766e;font-size:.7em;font-weight:700;padding:1px 7px;border-radius:99px;margin-right:4px" title="이 메모는 업체 페이지에서 작성됨">🏢 '+e(m.business_name)+'</span>':'';
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
        +bizChip
        +catChip
        +(due?'<span style="margin-left:2px">'+due+'</span>':'')
        +'<span style="margin-left:auto;font-size:.7em;color:#8b95a1">'+e(by)+' · '+e(created)+(m.is_edited?' (수정됨)':'')+'</span>'
        +'<button onclick="cdToggleMemoComments('+m.id+')" style="background:none;border:none;color:#3182f6;font-size:.74em;cursor:pointer;font-family:inherit;padding:0 4px" title="댓글">💬 댓글</button>'
        +'<button onclick="deleteCdMemo('+m.id+')" style="background:none;border:none;color:#f04452;font-size:.78em;cursor:pointer;font-family:inherit;padding:0 4px" title="삭제">🗑️</button>'
      +'</div>'
      +'<div style="white-space:pre-wrap;word-break:break-word;color:#191f28;line-height:1.5">'+contentHtml+'</div>'
      +(tags?'<div style="margin-top:5px">'+tags+'</div>':'')
      +(attach?'<div style="margin-top:6px">'+attach+'</div>':'')
      +'<div id="cdMemoComments_'+m.id+'" style="display:none;margin-top:8px;padding:8px 10px;background:#f9fafb;border-left:3px solid #c7d2fe;border-radius:4px"></div>'
    +'</div>';
  }).join('');
}

/* 헤더 영역 (카테고리 탭 위) — active tag pill + 정렬 select + 일괄 액션 바 */
function _renderCdMemoHeader(filteredCount){
  /* 헤더 plumbing — cdMemoTabs 위에 _cdMemoHeaderBar 추가 (없으면 생성). active tag / 정렬 / 일괄 표시
     주의: admin.js 의 $g 는 'getElementById(id) || _noop()' 라 element 없을 때 truthy 반환 →
     null 체크 깨짐. 신규 element 생성 분기에서는 document.getElementById 직접 사용 필수. */
  const tabs = document.getElementById('cdMemoTabs'); if(!tabs) return;
  let bar = document.getElementById('cdMemoHeaderBar');
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
  /* 메모 빡센 세팅 commit 4 — CSV 내보내기 버튼 (현재 필터된 메모) */
  const exportBtn = '<button onclick="cdExportMemoCsv()" style="background:#fff;color:#374151;border:1px solid #e5e8eb;padding:4px 9px;border-radius:6px;font-size:.74em;cursor:pointer;font-family:inherit" title="현재 필터된 메모를 CSV (Excel) 로 내려받기">📥 CSV</button>';
  bar.innerHTML = tagPill + bulkBar + sortSel + exportBtn;
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
  /* Phase M16 (2026-05-05 사장님 보고: "메모 pdf·사진 누르면 Unauthorized"):
   * URL 에 ADMIN_KEY 항상 부착 — 새 탭 진입 시 cookie 없거나 ADMIN_KEY 인증 통과되도록.
   * thumbnail img src 도 동일 (이전엔 401 받아서 깨진 표시). */
  const k = (typeof KEY !== 'undefined' && KEY) ? '&key=' + encodeURIComponent(KEY) : '';
  return '<div style="display:flex;flex-wrap:wrap;gap:6px">'+arr.map(a=>{
    const url='/api/'+(String(a.mime||'').startsWith('image/')?'image':'file')+'?k='+encodeURIComponent(a.key)+(a.name?'&name='+encodeURIComponent(a.name):'')+k;
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
  _syncMemoStore();  /* Phase #6 적용 */
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
    /* Phase #3 적용 (2026-05-06): type-safe wrapper 사용 (fallback to fetch) */
    let d;
    if(window.__memoActions && window.__memoActions.deleteMemo){
      d = await window.__memoActions.deleteMemo(id);
    } else {
      const r = await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&id='+id,{method:'DELETE'});
      d = await r.json();
    }
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
  /* Phase M3: 닫을 때 선택 상태 리셋 */
  _trashSelectedIds = {};
  const all = $g('trashSelectAll'); if(all && all.checked !== undefined) all.checked = false;
}

/* ============================================================
 * Phase M15 (2026-05-05 사장님 명령): 빠른 메모 — 사이드바 📒 클릭 → 거래처/업체 검색 → 메모 작성
 * 사장님 직접 인용:
 * > "메모 누르면 거래처나 사람이름 검색 하는거 나오고 거기서 메모입력도 가능하게 하자"
 * ============================================================ */
var _quickMemoTarget = null;  /* { type: 'user'|'business', id, name } */
var _quickMemoSearchTimer = null;

function openQuickMemoModal(){
  const m = $g('quickMemoModal'); if(!m){ alert('quickMemoModal element 없음'); return; }
  /* 상태 리셋 */
  _quickMemoTarget = null;
  const inp = $g('quickMemoSearch'); if(inp) inp.value = '';
  const res = $g('quickMemoSearchResults'); if(res) res.innerHTML = '';
  const form = $g('quickMemoForm'); if(form) form.style.display = 'none';
  const search = $g('quickMemoSearchArea'); if(search) search.style.display = 'block';
  const content = $g('quickMemoContent'); if(content) content.value = '';
  const due = $g('quickMemoDue'); if(due) due.value = '';
  m.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(function(){ if(inp) inp.focus(); }, 100);
}

function closeQuickMemoModal(){
  const m = $g('quickMemoModal'); if(m) m.style.display = 'none';
  document.body.style.overflow = '';
  _quickMemoTarget = null;
}

function onQuickMemoSearchInput(){
  if(_quickMemoSearchTimer) clearTimeout(_quickMemoSearchTimer);
  _quickMemoSearchTimer = setTimeout(_quickMemoDoSearch, 200);
}

async function _quickMemoDoSearch(){
  const q = ($g('quickMemoSearch').value || '').trim();
  const res = $g('quickMemoSearchResults');
  if(!res) return;
  if(q.length < 2){
    res.innerHTML = '<div style="color:#9ca3af;padding:10px;font-size:.82em;text-align:center">2자 이상 입력</div>';
    return;
  }
  res.innerHTML = '<div style="color:#9ca3af;padding:10px;font-size:.82em;text-align:center">검색 중...</div>';
  try{
    const r = await fetch('/api/admin-search?q=' + encodeURIComponent(q) + '&key=' + encodeURIComponent(KEY));
    const d = await r.json();
    /* Phase R4 (2026-05-05 사장님 보고: 검색 실패 fix):
     * admin-search API 는 'ok' 필드 없이 직접 {users, businesses, ...} 반환.
     * 'd.error' 만 체크. */
    if(d.error){ res.innerHTML = '<div style="color:#f04452;padding:10px;font-size:.82em">' + e(d.error) + '</div>'; return; }
    _renderQuickMemoResults(d.users || [], d.businesses || []);
  }catch(err){
    res.innerHTML = '<div style="color:#f04452;padding:10px;font-size:.82em">오류: ' + e(err.message) + '</div>';
  }
}

function _renderQuickMemoResults(users, businesses){
  const res = $g('quickMemoSearchResults');
  if(!res) return;
  if(!users.length && !businesses.length){
    res.innerHTML = '<div style="color:#9ca3af;padding:10px;font-size:.82em;text-align:center">검색 결과 없음</div>';
    return;
  }
  let html = '';
  if(users.length){
    html += '<div style="font-size:.72em;color:#8b95a1;font-weight:600;margin:6px 0 4px">👤 거래처 ('+users.length+')</div>';
    html += users.slice(0, 8).map(u =>
      '<div onclick="_quickMemoSelect(\'user\','+u.id+',\''+escAttr(u.real_name||u.name||'#'+u.id)+'\')" style="padding:8px 10px;border:1px solid #e5e8eb;border-radius:8px;margin-bottom:4px;cursor:pointer;background:#fff;display:flex;align-items:center;gap:8px;transition:background .12s" onmouseenter="this.style.background=\'#f0f9ff\'" onmouseleave="this.style.background=\'#fff\'">'
        + '<span style="font-size:1.1em">👤</span>'
        + '<div style="flex:1;min-width:0">'
          + '<div style="font-weight:600;font-size:.85em">' + e(u.real_name || u.name || '#'+u.id) + '</div>'
          + '<div style="font-size:.72em;color:#6b7280">' + e(u.phone || u.email || '') + '</div>'
        + '</div>'
      + '</div>'
    ).join('');
  }
  if(businesses.length){
    html += '<div style="font-size:.72em;color:#8b95a1;font-weight:600;margin:8px 0 4px">🏢 업체 ('+businesses.length+')</div>';
    html += businesses.slice(0, 8).map(b =>
      '<div onclick="_quickMemoSelect(\'business\','+b.id+',\''+escAttr(b.company_name||'#'+b.id)+'\')" style="padding:8px 10px;border:1px solid #e5e8eb;border-radius:8px;margin-bottom:4px;cursor:pointer;background:#fff;display:flex;align-items:center;gap:8px;transition:background .12s" onmouseenter="this.style.background=\'#f0fdf4\'" onmouseleave="this.style.background=\'#fff\'">'
        + '<span style="font-size:1.1em">🏢</span>'
        + '<div style="flex:1;min-width:0">'
          + '<div style="font-weight:600;font-size:.85em">' + e(b.company_name || '#'+b.id) + '</div>'
          + '<div style="font-size:.72em;color:#6b7280">' + e(b.business_number || '') + (b.ceo_name ? ' · ' + e(b.ceo_name) : '') + '</div>'
        + '</div>'
      + '</div>'
    ).join('');
  }
  res.innerHTML = html;
}

function _quickMemoSelect(type, id, name){
  _quickMemoTarget = { type: type, id: Number(id), name: String(name||'') };
  const tgt = $g('quickMemoTarget');
  if(tgt){
    const icon = type === 'business' ? '🏢' : '👤';
    tgt.innerHTML = icon + ' <span style="color:#1e40af">' + e(name) + '</span> 메모 추가';
  }
  $g('quickMemoSearchArea').style.display = 'none';
  $g('quickMemoForm').style.display = 'block';
  setTimeout(function(){ const c = $g('quickMemoContent'); if(c) c.focus(); }, 100);
}

function _quickMemoBackToSearch(){
  _quickMemoTarget = null;
  $g('quickMemoSearchArea').style.display = 'block';
  $g('quickMemoForm').style.display = 'none';
  setTimeout(function(){ const inp = $g('quickMemoSearch'); if(inp) inp.focus(); }, 100);
}

async function submitQuickMemo(){
  if(!_quickMemoTarget){ alert('대상이 선택되지 않았습니다'); return; }
  const content = ($g('quickMemoContent').value || '').trim();
  if(!content){ alert('메모 내용을 입력하세요'); return; }
  const memoType = $g('quickMemoType').value || '거래처 정보';
  const category = $g('quickMemoCategory').value || '';
  const due = $g('quickMemoDue').value || '';
  const btn = $g('quickMemoSubmitBtn');
  if(btn){ btn.disabled = true; btn.textContent = '저장 중...'; }
  try{
    const body = { memo_type: memoType, content: content };
    if(category) body.category = category;
    if(due) body.due_date = due;
    if(_quickMemoTarget.type === 'business') body.target_business_id = _quickMemoTarget.id;
    else body.target_user_id = _quickMemoTarget.id;
    const r = await fetch('/api/memos?key=' + encodeURIComponent(KEY), {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
    const d = await r.json();
    if(btn){ btn.disabled = false; btn.textContent = '＋ 메모 추가'; }
    if(!d.ok){ alert('저장 실패: ' + (d.error || 'unknown')); return; }
    /* toast + 모달 닫기 */
    if(typeof showAdminToast === 'function') showAdminToast('✅ ' + _quickMemoTarget.name + ' 메모 추가됨');
    else alert('✅ 메모 추가됨');
    closeQuickMemoModal();
    /* 거래처 dashboard 가 같은 user_id 면 reload */
    if(_quickMemoTarget.type === 'user' && typeof _cdCurrentUserId !== 'undefined' && _cdCurrentUserId === _quickMemoTarget.id && typeof _loadCdAllMemos === 'function'){
      _loadCdAllMemos(_quickMemoTarget.id);
    }
  }catch(err){
    if(btn){ btn.disabled = false; btn.textContent = '＋ 메모 추가'; }
    alert('오류: ' + err.message);
  }
}

/* Phase M3 (2026-05-05 사장님 명령): 휴지통 일괄 액션 — 체크박스 + 전체 선택 + 일괄 복원·삭제 */
var _trashSelectedIds = {};

function trashToggleSelect(id, checked){
  if(checked) _trashSelectedIds[id] = true;
  else delete _trashSelectedIds[id];
  _renderTrashSelectionUI();
  const card = document.querySelector('[data-trash-id="' + id + '"]');
  if(card) card.style.background = checked ? '#fef3c7' : '';
}

function trashToggleAll(checked){
  const cards = document.querySelectorAll('[data-trash-id]');
  cards.forEach(function(c){
    const id = parseInt(c.dataset.trashId);
    if(!id) return;
    if(checked) _trashSelectedIds[id] = true;
    else delete _trashSelectedIds[id];
    const chk = c.querySelector('input[type="checkbox"]');
    if(chk) chk.checked = checked;
    c.style.background = checked ? '#fef3c7' : '';
  });
  _renderTrashSelectionUI();
}

function _renderTrashSelectionUI(){
  const ids = Object.keys(_trashSelectedIds);
  const n = ids.length;
  const cnt = $g('trashSelectedCount'); if(cnt) cnt.textContent = '선택 ' + n + '건';
  const restoreBtn = $g('trashBulkRestoreBtn');
  const purgeBtn = $g('trashBulkPurgeBtn');
  if(restoreBtn){ restoreBtn.disabled = n===0; restoreBtn.style.opacity = n===0 ? '0.5' : '1'; }
  if(purgeBtn){ purgeBtn.disabled = n===0; purgeBtn.style.opacity = n===0 ? '0.5' : '1'; }
  const total = document.querySelectorAll('[data-trash-id]').length;
  const all = $g('trashSelectAll');
  if(all && all.checked !== undefined) all.checked = (n > 0 && n === total);
}

async function bulkRestoreTrash(){
  const ids = Object.keys(_trashSelectedIds).map(Number).filter(Boolean);
  if(!ids.length){ alert('선택된 항목이 없습니다.'); return; }
  if(!confirm(ids.length + '건 일괄 복원할까요?')) return;
  const results = await Promise.all(ids.map(function(id){
    return fetch('/api/memos?action=restore&id=' + id + '&key=' + encodeURIComponent(KEY), { method:'POST' })
      .then(function(r){ return r.json(); })
      .catch(function(e){ return { ok:false, error: e && e.message }; });
  }));
  const ok = results.filter(function(r){ return r && r.ok; }).length;
  const fail = results.length - ok;
  alert('복원 완료: ' + ok + '건' + (fail ? ' (실패 ' + fail + '건)' : ''));
  _trashSelectedIds = {};
  loadTrash();
  if(typeof _cdCurrentUserId !== 'undefined' && _cdCurrentUserId && typeof _loadCdAllMemos === 'function') _loadCdAllMemos(_cdCurrentUserId);
}

async function bulkPurgeTrash(){
  const ids = Object.keys(_trashSelectedIds).map(Number).filter(Boolean);
  if(!ids.length){ alert('선택된 항목이 없습니다.'); return; }
  if(!confirm(ids.length + '건 영구 삭제할까요?\n\n⚠️ 되돌릴 수 없습니다.')) return;
  const results = await Promise.all(ids.map(function(id){
    return fetch('/api/memos?action=purge&id=' + id + '&key=' + encodeURIComponent(KEY), { method:'POST' })
      .then(function(r){ return r.json(); })
      .catch(function(e){ return { ok:false, error: e && e.message }; });
  }));
  const ok = results.filter(function(r){ return r && r.ok; }).length;
  const fail = results.length - ok;
  alert('영구 삭제: ' + ok + '건' + (fail ? ' (실패 ' + fail + '건)' : ''));
  _trashSelectedIds = {};
  loadTrash();
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
      /* Phase M3 (2026-05-05 사장님 명령): 카드별 체크박스 추가 */
      const checked = _trashSelectedIds[m.id] ? 'checked' : '';
      const cardBg = _trashSelectedIds[m.id] ? '#fef3c7' : '';
      return '<div data-trash-id="' + m.id + '" style="padding:10px 0;border-bottom:1px dashed #e5e8eb;background:' + cardBg + '">'
        + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;font-size:.85em">'
          + '<input type="checkbox" ' + checked + ' onchange="trashToggleSelect(' + m.id + ',this.checked)" style="width:14px;height:14px;cursor:pointer;accent-color:#3182f6;flex-shrink:0">'
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
    /* Phase M3: 일괄 선택 UI 초기화 (카드 새로 그렸으니 카운트·버튼·전체체크 동기화) */
    _renderTrashSelectionUI();
  }catch(err){
    list.innerHTML = '<div style="color:#f04452;padding:14px">오류: ' + e(err.message) + '</div>';
  }
}

async function restoreMemo(id){
  if(!confirm('이 메모를 복원할까요?')) return;
  try{
    /* Phase #3 적용 (2026-05-06): type-safe wrapper 사용 */
    let d;
    if(window.__memoActions && window.__memoActions.restoreMemo){
      d = await window.__memoActions.restoreMemo(id);
    } else {
      const r = await fetch('/api/memos?action=restore&id=' + id + '&key=' + encodeURIComponent(KEY), { method: 'POST' });
      d = await r.json();
    }
    if(!d.ok){ alert('복원 실패: ' + (d.error || 'unknown')); return; }
    loadTrash();
    if(typeof _cdCurrentUserId !== 'undefined' && _cdCurrentUserId && typeof _loadCdAllMemos === 'function') _loadCdAllMemos(_cdCurrentUserId);
  }catch(err){ alert('오류: ' + err.message); }
}

async function purgeMemo(id){
  if(!confirm('이 메모를 영구 삭제할까요?\n\n⚠️ 되돌릴 수 없습니다.\n(manager+ 권한 필요)')) return;
  try{
    /* Phase #3 + #10 적용 (2026-05-06): type-safe wrapper + RBAC manager 가드 */
    let d;
    if(window.__memoActions && window.__memoActions.purgeMemo){
      d = await window.__memoActions.purgeMemo(id);
    } else {
      const r = await fetch('/api/memos?action=purge&id=' + id + '&key=' + encodeURIComponent(KEY), { method: 'POST' });
      d = await r.json();
    }
    if(!d.ok){
      if(d.error && d.error.indexOf('권한') >= 0){
        alert('manager 권한이 필요합니다. 사장님께 권한 부여 요청하세요.');
      } else {
        alert('삭제 실패: ' + (d.error || 'unknown'));
      }
      return;
    }
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

/* ===== 메모 빡센 세팅 commit 4 — CSV export + Ctrl+M 단축키 ===== */

/* 현재 거래처 메모를 CSV 로 내려받기 (필터된 결과 그대로 + 엑셀에서 한글 깨짐 방지 BOM)
   주의: admin.js 에 cdExportCsv 다른 함수(위하고 export) 가 이미 있어서 cdExportMemoCsv 이름 사용 */
function cdExportMemoCsv(){
  if(!_cdCurrentUserId){ alert('거래처가 선택되지 않았습니다'); return; }
  let arr = _cdMemosCache.slice();
  /* 현재 필터 적용 */
  const cat = _cdMemoCategory;
  if(cat !== 'all'){
    if(cat === '할 일') arr = arr.filter(m=>['할 일','확인필요','고객요청'].includes(m.memo_type));
    else if(cat === '거래처 정보') arr = arr.filter(m=>['거래처 정보','사실메모','담당자판단','주의사항','참고'].includes(m.memo_type));
    else if(cat === '완료') arr = arr.filter(m=>['완료','완료처리'].includes(m.memo_type));
    else arr = arr.filter(m=>m.category === cat);
  }
  if(_cdActiveTag) arr = arr.filter(m=>Array.isArray(m.tags)&&m.tags.indexOf(_cdActiveTag)>=0);
  if(!arr.length){ alert('내보낼 메모가 없습니다'); return; }

  /* CSV 안전 escape — RFC4180 (큰따옴표는 두 번, 셀에 콤마/줄바꿈/큰따옴표 있으면 큰따옴표로 감쌈) */
  const csvCell = v => {
    const s = String(v == null ? '' : v);
    if(s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0){
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const headers = ['ID','생성','수정','타입','카테고리','내용','기한','#태그','첨부','작성자'];
  const rows = arr.map(m => {
    const tags = Array.isArray(m.tags) ? m.tags.map(t=>'#'+t).join(' ') : '';
    const attach = Array.isArray(m.attachments)
      ? m.attachments.map(a=>String(a.name||a.key||'')).join(' | ')
      : '';
    return [
      m.id,
      m.created_at || '',
      m.updated_at || '',
      m.memo_type_display || m.memo_type || '',
      m.category || '',
      m.content || '',
      m.due_date || '',
      tags,
      attach,
      m.author_name || '',
    ].map(csvCell).join(',');
  });
  const csv = headers.map(csvCell).join(',') + '\n' + rows.join('\n');
  /* UTF-8 BOM 포함 (엑셀에서 한글 깨짐 방지) */
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const cname = ($g('cdName')?.textContent || ('user'+_cdCurrentUserId)).trim().replace(/[\\\/:*?"<>|]/g,'_').slice(0,80);
  const today = new Date(Date.now()+9*60*60*1000).toISOString().slice(0,10);
  const filename = '거래처메모_' + cname + '_' + today + '.csv';
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  setTimeout(()=>URL.revokeObjectURL(link.href), 1000);
}

/* ===== 메모 댓글 (사장님 명령 2026-04-30 후속 — memo_comments 테이블) =====
 * cdToggleMemoComments(memoId) — 메모 카드의 💬 댓글 버튼 클릭 시 영역 펼침/접힘 + 로드 */
async function cdToggleMemoComments(memoId){
  const box = document.getElementById('cdMemoComments_'+memoId);
  if(!box) return;
  if(box.style.display === 'none' || !box.style.display){
    box.style.display = 'block';
    box.innerHTML = '<div style="color:#8b95a1;font-size:.78em">불러오는 중...</div>';
    try{
      const r = await fetch('/api/memo-comments?memo_id='+memoId+'&key='+encodeURIComponent(KEY));
      const d = await r.json();
      if(!d.ok){ box.innerHTML = '<div style="color:#f04452">'+e(d.error||'오류')+'</div>'; return; }
      _renderMemoComments(memoId, d.comments||[]);
    }catch(err){ box.innerHTML = '<div style="color:#f04452">오류: '+e(err.message)+'</div>'; }
  } else {
    box.style.display = 'none';
  }
}

function _renderMemoComments(memoId, comments){
  const box = document.getElementById('cdMemoComments_'+memoId);
  if(!box) return;
  let html = '';
  if(comments.length){
    html += comments.map(c => {
      const t = (c.created_at||'').substring(0, 16).replace('T',' ');
      const by = c.author_name || '';
      const content = e(c.content||'').replace(/\n/g,'<br>');
      return '<div style="padding:5px 0;border-bottom:1px dotted #e5e8eb;font-size:.82em">'
        + '<div style="display:flex;justify-content:space-between;font-size:.86em;color:#6b7280;margin-bottom:2px">'
        +   '<span><b>'+e(by)+'</b> · '+e(t)+'</span>'
        +   '<button onclick="cdDeleteMemoComment('+c.id+','+memoId+')" style="background:none;border:none;color:#f04452;cursor:pointer;font-family:inherit;font-size:.86em;padding:0 4px">×</button>'
        + '</div>'
        + '<div style="color:#191f28">'+content+'</div>'
      + '</div>';
    }).join('');
  } else {
    html += '<div style="color:#9ca3af;font-size:.78em;padding:4px 0">아직 댓글 없음</div>';
  }
  /* 입력 폼 */
  html += '<div style="display:flex;gap:5px;margin-top:6px">'
    + '<input type="text" id="cdMemoCommentInput_'+memoId+'" placeholder="↳ 답글" style="flex:1;padding:5px 8px;border:1px solid #e5e8eb;border-radius:5px;font-size:.82em;font-family:inherit;outline:none" onkeydown="if(event.key===\'Enter\'){event.preventDefault();cdSubmitMemoComment('+memoId+')}">'
    + '<button onclick="cdSubmitMemoComment('+memoId+')" style="background:#3182f6;color:#fff;border:none;padding:5px 11px;border-radius:5px;font-size:.78em;font-weight:600;cursor:pointer;font-family:inherit">↳</button>'
  + '</div>';
  box.innerHTML = html;
}

async function cdSubmitMemoComment(memoId){
  const input = document.getElementById('cdMemoCommentInput_'+memoId);
  if(!input) return;
  const content = (input.value||'').trim();
  if(!content){ input.focus(); return; }
  try{
    const r = await fetch('/api/memo-comments?key='+encodeURIComponent(KEY), {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ memo_id: memoId, content })
    });
    const d = await r.json();
    if(!d.ok){ alert('댓글 추가 실패: '+(d.error||'unknown')); return; }
    /* reload comments only */
    const r2 = await fetch('/api/memo-comments?memo_id='+memoId+'&key='+encodeURIComponent(KEY));
    const d2 = await r2.json();
    _renderMemoComments(memoId, d2.comments||[]);
  }catch(err){ alert('오류: '+err.message); }
}

async function cdDeleteMemoComment(commentId, memoId){
  if(!confirm('이 댓글을 삭제할까요?')) return;
  try{
    const r = await fetch('/api/memo-comments?id='+commentId+'&key='+encodeURIComponent(KEY), { method: 'DELETE' });
    const d = await r.json();
    if(!d.ok){ alert('삭제 실패: '+(d.error||'unknown')); return; }
    /* reload */
    const r2 = await fetch('/api/memo-comments?memo_id='+memoId+'&key='+encodeURIComponent(KEY));
    const d2 = await r2.json();
    _renderMemoComments(memoId, d2.comments||[]);
  }catch(err){ alert('오류: '+err.message); }
}

/* 메모 별창 띄우기 (사장님 명령 2026-04-30 — A 방식)
   거래처 dashboard 가 열린 상태에서 "🪟 별창" 클릭 → /memo-window.html 새 탭.
   사장님은 카톡 상담방 / 위하고 / admin 보면서 별창에 메모 동시 작성. */
function cdOpenMemoWindow(){
  if(!_cdCurrentUserId){ alert('거래처가 선택되지 않았습니다'); return; }
  const url = '/memo-window.html?user_id=' + encodeURIComponent(_cdCurrentUserId)
    + '&key=' + encodeURIComponent(KEY || '');
  /* 새 탭 열기 (별도 윈도우 size 지정 시 사장님이 다른 탭 모니터에 옮겨놓고 사용 가능) */
  window.open(url, '_blank', 'noopener');
}

/* Ctrl+M (또는 Cmd+M) 단축키 — 거래처 dashboard 가 열려있으면 메모 입력칸 포커스
   거래처 dashboard 가 안 열려있으면 통합 검색칸 포커스 (사용자 → 메모 흐름) */
(function _bindMemoShortcut(){
  if(window._cdMemoShortcutBound) return;
  window._cdMemoShortcutBound = true;
  document.addEventListener('keydown', function(e){
    /* Ctrl+M / Cmd+M, 단 input/textarea/contenteditable 안에서는 무시 */
    if(!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'm') return;
    const ae = document.activeElement;
    const tag = (ae && ae.tagName || '').toLowerCase();
    if(tag === 'input' || tag === 'textarea' || (ae && ae.isContentEditable)) return;
    e.preventDefault();
    /* 1. dashboard 열렸나? 메모 입력칸 포커스 */
    const dash = $g('custDashModal');
    if(dash && dash.style.display !== 'none'){
      const ta = $g('cdMemoNewContent');
      if(ta){
        try{ ta.focus(); ta.scrollIntoView({behavior:'smooth', block:'center'}); }catch(_){}
        return;
      }
    }
    /* 2. dashboard 안 열림 → 통합 검색칸 포커스 (거래처 찾기 → 클릭으로 dashboard 열기 흐름) */
    const search = $g('clientSearchInput');
    if(search){
      try{ search.focus(); search.scrollIntoView({behavior:'smooth', block:'center'}); }catch(_){}
      /* 사용자에게 안내 */
      const placeholder = search.placeholder;
      search.placeholder = '💡 거래처 이름·#태그 검색 후 클릭 → 메모 추가';
      setTimeout(()=>{ if(search.placeholder !== placeholder) search.placeholder = placeholder; }, 3000);
    }
  });
})();
