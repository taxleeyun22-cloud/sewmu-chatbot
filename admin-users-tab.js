/* ===== admin-users-tab.js — 사용자 탭 + 승인+업체 원클릭 + 거래처 사업장 관리 (쪼개기 Step 6) =====
 * 사장님 명령 (2026-05-02): "쪼개기 한다음에" — Step 6.
 *
 * 분리 범위 (admin.js → admin-users-tab.js, ~640줄):
 *  - 사용자 탭: currentStatus / refreshPendingBadge / setUserStatusActive / userStatus / loadUsers / 사용자 카드 렌더
 *  - 승인 액션: approveUser (모달 호출) / rejectUser / setAdminFlag / archiveClient / terminateUser
 *  - 승인 + 업체 연결 원클릭 모달: openApproveWithBusiness / 모달 분기 (_apbUser / _apbAllBiz / _apbStep)
 *  - 거래처 사업장 관리 (복수 지원): 사업장 추가 / 변경 / 제거 / 역할 / primary 등
 *
 * 의존 (cross-script via classic script global env):
 *  - admin.js: KEY, e, escAttr, $g, tab, escape helpers
 *  - admin-customer-dash.js: openCustomerDashboard
 *
 * 노출 (window 자동 — function 선언 + var 사용)
 *
 * 로드 순서 (admin.html — staff.html 은 redirect):
 *   admin.js → admin-memos.js → admin-customer-dash.js → admin-business-tab.js → admin-search-bulk.js
 *   → admin-rooms-list.js → admin-rooms-msg.js → admin-rooms-misc.js → admin-users-tab.js */

var currentStatus='pending';
async function refreshPendingBadge(){
try{
const r=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY)+'&status=pending');
const d=await r.json();
const n=(d.counts&&d.counts.pending)||0;
const b=$g('pendingBadge');
if(n>0){b.textContent=n;b.style.display='inline-block'}else{b.style.display='none'}
}catch{}
}

function userStatus(s){
currentStatus=s;
['Pending','Client','Guest','Rejected','Terminated','Admin'].forEach(k=>{
const el=$g('uSt'+k);if(!el)return;
const active=('uSt'+k).toLowerCase().indexOf(s.replace('approved_','').toLowerCase())>=0;
el.style.background=active?(s==='rejected'?'#8b95a1':s==='terminated'?'#6b7280':s==='pending'?'#f04452':s==='admin'?'#b45309':'#3182f6'):'#e5e8eb';
el.style.color=active?'#fff':'#8b95a1';
/* .on 클래스 동기화 — admin.html 의 html.embedded CSS 가 .on 으로 색상 결정 (!important).
   inline style 만 바꾸면 embedded 모드에서 색깔 안 바뀌는 버그 — 사장님 보고 (2026-04-29).
   해결: userStatus 가 .on 클래스도 토글. */
if(active) el.classList.add('on'); else el.classList.remove('on');
});
loadUsers(s);
}

