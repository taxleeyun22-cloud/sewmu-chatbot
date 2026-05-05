/* ===== admin-customer-dash.js — 거래처 dashboard 본체 (쪼개기 Step 2) =====
 * 사장님 명령 (2026-04-30): 'ㄱㄱㄱ가보자' — Step 1 검증 PASS 후 즉시 진행.
 *
 * 분리 범위 (admin.js → admin-customer-dash.js):
 *  - 상태: _cdCurrentUserId / _cdUserCache / _summaryMode / _customerSummaryUserId / _customerSummaryBusinessId
 *  - 메인 모달: openCustomerDashboard / closeCustomerDashboard
 *  - 로더: _loadCdAutoSummary / _loadCdTodosAndSummaries
 *  - 액션: _cdCompleteTodo / _cdOpenSummary
 *  - 네비: cdGotoDocs / cdGotoRoom / cdExportCsv
 *  - 외부: openCustomerDashboardFromRoom (상담방 헤더 → 거래처 dashboard)
 *  - 요약: openCustomerSummary / _cdCurrentCustomerName
 *
 * 의존 (cross-script via classic script global env):
 *  - admin.js: KEY, e, escAttr, $g, docsSelectedUserId, openBusinessDashboard,
 *              openBizDocsPanel, openCustSidePanel, openAddBizForUser, _loadCdFilings,
 *              _normType, openRoom, openRoomSummary, openSummaryHistory,
 *              selectCustomer, openRoomForCurrentCustomer, exportWehago,
 *              currentRoomId, _lastSummaryText, _lastSummaryJson, _lastSummaryRange,
 *              _setSummaryRangeUI, tab
 *  - admin-memos.js (Step 1): _loadCustomerInfo (alias), _cdMemoCategory,
 *              _cdPendingAttachments, cdMemoFilter
 *
 * 노출 (window 자동, classic script):
 *  - 함수 선언: openCustomerDashboard, closeCustomerDashboard, _loadCdAutoSummary,
 *              _loadCdTodosAndSummaries, _cdCompleteTodo, _cdOpenSummary,
 *              cdGotoDocs, cdGotoRoom, cdExportCsv, openCustomerDashboardFromRoom,
 *              openCustomerSummary, _cdCurrentCustomerName
 *  - var: _cdCurrentUserId, _cdUserCache, _summaryMode, _customerSummaryUserId,
 *         _customerSummaryBusinessId
 *
 * 로드 순서: admin.html / staff.html 에서 admin.js → admin-memos.js → 본 파일 */

var _cdCurrentUserId = null;
var _cdUserCache = {};
var _summaryMode = 'room';  /* 'room' (방단위) | 'customer' (사람단위 user_id) | 'business' (업체단위 business_id) */
var _customerSummaryUserId = null;
var _customerSummaryBusinessId = null;

