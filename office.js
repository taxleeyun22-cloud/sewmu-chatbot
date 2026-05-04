/* office.js — office.html 인라인 JS 외부화 (Phase H6b, 2026-05-04) */

/* office = admin iframe 통째 wrapper. 사이드바 클릭 → admin 함수 직접 호출 (사장님 명령) */

const ADMIN_KEY=(typeof sessionStorage!=='undefined'&&sessionStorage.getItem('admin_key'))||'';
const $=id=>document.getElementById(id);
const escAttr=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let ME=null;
const ROOM_LABELS=new Map();
let STAFF_COUNTS={};

function authQS(){ return ADMIN_KEY?'?key='+encodeURIComponent(ADMIN_KEY):''; }
function authQSAmp(){ return ADMIN_KEY?'&key='+encodeURIComponent(ADMIN_KEY):''; }

function setCnt(id,n){
  const el=$(id); if(!el) return;
  n=parseInt(n)||0;
  el.textContent=n;
  const target=el.closest('.of-pill')||el;
  target.style.display=n>0?'':'none';
}

/* iframe 안 admin 함수 호출 (로드 안 끝났으면 폴링) */
function callAdmin(fnName, ...args){
  return callAdminSeq([[fnName, ...args]]);
}

/* 여러 함수를 동기 순서로 호출. 과거 setTimeout 체인 + 각 callAdmin 의 polling 이 race 를 만들어
   '기장거래처 클릭 → 대기 탭에 active 가 남는 버그' 발생. 한 폴링 안에서 순차 실행. */
function callAdminSeq(calls){
  const f=$('adminFrame');
  if(!f || !Array.isArray(calls) || !calls.length) return;
  const ready=()=>{
    try{ return !!(f.contentWindow && typeof f.contentWindow.tab === 'function'); }
    catch(_){ return false; }
  };
  const run=()=>{
    const cw=f.contentWindow;
    for(const c of calls){
      const [name, ...args] = c;
      try{
        if(typeof cw[name]==='function') cw[name](...args);
      }catch(e){ console.warn('[callAdminSeq]',name,e); }
    }
  };
  if(ready()){ run(); return; }
  let tries=0;
  const t=setInterval(()=>{
    tries++;
    if(ready()){ clearInterval(t); run(); }
    else if(tries>=25) clearInterval(t);
  },200);
}

async function fetchCurrentUser(){
  try{
    const r=await fetch('/api/auth/me',{credentials:'include'});
    const j=await r.json();
    if(j && j.logged_in && j.user) ME=j.user;
  }catch(_){}
  return ME;
}

async function fetchRoomLabels(){
  try{
    const r=await fetch('/api/admin-room-labels'+authQS(),{credentials:'include'});
    if(!r.ok) return;
    const j=await r.json();
    const labels=(j.labels||[]).filter(l=>l.active!==0);
    ROOM_LABELS.clear();
    const newCounts={};
    for(const l of labels){
      ROOM_LABELS.set(l.id,{name:l.name,color:l.color});
      newCounts[l.name]=0;
    }
    STAFF_COUNTS=newCounts;
  }catch(_){}
}

async function fetchSidebarCounts(){
  /* ADMIN_KEY 없어도 cookie (사장님 카카오 로그인) 로 인증 통과 가능 — credentials:'include' */
  try{
    const [apprRes,memoRes,trashRes,termRes]=await Promise.all([
      fetch('/api/admin-approve?status=pending'+authQSAmp(),{credentials:'include'}),
      fetch('/api/memos?scope=my&only_mine=1'+authQSAmp(),{credentials:'include'}),
      fetch('/api/memos?scope=trash_count'+authQSAmp(),{credentials:'include'}),
      fetch('/api/admin-termination-requests?status=pending'+authQSAmp(),{credentials:'include'}).catch(()=>null)
    ]);
    if(apprRes.ok){
      const j=await apprRes.json(); const c=j.counts||{};
      setCnt('sbUserPending',c.pending||0);
      setCnt('sbUserClient',c.approved_client||0);
      setCnt('sbUserGuest',c.approved_guest||0);
      setCnt('sbUserRejected',c.rejected||0);
      setCnt('sbUserTerminated',c.terminated||0);
      setCnt('sbUserAdmin',c.admin||0);
    }
    if(memoRes.ok){
      const j=await memoRes.json();
      /* 사장님 명령: 카운트는 '오늘+오버듀+3일 이내' 만 (전체 X). 임박한 일만 빨간 뱃지. */
      const today=new Date(Date.now()+9*60*60*1000); today.setHours(0,0,0,0);
      const limit=new Date(today.getTime()+3*86400000);  /* +3일 */
      const arr=(j.memos||[]).filter(m=>{
        if(!m.due_date) return false;  /* 기한 없는 건 제외 */
        const d=new Date(m.due_date+'T00:00:00+09:00');
        return d<=limit;  /* 오버듀 + 오늘 + 3일 이내 */
      });
      setCnt('sbCntTodo',arr.length);
    }
    if(trashRes.ok){
      const j=await trashRes.json();
      setCnt('sbCntTrash',j.count||0);
    }
    if(termRes && termRes.ok){
      try{ const j=await termRes.json(); setCnt('sbCntTermReq',(j.requests||[]).length||0); }catch(_){}
    }
  }catch(_){}
}