async function loadUsers(status){
const el=$g('userList');
el.innerHTML='<div class="empty">불러오는 중...</div>';
try{
const r=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY)+'&status='+encodeURIComponent(status));
const d=await r.json();
if(d.counts){
$g('cPending').textContent=d.counts.pending||0;
$g('cClient').textContent=d.counts.approved_client||0;
$g('cGuest').textContent=d.counts.approved_guest||0;
$g('cRejected').textContent=d.counts.rejected||0;
if($g('cTerminated'))$g('cTerminated').textContent=d.counts.terminated||0;
if($g('cAdmin'))$g('cAdmin').textContent=d.counts.admin||0;
}
if(!d.users||d.users.length===0){el.innerHTML='<div class="empty">해당 상태의 사용자가 없습니다</div>';return}
el.innerHTML=d.users.map(u=>{
const nm=u.real_name||u.name||'이름없음';
const av=u.profile_image?'<img src="'+e(u.profile_image)+'" alt="">':nm[0];
const pv=u.provider||'';
const phone=u.phone?' · '+e(u.phone):'';
const nameConf=u.name_confirmed?'':'<span style="color:#f04452;font-size:.72em">⚠️본명미확인</span> ';
const adminMark=u.is_admin?' <span style="color:#fff;background:#8b6914;font-size:.65em;padding:2px 6px;border-radius:4px;font-weight:700">👑 관리자</span>':'';
/* Phase #10 적용 (2026-05-06): RBAC staff_role 배지 — manager / staff 표시 */
const roleMark=u.is_admin&&u.staff_role==='manager'?' <span style="color:#fff;background:#3182f6;font-size:.65em;padding:2px 6px;border-radius:4px;font-weight:700" title="사업장 관리·메모 작성 권한 강화">🛡️ Manager</span>':(u.is_admin&&u.staff_role==='staff'?' <span style="color:#475569;background:#f1f5f9;font-size:.65em;padding:2px 6px;border-radius:4px;font-weight:600">Staff</span>':'');
const todayCnt=u.today_count||0;
/* 🏢 고객이 직접 요청한 업체 등록 정보 — 대기 탭에서 승인 판단에 활용 */
const reqInfo=(u.requested_company_name||u.requested_business_number||u.requested_role)
  ? '<div style="margin-top:6px;padding:7px 10px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;font-size:.76em;color:#0c4a6e">'
    +'📝 본인 제출 회사정보 · '
    +(u.requested_company_name?'<b>회사명:</b> '+e(u.requested_company_name):'')
    +(u.requested_business_number?' <span style="color:#4b5563">· <b>사업자번호:</b> '+e(u.requested_business_number)+'</span>':'')
    +(u.requested_role?' <span style="background:'+(u.requested_role==='대표자'?'#fef3c7':'#e0f2fe')+';color:'+(u.requested_role==='대표자'?'#92400e':'#075985')+';padding:1px 6px;border-radius:4px;margin-left:4px;font-weight:700">'+e(u.requested_role)+'</span>':'')
    +(u.requested_at?' <span style="color:#9ca3af;font-size:.9em">· '+e(String(u.requested_at).substring(5,16))+'</span>':'')
    +'</div>'
  : '';
/* prefill 을 JSON 으로 데이터 속성에 안전 전달 */
const prefill=(u.requested_company_name||u.requested_business_number||u.requested_role)
  ? JSON.stringify({name:u.requested_company_name||'', bn:u.requested_business_number||'', role:u.requested_role||''}).replace(/"/g,'&quot;')
  : '';
let actions='';
const adminBtn=IS_OWNER?(u.is_admin
  ?'<button onclick="setAdminFlag('+u.id+',0)" style="background:#fff;color:#8b6914;border:1px solid #8b6914;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit;font-weight:600">👑 관리자 해제</button>'
  :'<button onclick="setAdminFlag('+u.id+',1)" style="background:#fff;color:#8b6914;border:1px dashed #8b6914;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit;font-weight:600">👑 관리자 승급</button>'
):'';
if(status==='admin'){
/* 👑 관리자 탭 — 관리자 해제 + Manager 등급 부여/해제 */
const isManager = u.staff_role === 'manager';
const managerBtn = IS_OWNER ? (isManager
  ? '<button onclick="setStaffRole('+u.id+',null)" style="background:#fff;color:#3182f6;border:1px solid #3182f6;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit;font-weight:600" title="Manager 권한 해제 (Staff 등급으로)">🛡️ Manager 해제</button>'
  : '<button onclick="setStaffRole('+u.id+',\'manager\')" style="background:#fff;color:#3182f6;border:1px dashed #3182f6;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit;font-weight:600" title="Manager 권한 부여 (사업장 관리·메모 권한 강화)">🛡️ Manager 부여</button>'
) : '';
actions='<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">'
+(IS_OWNER?'<button onclick="setAdminFlag('+u.id+',0)" style="background:#fff;color:#8b6914;border:1px solid #8b6914;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit;font-weight:600">👑 관리자 해제</button>':'<span style="font-size:.72em;color:#8b95a1">(owner 만 관리 가능)</span>')
+managerBtn
+'<button onclick="openCustomerDashboard('+u.id+',\''+e(nm).replace(/\'/g,'')+'\')" style="background:#fff;color:#3182f6;border:1px solid #3182f6;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit;font-weight:600">📋 거래처정보</button>'
+'</div>';
} else if(status==='pending'){
actions='<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">'
+'<button onclick="openApproveWithBusiness('+u.id+',\''+e(nm).replace(/\'/g,'')+'\',\''+e(u.phone||'').replace(/\'/g,'')+'\',\'approve_client\','+(prefill?'JSON.parse(this.dataset.pf)':'null')+')" '+(prefill?'data-pf="'+prefill+'"':'')+' style="background:#3182f6;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:.8em;cursor:pointer;font-family:inherit;font-weight:600" title="승인 + 업체·역할 연결을 한 번에">✓ 기장거래처 승인</button>'
/* '○ 일반 승인' 버튼 폐지 (사장님 명령 2026-05-02). pending 사용자는 → 기장거래처 승인 또는 거절만. */
+'<button onclick="openCustomerDashboard('+u.id+',\''+e(nm).replace(/\'/g,'')+'\')" style="background:#fff;color:#3182f6;border:1px solid #3182f6;padding:8px 14px;border-radius:8px;font-size:.8em;cursor:pointer;font-family:inherit;font-weight:600">📋 거래처정보</button>'
+'<button onclick="rejectUser('+u.id+')" style="background:#f04452;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:.8em;cursor:pointer;font-family:inherit;font-weight:600">✕ 거절</button>'
+adminBtn
+'</div>';
}else{
actions='<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">'
+'<button onclick="openCustomerDashboard('+u.id+',\''+e(nm).replace(/\'/g,'')+'\')" style="background:#fff;color:#3182f6;border:1px solid #3182f6;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit;font-weight:600">📋 거래처정보</button>'
+(status!=='approved_client'?'<button onclick="openApproveWithBusiness('+u.id+',\''+e(nm).replace(/\'/g,'')+'\',\''+e(u.phone||'').replace(/\'/g,'')+'\',\'approve_client\','+(prefill?'JSON.parse(this.dataset.pf)':'null')+')" '+(prefill?'data-pf="'+prefill+'"':'')+' style="background:#3182f6;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit" title="승인 + 업체 연결">→ 기장거래처</button>':'')
/* '→ 일반승인' 변경 버튼 폐지 (사장님 명령 2026-05-02). 다른 status 에서 일반승인으로 다운그레이드 X. */
+(status!=='pending'?'<button onclick="approveUser('+u.id+',\'pending\')" style="background:#8b95a1;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit">→ 대기로</button>':'')
+(IS_OWNER && status!=='rejected'?'<button onclick="rejectUser('+u.id+')" style="background:#f04452;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit">→ 거절</button>':'')
+(IS_OWNER && (status==='approved_client'||status==='approved_guest')?'<button onclick="archiveClient('+u.id+',\''+e(nm).replace(/\'/g,'')+'\')" title="폐업 처리 — 방만 closed, 고객 접근·계정은 유지" style="background:#fff;color:#8b6914;border:1px solid #fcd34d;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit">📦 폐업 처리</button>':'')
+(IS_OWNER && (status==='approved_client'||status==='approved_guest')?'<button onclick="terminateUser('+u.id+',\''+e(nm).replace(/\'/g,'')+'\')" title="거래 종료(기장이관) — 상담방 모두 closed, 고객 접근 차단" style="background:#fff;color:#6b7280;border:1px solid #6b7280;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit">🚫 거래 종료</button>':'')
+(IS_OWNER && status==='terminated'?'<button onclick="approveUser('+u.id+',\'approve_client\')" style="background:#3182f6;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit">🔄 거래 재개(기장)</button>':'')
+adminBtn
+'</div>';
}
/* 상호 + 이름 + 대표/담당자 뱃지 — 검색성·식별성 향상 (server: company_name·ceo_name JOIN) */
const company=(u.company_name||'').trim();
const ceoName=(u.ceo_name||'').trim();
const realNm=(u.real_name||'').trim();
const roleBadge=ceoName
  ? (realNm && realNm===ceoName
    ? '<span style="font-size:.62em;background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:4px;margin-left:6px;font-weight:600">🧑‍💼 대표</span>'
    : '<span style="font-size:.62em;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:4px;margin-left:6px;font-weight:600">👤 담당자</span>')
  : '';
const kakaoAlias=(u.name&&u.real_name&&u.name!==u.real_name?' <span style="font-size:.72em;color:#8b95a1">(카톡: '+e(u.name)+')</span>':'');
const nameLine=company
  ? '<div class="name">🏢 '+e(company)+' <span style="font-weight:500;color:#8b95a1;font-size:.88em">· '+e(nm)+'</span>'+roleBadge+kakaoAlias+adminMark+roleMark+'</div>'
  : '<div class="name">'+e(nm)+roleBadge+kakaoAlias+adminMark+roleMark+'</div>';
return '<div data-user-id="'+u.id+'" style="background:#fff;border-radius:12px;padding:16px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,.03)">'
+'<div style="display:flex;align-items:center;gap:14px">'
+'<div class="avatar">'+av+'</div>'
+'<div class="info">'+nameLine
+'<div class="meta">'+nameConf+(pv?'<span class="badge">'+pv+'</span> ':'')+e(u.email||'')+phone+'</div>'
+'<div class="meta" style="margin-top:3px">가입 '+e(u.created_at||'')+' · 오늘 '+todayCnt+'건</div>'
+'</div></div>'
+reqInfo
+actions
+'</div>';
}).join('');
}catch(err){el.innerHTML='<div class="empty">오류: '+e(err.message)+'</div>'}
}

async function approveUser(id,action){
try{
const r=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:id,action:action})});
const d=await r.json();
if(d.ok){loadUsers(currentStatus);refreshPendingBadge()}
else alert('실패: '+(d.error||'unknown'));
}catch(err){alert('오류: '+err.message)}
}

/* ===== ✅ 승인 + 🏢 업체 연결 원클릭 플로우 =====
   기장/일반 승인 버튼 → 이 모달 → (승인) + (업체 연결·역할) + (방 참여) 한 번에 */
var _apbUser=null;       /* {id, name, phone, action} */
var _apbAllBiz=[];
var _apbSelectedBizId=null;

async function openApproveWithBusiness(userId, displayName, phone, action, prefill){
  try {
  _apbUser={id:userId, name:displayName||'', phone:phone||'', action:action||'approve_client'};
  _apbSelectedBizId=null;
  const m=$g('approveBizModal');
  if(!m){alert('승인 모달이 페이지에 없습니다. Ctrl+Shift+R 로 강제 새로고침 후 다시 시도해주세요.');return;}
  const modeRadio=document.querySelector('input[name=apbMode][value=existing]');
  if(!modeRadio){alert('승인 모달 구성이 옛 버전입니다. Ctrl+Shift+R (또는 시크릿 창에서 테스트)');return;}
  const actLabel=action==='approve_guest'?'일반승인':'기장거래처 승인';
  const pfMark=prefill?' <span style="font-size:.72em;background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:4px;margin-left:4px">📝 고객 요청 자동 채움</span>':'';
  $g('apbUser').innerHTML='<b>'+e(displayName||'이름없음')+'</b>'+(phone?' · '+e(phone):'')
    +' <span style="font-size:.78em;color:#3b82f6;font-weight:700">→ '+actLabel+'</span>'+pfMark;
  /* 기본: 기존 업체 모드. 라디오·폼 초기화 */
  modeRadio.checked=true;
  _apbSwitchMode('existing');
  $g('apbSearch').value='';
  /* 📋 수임처 정보 */
  $g('apbNewName').value='';
  $g('apbNewForm').value='0.법인사업자';
  $g('apbNewCeo').value='';
  $g('apbNewBiz').value='';
  $g('apbNewSubBiz').value='';
  $g('apbNewCorpNo').value='';
  $g('apbNewAddr1').value='';
  $g('apbNewAddr2').value='';
  $g('apbNewPhone').value='';
  $g('apbNewIndustryCode').value='';
  $g('apbNewBizCategory').value='';
  $g('apbNewIndustry').value='';
  /* 📊 회계/급여 */
  $g('apbNewEstDate').value='';
  $g('apbNewFiscalTerm').value='';
  /* 기수: 올해 1/1 ~ 12/31 기본값 */
  var _thisYear=new Date().getFullYear();
  $g('apbNewFiscalStart').value=_thisYear+'-01-01';
  $g('apbNewFiscalEnd').value=_thisYear+'-12-31';
  $g('apbNewHrYear').value=_thisYear;
  const roleRadio=document.querySelector('input[name=apbRole][value=담당자]');
  if(roleRadio)roleRadio.checked=true;
  $g('apbAutoJoin').checked=true;
  /* 🏷️ 담당자 라벨 select 채우기 */
  const apbSel=$g('apbPriority');
  if(apbSel){
    apbSel.innerHTML='<option value="">— 미지정</option><option value="" disabled>불러오는 중...</option>';
    try{
      const labels=await _ensureRoomLabels(true);
      apbSel.innerHTML='<option value="">— 미지정</option>'
        +labels.map(lb=>'<option value="'+lb.id+'" style="background:'+escAttr(lb.color||'#fff')+'">'+e(lb.name)+'</option>').join('');
    }catch(_){}
  }

  /* 고객이 직접 요청한 값 있으면 → '새 업체 생성' 모드 + 자동 채움.
     세무사는 내용 확인·수정 후 승인만 누르면 됨 */
  if(prefill && (prefill.name || prefill.bn || prefill.role)){
    const newRadio=document.querySelector('input[name=apbMode][value=new]');
    if(newRadio){newRadio.checked=true;_apbSwitchMode('new');}
    if(prefill.name)$g('apbNewName').value=prefill.name;
    if(prefill.bn)$g('apbNewBiz').value=prefill.bn;
    /* 대표자명 힌트: real_name 이 있으면 (prefill 외부라 displayName 사용) */
    if(displayName)$g('apbNewCeo').value=displayName;
    if(prefill.role){
      const rr=document.querySelector('input[name=apbRole][value='+prefill.role+']');
      if(rr)rr.checked=true;
    }
  }

  m.style.display='flex';
  document.body.style.overflow='hidden';
  await _apbLoadBusinesses();
  } catch(err) {
    /* Phase 5-23: 디버그 안내 ("F12 Console") 제거. 세무사용 메시지만. */
    console.error('openApproveWithBusiness error:', err);
    alert('승인 모달 오류: '+(err&&err.message||err));
  }
}
function closeApproveBizModal(){
  const m=$g('approveBizModal');if(m)m.style.display='none';
  document.body.style.overflow='';
  _apbUser=null;_apbSelectedBizId=null;
}
/* 🔍 카카오 주소검색 (위하고 스타일) — 승인 모달 '새 업체 생성' 주소 입력용 */
function _apbOpenAddressSearch(){
  if(typeof daum==='undefined'||!daum.Postcode){
    alert('주소검색 스크립트가 아직 로드 중입니다. 잠시 후 다시 시도해주세요.');
    return;
  }
  new daum.Postcode({
    oncomplete: function(data){
      var full=data.roadAddress||data.jibunAddress||data.address||'';
      if(data.buildingName)full+=' ('+data.buildingName+')';
      $g('apbNewAddr1').value=full;
      var d2=$g('apbNewAddr2');if(d2)d2.focus();
    }
  }).open();
}
function _apbSwitchMode(mode){
  $g('apbExistingBox').style.display=mode==='existing'?'block':'none';
  $g('apbNewBox').style.display=mode==='new'?'block':'none';
}
async function _apbLoadBusinesses(){
  const el=$g('apbList');if(!el)return;
  el.innerHTML='<div style="text-align:center;color:#8b95a1;padding:20px 0;font-size:.8em">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-businesses?key='+encodeURIComponent(KEY));
    const d=await r.json();
    _apbAllBiz=(d.businesses||[]).filter(b=>b.status==='active');
    _apbFilterList();
  }catch(err){el.innerHTML='<div style="color:#f04452;padding:12px;font-size:.8em">오류: '+e(err.message)+'</div>'}
}
function _apbFilterList(){
  const el=$g('apbList');if(!el)return;
  const q=($g('apbSearch').value||'').trim().toLowerCase();
  const list=q
    ? _apbAllBiz.filter(b=>((b.company_name||'')+' '+(b.business_number||'')+' '+(b.ceo_name||'')).toLowerCase().indexOf(q)>=0)
    : _apbAllBiz;
  if(!list.length){el.innerHTML='<div style="text-align:center;color:#8b95a1;padding:16px 0;font-size:.8em">'+(q?'검색 결과 없음':'등록된 업체가 없습니다')+'</div>';return}
  el.innerHTML=list.slice(0,30).map(b=>{
    const selected=_apbSelectedBizId===b.id;
    const sub=[b.business_number?('#'+b.business_number):'', b.ceo_name||''].filter(Boolean).join(' · ');
    return '<div onclick="_apbPickBiz('+b.id+')" style="padding:8px 12px;border-bottom:1px solid #f2f4f6;cursor:pointer;background:'+(selected?'#dbeafe':'#fff')+'">'
      +'<div style="font-size:.88em;font-weight:600">'+e(b.company_name)+(selected?' ✅':'')+'</div>'
      +(sub?'<div style="font-size:.72em;color:#6b7280">'+e(sub)+'</div>':'')
      +'</div>';
  }).join('');
}
function _apbPickBiz(bid){
  _apbSelectedBizId=bid;
  _apbFilterList();
}
async function submitApproveWithBusiness(){
  if(!_apbUser)return;
  const mode=(document.querySelector('input[name=apbMode]:checked')||{}).value;
  const role=(document.querySelector('input[name=apbRole]:checked')||{}).value||'담당자';
  const autoJoin=$g('apbAutoJoin').checked;
  const btn=$g('apbSubmitBtn');

  if(mode==='existing' && !_apbSelectedBizId){
    alert('기존 업체를 선택하거나 "새 업체 생성" 으로 전환하세요');return;
  }
  if(mode==='new'){
    const nm=($g('apbNewName').value||'').trim();
    const ceo=($g('apbNewCeo').value||'').trim();
    const biz=($g('apbNewBiz').value||'').trim();
    const fy1=$g('apbNewFiscalStart').value;
    const fy2=$g('apbNewFiscalEnd').value;
    const hy=$g('apbNewHrYear').value;
    if(!nm){alert('회사명을 입력하세요');return}
    if(!ceo){alert('대표자명을 입력하세요');return}
    if(!biz){alert('사업자등록번호를 입력하세요');return}
    if(!fy1||!fy2){alert('기수 회계기간(시작/종료)을 입력하세요');return}
    if(!hy){alert('인사연도를 입력하세요');return}
  }
  if(btn){btn.disabled=true;btn.textContent='처리 중...';btn.style.opacity='.6'}
  try{
    /* 1) 승인 */
    const r1=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:_apbUser.id, action:_apbUser.action})});
    const d1=await r1.json();
    if(!d1.ok){alert('승인 실패: '+(d1.error||''));return}

    /* 2) 업체 — 기존 선택 or 신규 생성 */
    let businessId=_apbSelectedBizId;
    let createdRoomId=null;
    if(mode==='new'){
      /* 위하고 수임처 신규생성 스타일 — 전체 필드 */
      const addr1=($g('apbNewAddr1').value||'').trim();
      const addr2=($g('apbNewAddr2').value||'').trim();
      const body={
        company_name:$g('apbNewName').value.trim(),
        company_form:$g('apbNewForm').value,
        ceo_name:($g('apbNewCeo').value||'').trim()||null,
        business_number:($g('apbNewBiz').value||'').trim().replace(/\D/g,'')||null,
        sub_business_number:($g('apbNewSubBiz').value||'').trim().replace(/\D/g,'')||null,
        corporate_number:($g('apbNewCorpNo').value||'').trim().replace(/\D/g,'')||null,
        address:[addr1,addr2].filter(Boolean).join(' ')||null,
        phone:($g('apbNewPhone').value||'').trim()||null,
        industry_code:($g('apbNewIndustryCode').value||'').trim()||null,
        business_category:($g('apbNewBizCategory').value||'').trim()||null,
        industry:($g('apbNewIndustry').value||'').trim()||null,
        establishment_date:$g('apbNewEstDate').value||null,
        fiscal_year_start:$g('apbNewFiscalStart').value||null,
        fiscal_year_end:$g('apbNewFiscalEnd').value||null,
        fiscal_term:$g('apbNewFiscalTerm').value?Number($g('apbNewFiscalTerm').value):null,
        hr_year:$g('apbNewHrYear').value?Number($g('apbNewHrYear').value):null,
        service_type:'기장', /* 세무사 지시: 기장 고정 */
        contract_date:new Date().toISOString().slice(0,10), /* 수임일자 자동 오늘 */
        auto_create_room: autoJoin,
        priority: $g('apbPriority')?.value?Number($g('apbPriority').value):null,
      };
      const r2=await fetch('/api/admin-businesses?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d2=await r2.json();
      if(!d2.ok){alert('업체 생성 실패: '+(d2.error||''));return}
      businessId=d2.id;
      createdRoomId=d2.room_id||null;
    }

    /* 3) 구성원 연결 */
    const isPrimary=(role==='대표자')?1:0;
    const r3=await fetch('/api/admin-business-members?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({business_id:businessId, user_id:_apbUser.id, role:role, is_primary:isPrimary, phone:_apbUser.phone||null})});
    const d3=await r3.json();
    if(!d3.ok){alert('구성원 연결 실패: '+(d3.error||''));return}

    /* 4) 상담방 참여 — autoJoin 체크된 경우 */
    if(autoJoin){
      let targetRoomId=createdRoomId;
      if(!targetRoomId){
        /* 기존 업체의 첫 active 방 찾기 */
        const r4=await fetch('/api/admin-businesses?key='+encodeURIComponent(KEY)+'&id='+businessId);
        const d4=await r4.json();
        const activeRooms=(d4.rooms||[]).filter(x=>x.status==='active');
        if(activeRooms.length){targetRoomId=activeRooms[0].id}
        else {
          /* 방 없으면 새로 만들기 — auto_create_room flow 재사용 어렵고 admin-rooms action=create 호출 */
          const r5=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:(d4.business?.company_name||'상담방')+' 상담방', max_members:10, member_user_ids:[_apbUser.id]})});
          const d5=await r5.json();
          if(d5.ok){
            targetRoomId=d5.room_id;
            /* 생성된 방을 이 업체에 연결 */
            try{ await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=link_business&room_id='+encodeURIComponent(d5.room_id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:d5.room_id, business_id:businessId})});}catch{}
          }
        }
      }
      if(targetRoomId){
        try{
          await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=add_member&room_id='+encodeURIComponent(targetRoomId),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:targetRoomId, user_id:_apbUser.id})});
        }catch{}
      }
    }

    alert('✅ 승인 + 업체 연결 완료'+(createdRoomId?('\n📢 상담방도 함께 개설됨: '+createdRoomId):''));
    closeApproveBizModal();
    if(typeof loadUsers==='function')loadUsers(currentStatus);
    if(typeof refreshPendingBadge==='function')refreshPendingBadge();
  }catch(err){alert('오류: '+err.message)}
  finally{if(btn){btn.disabled=false;btn.textContent='✅ 승인하고 연결';btn.style.opacity=''}}
}