async function openCustomerDashboard(userId){
  if(!userId)return;
  _cdCurrentUserId=userId;
  docsSelectedUserId=userId; /* 다른 모달과 컨텍스트 공유 */
  /* 통합 메모 영역 reset (메모 빡센 세팅) */
  _cdMemoCategory='all';
  _cdPendingAttachments=[];
  if($g('cdMemoNewContent'))$g('cdMemoNewContent').value='';
  if($g('cdMemoNewDue'))$g('cdMemoNewDue').value='';
  if($g('cdMemoNewFile'))$g('cdMemoNewFile').value='';
  if($g('cdMemoNewFileLabel'))$g('cdMemoNewFileLabel').textContent='';
  if($g('cdMemoNewCategory'))$g('cdMemoNewCategory').value='';
  if($g('cdMemoNewType'))$g('cdMemoNewType').value='거래처 정보';
  /* 카테고리 탭 active 'all' 로 리셋 */
  if(typeof cdMemoFilter==='function') cdMemoFilter('all');
  const m=$g('custDashModal');
  if(!m)return;
  m.style.display='block';
  document.body.style.overflow='hidden';
  $g('cdName').textContent='불러오는 중...';
  $g('cdSub').textContent='';
  $g('cdBasic').innerHTML='…';
  $g('cdDocs').innerHTML='…';
  $g('cdFinance').innerHTML='…';
  $g('cdBizDocs').innerHTML='…';
  $g('cdRecentChat').innerHTML='…';
  /* 병렬 조회: 거래처 기본·재무·서류(시스템A)·상담방·문서·매핑사업장(시스템B) */
  const q=(p)=>'/api/'+p+(p.includes('?')?'&':'?')+'key='+encodeURIComponent(KEY);
  try{
    const [custRes, finRes, bizDocsRes, docsRes, roomsRes, mappedBizRes] = await Promise.all([
      fetch(q('admin-approve?status=all')).then(r=>r.json()).catch(()=>({users:[]})),
      fetch(q('admin-finance?user_id='+userId+'&action=summary')).then(r=>r.json()).catch(()=>({})),
      fetch(q('admin-biz-docs?user_id='+userId)).then(r=>r.json()).catch(()=>({businesses:[]})),
      fetch(q('admin-documents?user_id='+userId+'&limit=5')).then(r=>r.json()).catch(()=>({documents:[],counts:{}})),
      fetch(q('admin-rooms')).then(r=>r.json()).catch(()=>({rooms:[]})),
      fetch(q('admin-businesses?user_id='+userId)).then(r=>r.json()).catch(()=>({businesses:[]})),
    ]);
    const u=(custRes.users||[]).find(x=>x.id===userId);
    const nm=u?(u.real_name||u.name||'#'+userId):'#'+userId;
    $g('cdName').textContent=nm;
    /* 사용자 이름 캐시 — _loadCdTodosAndSummaries 가 참조 */
    if(u)_cdUserCache[userId]=u;
    /* 우선순위 배지 + 연락처 */
    const userRoom=(roomsRes.rooms||[]).find(r=>{
      /* 멤버에 이 userId 포함한 방을 우선 — 근데 여기선 간단히 첫 active 방 */
      return r.status==='active';
    });
    const pri=userRoom?Number(userRoom.priority||0):0;
    const priColor={1:'#dc2626',2:'#f59e0b',3:'#10b981'}[pri]||'#9ca3af';
    const priLabel=pri>0?pri+'순위':'미분류';
    $g('cdPriority').innerHTML='<span style="background:'+priColor+';color:#fff;padding:4px 10px;border-radius:14px;font-size:.74em;font-weight:700">'+priLabel+'</span>';
    $g('cdSub').textContent=(u?((u.phone||'연락처 미등록')+' · '+(u.provider||'')+' 로그인'):'')+' · '+(u?(u.approval_status==='approved_client'?'🏢 기장거래처':u.approval_status==='approved_guest'?'✅ 일반':'⏳ '+(u.approval_status||'pending')):'');
    /* 기본 정보 */
    $g('cdBasic').innerHTML=''
      +'<div>이름: <b>'+e(nm)+'</b></div>'
      +(u&&u.email?'<div>이메일: '+e(u.email)+'</div>':'')
      +(u&&u.phone?'<div>연락처: '+e(u.phone)+'</div>':'')
      +'<div>가입: '+e((u&&u.created_at||'').slice(0,10))+'</div>';
    /* 문서 현황 */
    const counts=docsRes.counts||{};
    const fmt=v=>(Number(v)||0).toLocaleString('ko-KR');
    $g('cdDocs').innerHTML=''
      +'<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">'
      +'<div style="padding:8px 10px;background:#fef3c7;border-radius:6px"><div style="font-size:.72em;color:#92400e">⏳ 대기</div><div style="font-weight:800;font-size:1.1em">'+(counts.pending||0)+'</div></div>'
      +'<div style="padding:8px 10px;background:#d1fae5;border-radius:6px"><div style="font-size:.72em;color:#065f46">✅ 승인</div><div style="font-weight:800;font-size:1.1em">'+(counts.approved||0)+'</div></div>'
      +'<div style="padding:8px 10px;background:#fee2e2;border-radius:6px"><div style="font-size:.72em;color:#991b1b">❌ 반려</div><div style="font-weight:800;font-size:1.1em">'+(counts.rejected||0)+'</div></div>'
      +'<div style="padding:8px 10px;background:#e0f2fe;border-radius:6px"><div style="font-size:.72em;color:#075985">📊 총</div><div style="font-weight:800;font-size:1.1em">'+((counts.pending||0)+(counts.approved||0)+(counts.rejected||0))+'</div></div>'
      +'</div>';
    /* 재무 요약 */
    if(finRes.has_data && finRes.rows){
      const rows=finRes.rows.slice(0,3);
      $g('cdFinance').innerHTML=rows.map(r=>{
        const parts=[];
        if(r.revenue!=null)parts.push('매출 '+fmt(r.revenue));
        if(r.vat_payable!=null)parts.push('부가세 '+fmt(r.vat_payable));
        return '<div style="padding:6px 0;border-bottom:1px dashed #e5e8eb"><b>'+e(r.period)+'</b> '+parts.join(' · ')+'</div>';
      }).join('')+'<div style="font-size:.72em;color:#8b95a1;margin-top:6px">최근 3건 (편집 → 버튼)</div>';
    } else {
      $g('cdFinance').innerHTML='<div style="color:#8b95a1">재무 데이터 없음. 편집 → 버튼으로 추가하거나 PDF 업로드 후 Claude에게 처리 요청.</div>';
    }
    /* 🏢 연결된 사업장 — 시스템 B (businesses + business_members) 우선, 시스템 A (client_businesses) 는 fallback */
    const mappedBizs=(mappedBizRes.businesses)||[];
    const legacyBizs=(bizDocsRes.businesses)||[];
    const userPhoneRaw=(u&&u.phone)||'';
    const headerHtml='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
      +'<div style="font-weight:700;font-size:.92em">🏢 연결된 사업장 ('+(mappedBizs.length+legacyBizs.length)+')</div>'
      +'<button onclick="openAddBizForUser('+userId+',\''+e(nm).replace(/\'/g,'')+'\',\''+e(userPhoneRaw).replace(/\'/g,'')+'\')" style="background:var(--brand-primary,#3182f6);color:#fff;border:none;padding:6px 13px;border-radius:6px;font-size:.78em;font-weight:700;cursor:pointer;font-family:inherit">＋ 🏢 사업장 추가</button>'
      +'</div>';
    let bizHtml='';
    if(!mappedBizs.length && !legacyBizs.length){
      bizHtml='<div style="color:#8b95a1;padding:14px;text-align:center;border:1px dashed #d1d5db;border-radius:8px;font-size:.86em">등록된 사업장이 없습니다.<br><span style="font-size:.78em;color:#9ca3af">＋ 🏢 사업장 추가 버튼으로 위하고 정보를 입력하세요.</span></div>';
    } else {
      /* 시스템 B 카드 — 위하고 필드 표시 */
      if(mappedBizs.length){
        bizHtml+='<div style="display:flex;flex-direction:column;gap:10px">';
        bizHtml+=mappedBizs.map(b=>{
          let kvs='';
          try{
            const _kv=(k,v)=>v?'<div style="font-size:.78em"><b style="color:#6b7280;margin-right:5px">'+e(k)+'</b>'+e(String(v))+'</div>':'';
            kvs+=_kv('회사구분',b.company_form);
            kvs+=_kv('사업자번호',b.business_number);
            kvs+=_kv('대표자',b.ceo_name);
            kvs+=_kv('업태',b.business_category);
            kvs+=_kv('업종',b.industry);
            kvs+=_kv('업종코드',b.industry_code);
            kvs+=_kv('과세유형',b.tax_type);
            kvs+=_kv('사업장주소',b.address);
            kvs+=_kv('전화',b.phone);
            kvs+=_kv('수임일자',b.contract_date);
            kvs+=_kv('회계기간',[b.fiscal_year_start,b.fiscal_year_end].filter(Boolean).join(' ~ '));
            kvs+=_kv('기수',b.fiscal_term);
            kvs+=_kv('인사연도',b.hr_year);
          }catch(_){kvs='<div style="color:#f04452;font-size:.78em">필드 렌더 오류</div>'}
          const idC=b.docs&&b.docs.id_card&&b.docs.id_card.uploaded?'✅':'⚠️';
          const bz=b.docs&&b.docs.biz_reg&&b.docs.biz_reg.uploaded?'✅':'⚠️';
          const ht=b.docs&&b.docs.hometax&&b.docs.hometax.saved?'✅':'⚠️';
          const roleBadge=b.member_role==='대표자'
            ?'<span style="background:#fef3c7;color:#92400e;font-size:.66em;padding:1px 7px;border-radius:4px;margin-left:4px;font-weight:700">🧑‍💼 대표자</span>'
            :'<span style="background:#e0f2fe;color:#075985;font-size:.66em;padding:1px 7px;border-radius:4px;margin-left:4px">👤 담당자</span>';
          const primaryBadge=b.member_is_primary
            ?'<span style="background:#fee2e2;color:#991b1b;font-size:.64em;padding:1px 6px;border-radius:4px;margin-left:3px">주 연락</span>':'';
          const formBadge=b.company_form
            ?'<span style="background:#eef2ff;color:#3730a3;font-size:.64em;padding:1px 6px;border-radius:4px;margin-left:3px">'+e(b.company_form)+'</span>':'';
          return '<div style="border:1px solid #d1d5db;border-radius:10px;background:#fff;padding:12px 14px">'
            +'<div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:8px">'
              +'<div style="font-weight:700;font-size:.95em;color:#1e40af;cursor:pointer;text-decoration:underline" onclick="closeCustomerDashboard&&closeCustomerDashboard();setTimeout(function(){openBusinessDashboard('+b.id+')},150)">'+e(b.company_name||'사업장 #'+b.id)+'</div>'
              +formBadge+roleBadge+primaryBadge
            +'</div>'
            +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:4px 12px;color:#374151">'+kvs+'</div>'
            +'<div style="display:flex;align-items:center;gap:6px;margin-top:9px;padding-top:8px;border-top:1px dashed #e5e8eb">'
              +'<div style="flex:1;font-size:.74em;color:#555">📑 신분증 '+idC+' · 사등 '+bz+' · 홈택스 '+ht+'</div>'
              +'<button onclick="closeCustomerDashboard&&closeCustomerDashboard();setTimeout(function(){openBusinessDashboard('+b.id+')},150)" style="background:#eef2ff;color:#3730a3;border:none;padding:5px 10px;border-radius:6px;font-size:.72em;cursor:pointer;font-family:inherit;font-weight:600">🏢 업체로 →</button>'
            +'</div>'
          +'</div>';
        }).join('');
        bizHtml+='</div>';
      }
      /* 시스템 A 카드 (구버전 호환) — mini 형태 */
      if(legacyBizs.length){
        bizHtml+='<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #d1d5db">'
          +'<div style="font-size:.74em;color:#9ca3af;margin-bottom:6px">📦 구버전 등록 (client_businesses)</div>'
          +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px">'
          +legacyBizs.map(b=>{
            const idC=b.docs&&b.docs.id_card&&b.docs.id_card.uploaded?'✅':'⚠️';
            const bz=b.docs&&b.docs.biz_reg&&b.docs.biz_reg.uploaded?'✅':'⚠️';
            const ht=b.docs&&b.docs.hometax&&b.docs.hometax.saved?'✅':'⚠️';
            return '<div style="padding:9px 11px;border:1px solid #e5e8eb;border-radius:8px;background:#fafafa">'
              +'<div style="font-weight:700;font-size:.84em;margin-bottom:3px">'+e(b.company_name||'사업장 #'+b.id)+'</div>'
              +'<div style="font-size:.72em;color:#555">신분증 '+idC+' · 사등 '+bz+' · 홈택스 '+ht+'</div>'
            +'</div>';
          }).join('')
          +'</div></div>';
      }
      bizHtml+='<button onclick="openBizDocsPanel()" style="margin-top:10px;background:#ecfdf5;color:#065f46;border:none;padding:7px 12px;border-radius:6px;font-size:.78em;font-weight:700;cursor:pointer;font-family:inherit">📋 서류 자세히 보기</button>';
    }
    $g('cdBizDocs').innerHTML=headerHtml+bizHtml;
    /* 최근 대화 — 간단 */
    $g('cdRecentChat').innerHTML='<div style="color:#8b95a1">우측 "상담방 열기" 버튼으로 전체 대화 확인.</div>';
    /* 이 거래처 관련 할 일 + AI 요약 이력 — 이 user 가 속한 방 기준 */
    _loadCdTodosAndSummaries(userId, roomsRes.rooms||[]);
    /* 거래처 노트 — user_id 기반 영구 메모 (admin-memos.js 의 alias) */
    _loadCustomerInfo(userId);
    /* 신고 Case 리스트 */
    if(typeof _loadCdFilings==='function') _loadCdFilings(userId);
    /* 자동 요약 (캐시 우선 — GPT 비용 0) */
    _loadCdAutoSummary(userId);
  }catch(err){
    $g('cdName').textContent='오류';
    $g('cdBasic').innerHTML='<div style="color:#f04452">로드 실패: '+e(err.message)+'</div>';
  }
}

/* 거래처 통합 자동 요약 — admin-customer-summary?cache_only=1 */
async function _loadCdAutoSummary(userId){
  if(!userId) return;
  const box=$g('cdSummaries');
  if(!box) return;
  try{
    const r=await fetch('/api/admin-customer-summary?user_id='+userId+'&range=recent&cache_only=1&key='+encodeURIComponent(KEY),{credentials:'include'});
    if(!r.ok) return;
    const j=await r.json();
    if(!j || !j.summary) return; /* 캐시 없음 — 사장님이 ✨ 클릭하면 생성 */
    const stamp=j.generated_at||'';
    const html='<div style="background:#f0f9ff;border-left:3px solid #3182f6;padding:10px 12px;margin-bottom:10px;border-radius:6px;font-size:.85em;line-height:1.55;white-space:pre-wrap">'
      +'<div style="font-weight:700;color:#1a56db;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center">'
      +  '<span>🤖 거래처 통합 자동 요약</span>'
      +  '<button onclick="openCustomerSummary()" style="background:#fff;color:#3182f6;border:1px solid #3182f6;padding:3px 9px;border-radius:5px;font-size:.7em;cursor:pointer;font-family:inherit">✨ 새로 생성</button>'
      +'</div>'
      +'<div style="color:#191f28">'+e(j.summary)+'</div>'
      +'<div style="font-size:.7em;color:#8b95a1;margin-top:6px">생성: '+e(stamp)+' · 캐시</div>'
      +'</div>';
    box.innerHTML=html+box.innerHTML;
  }catch(_){}
}

async function _loadCdTodosAndSummaries(userId, allRooms){
  const todoBox=$g('cdTodos'), sumBox=$g('cdSummaries');
  const todoCnt=$g('cdTodoCount'), sumCnt=$g('cdSummaryCount');
  if(todoBox)todoBox.innerHTML='<div style="color:#8b95a1;padding:10px 0">불러오는 중...</div>';
  if(sumBox)sumBox.innerHTML='<div style="color:#8b95a1;padding:10px 0">불러오는 중...</div>';
  /* 이 사용자가 속한 방 id 추출 (first_member_name 또는 user_id 기반. 서버가 full 멤버 리스트 안 주므로
     간단히 first_member 매칭으로 시작 — 더 정확히 하려면 /api/admin-rooms?user_id=X 필요) */
  /* 임시 접근: 전체 방 중 first_member_user_id 혹은 name 일치만 필터.
     현실적으로 custRes 에서 real_name 가져와 room 의 first_member_name 과 매칭 */
  try{
    const u=_cdUserCache?.[userId]||null;
    const uName=u?.real_name||u?.name;
    const userRooms=allRooms.filter(r=>{
      if(!uName)return false;
      return (r.first_member_name||'').trim()===uName.trim();
    });
    const roomIds=userRooms.map(r=>r.id);
    /* 1. 할 일 (미완료만) — /api/memos?scope=my 후 room_id 필터 */
    try{
      const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&scope=my');
      const d=await r.json();
      const all=(d.memos||[]).map(m=>({...m,_t:_normType(m.memo_type_display||m.memo_type)}));
      const mine=all.filter(m=>m._t==='할 일' && m.room_id && roomIds.indexOf(m.room_id)>=0);
      if(todoCnt)todoCnt.textContent=mine.length?'('+mine.length+'건)':'';
      if(!mine.length){
        if(todoBox)todoBox.innerHTML='<div style="color:#adb5bd;padding:10px 0;font-size:.88em">미완료 할 일 없음</div>';
      } else {
        if(todoBox)todoBox.innerHTML=mine.slice(0,8).map(m=>{
          const due=m.due_date?'<span style="font-size:.72em;color:#b45309;margin-left:4px">📅 '+e(m.due_date)+'</span>':'';
          return '<div style="padding:6px 0;border-bottom:1px dashed #e5e8eb;display:flex;align-items:center;gap:6px">'
            +'<input type="checkbox" onchange="_cdCompleteTodo('+m.id+',this)" style="width:14px;height:14px;cursor:pointer;accent-color:#10b981;flex-shrink:0">'
            +'<span style="flex:1;font-size:.85em">'+e(m.content||'')+due+'</span>'
            +'</div>';
        }).join('')+(mine.length>8?'<div style="font-size:.72em;color:#8b95a1;margin-top:4px">+ '+(mine.length-8)+'건 더 · 대시보드에서 확인</div>':'');
      }
    }catch(_){if(todoBox)todoBox.innerHTML='<div style="color:#8b95a1">불러오기 실패</div>'}
    /* 2. AI 요약 이력 — 방마다 조회해서 합침 (최대 3개 방까지만, 너무 느려지는 것 방지) */
    try{
      if(!roomIds.length){
        if(sumBox)sumBox.innerHTML='<div style="color:#adb5bd;padding:10px 0;font-size:.88em">이 거래처 상담방이 없습니다</div>';
        if(sumCnt)sumCnt.textContent='';
        return;
      }
      const rs=await Promise.all(roomIds.slice(0,3).map(rid=>
        fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=summary_history&room_id='+encodeURIComponent(rid))
          .then(r=>r.json()).catch(()=>({summaries:[]}))
      ));
      const merged=[];
      rs.forEach((res, idx)=>{
        (res.summaries||[]).forEach(s=>merged.push({...s, _roomId:roomIds[idx]}));
      });
      merged.sort((a,b)=>String(b.generated_at||'').localeCompare(String(a.generated_at||'')));
      if(sumCnt)sumCnt.textContent=merged.length?'('+merged.length+'건)':'';
      if(!merged.length){
        if(sumBox)sumBox.innerHTML='<div style="color:#adb5bd;padding:10px 0;font-size:.88em">생성된 요약이 없습니다</div>';
      } else {
        const rangeLabel={recent:'최근 50건',week:'최근 7일',month:'이번달',all:'전체',custom:'지정기간'};
        if(sumBox)sumBox.innerHTML=merged.slice(0,5).map(s=>{
          const lab=rangeLabel[s.range_type]||s.range_type;
          const preview=String(s.summary_text||'').slice(0,80);
          return '<div onclick="_cdOpenSummary(\''+escAttr(s._roomId)+'\','+s.id+')" style="padding:7px 8px;border-bottom:1px dashed #e5e8eb;cursor:pointer" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'\'">'
            +'<div style="display:flex;gap:5px;font-size:.72em;color:#6b7280;margin-bottom:2px">'
            +'<span style="background:#eff6ff;color:#1e40af;padding:0 6px;border-radius:8px;font-weight:700">'+e(lab)+'</span>'
            +'<span>'+e((s.generated_at||'').substring(5,16))+'</span>'
            +'<span>·</span><span>메시지 '+(s.source_message_count||0)+'</span>'
            +'</div>'
            +'<div style="font-size:.82em;color:#191f28;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+e(preview)+'</div>'
            +'</div>';
        }).join('');
      }
    }catch(_){if(sumBox)sumBox.innerHTML='<div style="color:#8b95a1">불러오기 실패</div>'}
  }catch(err){
    if(todoBox)todoBox.innerHTML='<div style="color:#f04452">오류: '+e(err.message)+'</div>';
  }
}

/* cdTodos 체크박스 → 완료 */
async function _cdCompleteTodo(id, chk){
  try{
    await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&id='+id,{
      method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({memo_type:'완료'})
    });
    if(chk)chk.closest('div').style.opacity='.4';
  }catch(_){}
}

