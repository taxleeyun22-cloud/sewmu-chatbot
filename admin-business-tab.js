/* ===== admin-business-tab.js — 업체(business) 모드 + 새 업체 모달 + 업체 dashboard (쪼개기 Step 3) =====
 * 사장님 명령 (2026-04-30): 처음 계획 통째 — admin.js 7492줄 Step 3 분리.
 *
 * 분리 범위 (admin.js → admin-business-tab.js, 약 460줄):
 *  - 상태: _clientTabMode / _bizListCache / _bdCurrent / _bizSearchT
 *  - 모드 토글: setClientTabMode (사용자/업체)
 *  - 업체 list: onBizSearchInput / loadBusinessList / _renderBizList
 *  - 새 업체 모달: openNewBusinessModal / closeNewBusinessModal / _nbOpenAddressSearch / _nbUpdateFiscalTerm / submitNewBusiness
 *  - 업체 dashboard 진입: openBusinessDashboard (현재 business.html 페이지 redirect)
 *  - legacy 모달: _openBusinessDashboardLegacy + _bd* 헬퍼들 (호출 X 지만 보존)
 *  - 거래처 메모 (업체): _bdLoadMemos / _bdAddMemo / _bdCloseMemoModal / _bdSubmitMemo / _bdDeleteMemo + ESC handler
 *  - 거래처 AI 요약: _bdRunBusinessSummary
 *  - 업체 정보 편집: _bdKV / _bdEditBasic
 *  - 업체 구성원: _bdAddMember / _bdChangeRole / _bdTogglePrimary / _bdRemoveMember
 *  - dashboard 닫기: closeBusinessDashboard
 *
 * 의존 (cross-script via classic script global env):
 *  - admin.js: KEY, e, escAttr, $g, _ensureRoomLabels, _calcFiscalTerm, tab, openRoom,
 *              _doClientSearch, _lastSummaryText, _lastSummaryJson, _lastSummaryRange,
 *              _setSummaryRangeUI
 *  - admin-customer-dash.js (Step 2): _summaryMode, _customerSummaryUserId, _customerSummaryBusinessId
 *
 * 노출 (window 자동 — function 선언 + var 사용)
 *
 * 로드 순서 (admin.html — staff.html 은 redirect):
 *   admin.js → admin-memos.js → admin-customer-dash.js → admin-business-tab.js */

var _clientTabMode = 'user';  /* 'user' | 'business' */
var _bizListCache = [];
var _bizSearchT = null;
var _bdCurrent = null;

function setClientTabMode(m){
  _clientTabMode=m;
  const u=$g('userModeView'), b=$g('bizModeView');
  const mu=$g('modeBtnUser'), mb=$g('modeBtnBiz');
  if(u)u.style.display=(m==='user')?'block':'none';
  if(b)b.style.display=(m==='business')?'block':'none';
  if(mu){mu.style.background=(m==='user')?'#191f28':'transparent';mu.style.color=(m==='user')?'#fff':'#6b7280';mu.style.fontWeight=(m==='user')?'700':'500'}
  if(mb){mb.style.background=(m==='business')?'#191f28':'transparent';mb.style.color=(m==='business')?'#fff':'#6b7280';mb.style.fontWeight=(m==='business')?'700':'500'}
  if(m==='business')loadBusinessList();
  /* 모드 전환 시 통합 검색이 비어있지 않으면 새 모드에도 즉시 필터 적용 */
  if(typeof _doClientSearch==='function') setTimeout(_doClientSearch, 50);
}