async function setAdminFlag(id,flag){
  if(!IS_OWNER){alert('owner 권한이 필요합니다');return}
  const msg=flag?'이 사용자를 관리자로 승급하시겠습니까?\n(승급 후 카톡/네이버 로그인 상태로 admin.html 접근 가능)':'관리자 권한을 해제하시겠습니까?';
  if(!confirm(msg))return;
  try{
    const r=await fetch('/api/admin-users?key='+encodeURIComponent(KEY)+'&action=set_admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:id,is_admin:flag})});
    const d=await r.json();
    if(d.ok){loadUsers(currentStatus);alert(flag?'✅ 관리자로 승급되었습니다':'✅ 관리자 권한이 해제되었습니다')}
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

/* Phase #10 적용 (2026-05-06): RBAC staff_role 부여/해제.
 * role: 'manager' | 'staff' | null (= 등급 해제, 단순 admin)
 * Manager 부여 시 _authz.checkRole('manager') 통과 → 사업장 매핑·메모 작성 등 권한 확장.
 * 일단은 owner UI 만 노출. 실제 endpoint 권한 분기는 후속 phase. */
async function setStaffRole(id, role){
  if(!IS_OWNER){alert('owner 권한이 필요합니다');return}
  const labels = { manager: '🛡️ Manager (사업장 관리)', staff: 'Staff (일반 admin)' };
  const target = role === null ? '권한 해제 (단순 admin)' : (labels[role] || role);
  if(!confirm('이 직원의 등급을 변경합니다.\n\n새 등급: ' + target + '\n\n진행할까요?')) return;
  try{
    const r = await fetch('/api/admin-users?key='+encodeURIComponent(KEY)+'&action=set_staff_role', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ user_id: id, staff_role: role })
    });
    const d = await r.json();
    if(d.ok){
      loadUsers(currentStatus);
      alert('✅ 등급 변경 완료\n새 등급: ' + (d.staff_role || '단순 admin'));
    } else {
      alert('실패: ' + (d.error || 'unknown'));
    }
  }catch(err){ alert('오류: ' + err.message); }
}