/* 사이드바 검색 폐기 — 통합 검색은 admin iframe 안 #clientSearchInput 가 담당 */

/* ===== Collapsible 사이드바 섹션 ===== */
const COLLAPSE_KEY='office_collapsed_sections_v1';
function loadCollapsed(){
  try{ return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY)||'[]')); }
  catch(_){ return new Set(); }
}
function saveCollapsed(set){
  try{ localStorage.setItem(COLLAPSE_KEY,JSON.stringify(Array.from(set))); }catch(_){}
}
function applyCollapsed(){
  const set=loadCollapsed();
  document.querySelectorAll('.of-sb-section[data-section-key]').forEach(sec=>{
    const k=sec.dataset.sectionKey;
    if(set.has(k)) sec.classList.add('collapsed');
    else sec.classList.remove('collapsed');
  });
}
document.querySelectorAll('.of-sb-section[data-section-key]').forEach(sec=>{
  sec.addEventListener('click',()=>{
    const k=sec.dataset.sectionKey;
    const set=loadCollapsed();
    if(set.has(k)){ set.delete(k); sec.classList.remove('collapsed'); }
    else{ set.add(k); sec.classList.add('collapsed'); }
    saveCollapsed(set);
  });
});

function renderSbStaff(){
  const list=$('sbStaffList'); if(!list) return;
  const entries=Object.entries(STAFF_COUNTS);
  if(!entries.length){
    list.innerHTML='<div style="padding:8px 16px;font-size:11px;color:var(--sb-text-mute,#8b95a1)">관리자에서 라벨을 만들면 표시됩니다.</div>';
    const sbAdd=$('sbAddStaff'); if(sbAdd) sbAdd.style.display='none';
    return;
  }
  list.innerHTML=entries.map(([name,cnt])=>{
    const labelInfo=Array.from(ROOM_LABELS.values()).find(l=>l.name===name);
    const color=labelInfo?.color||'#6b7280';
    const cntHidden=cnt>0?'':'display:none';
    return `<button class="of-sb-item" data-staff="${escAttr(name)}" type="button">
      <span class="ic" style="color:${color}">●</span><span class="lb">${escAttr(name)}</span><span class="cnt" style="${cntHidden}">${cnt}</span>
    </button>`;
  }).join('');
  const sbAdd=$('sbAddStaff'); if(sbAdd) sbAdd.style.display='none';
  const sbSec=$('sbSecStaff'); if(sbSec && sbSec.firstChild) sbSec.firstChild.textContent='담당자별 ';
}

