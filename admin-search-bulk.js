/* ===== admin-search-bulk.js — 전역 검색 + 단체발송 + 통합 검색 드롭다운 (쪼개기 Step 4) =====
 * 사장님 명령 (2026-04-30): 처음 계획 통째 — admin.js 7090줄 Step 4 분리.
 *
 * 분리 범위 (admin.js → admin-search-bulk.js, 약 500줄):
 *  - 전역 검색 (searchModal): openSearch / onSearchInput / doSearch / closeSearchModal
 *                             jumpToUser / jumpToRoom / jumpToBusiness / jumpToDocument / jumpToConversation
 *  - 단체발송: openBulkSend / closeBulkSend / submitBulkSend
 *              + _bulkAddFiles / _bulkRemoveAttachment / _bulkRenderAttachments
 *              + _bulkLoadRooms / _bulkRender / _bulkToggle / _bulkUpdateCount / _bulkSelect / _bulkSelectNone
 *  - 통합 검색 (clientSearchInput 상단 탭): onClientSearchInput / clearClientSearch / _doClientSearch
 *              + _renderClientSearchDropdown / _fetchSearchDropdown / _searchPickUser / _searchPickMemo
 *              + document click listener (드롭다운 close)
 *  - 상태: searchTimer / _bulkRooms / _bulkSelected / _bulkAttachments
 *          _clientSearchT / _searchDropdownT / _searchDropdownLastQ
 *
 * 의존 (cross-script via classic script global env):
 *  - admin.js: KEY, e, escAttr, $g, tab, fileIconFor, openRoom
 *  - admin-customer-dash.js: openCustomerDashboard
 *  - admin-business-tab.js: setClientTabMode, _clientTabMode, _renderBizList
 *
 * 노출 (window 자동 — function 선언 + var 사용)
 *
 * 로드 순서 (admin.html / staff.html):
 *   admin.js → admin-memos.js → admin-customer-dash.js → admin-business-tab.js → admin-search-bulk.js */