async function rejectUser(id){
const reason=prompt('거절 사유 (선택):','')||null;
try{
const r=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:id,action:'reject',reason:reason})});
const d=await r.json();
if(d.ok){loadUsers(currentStatus);refreshPendingBadge()}
else alert('실패: '+(d.error||'unknown'));
}catch(err){alert('오류: '+err.message)}
}

/* 상담방 헤더 ☰ → 🚫 거래 종료: 현재 방 멤버 중 role!='admin' 인 거래처 사장을 찾아 terminate */
function terminateCurrentRoomClient(){
  if(!currentRoomId){alert('상담방을 먼저 선택하세요');return}
  const candidates=(currentRoomMembers||[]).filter(m=>!m.left_at && m.role!=='admin' && m.user_id);
  if(!candidates.length){alert('이 방에 거래 종료 대상 거래처가 없습니다.\n(관리자만 있는 방이거나 이미 모두 나간 상태)');return}
  let picked=candidates[0];
  if(candidates.length>1){
    const list=candidates.map((m,i)=>(i+1)+') '+(m.real_name||m.name||'user#'+m.user_id)).join('\n');
    const choice=prompt('거래 종료할 거래처를 선택하세요:\n\n'+list+'\n\n번호 입력 (1~'+candidates.length+')','1');
    if(choice===null)return;
    const idx=parseInt(choice,10)-1;
    if(!(idx>=0 && idx<candidates.length)){alert('잘못된 번호');return}
    picked=candidates[idx];
  }
  terminateUser(picked.user_id, picked.real_name||picked.name||'');
}