/* 거래처 대시보드 → 요약 클릭 시 해당 방 요약 모달 열기 */
function _cdOpenSummary(roomId, summaryId){
  closeCustomerDashboard();
  setTimeout(()=>{
    if(typeof openRoom==='function')openRoom(roomId);
    setTimeout(()=>{
      if(typeof openRoomSummary==='function')openRoomSummary();
      setTimeout(()=>{
        if(typeof openSummaryHistory==='function')openSummaryHistory();
      }, 200);
    }, 400);
  }, 100);
}

function closeCustomerDashboard(){
  $g('custDashModal').style.display='none';
  document.body.style.overflow='';
  _cdCurrentUserId=null;
}
function cdGotoDocs(){
  closeCustomerDashboard();
  tab('docs');
  setTimeout(()=>{if(_cdCurrentUserId||docsSelectedUserId)selectCustomer(docsSelectedUserId||_cdCurrentUserId)},100);
}
function cdGotoRoom(){
  /* 이 거래처가 멤버인 상담방으로 이동 */
  openRoomForCurrentCustomer();
  closeCustomerDashboard();
}
function cdExportCsv(){
  exportWehago();
}

/* 상담방 헤더 "🏢 거래처" 버튼 →
   Phase M11 (2026-05-05 사장님 명령): N:N 매핑 (1방 = N업체).
   - 방의 연결된 업체 list (room_businesses) 조회
   - 1개 → 직행
   - 2개+ → 선택 모달 (selectRoomBizModal)
   - 0개 → 자동 추론 (멤버의 매핑 사업장)
       · 1개 → 자동 연결 + dashboard
       · 2개+ → linkBizModal
       · 0개 → 안내 alert */