function onBizSearchInput(){
  if(_bizSearchT)clearTimeout(_bizSearchT);
  _bizSearchT=setTimeout(_renderBizList, 200);
}
async function loadBusinessList(){
  const el=$g('bizList');if(!el)return;
  el.innerHTML='<div style="text-align:center;color:#8b95a1;padding:40px 0;font-size:.88em">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-businesses?key='+encodeURIComponent(KEY));
    const d=await r.json();
    _bizListCache=(d.businesses||[]).filter(b=>b.status!=='closed');
    const c=d.counts||{};
    $g('bizCounts').textContent='전체 '+(_bizListCache.length)+' · 활성 '+(c.active||0)+' · 종료 '+(c.closed||0)+' · 이관 '+(c.terminated||0);
    _renderBizList();
  }catch(err){el.innerHTML='<div style="color:#f04452;padding:20px">오류: '+e(err.message)+'</div>'}
}
function _renderBizList(){
  const el=$g('bizList');if(!el)return;
  const q=(($g('bizSearchInput').value)||'').trim().toLowerCase();
  const list=q?_bizListCache.filter(b=>((b.company_name||'')+' '+(b.business_number||'')+' '+(b.ceo_name||'')).toLowerCase().indexOf(q)>=0):_bizListCache;
  if(!list.length){el.innerHTML='<div style="text-align:center;color:#8b95a1;padding:40px 0;font-size:.88em">'+(q?'검색 결과 없음':'등록된 업체가 없습니다. [＋ 새 업체] 로 추가하세요.')+'</div>';return}
  el.innerHTML=list.map(function(b){
    const st=b.status==='terminated'?'<span style="background:#fee2e2;color:#991b1b;font-size:.68em;padding:2px 7px;border-radius:4px;margin-left:6px;font-weight:700">🚫 이관</span>':(b.status==='closed'?'<span style="background:#e5e8eb;color:#6b7280;font-size:.68em;padding:2px 7px;border-radius:4px;margin-left:6px">📦 종료</span>':'');
    const bn=b.business_number?'<span style="color:#6b7280;font-size:.82em">· '+e(b.business_number)+'</span>':'';
    const ceo=b.ceo_name?'<span style="color:#6b7280;font-size:.82em;margin-left:4px">· 대표 '+e(b.ceo_name)+'</span>':'';
    const cat=[b.business_type||'', b.industry||'', b.tax_type||''].filter(Boolean).join(' · ');
    const memCount=Number(b.member_count||0);
    const roomCount=Number(b.room_count||0);
    return '<div onclick="openBusinessDashboard('+b.id+')" style="background:#fff;border:1px solid #e5e8eb;border-radius:10px;padding:14px 16px;margin-bottom:8px;cursor:pointer;transition:.15s" onmouseover="this.style.borderColor=\'#3182f6\';this.style.boxShadow=\'0 2px 8px rgba(49,130,246,.08)\'" onmouseout="this.style.borderColor=\'#e5e8eb\';this.style.boxShadow=\'none\'">'
      +'<div style="display:flex;align-items:flex-start;gap:10px">'
      +'<div style="font-size:1.2em;line-height:1">🏢</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-weight:700;font-size:.95em">'+e(b.company_name||'(이름없음)')+st+'</div>'
      +'<div style="font-size:.82em;color:#4b5563;margin-top:2px">'+bn+ceo+'</div>'
      +(cat?'<div style="font-size:.75em;color:#8b95a1;margin-top:2px">'+e(cat)+'</div>':'')
      +'<div style="display:flex;gap:10px;margin-top:6px;font-size:.76em;color:#6b7280">'
      +'<span>👥 구성원 '+memCount+'명</span>'
      +'<span>💬 상담방 '+roomCount+'개</span>'
      +'</div>'
      +'</div><div style="color:#3182f6;font-size:1.1em">›</div></div></div>';
  }).join('');
}

/* ＋ 새 업체 생성 모달 (위하고 수임처 신규생성 스타일) */
async function openNewBusinessModal(){
  ['nbName','nbCeo','nbBiz','nbSubBiz','nbCorpNo','nbAddress','nbAddress2',
   'nbPhone','nbIndustryCode','nbCategory','nbIndustry','nbEstDate','nbFiscalTerm'].forEach(id=>{const el=$g(id);if(el)el.value=''});
  $g('nbForm').value='0.법인사업자';
  var curYear=new Date().getFullYear();
  if($g('nbFiscalStart'))$g('nbFiscalStart').value=curYear+'-01-01';
  if($g('nbFiscalEnd'))$g('nbFiscalEnd').value=curYear+'-12-31';
  if($g('nbHrYear'))$g('nbHrYear').value=String(curYear);
  $g('nbAutoRoom').checked=true;
  /* 🏷️ 담당자 라벨 select 채우기 */
  const nbSel=$g('nbPriority');
  if(nbSel){
    nbSel.innerHTML='<option value="">— 미지정</option><option value="" disabled>불러오는 중...</option>';
    try{
      const labels=await _ensureRoomLabels(true);
      nbSel.innerHTML='<option value="">— 미지정</option>'
        +labels.map(lb=>'<option value="'+lb.id+'" style="background:'+escAttr(lb.color||'#fff')+'">'+e(lb.name)+'</option>').join('');
    }catch(_){}
  }
  $g('newBusinessModal').style.display='flex';
}
function closeNewBusinessModal(){$g('newBusinessModal').style.display='none'}
function _nbOpenAddressSearch(){
  if(typeof daum==='undefined'||!daum.Postcode){
    alert('주소검색 스크립트가 아직 로드 중입니다. 잠시 후 다시 시도해주세요.');return;
  }
  new daum.Postcode({
    oncomplete:function(data){
      var full=data.roadAddress||data.jibunAddress||data.address||'';
      if(data.buildingName)full+=' ('+data.buildingName+')';
      $g('nbAddress').value=full;
      var d2=$g('nbAddress2');if(d2)d2.focus();
    }
  }).open();
}
function _nbUpdateFiscalTerm(){
  var t=_calcFiscalTerm($g('nbEstDate')?.value);
  var el=$g('nbFiscalTerm');if(el)el.value=t;
}
/* Phase Q3 (2026-05-07 사장님 명령): 신규 입력 / 기존 선택 모드 토글 */
var _nbRepMode = 'new';
function _nbSwitchRepMode(mode){
  _nbRepMode = mode;
  const newArea=$g('nbRepNewArea'), existArea=$g('nbRepExistArea');
  const newBtn=$g('nbRepModeNewBtn'), existBtn=$g('nbRepModeExistBtn');
  if(mode==='new'){
    if(newArea) newArea.style.display='grid';
    if(existArea) existArea.style.display='none';
    if(newBtn){ newBtn.style.background='#191f28'; newBtn.style.color='#fff'; newBtn.style.border='none'; }
    if(existBtn){ existBtn.style.background='#fff'; existBtn.style.color='#4b5563'; existBtn.style.border='1px solid #e5e8eb'; }
  } else {
    if(newArea) newArea.style.display='none';
    if(existArea) existArea.style.display='block';
    if(existBtn){ existBtn.style.background='#191f28'; existBtn.style.color='#fff'; existBtn.style.border='none'; }
    if(newBtn){ newBtn.style.background='#fff'; newBtn.style.color='#4b5563'; newBtn.style.border='1px solid #e5e8eb'; }
  }
}