/* 📦 폐업 처리 — 방만 closed. 접근은 유지 (가벼운 종료) */
async function archiveClient(id, displayName){
  const nm=displayName||'이 거래처';
  if(!confirm('📦 '+nm+' 을(를) 폐업 처리합니다.\n\n- 이 거래처의 모든 상담방이 "종료" 로 변경됩니다\n- 계정·기장거래처 상태·앱 접근은 그대로 유지 (언제든 재가동 가능)\n- 업체(businesses) 도 status=closed\n\n계속할까요?'))return;
  const reason=prompt('폐업 사유·메모 (선택):','')||null;
  try{
    const r=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:id, action:'archive', reason:reason})});
    const d=await r.json();
    if(!d.ok){alert('실패: '+(d.error||'unknown'));return}
    alert('✅ 폐업 처리 완료\n상담방 '+(d.rooms_closed||0)+'개 / 업체 '+(d.businesses_closed||0)+'개 closed');
    if(typeof loadUsers==='function')loadUsers(currentStatus);
    if(typeof loadRoomList==='function')loadRoomList();
    if(typeof loadBusinessList==='function' && _clientTabMode==='business')loadBusinessList();
  }catch(err){alert('오류: '+err.message)}
}

/* 거래 종료(기장이관) — 해당 사용자 접근 차단 + 모든 활성 방 closed. owner 는 즉시, staff 는 요청 큐 */
async function terminateUser(id, displayName){
  const nm=displayName||'이 거래처';
  if(!confirm('🚫 '+nm+' 와의 거래를 종료합니다.\n\n- 이 거래처의 모든 상담방이 "종료"로 변경됩니다\n- 해당 거래처는 앱에서 대화 내용을 더 이상 볼 수 없습니다\n- 관리자는 "🚫 종료" 탭에서 기록 관리 가능\n\n계속할까요?'))return;
  if(!confirm('한 번 더 확인: 거래 종료를 실행합니다.\n나중에 "🔄 거래 재개" 버튼으로 복구 가능합니다.'))return;
  const reason=prompt('종료 사유 (선택, 내부 기록용):','')||null;
  try{
    const r=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:id,action:'terminate',reason:reason})});
    const d=await r.json();
    if(d.ok){
      alert('✅ 거래 종료 완료');
      loadUsers(currentStatus);
      if(typeof loadRoomList==='function')loadRoomList();
    } else {
      alert('실패: '+(d.error||'unknown'));
    }
  }catch(err){alert('오류: '+err.message)}
}