async function openCustomerDashboardFromRoom(){
  if(!currentRoomId){alert('상담방을 먼저 열어주세요');return}
  try{
    /* 1. 방의 연결된 업체 list */
    const r = await fetch('/api/admin-room-businesses?room_id=' + encodeURIComponent(currentRoomId) + '&key=' + encodeURIComponent(KEY));
    const d = await r.json();
    const bizList = d.businesses || [];

    if(bizList.length === 1){
      /* 단일 업체 → 직행 */
      openBusinessDashboard(bizList[0].id);
      return;
    }

    if(bizList.length >= 2){
      /* 다수 업체 → 선택 모달 */
      openSelectRoomBizModal(currentRoomId, bizList);
      return;
    }

    /* 0개 — 자동 추론 (방 멤버의 매핑 사업장) */
    const m = await fetch('/api/admin-rooms?key=' + encodeURIComponent(KEY) + '&room_id=' + encodeURIComponent(currentRoomId));
    const md = await m.json();
    const customers = (md.members||[]).filter(c =>
      !c.left_at && c.user_id && c.role !== 'admin' &&
      Number(c.is_admin) !== 1 && c.approval_status !== 'rejected'
    );

    /* 매핑 사업장 모음 (중복 제거) */
    const candidatesById = {};
    for (const c of customers) {
      try {
        const br = await fetch('/api/admin-businesses?user_id=' + c.user_id + '&key=' + encodeURIComponent(KEY));
        const bd = await br.json();
        for (const b of (bd.businesses || [])) {
          if (!b.deleted_at && !candidatesById[b.id]) candidatesById[b.id] = b;
        }
      } catch (_) {}
    }
    const candidates = Object.values(candidatesById);

    if(candidates.length === 0){
      alert('이 방에 연결된 업체가 없습니다.\n\n💡 헤더 🔗 버튼으로 업체를 연결하거나,\n방 멤버의 사업장을 먼저 등록해주세요.');
      return;
    }
    if(candidates.length === 1){
      /* 1개 자동 연결 + 직행 */
      const ok = await _linkRoomBiz(currentRoomId, candidates[0].id, true);
      if(!ok) return;
      openBusinessDashboard(candidates[0].id);
      return;
    }
    /* 2개+ 후보 → 선택 모달 (linkBizModal) */
    openLinkBizModal(currentRoomId, candidates);
  }catch(e){
    alert('오류: '+e.message);
  }
}