/* 사용자 검색 (debounce 250ms) */
var _nbRepSearchTimer=null;
function _nbRepSearchInput(){
  if(_nbRepSearchTimer) clearTimeout(_nbRepSearchTimer);
  _nbRepSearchTimer = setTimeout(_nbRepDoSearch, 250);
}
async function _nbRepDoSearch(){
  const q=($g('nbRepSearch')?.value||'').trim();
  const res=$g('nbRepSearchResults'); if(!res) return;
  if(q.length<2){ res.innerHTML=''; return; }
  res.innerHTML='<div style="padding:8px;color:#8b95a1;font-size:.78em">검색 중...</div>';
  try{
    const r=await fetch('/api/admin-search?key='+encodeURIComponent(KEY)+'&q='+encodeURIComponent(q));
    const d=await r.json();
    const users=(d.users||[]).slice(0,8);
    if(!users.length){ res.innerHTML='<div style="padding:8px;color:#8b95a1;font-size:.78em">결과 없음</div>'; return; }
    res.innerHTML=users.map(u=>{
      const nm=u.real_name||u.name||'#'+u.id;
      const sub=[u.phone||'',u.email||''].filter(Boolean).join(' · ');
      return '<div onclick="_nbRepPickUser('+u.id+',\''+e(nm).replace(/\'/g,'')+'\')" style="padding:7px 10px;border-bottom:1px solid #f3f4f6;cursor:pointer;background:#fff" onmouseover="this.style.background=\'#eff6ff\'" onmouseout="this.style.background=\'#fff\'"><div style="font-weight:600;font-size:.82em">'+e(nm)+'</div><div style="font-size:.72em;color:#8b95a1">'+e(sub)+'</div></div>';
    }).join('');
  }catch(err){
    res.innerHTML='<div style="padding:8px;color:#dc2626;font-size:.78em">오류: '+e(err.message)+'</div>';
  }
}
function _nbRepPickUser(uid, name){
  const hidden=$g('nbRepSelectedUserId'); if(hidden) hidden.value=uid;
  const sel=$g('nbRepSelected'); if(sel) sel.textContent='✅ 선택됨: '+name+' (#'+uid+')';
  const res=$g('nbRepSearchResults'); if(res) res.innerHTML='';
  const inp=$g('nbRepSearch'); if(inp) inp.value='';
}

async function submitNewBusiness(){
  const name=$g('nbName').value.trim();
  const ceo=$g('nbCeo').value.trim();
  const biz=$g('nbBiz').value.trim();
  const fy1=$g('nbFiscalStart').value;
  const fy2=$g('nbFiscalEnd').value;
  const hy=$g('nbHrYear').value;
  if(!name){alert('* 회사명을 입력하세요');return}
  if(!ceo){alert('* 대표자명을 입력하세요');return}
  if(!biz){alert('* 사업자등록번호를 입력하세요');return}
  /* Phase Q3 (2026-05-07): 대표자 검증 */
  let representative=null, existingUserId=null;
  if(_nbRepMode==='new'){
    const repName=($g('nbRepName')?.value||'').trim();
    if(!repName){alert('* 대표자 실명을 입력하세요 (또는 기존 사용자 선택)');return}
    representative={
      real_name: repName,
      birth_date: $g('nbRepBirth')?.value||null,
      phone: ($g('nbRepPhone')?.value||'').trim()||null,
    };
  } else {
    existingUserId=Number($g('nbRepSelectedUserId')?.value||0)||null;
    if(!existingUserId){alert('* 기존 사용자를 선택하세요');return}
  }
  if(!fy1||!fy2){alert('* 기수 회계기간(시작/종료)을 입력하세요');return}
  if(!hy){alert('* 인사연도를 입력하세요');return}
  const btn=$g('nbSubmitBtn');if(btn){btn.disabled=true;btn.textContent='생성 중...'}
  try{
    const addr1=$g('nbAddress').value.trim();
    const addr2=$g('nbAddress2').value.trim();
    const body={
      company_name:name,
      company_form:$g('nbForm').value,
      ceo_name:ceo,
      business_number:biz.replace(/\D/g,''),
      sub_business_number:$g('nbSubBiz').value.trim().replace(/\D/g,'')||null,
      corporate_number:$g('nbCorpNo').value.trim().replace(/\D/g,'')||null,
      address:[addr1,addr2].filter(Boolean).join(' ')||null,
      phone:$g('nbPhone').value.trim()||null,
      industry_code:$g('nbIndustryCode').value.trim()||null,
      business_category:$g('nbCategory').value.trim()||null,
      industry:$g('nbIndustry').value.trim()||null,
      establishment_date:$g('nbEstDate').value||null,
      fiscal_year_start:fy1,
      fiscal_year_end:fy2,
      fiscal_term:$g('nbFiscalTerm').value?Number($g('nbFiscalTerm').value):null,
      hr_year:Number(hy),
      service_type:'기장',
      contract_date:new Date().toISOString().slice(0,10),
      auto_create_room: $g('nbAutoRoom').checked,
      priority: $g('nbPriority')?.value?Number($g('nbPriority').value):null,
      /* Q3 (2026-05-07): 대표자 자동 매핑 */
      representative: representative,  /* {real_name, birth_date, phone} or null */
      user_id: existingUserId,  /* 기존 사용자 매핑 시 */
    };
    const r=await fetch('/api/admin-businesses?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json();
    if(!d.ok && !d.id){alert('실패: '+(d.error||'unknown'));return}
    let msg='✅ 업체 생성 완료';
    if(d.room_id) msg+='\n📢 기본 상담방 개설: '+d.room_id;
    if(d.created_user_id) msg+='\n👤 사용자 자동 생성: #'+d.created_user_id+' (사용자 탭에 표시)';
    else if(d.mapped_user_id) msg+='\n🔗 기존 사용자 매핑: #'+d.mapped_user_id;
    alert(msg);
    closeNewBusinessModal();
    loadBusinessList();
    if(d.id)openBusinessDashboard(d.id);
  }catch(err){alert('오류: '+err.message)}
  finally{if(btn){btn.disabled=false;btn.textContent='생성'}}
}

/* 업체 대시보드 — v=124 부터 별도 페이지(business.html)로 분리.
   admin.js 7000+ 줄 의존성 0, 단순한 fetch+render 로 안정성 확보.
   기존 모달 본문 코드는 deprecated (호출되지 않음). */
function openBusinessDashboard(bid){
  if(!bid)return;
  _bdCurrent={id:bid};
  /* 같은 탭에서 페이지 이동 — 모바일 친화적. ADMIN_KEY 는 sessionStorage 에도 저장되어 새 페이지가 자동 사용. */
  try{ sessionStorage.setItem('ADMIN_KEY', KEY||''); }catch(_){}
  const url='/business.html?id='+encodeURIComponent(bid)+'&key='+encodeURIComponent(KEY||'');
  window.location.href=url;
}
/* 기존 풀 모달 코드는 아래 _openBusinessDashboardLegacy 로 유지 (회귀 0). 호출되지 않음.
   언젠가 내부 모달 방식이 필요하면 여기로 다시 alias 할 수 있음. */
async function _openBusinessDashboardLegacy(bid){
  if(!bid)return;
  _bdCurrent={id:bid};
  const m=$g('businessDashboardModal');if(!m){alert('업체 모달 element 없음');return}
  m.style.display='flex';document.body.style.overflow='hidden';
  $g('bdName').textContent='불러오는 중...';
  $g('bdSub').textContent='';
  $g('bdBody').innerHTML='<div style="text-align:center;color:#8b95a1;padding:40px 0">불러오는 중...</div>';
  let stage='1.fetch';
  try{
    /* fetch 가 응답 안 줄 때 본문이 영구 "불러오는 중..." 으로 멈추는 사고 방지 — 15초 타임아웃 */
    const fetchP=fetch('/api/admin-businesses?key='+encodeURIComponent(KEY)+'&id='+bid);
    const timeoutP=new Promise((_,rej)=>setTimeout(()=>rej(new Error('서버 응답 15초 초과')),15000));
    const r=await Promise.race([fetchP,timeoutP]);
    stage='2.json (status='+r.status+')';
    const d=await r.json();
    stage='3.check (ok='+d.ok+')';
    if(!d.ok){$g('bdBody').innerHTML='<div style="color:#f04452;padding:20px">'+e(d.error||'unknown')+'</div>';return}
    stage='4.parse';
    const biz=d.business||{};
    const members=d.members||[];
    const rooms=d.rooms||[];
    _bdCurrent={id:bid, biz:biz};
    stage='5.header';
    $g('bdName').textContent=biz.company_name||'(이름없음)';
    $g('bdSub').textContent=[biz.business_number?'#'+biz.business_number:'', biz.ceo_name?'대표 '+biz.ceo_name:'', biz.company_form||''].filter(Boolean).join(' · ');
    stage='6.body html';
    let html='';
    /* 기본정보 — 위하고 풍성 그리드 — 각 KV 행 try/catch */
    try {
      html+='<div style="background:#fff;border:1px solid #e5e8eb;border-radius:10px;padding:14px 16px;margin-bottom:12px">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div style="font-weight:700;font-size:.92em">📋 기본 정보 <span style="font-size:.7em;color:#9ca3af;font-weight:500;margin-left:4px">(위하고 호환)</span></div><button onclick="_bdEditBasic()" style="background:#f2f4f6;border:1px solid #e5e8eb;padding:5px 12px;border-radius:6px;font-size:.78em;cursor:pointer;font-family:inherit">편집</button></div>'
        +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;font-size:.84em;color:#374151">'
        +_bdKV('회사구분',biz.company_form)
        +_bdKV('사업자등록번호',biz.business_number)
        +_bdKV('종사업자번호',biz.sub_business_number)
        +_bdKV('법인등록번호',biz.corporate_number)
        +_bdKV('대표자',biz.ceo_name)
        +_bdKV('업태',biz.business_category)
        +_bdKV('업종',biz.industry)
        +_bdKV('업종코드',biz.industry_code)
        +_bdKV('과세유형',biz.tax_type)
        +_bdKV('사업장주소',biz.address)
        +_bdKV('사업장전화',biz.phone)
        +_bdKV('개업일',biz.establishment_date)
        +_bdKV('수임일자',biz.contract_date)
        +_bdKV('회계기간',[biz.fiscal_year_start,biz.fiscal_year_end].filter(Boolean).join(' ~ '))
        +_bdKV('기수',biz.fiscal_term)
        +_bdKV('인사연도',biz.hr_year)
        +_bdKV('노트',biz.notes)
        +'</div></div>';
    } catch(secErr){
      html+='<div style="color:#f04452;padding:10px;font-size:.82em">⚠️ 기본정보 렌더 실패: '+e(String(secErr&&secErr.message||secErr))+'</div>';
    }
    /* 📝 거래처 메모 — 본문 표시 후 비동기 로드 */
    html+='<div style="background:#fff;border:1px solid #e5e8eb;border-radius:10px;padding:14px 16px;margin-bottom:12px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
        +'<div style="font-weight:700;font-size:.92em">📝 거래처 메모</div>'
        +'<button onclick="_bdAddMemo('+bid+')" style="background:var(--brand-primary,#3182f6);color:#fff;border:none;padding:5px 13px;border-radius:6px;font-size:.78em;font-weight:600;cursor:pointer;font-family:inherit">＋ 메모</button>'
      +'</div>'
      +'<div id="bdMemoList" style="font-size:.85em;color:#8b95a1;padding:6px 0">메모 불러오는 중...</div>'
    +'</div>';
    /* 🤖 거래처 AI 요약 — 버튼 클릭 시 roomSummaryModal 재활용해서 business 모드로 실행 */
    html+='<div style="background:#fff;border:1px solid #e5e8eb;border-radius:10px;padding:14px 16px;margin-bottom:12px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
        +'<div style="font-weight:700;font-size:.92em">🤖 거래처 AI 요약</div>'
        +'<button onclick="_bdRunBusinessSummary('+bid+')" style="background:#10b981;color:#fff;border:none;padding:5px 13px;border-radius:6px;font-size:.78em;font-weight:600;cursor:pointer;font-family:inherit">✨ 요약 생성</button>'
      +'</div>'
      +'<div style="font-size:.78em;color:#8b95a1;padding:4px 0">이 거래처(업체) 의 모든 상담방 대화 + 메모 통합 요약. 클릭 시 별도 모달.</div>'
    +'</div>';
    /* 구성원 */
    html+='<div style="background:#fff;border:1px solid #e5e8eb;border-radius:10px;padding:14px 16px;margin-bottom:12px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div style="font-weight:700;font-size:.92em">👥 구성원 ('+members.length+'명)</div><button onclick="_bdAddMember()" style="background:var(--brand-primary,#3182f6);color:#fff;border:none;padding:5px 14px;border-radius:6px;font-size:.78em;font-weight:600;cursor:pointer;font-family:inherit">＋ 구성원 추가</button></div>';
    if(!members.length){
      html+='<div style="color:#8b95a1;font-size:.85em;padding:12px 0;text-align:center">아직 연결된 구성원이 없습니다</div>';
    } else {
      /* 각 멤버 렌더링을 개별 try/catch — 하나의 행 throw 가 전체 본문 멈춤으로 번지지 않게 */
      html+=members.map(function(mm){
        try{
          const nm=e(mm.real_name||mm.name||'#'+mm.user_id);
          const badge=mm.role==='대표자'?'<span style="background:#fef3c7;color:#92400e;font-size:.68em;padding:1px 7px;border-radius:4px;margin-left:6px;font-weight:700">🧑‍💼 대표자</span>':'<span style="background:#e0f2fe;color:#075985;font-size:.68em;padding:1px 7px;border-radius:4px;margin-left:6px">👤 담당자</span>';
          const primary=mm.is_primary?'<span style="background:#fee2e2;color:#991b1b;font-size:.66em;padding:1px 6px;border-radius:4px;margin-left:4px">주 연락</span>':'';
          const phone=mm.phone||mm.user_phone;
          const curRole=mm.role||'담당자';
          const curPrimary=mm.is_primary?1:0;
          return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f2f4f6;flex-wrap:wrap">'
            +'<div style="flex:1;min-width:0"><div style="font-size:.88em;font-weight:600">'+nm+badge+primary+'</div>'
            +(phone?'<div style="font-size:.74em;color:#8b95a1">'+e(phone)+'</div>':'')+'</div>'
            +'<button onclick="_bdChangeRole('+mm.id+',\''+curRole+'\')" style="background:#f3f4f6;color:#374151;border:none;padding:5px 9px;border-radius:6px;font-size:.72em;cursor:pointer;font-family:inherit" title="대표자↔담당자 전환">역할</button>'
            +'<button onclick="_bdTogglePrimary('+mm.id+','+curPrimary+')" style="background:'+(curPrimary?'#fee2e2':'#f3f4f6')+';color:'+(curPrimary?'#991b1b':'#374151')+';border:none;padding:5px 9px;border-radius:6px;font-size:.72em;cursor:pointer;font-family:inherit" title="주 연락 설정/해제">'+(curPrimary?'주연락 해제':'주연락')+'</button>'
            +'<button onclick="_bdRemoveMember('+mm.id+',\''+nm.replace(/\'/g,'')+'\')" style="background:#fee2e2;color:#dc2626;border:none;padding:5px 10px;border-radius:6px;font-size:.72em;cursor:pointer;font-family:inherit">제거</button>'
            +'</div>';
        }catch(itemErr){
          return '<div style="padding:8px 0;color:#f04452;font-size:.78em">⚠️ 멤버 #'+(mm&&mm.id||'?')+' 렌더 실패: '+e(String(itemErr&&itemErr.message||itemErr))+'</div>';
        }
      }).join('');
    }
    html+='</div>';
    /* 상담방 */
    html+='<div style="background:#fff;border:1px solid #e5e8eb;border-radius:10px;padding:14px 16px">'
      +'<div style="font-weight:700;font-size:.92em;margin-bottom:8px">💬 연결된 상담방 ('+rooms.length+')</div>';
    if(!rooms.length){
      html+='<div style="color:#8b95a1;font-size:.85em;padding:12px 0;text-align:center">연결된 상담방 없음</div>';
    } else {
      html+=rooms.map(function(rm){
        try{
          const st=rm.status==='closed'?'<span style="color:#9ca3af;font-size:.72em;margin-left:6px">종료</span>':'';
          return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #f2f4f6;cursor:pointer" onclick="closeBusinessDashboard();tab(\'rooms\');setTimeout(function(){openRoom(\''+rm.id+'\')},200)">'
            +'<div style="flex:1"><div style="font-size:.88em;font-weight:500">'+e(rm.name||rm.id)+st+'</div>'
            +'<div style="font-size:.72em;color:#8b95a1">ID: '+e(rm.id)+'</div></div>'
            +'<div style="color:#3182f6">›</div></div>';
        }catch(itemErr){
          return '<div style="padding:7px 0;color:#f04452;font-size:.78em">⚠️ 상담방 행 렌더 실패: '+e(String(itemErr&&itemErr.message||itemErr))+'</div>';
        }
      }).join('');
    }
    html+='</div>';
    stage='7.body set';
    $g('bdBody').innerHTML=html;
    stage='8.memo load';
    /* 본문 표시 후 메모 비동기 로드 — 본문 표시 실패해도 별도 로드 */
    setTimeout(()=>_bdLoadMemos(bid),50);
    stage='9.done';
  }catch(err){
    const msg='⚠️ 업체 정보 로딩 오류\n[stage='+stage+']\n'+(err&&err.message?err.message:'unknown');
    try{$g('bdBody').innerHTML='<div style="color:#f04452;padding:20px;font-size:.85em;white-space:pre-wrap">'+e(msg)+'</div>'}
    catch(_){alert(msg)}
  }
}

/* 📝 거래처(업체) 메모 — 조회·추가·삭제. memos 테이블의 target_business_id 사용. */
async function _bdLoadMemos(bid){
  const box=$g('bdMemoList');if(!box)return;
  try{
    const r=await fetch('/api/memos?scope=business_info&business_id='+encodeURIComponent(bid)+'&key='+encodeURIComponent(KEY));
    const d=await r.json();
    if(!d.ok){box.innerHTML='<span style="color:#f04452">메모 로드 실패: '+e(d.error||'unknown')+'</span>';return}
    const memos=d.memos||[];
    if(!memos.length){box.innerHTML='<span style="color:#9ca3af;font-size:.85em">아직 메모 없음. ＋ 메모 버튼으로 추가.</span>';return}
    box.innerHTML=memos.map(m=>{
      try{
        const t=(m.created_at||'').slice(0,10);
        const by=m.author_name?e(m.author_name):'';
        const content=e(String(m.content||'')).replace(/\n/g,'<br>');
        return '<div style="padding:8px 10px;border-left:3px solid #3182f6;background:#f9fafb;margin-bottom:6px;border-radius:4px">'
          +'<div style="font-size:.74em;color:#6b7280;margin-bottom:3px">'+t+(by?(' · '+by):'')
          +' <button onclick="_bdDeleteMemo('+m.id+','+bid+')" style="float:right;background:none;border:none;color:#dc2626;font-size:.78em;cursor:pointer;font-family:inherit;padding:0 4px">삭제</button></div>'
          +'<div style="line-height:1.5">'+content+'</div>'
        +'</div>';
      }catch(_){return ''}
    }).join('');
  }catch(err){
    box.innerHTML='<span style="color:#f04452">오류: '+e(err.message)+'</span>';
  }
}
/* 업체 메모 추가 — 모달 방식 (business.html 과 통일). DOM: #bdMemoModal
 * Phase M2-c (2026-05-05): 모달 제목에 업체명 동적 표시 ("🏢 ABC상회 메모 추가"). */
function _bdAddMemo(bid){
  const m=$g('bdMemoModal');const input=$g('bdMemoInput');
  if(!m||!m.style||!input)return;
  input.value='';
  m.dataset.bid=String(Number(bid)||0);
  /* 업체명 슬롯 채우기 — _bdCurrent.biz.company_name 사용 */
  const nameSlot=$g('bdMemoModalBizName');
  if(nameSlot){
    const bname = (typeof _bdCurrent!=='undefined' && _bdCurrent && _bdCurrent.biz && _bdCurrent.biz.company_name) || '업체';
    nameSlot.textContent = bname;
  }
  m.style.display='flex';
  setTimeout(function(){try{input.focus()}catch(_){}}, 50);
}
function _bdCloseMemoModal(){
  const m=$g('bdMemoModal');if(m&&m.style)m.style.display='none';
}
async function _bdSubmitMemo(){
  const m=$g('bdMemoModal');const input=$g('bdMemoInput');const btn=$g('bdMemoSaveBtn');
  if(!m||!input)return;
  const bid=Number(m.dataset&&m.dataset.bid||0);
  const txt=String(input.value||'').trim();
  if(!txt){try{input.focus()}catch(_){}return}
  if(!bid){alert('거래처 ID 누락');return}
  if(btn){btn.disabled=true;btn.textContent='저장 중...'}
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({memo_type:'거래처 정보',content:txt,target_business_id:bid})
    });
    const d=await r.json();
    if(btn){btn.disabled=false;btn.textContent='저장'}
    if(!d.ok){alert('추가 실패: '+(d.error||'unknown'));return}
    _bdCloseMemoModal();
    _bdLoadMemos(bid);
  }catch(err){
    if(btn){btn.disabled=false;btn.textContent='저장'}
    alert('오류: '+err.message);
  }
}
/* ESC 로 #bdMemoModal 닫기 (admin 단독 진입점 (staff redirect)) */
document.addEventListener('keydown',function(e){
  if(e.key!=='Escape')return;
  const m=$g('bdMemoModal');
  if(m&&m.style&&m.style.display==='flex')_bdCloseMemoModal();
});
async function _bdDeleteMemo(memoId, bid){
  if(!confirm('이 메모를 삭제하시겠습니까?'))return;
  try{
    const r=await fetch('/api/memos?id='+memoId+'&key='+encodeURIComponent(KEY),{method:'DELETE'});
    const d=await r.json();
    if(!d.ok){alert('삭제 실패: '+(d.error||'unknown'));return}
    _bdLoadMemos(bid);
  }catch(err){alert('오류: '+err.message)}
}
/* 🤖 거래처(업체) AI 요약 — 기존 roomSummaryModal 재활용. _summaryMode='business' 추가 분기. */
async function _bdRunBusinessSummary(bid){
  if(!bid){alert('업체 ID 없음');return}
  _summaryMode='business';
  _customerSummaryUserId=null;
  _customerSummaryBusinessId=Number(bid);
  const modal=$g('roomSummaryModal');
  const body=$g('rsBody');
  const meta=$g('rsMeta');
  if(!modal)return;
  modal.style.display='flex';
  document.body.style.overflow='hidden';
  _lastSummaryText=''; _lastSummaryJson=null;
  if(body)body.innerHTML='<div style="text-align:center;padding:40px 20px;color:#8b95a1;font-size:.9em;line-height:1.7">🏢 거래처(업체) 단위 요약 모드<br>기간 선택 후 <b style="color:#10b981">✨ 요약 생성</b> 버튼.<br><span style="font-size:.85em;color:#adb5bd">※ 이 업체의 모든 상담방 대화 + 메모 통합 요약</span></div>';
  if(meta)meta.textContent='[업체 단위] '+(_bdCurrent?.biz?.company_name||'#'+bid);
  if(typeof _setSummaryRangeUI==='function')_setSummaryRangeUI(_lastSummaryRange||'recent');
}
function _bdKV(k,v){
  if(v==null||v==='')return '<div style="color:#9ca3af"><b style="color:#6b7280;margin-right:6px">'+e(k)+'</b>—</div>';
  return '<div><b style="color:#6b7280;margin-right:6px">'+e(k)+'</b>'+e(String(v))+'</div>';
}
function closeBusinessDashboard(){
  $g('businessDashboardModal').style.display='none';
  document.body.style.overflow='';
}
async function _bdEditBasic(){
  if(!_bdCurrent||!_bdCurrent.biz)return;
  const b=_bdCurrent.biz;
  /* 간단 prompt 시리즈 — 차후 폼 모달로 개선 */
  const next={};
  const fields=[
    ['company_name','회사명',b.company_name],
    ['business_number','사업자등록번호',b.business_number],
    ['ceo_name','대표자명',b.ceo_name],
    ['business_category','업태',b.business_category],
    ['industry','업종',b.industry],
    ['address','주소',b.address],
    ['phone','전화',b.phone],
    ['contract_date','수임일자(YYYY-MM-DD)',b.contract_date],
    ['notes','노트',b.notes],
  ];
  for(const [k,label,cur] of fields){
    const v=prompt(label+' (빈값 Enter = 변경 없음)', cur||'');
    if(v===null)return; /* 취소 시 중단 */
    if(v!=='' && v!==(cur||''))next[k]=v;
  }
  if(!Object.keys(next).length){alert('변경된 필드 없음');return}
  try{
    const r=await fetch('/api/admin-businesses?key='+encodeURIComponent(KEY)+'&id='+_bdCurrent.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});
    const d=await r.json();
    if(!d.ok){alert('실패: '+(d.error||'unknown'));return}
    openBusinessDashboard(_bdCurrent.id);
    loadBusinessList();
  }catch(err){alert('오류: '+err.message)}
}
async function _bdAddMember(){
  if(!_bdCurrent)return;
  const uidStr=prompt('추가할 사용자 user_id 입력 (거래처 탭에서 ID 확인)','');
  if(!uidStr)return;
  const uid=Number(uidStr);if(!uid){alert('숫자 user_id');return}
  const role=confirm('👉 확인 = 대표자 / 취소 = 담당자')?'대표자':'담당자';
  try{
    const r=await fetch('/api/admin-business-members?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({business_id:_bdCurrent.id, user_id:uid, role:role, is_primary:(role==='대표자'?1:0)})});
    const d=await r.json();
    if(!d.ok){alert('실패: '+(d.error||'unknown'));return}
    openBusinessDashboard(_bdCurrent.id);
  }catch(err){alert('오류: '+err.message)}
}
async function _bdChangeRole(memberId, currentRole){
  const nextRole=currentRole==='대표자'?'담당자':'대표자';
  if(!confirm('역할을 "'+currentRole+'" → "'+nextRole+'" 로 변경합니까?'))return;
  try{
    const r=await fetch('/api/admin-business-members?key='+encodeURIComponent(KEY)+'&id='+memberId,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:nextRole})});
    const d=await r.json();
    if(!d.ok){alert('실패: '+(d.error||'unknown'));return}
    openBusinessDashboard(_bdCurrent.id);
  }catch(err){alert('오류: '+err.message)}
}
async function _bdTogglePrimary(memberId, currentPrimary){
  const next=currentPrimary?0:1;
  if(!confirm(next?'이 사람을 "주 연락처" 로 설정합니까? (기존 주연락은 해제됨)':'주 연락처 지정을 해제합니까?'))return;
  try{
    const r=await fetch('/api/admin-business-members?key='+encodeURIComponent(KEY)+'&id='+memberId,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({is_primary:next})});
    const d=await r.json();
    if(!d.ok){alert('실패: '+(d.error||'unknown'));return}
    openBusinessDashboard(_bdCurrent.id);
  }catch(err){alert('오류: '+err.message)}
}
async function _bdRemoveMember(memberId, displayName){
  if(!confirm((displayName||'이 구성원')+' 을(를) 이 업체에서 제외합니까?\n(업무 담당 해제. 사용자 계정은 유지)'))return;
  try{
    const r=await fetch('/api/admin-business-members?key='+encodeURIComponent(KEY)+'&id='+memberId,{method:'DELETE'});
    const d=await r.json();
    if(!d.ok){alert('실패: '+(d.error||'unknown'));return}
    openBusinessDashboard(_bdCurrent.id);
  }catch(err){alert('오류: '+err.message)}
}