/* ===== 거래처 사업장 관리 (복수 지원) ===== */
var currentProfileUserId=null;
var currentEditingBizId=null; // null이면 신규, 숫자면 수정

async function openProfile(userId,displayName){
  currentProfileUserId=userId;
  currentEditingBizId=null;
  $g('pmUserInfo').textContent='사용자: '+displayName+' (ID '+userId+')';
  $g('pmTitle').textContent=displayName+'님의 사업장';
  $g('profileModal').style.display='flex';
  pmShowList();
  await loadBusinesses();
}

function closeProfileModal(){$g('profileModal').style.display='none'}

function pmShowList(){
  $g('pmListView').style.display='block';
  $g('pmEditView').style.display='none';
}
function pmShowEdit(){
  $g('pmListView').style.display='none';
  $g('pmEditView').style.display='block';
}
function pmBackToList(){pmShowList();loadBusinesses()}

async function loadBusinesses(){
  if(!currentProfileUserId)return;
  const listEl=$g('pmBizList');
  listEl.innerHTML='<div style="padding:20px;text-align:center;color:#8b95a1;font-size:.85em">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-client-businesses?key='+encodeURIComponent(KEY)+'&user_id='+currentProfileUserId);
    const d=await r.json();
    const list=d.businesses||[];
    if(list.length===0){
      listEl.innerHTML='<div style="padding:24px;text-align:center;color:#8b95a1;font-size:.85em;background:#f9fafb;border-radius:8px">등록된 사업장이 없습니다<br><span style="font-size:.85em;color:#b0b8c1">위의 "＋ 사업장 추가" 버튼으로 등록하세요</span></div>';
      return;
    }
    listEl.innerHTML=list.map(function(b){
      const primary=b.is_primary?'<span style="font-size:.65em;background:#e0f5ec;color:#10b981;padding:2px 6px;border-radius:5px;margin-left:6px;font-weight:600">⭐ 주</span>':'';
      const bizNo=b.business_number?b.business_number.slice(0,3)+'-'+b.business_number.slice(3,5)+'-'+b.business_number.slice(5):'-';
      const info=[b.business_type,b.tax_type,b.industry].filter(Boolean).join(' · ')||'-';
      return '<div style="background:#f9fafb;border:1px solid #e5e8eb;border-radius:10px;padding:14px;margin-bottom:8px;cursor:pointer;transition:.15s" onclick="pmEditBusiness('+b.id+')" onmouseover="this.style.background=\'#f2f4f6\'" onmouseout="this.style.background=\'#f9fafb\'">'
        +'<div style="font-weight:600;font-size:.92em;color:#191f28;margin-bottom:4px">'+e(b.company_name||'상호 미등록')+primary+'</div>'
        +'<div style="font-size:.75em;color:#555;margin-bottom:2px">'+e(info)+'</div>'
        +'<div style="font-size:.72em;color:#8b95a1">사업자번호 '+e(bizNo)+(b.ceo_name?' · 대표 '+e(b.ceo_name):'')+'</div>'
        +(b.notes?'<div style="font-size:.72em;color:#3182f6;margin-top:6px;padding-top:6px;border-top:1px solid #e5e8eb">📝 '+e(b.notes.slice(0,60))+(b.notes.length>60?'...':'')+'</div>':'')
        +'</div>';
    }).join('');
  }catch(err){listEl.innerHTML='<div style="padding:20px;color:#f04452">오류: '+e(err.message)+'</div>'}
}