/* ===== 전역 검색 ===== */
var searchTimer=null;
function openSearch(){
  $g('searchModal').style.display='flex';
  setTimeout(function(){$g('searchInput').focus()},100);
}
function onSearchInput(){
  if(searchTimer)clearTimeout(searchTimer);
  searchTimer=setTimeout(doSearch,300);
}
async function doSearch(){
  const q=$g('searchInput').value.trim();
  const el=$g('searchResults');
  if(q.length<2){el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.85em;padding:40px 0">2자 이상 입력하세요</div>';return}
  el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.85em;padding:40px 0">검색 중...</div>';
  try{
    const r=await fetch('/api/admin-search?key='+encodeURIComponent(KEY)+'&q='+encodeURIComponent(q));
    const d=await r.json();
    if(d.error){el.innerHTML='<div style="color:#f04452;font-size:.85em;padding:20px 0">오류: '+e(d.error)+'</div>';return}
    let html='';
    const totalN=(d.users||[]).length+(d.conversations||[]).length+(d.rooms||[]).length+(d.room_messages||[]).length;
    if(totalN===0){
      el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.85em;padding:40px 0">"'+e(q)+'"에 대한 검색 결과가 없습니다</div>';return;
    }
    if(d.users&&d.users.length){
      html+='<div class="sr-group"><div class="sr-title">👤 사용자 '+d.users.length+'명</div>';
      html+=d.users.map(function(u){
        const nm=u.real_name||u.name||'이름없음';
        const badge=u.is_admin?' <span style="background:#8b6914;color:#fff;font-size:.65em;padding:1px 5px;border-radius:4px;font-weight:700">👑</span>':'';
        const st=u.approval_status||'pending';
        return '<div class="sr-item" onclick="jumpToUser('+u.id+')"><b>'+e(nm)+'</b>'+badge+'<div class="sr-sub">'+e(u.email||'')+' · '+e(u.phone||'')+' · '+e(st)+'</div></div>';
      }).join('');
      html+='</div>';
    }
    if(d.rooms&&d.rooms.length){
      html+='<div class="sr-group"><div class="sr-title">💬 상담방 '+d.rooms.length+'개</div>';
      html+=d.rooms.map(function(r){
        const st=r.status==='closed'?' <span style="color:#8b95a1;font-size:.72em">(종료)</span>':'';
        return '<div class="sr-item" onclick="jumpToRoom(\''+e(r.id).replace(/\'/g,'')+'\')"><b>'+e(r.name||'상담방')+'</b>'+st+'<div class="sr-sub">ID: '+e(r.id)+' · 메시지 '+(r.msg_count||0)+'건 · '+e(r.created_at||'')+'</div></div>';
      }).join('');
      html+='</div>';
    }
    if(d.room_messages&&d.room_messages.length){
      html+='<div class="sr-group"><div class="sr-title">📨 상담방 메시지 '+d.room_messages.length+'건</div>';
      html+=d.room_messages.map(function(m){
        const who=m.role==='human_advisor'?'👨‍💼 세무사':m.role==='assistant'?'🤖 AI':'👤 '+(m.real_name||m.name||'사용자');
        const snip=String(m.content||'').slice(0,120);
        return '<div class="sr-item" onclick="jumpToRoom(\''+e(m.room_id).replace(/\'/g,'')+'\')"><b>'+e(m.room_name||m.room_id)+'</b> · '+who+'<div class="sr-sub">'+e(snip)+(m.content&&m.content.length>120?'…':'')+'</div><div class="sr-sub" style="color:#c6cdd2">'+e(m.created_at||'')+'</div></div>';
      }).join('');
      html+='</div>';
    }
    if(d.conversations&&d.conversations.length){
      html+='<div class="sr-group"><div class="sr-title">💭 일반 대화 '+d.conversations.length+'건</div>';
      html+=d.conversations.map(function(m){
        const who=m.role==='assistant'?'🤖 AI'+(m.confidence?'['+e(m.confidence)+']':''):'👤 '+(m.real_name||m.name||'사용자');
        const snip=String(m.content||'').slice(0,120);
        return '<div class="sr-item" onclick="jumpToConversation(\''+e(m.session_id).replace(/\'/g,'')+'\')">'+who+'<div class="sr-sub">'+e(snip)+(m.content&&m.content.length>120?'…':'')+'</div><div class="sr-sub" style="color:#c6cdd2">'+e(m.created_at||'')+'</div></div>';
      }).join('');
      html+='</div>';
    }
    /* 메모 — 메모가 박힌 위치(상담방/사람/사업장) 컨텍스트 표시 + 점프 */
    if(d.memos&&d.memos.length){
      html+='<div class="sr-group"><div class="sr-title">📝 메모 '+d.memos.length+'건</div>';
      html+=d.memos.map(function(m){
        try{
          let where='', jumpFn='';
          if(m.target_business_id){
            where='[🏢 '+e(m.target_business_name||'#'+m.target_business_id)+']';
            jumpFn='location.href=\'/business.html?id='+m.target_business_id+'&key=\'+encodeURIComponent(KEY)';
          } else if(m.target_user_id){
            where='[👤 '+e(m.target_user_real_name||m.target_user_name||'#'+m.target_user_id)+']';
            jumpFn='closeSearchModal();openCustomerDashboard('+m.target_user_id+')';
          } else if(m.room_id && m.room_id !== '__none__'){
            where='[💬 '+e(m.room_name||m.room_id)+']';
            jumpFn='jumpToRoom(\''+e(m.room_id).replace(/\'/g,'')+'\')';
          } else {
            where='[📌 분류 없음]';
            jumpFn='void(0)';
          }
          const tp=m.memo_type?' <span style="background:#eef2ff;color:#3730a3;font-size:.7em;padding:1px 6px;border-radius:4px;margin-left:4px">'+e(m.memo_type)+'</span>':'';
          const due=m.due_date?' <span style="color:#dc2626;font-size:.72em;margin-left:4px">📅 '+e(m.due_date)+'</span>':'';
          const by=m.author_name?' · '+e(m.author_name):'';
          const snip=String(m.content||'').slice(0,140);
          return '<div class="sr-item" onclick="'+jumpFn+'"><b>'+where+'</b>'+tp+due+'<div class="sr-sub">'+e(snip)+(m.content&&m.content.length>140?'…':'')+'</div><div class="sr-sub" style="color:#c6cdd2">'+e((m.created_at||'').slice(0,16))+by+'</div></div>';
        }catch(_){return ''}
      }).join('');
      html+='</div>';
    }
    /* 사업장 — 회사명·사업자번호·대표 매칭 → business.html 점프 */
    if(d.businesses&&d.businesses.length){
      html+='<div class="sr-group"><div class="sr-title">🏢 사업장 '+d.businesses.length+'개</div>';
      html+=d.businesses.map(function(b){
        try{
          const meta=[
            b.business_number?'#'+b.business_number:'',
            b.ceo_name?'대표 '+b.ceo_name:'',
            b.company_form||'',
            b.business_category||'',
            b.industry||''
          ].filter(Boolean).join(' · ');
          const stClosed=b.status==='closed'?' <span style="color:#9ca3af;font-size:.72em">(종료)</span>':'';
          return '<div class="sr-item" onclick="jumpToBusiness('+b.id+')"><b>'+e(b.company_name||'#'+b.id)+'</b>'+stClosed+'<div class="sr-sub">'+e(meta)+'</div></div>';
        }catch(_){return ''}
      }).join('');
      html+='</div>';
    }
    /* 문서 — vendor·category·note 매칭 → 문서 상세 모달 (admin-documents 의 모달) */
    if(d.documents&&d.documents.length){
      const TY={receipt:'영수증',lease:'임대차',payroll:'근로',freelancer_payment:'프리랜서',tax_invoice:'세금계산서',insurance:'보험',utility:'공과금',property_tax:'지방세',bank_stmt:'은행내역',business_reg:'사업자등록증',identity:'신분증',contract:'계약서',other:'기타'};
      const ST={pending:'⏳',approved:'✅',rejected:'❌'};
      html+='<div class="sr-group"><div class="sr-title">📋 문서 '+d.documents.length+'건</div>';
      html+=d.documents.map(function(doc){
        try{
          const dt=(doc.created_at||'').slice(0,10);
          const tp=TY[doc.doc_type]||doc.doc_type||'문서';
          const st=ST[doc.status]||'';
          const v=doc.vendor||doc.real_name||doc.name||'';
          const amt=doc.amount?(Number(doc.amount).toLocaleString('ko-KR')+'원'):'';
          const cat=doc.category?' · '+e(doc.category):'';
          return '<div class="sr-item" onclick="jumpToDocument('+doc.id+')"><b>'+st+' '+e(tp)+'</b> '+e(dt)+(v?' · '+e(v):'')+(amt?' · '+e(amt):'')+cat+'</div>';
        }catch(_){return ''}
      }).join('');
      html+='</div>';
    }
    el.innerHTML=html;
  }catch(err){el.innerHTML='<div style="color:#f04452;font-size:.85em;padding:20px 0">오류: '+e(err.message)+'</div>'}
}
/* 사업장 점프 — business.html 단독 페이지로 이동 */
function jumpToBusiness(bizId){
  closeSearchModal();
  try{ sessionStorage.setItem('ADMIN_KEY', KEY||''); }catch(_){}
  location.href='/business.html?id='+encodeURIComponent(bizId)+'&key='+encodeURIComponent(KEY||'');
}
/* 문서 점프 — 기존 문서 상세 모달이 있으면 호출, 없으면 문서 탭으로 */
function jumpToDocument(docId){
  closeSearchModal();
  if(typeof openDocumentDetail==='function'){
    openDocumentDetail(docId);
  } else if(typeof openDocumentModal==='function'){
    openDocumentModal(docId);
  } else {
    tab('docs');
    setTimeout(function(){
      const card=document.querySelector('[data-doc-id="'+docId+'"]');
      if(card){card.scrollIntoView({behavior:'smooth',block:'center'});card.style.outline='3px solid #3182f6';setTimeout(function(){card.style.outline=''},2000)}
    },400);
  }
}
function closeSearchModal(){$g('searchModal').style.display='none'}
function jumpToUser(id){
  closeSearchModal();
  tab('users');
  setTimeout(function(){
    const card=document.querySelector('[data-user-id="'+id+'"]');
    if(card){card.scrollIntoView({behavior:'smooth',block:'center'});card.style.outline='3px solid #3182f6';setTimeout(function(){card.style.outline=''},2000)}
  },400);
}
function jumpToRoom(roomId){
  closeSearchModal();
  tab('rooms');
  setTimeout(function(){if(typeof openRoom==='function')openRoom(roomId)},300);
}
function jumpToConversation(sessionId){
  closeSearchModal();
  tab('chat');
  /* 대화 탭은 세션 단위로 열기 로직이 있으면 붙일 수 있음. 일단 탭만 전환 */
}
/* ===== 📢 단체발송 — 여러 상담방에 한 번에 메시지 발송 =====
   안전장치: 2단계 confirm, closed 방 자동 제외, 최대 200개 제한, 기본 선택 없음 */
var _bulkRooms=[];
var _bulkSelected=new Set();
/* 첨부 대기열 — 업로드 전엔 file 보관, 업로드 후 url·name·size 업데이트 */
var _bulkAttachments=[]; /* [{type:'image'|'file', file, url?, name, size}] */
async function openBulkSend(){
  const m=$g('bulkSendModal');if(!m)return;
  m.style.display='flex';
  document.body.style.overflow='hidden';
  _bulkSelected=new Set();
  _bulkAttachments=[];
  if($g('bulkContent'))$g('bulkContent').value='';
  if($g('bulkCount'))$g('bulkCount').textContent='0';
  _bulkRenderAttachments();
  await _bulkLoadRooms();
}
function closeBulkSend(){
  const m=$g('bulkSendModal');if(m)m.style.display='none';
  document.body.style.overflow='';
  /* 업로드된 임시 URL 은 서버에 이미 저장된 파일이라 별도 cleanup 불필요,
     Blob URL 프리뷰만 revoke */
  for(const a of _bulkAttachments){if(a._previewUrl){try{URL.revokeObjectURL(a._previewUrl)}catch(_){}} }
  _bulkAttachments=[];
}

/* 이미지/파일 첨부 — 선택 즉시 업로드해서 서버 URL 확보 (단체발송 시점엔 URL 만 사용) */
async function _bulkAddFiles(fileList, type){
  const files=Array.from(fileList||[]);
  if(!files.length)return;
  for(const f of files){
    if(_bulkAttachments.length>=10){alert('첨부는 최대 10개까지');break}
    /* 이미지 제한 10MB, 파일 100MB — upload-image/upload-file 제약 */
    if(type==='image' && f.size>10*1024*1024){alert('['+f.name+'] 이미지는 10MB 이하');continue}
    if(type==='file' && f.size>100*1024*1024){alert('['+f.name+'] 파일은 100MB 이하 (대용량은 상담방 직접 업로드 이용)');continue}
    const entry={type, file:f, name:f.name, size:f.size, status:'uploading'};
    if(type==='image')entry._previewUrl=URL.createObjectURL(f);
    _bulkAttachments.push(entry);
    _bulkRenderAttachments();
    /* 백그라운드 업로드 */
    (async()=>{
      try{
        const fd=new FormData();fd.append('file',f);
        const ep=type==='image'?'/api/upload-image':'/api/upload-file';
        const r=await fetch(ep+'?key='+encodeURIComponent(KEY),{method:'POST',body:fd});
        const d=await r.json();
        if(!d.ok){entry.status='failed';entry._error=d.error||'업로드 실패'}
        else{entry.url=d.url;entry.status='ready'}
      }catch(err){entry.status='failed';entry._error=err.message}
      _bulkRenderAttachments();
    })();
  }
}
function _bulkRemoveAttachment(idx){
  const a=_bulkAttachments[idx];
  if(a && a._previewUrl){try{URL.revokeObjectURL(a._previewUrl)}catch(_){}}
  _bulkAttachments.splice(idx,1);
  _bulkRenderAttachments();
}
function _bulkRenderAttachments(){
  const el=$g('bulkAttachPreview');if(!el)return;
  if(!_bulkAttachments.length){el.style.display='none';return}
  el.style.display='flex';
  el.innerHTML=_bulkAttachments.map(function(a,i){
    let body='';
    if(a.type==='image'){
      const src=a._previewUrl||a.url||'';
      body='<img src="'+escAttr(src)+'" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid #e5e8eb;display:block">';
    } else {
      body='<div style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;background:#f2f4f6;border:1px solid #e5e8eb;border-radius:6px;font-size:1.4em">'+(typeof fileIconFor==='function'?fileIconFor(a.name||''):'📄')+'</div>';
    }
    let status='';
    if(a.status==='uploading')status='<div style="position:absolute;inset:0;background:rgba(0,0,0,.45);color:#fff;font-size:.62em;display:flex;align-items:center;justify-content:center;border-radius:6px">업로드중...</div>';
    else if(a.status==='failed')status='<div style="position:absolute;inset:0;background:rgba(220,38,38,.7);color:#fff;font-size:.62em;display:flex;align-items:center;justify-content:center;border-radius:6px" title="'+escAttr(a._error||'')+'">실패</div>';
    const label='<div style="font-size:.7em;color:#374151;max-width:64px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;margin-top:2px">'+e(a.name||'')+'</div>';
    return '<div style="position:relative;width:64px;flex-shrink:0"><div style="position:relative">'+body+status
      +'<button onclick="_bulkRemoveAttachment('+i+')" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;background:#000;color:#fff;border:none;border-radius:50%;font-size:.7em;cursor:pointer;line-height:1;padding:0;display:flex;align-items:center;justify-content:center" aria-label="제거">×</button>'
      +'</div>'+label+'</div>';
  }).join('');
}
async function _bulkLoadRooms(){
  const list=$g('bulkRoomList');if(!list)return;
  list.innerHTML='<div style="text-align:center;color:#8b95a1;padding:30px 0;font-size:.88em">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY));
    const d=await r.json();
    _bulkRooms=(d.rooms||[]).filter(rm=>rm.status==='active');
    _bulkRender();
  }catch(err){list.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(err.message)+'</div>'}
}
function _bulkRender(){
  const list=$g('bulkRoomList');if(!list)return;
  if(!_bulkRooms.length){
    list.innerHTML='<div style="text-align:center;color:#8b95a1;padding:30px 0;font-size:.88em">active 상담방이 없습니다</div>';
    return;
  }
  /* 우선순위 그룹핑 */
  const priOrder=[1,2,3,0];
  const priLabels={1:'🔴 1순위',2:'🟡 2순위',3:'🟢 3순위',0:'⚪ 미분류'};
  const priColors={1:'#dc2626',2:'#b45309',3:'#059669',0:'#6b7280'};
  const groups={1:[],2:[],3:[],0:[]};
  for(const rm of _bulkRooms){
    const p=Number(rm.priority||0);
    groups[p===1||p===2||p===3?p:0].push(rm);
  }
  let html='';
  for(const p of priOrder){
    const arr=groups[p];if(!arr.length)continue;
    const c=priColors[p];
    html+='<div style="margin:8px 0 4px;font-size:.76em;font-weight:700;color:'+c+';border-bottom:1px solid '+c+';padding-bottom:3px">'+priLabels[p]+' <span style="font-weight:500;color:#6b7280">('+arr.length+')</span></div>';
    html+=arr.map(rm=>{
      const checked=_bulkSelected.has(rm.id)?'checked':'';
      const customer=rm.first_member_name||rm.name||rm.id;
      return '<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid #f2f4f6;cursor:pointer;font-size:.88em">'
        +'<input type="checkbox" data-room-id="'+escAttr(rm.id)+'" '+checked+' onchange="_bulkToggle(\''+escAttr(rm.id)+'\',this.checked)" style="width:16px;height:16px;cursor:pointer;accent-color:#10b981">'
        +'<span style="flex:1">'+e(customer)+(rm.name&&rm.name!==customer?' <span style="color:#8b95a1;font-size:.82em">'+e(rm.name)+'</span>':'')+'</span>'
        +'</label>';
    }).join('');
  }
  list.innerHTML=html;
  _bulkUpdateCount();
}
function _bulkToggle(roomId, on){
  if(on)_bulkSelected.add(roomId); else _bulkSelected.delete(roomId);
  _bulkUpdateCount();
}
function _bulkUpdateCount(){
  const el=$g('bulkCount');if(el)el.textContent=String(_bulkSelected.size);
}
function _bulkSelect(filter){
  /* filter: 'all' | 1 | 2 | 3 | 'none' — 해당 그룹 전부 선택 (추가) */
  for(const rm of _bulkRooms){
    const p=Number(rm.priority||0);
    if(filter==='all')_bulkSelected.add(rm.id);
    else if(filter==='none' && p===0)_bulkSelected.add(rm.id);
    else if(typeof filter==='number' && p===filter)_bulkSelected.add(rm.id);
  }
  _bulkRender();
}
function _bulkSelectNone(){
  _bulkSelected.clear();
  _bulkRender();
}
async function submitBulkSend(){
  const content=($g('bulkContent')?.value||'').trim();
  if(!content && !_bulkAttachments.length){alert('메시지 내용이나 첨부 파일이 필요합니다');return}
  if(!_bulkSelected.size){alert('최소 1개 이상의 상담방을 선택하세요');return}
  /* 실패한 첨부는 발송 전에 제거 권유 */
  const failedAtt=_bulkAttachments.filter(a=>a.status==='failed');
  if(failedAtt.length){
    if(!confirm('업로드 실패한 첨부가 '+failedAtt.length+'개 있습니다. 해당 항목은 제외하고 발송할까요?'))return;
  }
  /* 업로드가 아직 진행 중인 첨부는 대기 — 최대 30초 */
  const deadline=Date.now()+30000;
  while(_bulkAttachments.some(a=>a.status==='uploading') && Date.now()<deadline){
    await new Promise(res=>setTimeout(res,200));
  }
  const stillUploading=_bulkAttachments.some(a=>a.status==='uploading');
  if(stillUploading){alert('첨부 업로드가 아직 완료되지 않았습니다. 잠시 후 다시 시도하세요');return}
  const ready=_bulkAttachments.filter(a=>a.status==='ready' && a.url);
  const n=_bulkSelected.size;
  const attachDesc=ready.length?' + '+ready.filter(a=>a.type==='image').length+'장 사진 / '+ready.filter(a=>a.type==='file').length+'개 파일':'';
  if(!confirm('⚠️ '+n+'개 상담방에 메시지를 발송합니다'+attachDesc+'.\n고객들이 바로 볼 수 있습니다.\n\n정말 발송할까요?'))return;
  if(!confirm('한 번 더 확인: '+n+'개 상담방 · 메시지 '+content.length+'자'+attachDesc+'\n\n발송을 시작합니다.'))return;
  const btn=$g('bulkSubmitBtn');
  if(btn){btn.disabled=true;btn.style.opacity='.55';btn.textContent='📢 발송 중...'}
  try{
    const attachments=ready.map(a=>{
      if(a.type==='image')return {type:'image', url:a.url};
      return {type:'file', url:a.url, name:a.name, size:a.size};
    });
    const r=await fetch('/api/admin-bulk-send?key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({room_ids:Array.from(_bulkSelected), content, attachments})
    });
    const d=await r.json();
    if(!d.ok){alert('발송 실패: '+(d.error||'unknown'));return}
    const msg='✅ '+d.sent+'건 발송 성공'+(d.failed&&d.failed.length?' / ⚠️ '+d.failed.length+'건 실패':'');
    alert(msg);
    closeBulkSend();
  }catch(err){alert('오류: '+err.message)}
  finally{if(btn){btn.disabled=false;btn.style.opacity='';btn.textContent='⚠️ 발송'}}
}
/* ===== 통합 검색 (사용자 + 업체) — 사장님 명령: '사용자도 업체도 통합으로'
   admin.html 모드 토글 줄의 #clientSearchInput 에 입력 시 현재 모드에 맞춰 필터 */
var _clientSearchT=null;
function onClientSearchInput(){
  if(_clientSearchT)clearTimeout(_clientSearchT);
  _clientSearchT=setTimeout(_doClientSearch, 200);
  /* X 버튼 표시/숨김 */
  try{
    const v=($g('clientSearchInput')?.value||'').trim();
    const x=$g('clientSearchClear'); if(x) x.style.display=v?'inline-block':'none';
  }catch{}
}
function clearClientSearch(){
  const inp=$g('clientSearchInput'); if(inp) inp.value='';
  const x=$g('clientSearchClear'); if(x) x.style.display='none';
  const dd=$g('clientSearchDropdown'); if(dd){ dd.style.display='none'; dd.innerHTML=''; }
  _searchDropdownLastQ='';
  _doClientSearch();
}
function _doClientSearch(){
  const q=($g('clientSearchInput')?.value||'').trim().toLowerCase();
  if(_clientTabMode==='user'){
    /* 사용자 모드 — 현재 렌더된 #userList 카드를 client-side filter
       카드 텍스트(본명/닉/전화/이메일/회사명) 안 q 매칭 */
    const list=$g('userList'); if(!list) return;
    let visible=0, total=0;
    Array.from(list.children).forEach(c=>{
      total++;
      if(!q){ c.style.display=''; visible++; return; }
      const txt=(c.textContent||'').toLowerCase();
      const match=txt.indexOf(q)>=0;
      c.style.display = match ? '' : 'none';
      if(match) visible++;
    });
    const hintId='userListSearchHint';
    let hint=$g(hintId);
    if(q && total>0 && visible===0){
      if(!hint){
        hint=document.createElement('div');
        hint.id=hintId;
        hint.style.cssText='padding:30px 0;text-align:center;color:#8b95a1;font-size:.88em';
        list.appendChild(hint);
      }
      hint.textContent='"'+q+'"에 일치하는 사용자가 없습니다 (현재 탭 내).';
      hint.style.display='block';
    }else if(hint){ hint.style.display='none'; }
  }else{
    /* 업체 모드 — 기존 bizSearchInput + _renderBizList 재사용. 통합 input 값을 sync */
    const bizInput=$g('bizSearchInput');
    if(bizInput){ bizInput.value=q; }
    if(typeof _renderBizList==='function') _renderBizList();
  }
  /* 추가: 통합 드롭다운 (사용자 + 메모 + 업체) — 메모 빡센 세팅 */
  _renderClientSearchDropdown(q);
}

/* 통합 검색 드롭다운 — admin-search API 호출 후 사용자/메모/업체 결과를 표시 */
var _searchDropdownT=null;
var _searchDropdownLastQ='';
function _renderClientSearchDropdown(q){
  const dd=$g('clientSearchDropdown'); if(!dd) return;
  /* 한글 1자 ('박', '김' 등 성씨) 도 검색 허용. 영문/숫자만 2자 이상 요구. */
  const isKorean = /[가-힣]/.test(q);
  const minLen = isKorean ? 1 : 2;
  if(!q || q.length<minLen){ dd.style.display='none'; dd.innerHTML=''; return; }
  if(_searchDropdownT) clearTimeout(_searchDropdownT);
  _searchDropdownT=setTimeout(()=>_fetchSearchDropdown(q), 250);
}
async function _fetchSearchDropdown(q){
  if(_searchDropdownLastQ===q) return;
  _searchDropdownLastQ=q;
  const dd=$g('clientSearchDropdown'); if(!dd) return;
  dd.style.display='block';
  dd.innerHTML='<div style="padding:14px;color:#8b95a1;font-size:.84em;text-align:center">검색 중...</div>';
  try{
    const r=await fetch('/api/admin-search?key='+encodeURIComponent(KEY)+'&q='+encodeURIComponent(q));
    const d=await r.json();
    if(_searchDropdownLastQ!==q) return;  /* 더 최신 q 입력됐으면 스킵 */
    const users=(d.users||[]).slice(0,8);
    const memos=(d.memos||[]).slice(0,12);
    const businesses=(d.businesses||[]).slice(0,5);
    const total=users.length+memos.length+businesses.length;
    if(!total){
      dd.innerHTML='<div style="padding:14px;color:#8b95a1;font-size:.84em;text-align:center">"'+e(q)+'" 결과 없음</div>';
      return;
    }
    let html='';
    if(users.length){
      html+='<div style="padding:8px 12px 4px;font-size:.7em;font-weight:700;color:#8b95a1;letter-spacing:.05em;text-transform:uppercase;background:#fafbfc;border-bottom:1px solid #f3f4f6">👤 사용자 '+users.length+'명</div>';
      html+=users.map(u=>{
        const nm=u.real_name||u.name||'#'+u.id;
        const sub=[u.phone||'',u.email||''].filter(Boolean).join(' · ');
        const adminBadge=u.is_admin?' <span style="background:#8b6914;color:#fff;font-size:.66em;font-weight:700;padding:1px 5px;border-radius:99px">👑</span>':'';
        return '<div onclick="_searchPickUser('+u.id+')" style="padding:8px 12px;border-bottom:1px solid #f3f4f6;cursor:pointer;transition:background .12s" onmouseover="this.style.background=\'#eff6ff\'" onmouseout="this.style.background=\'\'"><div style="font-weight:700;font-size:.86em;color:#191f28">'+e(nm)+adminBadge+'</div><div style="font-size:.74em;color:#8b95a1;margin-top:1px">'+e(sub)+'</div></div>';
      }).join('');
    }
    if(memos.length){
      html+='<div style="padding:8px 12px 4px;font-size:.7em;font-weight:700;color:#8b95a1;letter-spacing:.05em;text-transform:uppercase;background:#fafbfc;border-bottom:1px solid #f3f4f6">📒 메모 '+memos.length+'건</div>';
      const CAT_ICONS={'전화':'📞','문서':'📁','이슈':'⚠️','약속':'📅','일반':'📝'};
      const TYPE_ICONS={'할 일':'📌','확인필요':'📌','고객요청':'📌','거래처 정보':'🏢','완료':'✅'};
      html+=memos.map(m=>{
        const ic=CAT_ICONS[m.category]||TYPE_ICONS[m.memo_type]||'📒';
        const ctx=m.target_user_real_name||m.target_user_name||m.target_business_name||m.room_name||'';
        const due=m.due_date?' · '+e(m.due_date):'';
        const snip=String(m.content||'').slice(0,60);
        const tagChips=Array.isArray(m.tags)&&m.tags.length?m.tags.slice(0,3).map(t=>'<span style="background:#dbeafe;color:#1e40af;font-size:.66em;font-weight:600;padding:1px 6px;border-radius:99px;margin-right:3px">#'+e(t)+'</span>').join(''):'';
        const userId=m.target_user_id;
        const onclick=userId?'_searchPickMemo('+userId+','+m.id+')':'';
        const cursorStyle=userId?'cursor:pointer':'cursor:default;opacity:.7';
        return '<div onclick="'+onclick+'" style="padding:8px 12px;border-bottom:1px solid #f3f4f6;'+cursorStyle+';transition:background .12s" onmouseover="if(this.onclick)this.style.background=\'#eff6ff\'" onmouseout="this.style.background=\'\'"><div style="display:flex;align-items:center;gap:5px;font-size:.78em"><span style="flex-shrink:0">'+ic+'</span><span style="color:#1e40af;font-weight:600">'+e(ctx)+'</span><span style="color:#8b95a1;font-size:.92em;margin-left:auto">'+e((m.created_at||'').substring(0,10))+due+'</span></div><div style="font-size:.78em;color:#191f28;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+e(snip)+(snip.length>=60?'…':'')+'</div>'+(tagChips?'<div style="margin-top:2px">'+tagChips+'</div>':'')+'</div>';
      }).join('');
    }
    if(businesses.length){
      html+='<div style="padding:8px 12px 4px;font-size:.7em;font-weight:700;color:#8b95a1;letter-spacing:.05em;text-transform:uppercase;background:#fafbfc;border-bottom:1px solid #f3f4f6">🏢 업체 '+businesses.length+'개</div>';
      html+=businesses.map(b=>{
        return '<div onclick="setClientTabMode(\'business\');document.getElementById(\'clientSearchDropdown\').style.display=\'none\'" style="padding:8px 12px;border-bottom:1px solid #f3f4f6;cursor:pointer;transition:background .12s" onmouseover="this.style.background=\'#eff6ff\'" onmouseout="this.style.background=\'\'"><div style="font-weight:700;font-size:.86em;color:#191f28">'+e(b.company_name||'(이름없음)')+'</div><div style="font-size:.74em;color:#8b95a1;margin-top:1px">'+e([b.business_number||'',b.ceo_name?'대표 '+b.ceo_name:''].filter(Boolean).join(' · '))+'</div></div>';
      }).join('');
    }
    dd.innerHTML=html;
  }catch(err){
    dd.innerHTML='<div style="padding:14px;color:#f04452;font-size:.84em">검색 오류: '+e(err.message||'')+'</div>';
  }
}

/* 사용자 클릭 → 거래처 dashboard */
function _searchPickUser(userId){
  const dd=$g('clientSearchDropdown'); if(dd)dd.style.display='none';
  if(typeof openCustomerDashboard==='function') openCustomerDashboard(Number(userId));
}

/* 메모 클릭 → 거래처 dashboard + 그 메모 highlight (1.5초) */
function _searchPickMemo(userId, memoId){
  const dd=$g('clientSearchDropdown'); if(dd)dd.style.display='none';
  if(!userId) return;
  if(typeof openCustomerDashboard==='function'){
    openCustomerDashboard(Number(userId));
    /* dashboard 메모 로드 후 해당 memoId 카드로 scroll + highlight */
    setTimeout(()=>{
      const card=document.querySelector('#cdMemoList [data-memo-id="'+memoId+'"]');
      if(card){
        card.scrollIntoView({behavior:'smooth', block:'center'});
        const orig=card.style.background;
        card.style.transition='background .25s';
        card.style.background='#fef3c7';
        setTimeout(()=>{ card.style.background=orig||''; }, 1500);
      }
    }, 1200);
  }
}

/* 검색칸 밖 클릭 시 드롭다운 닫기 */
document.addEventListener('click', function(e){
  if(!e.target.closest('#clientSearchInput') && !e.target.closest('#clientSearchDropdown')){
    const dd=document.getElementById('clientSearchDropdown'); if(dd) dd.style.display='none';
  }
});