function renderHeaderDate(){
  /* 헤더 제거됐으면 패스 */
  const el=$('hdrDate'); if(!el) return;
  const d=new Date();
  const dn=['일','월','화','수','목','금','토'][d.getDay()];
  const pad=n=>String(n).padStart(2,'0');
  el.textContent=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} (${dn})`;
}

function setRole(_role){
  document.body.dataset.role='boss';
  if(ME){
    const name=ME.real_name||ME.name||'관리자';
    if($('sbName')) $('sbName').textContent=name;
    if($('sbAvatar')) $('sbAvatar').textContent=name.charAt(0);
    if($('sbRole')) $('sbRole').textContent=(ME.id===1)?'세무사 (사장님)':'관리자';
  }else{
    if($('sbName')) $('sbName').textContent='이재윤';
    if($('sbAvatar')) $('sbAvatar').textContent='이';
    if($('sbRole')) $('sbRole').textContent='세무사 (사장님)';
  }
  const back=$('backToAdmin');
  if(back){ back.href='/admin.html'; back.title='관리자 화면으로'; }
  renderSbStaff();
}

/* ===== 사이드바 클릭 매핑 ===== */
$('sidebar')?.addEventListener('click',e=>{
  const it=e.target.closest('.of-sb-item');
  if(!it) return;

  /* 사용자 카테고리 — 한 번의 sequential 호출 (race 방지)
     주의: admin.js tab('users') 가 loadUsers(currentStatus||'pending') 를 자동으로
     호출하기 때문에, currentStatus 를 먼저 세팅해야 잘못된 status 의 list 가 안 떠 옴.
     과거 사고: userStatus('approved_client') 직전 tab('users') 가 loadUsers('pending')
     fetch 를 시작 → race 로 pending 응답이 client 응답을 덮어쓰면 button 은 client 인데
     list 는 pending. */
  if(it.dataset.mode==='user'){
    document.querySelectorAll('#sidebar .of-sb-item').forEach(x=>x.classList.remove('on'));
    it.classList.add('on');
    const st=it.dataset.status;
    const f=$('adminFrame');
    /* currentStatus 를 직접 set — admin.js 안 module-scoped 변수라 안 됨.
       대신 admin.js 가 현재 노출한 함수만 사용. tab() 호출 전에 status 를 설정할 방법은
       userStatus() 자체를 먼저 호출하는 것 — 이러면 currentStatus 도 set 되고 styles 도 set */
    callAdminSeq([
      ['userStatus', st],          /* 1. currentStatus + buttons + loadUsers(st) */
      ['setClientTabMode','user'], /* 2. user mode view 표시 */
      ['tab','users']              /* 3. tab visibility — loadUsers(currentStatus=st) 동일 status fetch */
    ]);
    return;
  }

  /* 업체 카테고리 */
  if(it.dataset.mode==='business'){
    document.querySelectorAll('#sidebar .of-sb-item').forEach(x=>x.classList.remove('on'));
    it.classList.add('on');
    callAdminSeq([
      ['tab','users'],
      ['setClientTabMode','business']
    ]);
    return;
  }

  /* 관리 카테고리 (admin 탭 직접) */
  if(it.dataset.adminTab){
    document.querySelectorAll('#sidebar .of-sb-item').forEach(x=>x.classList.remove('on'));
    it.classList.add('on');
    callAdmin('tab',it.dataset.adminTab);
    return;
  }

  /* 담당자별 라벨 클릭 → admin 상담방 + 라벨 필터 */
  if(it.dataset.staff){
    document.querySelectorAll('#sidebar .of-sb-item').forEach(x=>x.classList.remove('on'));
    it.classList.add('on');
    let labelId=null;
    for(const [id,info] of ROOM_LABELS){
      if(info.name===it.dataset.staff){ labelId=id; break; }
    }
    /* tab(rooms) → _roomFilterSet → loadRoomList 순차 */
    if(labelId){
      callAdminSeq([
        ['tab','rooms'],
        ['_roomFilterSet', new Set([labelId])],
        ['loadRoomList']
      ]);
    }else{
      callAdmin('tab','rooms');
    }
    return;
  }
});

/* 알림 버튼 → admin iframe 모달 */
$('sbMyTodosBtn')?.addEventListener('click',(e)=>{
  e.stopPropagation();
  callAdmin('openMyTodos');
});
$('sbTermReqBtn')?.addEventListener('click',(e)=>{
  e.stopPropagation();
  callAdmin('openTerminationRequests');
});

/* 휴지통 — admin iframe 의 trashModal 열기 (메모 빡센 세팅 — 사장님 명령 2026-04-30) */
$('sbTrashBtn')?.addEventListener('click',(e)=>{
  e.stopPropagation();
  callAdmin('openTrash');
});

/* 모바일 햄버거 */
$('burger')?.addEventListener('click',()=>$('sidebar')?.classList?.toggle('open'));
document.addEventListener('click',e=>{
  if(window.innerWidth>=1024) return;
  const sb=$('sidebar');
  if(!sb||!sb.classList.contains('open')) return;
  if(e.target.closest('#sidebar')||e.target.closest('#burger')) return;
  sb.classList.remove('open');
});

/* ===== 부트스트랩 ===== */
setRole('boss');
renderHeaderDate();
applyCollapsed();
(async ()=>{
  try{
    await Promise.all([fetchCurrentUser(),fetchRoomLabels()]);
    setRole('boss');
    renderSbStaff();
    await fetchSidebarCounts();
  }catch(e){ console.error('[boot]',e); }
})();

/* iframe 안에서 status 변경 (승인·거절·종료·관리자 토글) 후 사이드바 카운트 동기화 */
window.addEventListener('message',e=>{
  if(!e.data||typeof e.data!=='object') return;
  if(e.data.type==='admin:userStatusChanged'||e.data.type==='admin:roomLabelChanged'){
    fetchSidebarCounts();
    if(e.data.type==='admin:roomLabelChanged') fetchRoomLabels().then(renderSbStaff);
  }
});

/* iframe 모달 열고 닫힐 때마다 사이드바 카운트 폴링 (간단). 1분마다 자동 갱신 */
setInterval(()=>{
  if(document.visibilityState==='visible') fetchSidebarCounts();
},60000);

/* 헤더 / 알림 등 admin 의 hdr 안 버튼들 직접 호출 매핑 (관리 카테고리에 추가 가능) */
window.officeOpenSearch=()=>callAdmin('openSearch');
window.officeOpenMyTodos=()=>callAdmin('openMyTodos');
window.officeOpenBulkSend=()=>callAdmin('openBulkSend');
window.officeOpenTermination=()=>callAdmin('openTerminationRequests');