async function pmClearForm(){
  ['pmCompany','pmBizNo','pmCEO','pmPhone','pmIndustry','pmAddr','pmAddr2','pmEstDate','pmEmp','pmRevenue','pmNotes','pmSubBizNo','pmCorpNo','pmBizCategory','pmIndustryCode','pmFiscalStart','pmFiscalEnd','pmFiscalTerm','pmHrYear'].forEach(id=>{const el=$g(id);if(el)el.value=''});
  $g('pmBizType').value='';
  $g('pmTaxType').value='';
  $g('pmVatPeriod').value='';
  $g('pmIsPrimary').checked=false;
  /* 🏷️ 담당자 라벨 select 채우기 */
  const pmSel=$g('pmPriority');
  if(pmSel){
    pmSel.innerHTML='<option value="">— 미지정</option>';
    try{
      const labels=await _ensureRoomLabels(true);
      pmSel.innerHTML='<option value="">— 미지정</option>'
        +labels.map(lb=>'<option value="'+lb.id+'" style="background:'+escAttr(lb.color||'#fff')+'">'+e(lb.name)+'</option>').join('');
    }catch(_){}
  }
}
function _pmOpenAddressSearch(){
  if(typeof daum==='undefined'||!daum.Postcode){
    alert('주소검색 스크립트가 아직 로드 중입니다.');return;
  }
  new daum.Postcode({
    oncomplete:function(data){
      var full=data.roadAddress||data.jibunAddress||data.address||'';
      if(data.buildingName)full+=' ('+data.buildingName+')';
      $g('pmAddr').value=full;
      var d2=$g('pmAddr2');if(d2)d2.focus();
    }
  }).open();
}
function _pmUpdateFiscalTerm(){
  var t=_calcFiscalTerm($g('pmEstDate')?.value);
  var el=$g('pmFiscalTerm');if(el)el.value=t;
}