/* 방-업체 연결 helper */
async function _linkRoomBiz(roomId, bizId, isPrimary){
  try{
    const r = await fetch('/api/admin-room-businesses?key=' + encodeURIComponent(KEY), {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ room_id: roomId, business_id: bizId, is_primary: !!isPrimary }),
    });
    const d = await r.json();
    if(!d.ok){ alert('연결 실패: ' + (d.error || 'unknown')); return false; }
    return true;
  }catch(err){
    alert('오류: '+err.message);
    return false;
  }
}

/* 방-업체 매핑 해제 */
async function _unlinkRoomBiz(roomId, bizId){
  if(!confirm('이 방에서 업체 매핑을 해제할까요?\n(업체·메모 자체는 유지됩니다)')) return false;
  try{
    const r = await fetch('/api/admin-room-businesses?room_id=' + encodeURIComponent(roomId) + '&business_id=' + bizId + '&key=' + encodeURIComponent(KEY), { method: 'DELETE' });
    const d = await r.json();
    if(!d.ok){ alert('해제 실패: ' + (d.error || 'unknown')); return false; }
    return true;
  }catch(err){
    alert('오류: '+err.message);
    return false;
  }
}

/* linkBizModal — 0개 매핑 + 후보 list 에서 사장님이 1개 선택해서 연결 */
function openLinkBizModal(roomId, candidates){
  const m = $g('linkBizModal'); if(!m){ alert('linkBizModal element 없음'); return; }
  const list = $g('linkBizList');
  if(list){
    list.innerHTML = candidates.map(b =>
      '<div style="padding:12px 14px;border:1px solid #e5e8eb;border-radius:10px;margin-bottom:8px;background:#fff">'
        + '<div style="font-weight:700;font-size:.95em;margin-bottom:4px">'+e(b.company_name||'사업장 #'+b.id)+'</div>'
        + '<div style="font-size:.78em;color:#6b7280;line-height:1.5">'
          + (b.business_number ? '사업자 ' + e(b.business_number) + ' · ' : '')
          + (b.ceo_name ? '대표 ' + e(b.ceo_name) + ' · ' : '')
          + (b.industry || '')
        + '</div>'
        + '<div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end">'
          + '<button onclick="_linkBizConfirm(\''+escAttr(roomId)+'\','+b.id+',true)" style="background:#10b981;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:.78em;font-weight:700;cursor:pointer;font-family:inherit">✅ 이 업체 연결 (주)</button>'
          + '<button onclick="_linkBizConfirm(\''+escAttr(roomId)+'\','+b.id+',false)" style="background:#fff;color:#3182f6;border:1px solid #3182f6;padding:6px 14px;border-radius:6px;font-size:.78em;font-weight:600;cursor:pointer;font-family:inherit">+ 추가 연결 (보조)</button>'
        + '</div>'
      + '</div>'
    ).join('');
  }
  m.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeLinkBizModal(){
  const m = $g('linkBizModal'); if(m) m.style.display = 'none';
  document.body.style.overflow = '';
}

async function _linkBizConfirm(roomId, bizId, isPrimary){
  const ok = await _linkRoomBiz(roomId, bizId, isPrimary);
  if(!ok) return;
  closeLinkBizModal();
  openBusinessDashboard(bizId);
}

/* selectRoomBizModal — 2개+ 매핑된 업체 중 사장님이 어느 dashboard 볼지 선택 */
function openSelectRoomBizModal(roomId, bizList){
  const m = $g('selectRoomBizModal'); if(!m){ alert('selectRoomBizModal element 없음'); return; }
  const list = $g('selectRoomBizList');
  if(list){
    list.innerHTML = bizList.map(b =>
      '<div style="padding:12px 14px;border:1px solid '+(b.is_primary?'#10b981':'#e5e8eb')+';border-radius:10px;margin-bottom:8px;background:'+(b.is_primary?'#f0fdf4':'#fff')+'">'
        + '<div style="font-weight:700;font-size:.95em;margin-bottom:4px">'
          + (b.is_primary?'<span style="color:#10b981;margin-right:4px">★</span>':'')
          + e(b.company_name||'사업장 #'+b.id)
          + (b.is_primary?' <span style="font-size:.7em;color:#10b981;font-weight:600;margin-left:4px">주 업체</span>':'')
        + '</div>'
        + '<div style="font-size:.78em;color:#6b7280;line-height:1.5">'
          + (b.business_number ? '사업자 ' + e(b.business_number) + ' · ' : '')
          + (b.ceo_name ? '대표 ' + e(b.ceo_name) + ' · ' : '')
          + (b.industry || '')
        + '</div>'
        + '<div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">'
          + '<button onclick="closeSelectRoomBizModal();openBusinessDashboard('+b.id+')" style="background:#3182f6;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:.78em;font-weight:700;cursor:pointer;font-family:inherit">📊 dashboard 열기</button>'
          + (b.is_primary?'':'<button onclick="_setPrimaryAndReopen(\''+escAttr(roomId)+'\','+b.id+')" style="background:#fff;color:#10b981;border:1px solid #10b981;padding:6px 12px;border-radius:6px;font-size:.78em;font-weight:600;cursor:pointer;font-family:inherit">★ 주 업체로</button>')
          + '<button onclick="_unlinkAndReopen(\''+escAttr(roomId)+'\','+b.id+')" style="background:#fff;color:#dc2626;border:1px solid #dc2626;padding:6px 12px;border-radius:6px;font-size:.78em;font-weight:600;cursor:pointer;font-family:inherit">🗑️ 해제</button>'
        + '</div>'
      + '</div>'
    ).join('');
  }
  m.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeSelectRoomBizModal(){
  const m = $g('selectRoomBizModal'); if(m) m.style.display = 'none';
  document.body.style.overflow = '';
}

async function _setPrimaryAndReopen(roomId, bizId){
  const ok = await _linkRoomBiz(roomId, bizId, true);
  if(!ok) return;
  closeSelectRoomBizModal();
  /* 다시 거래처 버튼 흐름으로 — 이번엔 primary 가 set 되어 있으니 reload */
  setTimeout(openCustomerDashboardFromRoom, 100);
}

async function _unlinkAndReopen(roomId, bizId){
  const ok = await _unlinkRoomBiz(roomId, bizId);
  if(!ok) return;
  closeSelectRoomBizModal();
  setTimeout(openCustomerDashboardFromRoom, 100);
}

/* ===== 📝 거래처 단위 AI 요약 — user_id 기반 통합 (모든 방 대화 + 메모) =====
   현재 거래처 대시보드(_cdCurrentUserId) 기준. 기존 roomSummaryModal 재사용.
   _summaryMode='customer' 일 때 runRoomSummary 가 customer-summary API 호출. */
function openCustomerSummary(){
  const uid=_cdCurrentUserId;
  if(!uid){alert('거래처가 선택되지 않았습니다');return}
  _summaryMode='customer';
  _customerSummaryUserId=uid;
  /* 기존 요약 모달 재사용 */
  const modal=$g('roomSummaryModal');
  const body=$g('rsBody');
  const meta=$g('rsMeta');
  if(!modal)return;
  modal.style.display='flex';
  document.body.style.overflow='hidden';
  _lastSummaryText='';
  _lastSummaryJson=null;
  if(body)body.innerHTML='<div style="text-align:center;padding:40px 20px;color:#8b95a1;font-size:.9em;line-height:1.7">📝 거래처 단위 요약 모드<br>기간 선택 후 <b style="color:#10b981">✨ 요약 생성</b> 버튼.<br><span style="font-size:.85em;color:#adb5bd">※ 이 거래처 모든 방 대화 + 메모 통합 요약</span></div>';
  if(meta)meta.textContent='[거래처 단위] '+_cdCurrentCustomerName();
  if(typeof _setSummaryRangeUI==='function')_setSummaryRangeUI(_lastSummaryRange||'recent');
}

function _cdCurrentCustomerName(){
  try{return ($g('cdName')?.textContent||'').trim()||('user #'+_cdCurrentUserId)}catch{return ''}
}