function pmNewBusiness(){
  currentEditingBizId=null;
  pmClearForm();
  $g('pmDeleteBtn').style.display='none';
  pmShowEdit();
}

async function pmEditBusiness(bizId){
  currentEditingBizId=bizId;
  pmClearForm();
  $g('pmDeleteBtn').style.display='inline-flex';
  pmShowEdit();
  try{
    const r=await fetch('/api/admin-client-businesses?key='+encodeURIComponent(KEY)+'&user_id='+currentProfileUserId);
    const d=await r.json();
    const b=(d.businesses||[]).find(x=>x.id===bizId);
    if(!b)return;
    $g('pmCompany').value=b.company_name||'';
    $g('pmBizNo').value=b.business_number||'';
    $g('pmCEO').value=b.ceo_name||'';
    $g('pmPhone').value=b.phone||'';
    $g('pmIndustry').value=b.industry||'';
    $g('pmBizType').value=b.business_type||'';
    $g('pmTaxType').value=b.tax_type||'';
    $g('pmVatPeriod').value=b.vat_period||'';
    $g('pmEstDate').value=b.establishment_date||'';
    $g('pmEmp').value=b.employee_count||'';
    $g('pmAddr').value=b.address||'';
    $g('pmRevenue').value=b.last_revenue||'';
    $g('pmNotes').value=b.notes||'';
    $g('pmIsPrimary').checked=!!b.is_primary;
    $g('pmSubBizNo').value=b.sub_business_number||'';
    $g('pmCorpNo').value=b.corporate_number||'';
    $g('pmBizCategory').value=b.business_category||'';
    $g('pmIndustryCode').value=b.industry_code||'';
    $g('pmFiscalStart').value=b.fiscal_year_start||'';
    $g('pmFiscalEnd').value=b.fiscal_year_end||'';
    /* 위하고 확장 (company_form · fiscal_term · hr_year · addr2 · priority) */
    if($g('pmBizType')&&b.company_form)$g('pmBizType').value=b.company_form;
    if($g('pmFiscalTerm'))$g('pmFiscalTerm').value=b.fiscal_term||'';
    if($g('pmHrYear'))$g('pmHrYear').value=b.hr_year||'';
    if($g('pmPriority'))$g('pmPriority').value=b.priority||'';
    /* pmAddr2 는 저장 시 address 에 병합됐을 수 있음 — 분리 로직 없으면 빈값 */
    if($g('pmAddr2'))$g('pmAddr2').value='';
  }catch(err){alert('불러오기 실패: '+err.message)}
}

async function saveBusiness(){
  if(!currentProfileUserId)return;
  const payload={
    company_name:$g('pmCompany').value.trim(),
    business_number:$g('pmBizNo').value.trim().replace(/\D/g,''),
    ceo_name:$g('pmCEO').value.trim(),
    phone:$g('pmPhone').value.trim(),
    industry:$g('pmIndustry').value.trim(),
    business_type:$g('pmBizType').value,
    tax_type:$g('pmTaxType').value,
    vat_period:$g('pmVatPeriod').value,
    establishment_date:$g('pmEstDate').value,
    employee_count:$g('pmEmp').value,
    address:$g('pmAddr').value.trim(),
    last_revenue:$g('pmRevenue').value,
    notes:$g('pmNotes').value.trim(),
    is_primary:$g('pmIsPrimary').checked?1:0,
    sub_business_number:$g('pmSubBizNo').value.trim(),
    corporate_number:$g('pmCorpNo').value.trim(),
    business_category:$g('pmBizCategory').value.trim(),
    industry_code:$g('pmIndustryCode').value.trim(),
    fiscal_year_start:$g('pmFiscalStart').value,
    fiscal_year_end:$g('pmFiscalEnd').value,
    /* 위하고 확장 3필드 + 담당자 라벨 + address 병합 */
    company_form:$g('pmBizType').value||null,
    fiscal_term:$g('pmFiscalTerm')?.value?Number($g('pmFiscalTerm').value):null,
    hr_year:$g('pmHrYear')?.value?Number($g('pmHrYear').value):null,
    priority:$g('pmPriority')?.value?Number($g('pmPriority').value):null,
  };
  /* pmAddr + pmAddr2 병합 저장 */
  var _addr2=($g('pmAddr2')?.value||'').trim();
  if(_addr2)payload.address=[(payload.address||'').trim(),_addr2].filter(Boolean).join(' ');
  try{
    let r,d;
    if(currentEditingBizId){
      r=await fetch('/api/admin-client-businesses?key='+encodeURIComponent(KEY)+'&id='+currentEditingBizId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    } else {
      r=await fetch('/api/admin-client-businesses?key='+encodeURIComponent(KEY)+'&user_id='+currentProfileUserId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    }
    d=await r.json();
    if(d.ok){pmBackToList()}
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

async function deleteBusiness(){
  if(!currentEditingBizId)return;
  if(!confirm('이 사업장 정보를 삭제합니다. 계속할까요?'))return;
  try{
    const r=await fetch('/api/admin-client-businesses?key='+encodeURIComponent(KEY)+'&id='+currentEditingBizId,{method:'DELETE'});
    const d=await r.json();
    if(d.ok){pmBackToList()}
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

/* CSV 일괄 업로드 기능은 2026-04-24 제거됨. 위하고 폼으로 거래처 1건씩 등록. */

