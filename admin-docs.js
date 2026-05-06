/* ===== admin-docs.js — 풀스크린 이미지 뷰어 + 세무 문서 관리 탭 (쪼개기 Step 7) =====
 * 사장님 명령 (2026-05-02): "쪼개기 한다음에" — Step 7.
 *
 * 분리 범위 (admin.js → admin-docs.js, ~450줄):
 *  - 풀스크린 이미지 뷰어 (카톡 스타일):
 *      ivState / collectImagesNear / openImageViewer / closeImageViewer
 *      + 스와이프 / 줌 / pan / next/prev / index 표시
 *  - 세무 문서 관리 탭:
 *      loadDocsTab / 문서 카드 렌더 / 승인·반려 / 카테고리 필터
 *      + 문서 상세 모달 / 다운로드 / 미리보기
 *
 * 의존 (cross-script via classic script global env):
 *  - admin.js: KEY, e, escAttr, $g, fileIconFor
 *  - admin-rooms-msg.js: 영수증 승인 액션 cross
 *  - admin-customer-dash.js: openCustomerDashboard
 *
 * 노출 (window 자동 — function 선언 + var 사용)
 *
 * 로드 순서 (admin.html — staff.html 은 redirect):
 *   admin.js → admin-memos.js → admin-customer-dash.js → admin-business-tab.js → admin-search-bulk.js
 *   → admin-rooms-list.js → admin-rooms-msg.js → admin-rooms-misc.js → admin-users-tab.js → admin-docs.js */

/* ===== 풀스크린 이미지 뷰어 (카톡 스타일) ===== */
var ivState={srcs:[],idx:0,startX:0,startY:0,dx:0,dy:0,touching:false,swiped:false,axis:null};
function collectImagesNear(el){
  var c=el.closest(".rmsgs")||el.closest("#msgs")||el.closest("#roomChatMessages")||el.closest("#riPhotoGrid")||document.body;
  var nodes=c.querySelectorAll("img.rc-img-msg, img.ri-photo, .ri-photo img");
  var arr=[];nodes.forEach(function(n){if(n.src)arr.push(n.src)});
  return arr.length?arr:[el.src];
}
function openImgViewer(src,srcs){
  if(!Array.isArray(srcs)||srcs.length===0)srcs=[src];
  var i=srcs.indexOf(src);if(i<0)i=0;
  ivState.srcs=srcs;ivState.idx=i;
  var v=document.getElementById("imgViewer");if(!v)return;
  v.classList.add("open");v.classList.toggle("has-multiple",srcs.length>1);
  document.body.style.overflow="hidden";
  renderIvImg();
  try{history.pushState({iv:1},"",location.href)}catch(e){}
}
function closeImgViewer(){
  var v=document.getElementById("imgViewer");
  if(!v||!v.classList.contains("open"))return;
  v.classList.remove("open");document.body.style.overflow="";
  try{if(history.state&&history.state.iv)history.back()}catch(e){}
}
function renderIvImg(){
  var img=document.getElementById("ivImg");if(!img)return;
  img.src=ivState.srcs[ivState.idx]||"";
  var c=document.getElementById("ivCounter");
  if(c)c.textContent=(ivState.idx+1)+" / "+ivState.srcs.length;
}
function imgViewerNav(d){
  if(ivState.srcs.length<2)return;
  var next=ivState.idx+d;
  if(next<0||next>=ivState.srcs.length)return;
  ivState.idx=next;
  renderIvImg();
}
async function saveImgViewer(){
  var src=ivState.srcs[ivState.idx];if(!src)return;
  if(!confirm('사진을 저장하시겠습니까?'))return;
  try{
    var r=await fetch(src);if(!r.ok)throw new Error();
    var b=await r.blob();
    var nm=(src.split("/").pop()||"image").split("?")[0]||"image";
    var mime=b.type;
    if(!mime||mime==="application/octet-stream"){
      var urlExt=((nm.match(/\.(\w+)$/)||[,""])[1]||"").toLowerCase();
      mime=urlExt==="png"?"image/png":urlExt==="webp"?"image/webp":urlExt==="gif"?"image/gif":urlExt==="heic"?"image/heic":"image/jpeg";
      b=b.slice(0,b.size,mime);
    }
    var ext=(mime.split("/")[1]||"jpg").replace("jpeg","jpg");
    if(!/\.\w+$/.test(nm))nm+="."+ext;
    /* 모바일(iOS 사진앱·Android 갤러리)만 Web Share API 경유.
       PC 는 무조건 파일 다운로드 — 공유 시트로 빠지면 "저장" 의도와 다름 */
    var isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent||'');
    if(isMobile){
      try{
        if(typeof File==="function"&&navigator.canShare){
          var file=new File([b],nm,{type:mime});
          if(navigator.canShare({files:[file]})){
            await navigator.share({files:[file]});
            return;
          }
        }
      }catch(se){
        if(se&&se.name==="AbortError")return;
      }
    }
    /* PC · 공유 실패 폴백: 다운로드 링크 */
    var url=URL.createObjectURL(b);
    var a=document.createElement("a");
    a.href=url;a.download=nm;document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(url);a.remove()},150);
  }catch(e){window.open(src,"_blank")}
}
(function(){
  function init(){
    var v=document.getElementById("imgViewer");if(!v)return false;
    function img(){return document.getElementById("ivImg")}
    function resetTransform(animate){
      var i=img();if(!i)return;
      i.style.transition=animate?"transform .2s ease-out":"none";
      i.style.transform="";
    }
    v.addEventListener("click",function(e){
      if(ivState.swiped){ivState.swiped=false;return}
      if(e.target===v)closeImgViewer();
    });
    v.addEventListener("touchstart",function(e){
      if(e.touches.length!==1)return;
      ivState.startX=e.touches[0].clientX;ivState.startY=e.touches[0].clientY;
      ivState.dx=0;ivState.dy=0;ivState.touching=true;ivState.axis=null;
      var i=img();if(i)i.style.transition="none";
    },{passive:true});
    v.addEventListener("touchmove",function(e){
      if(!ivState.touching||e.touches.length!==1)return;
      var dx=e.touches[0].clientX-ivState.startX;
      var dy=e.touches[0].clientY-ivState.startY;
      if(!ivState.axis){
        if(Math.abs(dx)<8&&Math.abs(dy)<8)return;
        ivState.axis=Math.abs(dx)>=Math.abs(dy)?"x":"y";
      }
      ivState.dx=dx;ivState.dy=dy;
      if(e.cancelable)e.preventDefault();
      var i=img();if(!i)return;
      if(ivState.axis==="x"){
        var edge=(ivState.idx===0&&dx>0)||(ivState.idx===ivState.srcs.length-1&&dx<0);
        var d=edge?dx*0.35:dx;
        i.style.transform="translateX("+d+"px)";
      } else if(dy>0){
        i.style.transform="translateY("+dy+"px)";
      }
    },{passive:false});
    v.addEventListener("touchend",function(){
      if(!ivState.touching)return;ivState.touching=false;
      var dx=ivState.dx,dy=ivState.dy,axis=ivState.axis;
      ivState.dx=0;ivState.dy=0;ivState.axis=null;
      if(axis==="x"&&Math.abs(dx)>50){
        imgViewerNav(dx>0?-1:1);
        ivState.swiped=true;
        setTimeout(function(){ivState.swiped=false},400);
        resetTransform(false);
      } else if(axis==="y"&&dy>120){
        closeImgViewer();
        resetTransform(false);
      } else {
        resetTransform(true);
      }
    },{passive:true});
    v.addEventListener("touchcancel",function(){
      if(!ivState.touching)return;
      ivState.touching=false;ivState.dx=0;ivState.dy=0;ivState.axis=null;
      resetTransform(true);
    });
    document.addEventListener("keydown",function(e){
      if(!v.classList.contains("open"))return;
      if(e.key==="Escape")closeImgViewer();
      else if(e.key==="ArrowLeft")imgViewerNav(-1);
      else if(e.key==="ArrowRight")imgViewerNav(1);
    });
    window.addEventListener("popstate",function(){
      if(v.classList.contains("open")){v.classList.remove("open");document.body.style.overflow=""}
    });
    return true;
  }
  if(!init()){document.addEventListener("DOMContentLoaded",init)}
})();


/* ===== 세무 문서 관리 탭 ===== */
var docsReloadTimer=null;
var docsCustomers=[]; // 거래처 요약 목록
var docsSelectedUserId=null;
var docsCustSort='pending'; // pending|recent|name
var docsCustSearchQ='';

function debouncedDocsLoad(){
  if(docsReloadTimer)clearTimeout(docsReloadTimer);
  docsReloadTimer=setTimeout(loadDocsTab,400);
}

function setDocsCustSort(s){
  docsCustSort=s;
  document.querySelectorAll('.dc-sort').forEach(b=>{
    const on=b.id==='dcSort'+s.charAt(0).toUpperCase()+s.slice(1);
    b.style.background=on?'#191f28':'#e5e8eb';
    b.style.color=on?'#fff':'#555';
  });
  renderCustomerList();
}

function filterDocsCustomers(){
  docsCustSearchQ=($g('docsCustSearch').value||'').trim().toLowerCase();
  renderCustomerList();
}

async function loadDocsCustomers(){
  try{
    /* 거래처 목록 + 상담방 목록 병렬 → user priority 계산 */
    const [custR, roomsR] = await Promise.all([
      fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=by_user').then(r=>r.json()).catch(()=>({users:[]})),
      fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)).then(r=>r.json()).catch(()=>({rooms:[]})),
    ]);
    if(custR.error){console.error(custR.error);return}
    /* 각 user_id 의 priority = 해당 user가 속한 방 중 가장 낮은(우선) priority */
    const userPri={};
    const userRoomId={}; /* 거래처 → 대표 상담방 id (나중에 열 때 사용) */
    try{
      const rooms=roomsR.rooms||[];
      /* 방별 멤버를 구분하기 위해 별도 API 호출은 비용 큼 → 방 이름에 거래처명 포함됐다는 가정은 약함.
         대신 admin-rooms 목록의 first_member 정보를 활용. 사실 이건 멤버 1명만 대표. 그래서 fallback: 방 이름이 거래처명 일부면 매칭. */
      docsCustomers=(custR.users||[]);
      /* 각 방을 멤버별로 스캔 — 멤버 API는 방별 상세에서만 제공됨. 간소화: 방의 first_member_name 으로 매칭 */
      const custByName={};
      (custR.users||[]).forEach(c=>{
        const nm1=(c.real_name||'').toLowerCase();
        const nm2=(c.name||'').toLowerCase();
        if(nm1)custByName[nm1]=c.user_id;
        if(nm2)custByName[nm2]=c.user_id;
      });
      for(const rm of rooms){
        const fn=(rm.first_member_name||'').toLowerCase();
        const uid=custByName[fn];
        if(uid){
          const p=Number(rm.priority||99);
          if(!userPri[uid]||p<userPri[uid])userPri[uid]=p;
          if(!userRoomId[uid])userRoomId[uid]=rm.id;
        }
      }
    }catch(e){console.warn(e)}
    /* priority 병합 */
    for(const c of docsCustomers){
      const p=userPri[c.user_id];
      c.priority = (p && p<99) ? p : null;
      c.room_id = userRoomId[c.user_id] || null;
    }
    renderCustomerList();
    // 선택된 거래처가 목록에 없으면 초기화
    if(docsSelectedUserId && !docsCustomers.find(c=>c.user_id===docsSelectedUserId)){
      docsSelectedUserId=null;
      showCustomerDetail(null);
    }
  }catch(e){console.error(e)}
}

/* 문서 탭 — 거래처 리스트 priority 필터 (상담방 필터와 독립) */
function _docsCustFilterGet(){
  try{var raw=localStorage.getItem('docsCustPriFilter');if(raw){var arr=JSON.parse(raw);if(Array.isArray(arr))return new Set(arr)}}catch{}
  return new Set([1,2,3,'none']);
}
function _docsCustFilterSet(s){try{localStorage.setItem('docsCustPriFilter',JSON.stringify([...s]))}catch{}}
function toggleDocsCustFilter(key){
  const s=_docsCustFilterGet();
  if(s.has(key))s.delete(key); else s.add(key);
  if(s.size===0){s.add(1).add(2).add(3).add('none')}
  _docsCustFilterSet(s);
  renderCustomerList();
}

function renderCustomerList(){
  const el=$g('docsCustItems');
  if(!el||!el.innerHTML===undefined)return;
  let list=docsCustomers.slice();
  /* 우선순위 필터 */
  const priFlt=_docsCustFilterGet();
  const byPri={1:0,2:0,3:0,'none':0};
  docsCustomers.forEach(c=>{const k=c.priority?c.priority:'none';if(byPri[k]!=null)byPri[k]++});
  list=list.filter(c=>{
    const k=c.priority?c.priority:'none';
    return priFlt.has(k);
  });
  // 검색 필터 (사업체·대표자·본인명·연락처)
  if(docsCustSearchQ){
    list=list.filter(c=>{
      const n=((c.company_name||'')+' '+(c.ceo_name||'')+' '+(c.real_name||'')+' '+(c.name||'')+' '+(c.phone||'')+' '+(c.business_number||'')).toLowerCase();
      return n.includes(docsCustSearchQ);
    });
  }
  /* 필터 바 HTML */
  const fbtn=(key,label,color,cnt)=>{
    const on=priFlt.has(key);
    const bg=on?color:'#e5e8eb';
    const fg=on?'#fff':'#6b7280';
    return '<button onclick="toggleDocsCustFilter('+(typeof key==='number'?key:"'"+key+"'")+')" style="background:'+bg+';color:'+fg+';border:none;padding:4px 9px;border-radius:5px;font-size:.72em;font-weight:'+(on?'700':'500')+';cursor:pointer;font-family:inherit">'+label+' '+cnt+'</button>';
  };
  const filterBar='<div style="padding:6px 10px;border-bottom:1px solid #f2f4f6;display:flex;gap:3px;flex-wrap:wrap;background:#fff;position:sticky;top:0;z-index:2">'
    +fbtn(1,'🔴1','#dc2626',byPri[1])
    +fbtn(2,'🟡2','#f59e0b',byPri[2])
    +fbtn(3,'🟢3','#10b981',byPri[3])
    +fbtn('none','⚪미분류','#6b7280',byPri['none'])
    +'</div>';
  // 정렬
  if(docsCustSort==='pending'){
    list.sort((a,b)=>{
      if(b.pending!==a.pending)return b.pending-a.pending;
      return (b.last_upload||'')<(a.last_upload||'')?-1:1;
    });
  } else if(docsCustSort==='recent'){
    list.sort((a,b)=>(b.last_upload||'')<(a.last_upload||'')?-1:1);
  } else {
    list.sort((a,b)=>(a.real_name||a.name||'').localeCompare(b.real_name||b.name||''));
  }
  if(!list.length){
    el.innerHTML=filterBar+'<div style="text-align:center;color:#8b95a1;font-size:.85em;padding:40px 16px">해당 조건에 맞는 거래처 없음</div>';
    return;
  }
  el.innerHTML=filterBar+list.map(c=>{
    /* 표시 이름: 사업체(상호) 우선 → 본인 real_name → name */
    const primary=c.company_name||c.real_name||c.name||('#'+c.user_id);
    /* 보조: 대표자 or 본인 이름, 연락처 */
    const subParts=[];
    if(c.company_name){
      if(c.ceo_name)subParts.push('대표 '+c.ceo_name);
      else if(c.real_name)subParts.push('담당 '+c.real_name);
    } else if(c.real_name&&c.name&&c.name!==c.real_name){
      subParts.push(c.name); // 카톡닉네임
    }
    if(c.phone)subParts.push(c.phone);
    const sub=e(subParts.join(' · ')||'');
    const selected=c.user_id===docsSelectedUserId?'background:#e8f3ff;border-left:3px solid #3182f6':'border-left:3px solid transparent';
    const nonClient=c._non_client?' <span style="font-size:.68em;color:#f04452">(비거래처)</span>':'';
    const pendBadge=c.pending>0?`<span style="background:#f04452;color:#fff;padding:1px 7px;border-radius:10px;font-size:.68em;font-weight:700;margin-left:4px">${c.pending}</span>`:'';
    /* 우선순위 배지 (상담방에서 지정한 값 유래) */
    const priColors={1:'#dc2626',2:'#f59e0b',3:'#10b981'};
    const priBadge=c.priority?`<span style="background:${priColors[c.priority]};color:#fff;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;font-size:.66em;font-weight:800;margin-right:4px;flex-shrink:0">${c.priority}</span>`:'';
    const lastStr=c.last_upload?(c.last_upload.substring(5,10)+' 마지막 업로드'):'업로드 없음';
    const monthAmt=(c.month_approved_amount||0).toLocaleString('ko-KR');
    return `<div onclick="selectCustomer(${c.user_id})" style="${selected};padding:11px 13px;cursor:pointer;border-bottom:1px solid #f2f4f6">`
      +`<div style="display:flex;align-items:center;justify-content:space-between;gap:6px">`
      +  `<div style="font-weight:700;font-size:.88em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center">${priBadge}<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${e(primary)}${nonClient}</span></div>`
      +  pendBadge
      +`</div>`
      +(sub?`<div style="font-size:.7em;color:#8b95a1;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub}</div>`:'')
      +`<div style="font-size:.72em;color:#555;margin-top:4px">📄 ${c.total}건`
      +  (c.month_count?` · 이번달 ${c.month_count}건`:'')
      +  (c.month_approved_amount?` · 승인 ₩${monthAmt}`:'')
      +`</div>`
      +`<div style="font-size:.68em;color:#b0b8c1;margin-top:2px">${lastStr}</div>`
      +`</div>`;
  }).join('');
}

function selectCustomer(userId){
  docsSelectedUserId=userId;
  $g('docsFilterUser').value=String(userId);
  const cust=docsCustomers.find(c=>c.user_id===userId);
  showCustomerDetail(cust||null);
  renderCustomerList(); // 선택 표시 갱신
  loadDocsTab();
}

function showCustomerDetail(cust){
  const empty=$g('docsDetailEmpty');
  const panel=$g('docsDetailPanel');
  if(!cust){
    empty.style.display='block';
    panel.style.display='none';
    return;
  }
  empty.style.display='none';
  panel.style.display='flex';
  /* 상호 우선, 없으면 본인 이름 */
  const primary=cust.company_name||cust.real_name||cust.name||('#'+cust.user_id);
  $g('docsDetailName').textContent=primary;
  const parts=[];
  if(cust.company_name){
    if(cust.ceo_name)parts.push('대표 '+cust.ceo_name);
    if(cust.real_name&&cust.real_name!==cust.ceo_name)parts.push('담당 '+cust.real_name);
    if(cust.business_number){
      const bn=String(cust.business_number).replace(/\D/g,'');
      const bnFmt=bn.length===10?(bn.slice(0,3)+'-'+bn.slice(3,5)+'-'+bn.slice(5)):cust.business_number;
      parts.push('사업자 '+bnFmt);
    }
  } else if(cust.real_name&&cust.name&&cust.name!==cust.real_name){
    parts.push('('+cust.name+')');
  }
  if(cust.phone)parts.push(cust.phone);
  parts.push('문서 '+cust.total+'건');
  if(cust.pending>0)parts.push('⏳ 대기 '+cust.pending);
  $g('docsDetailSub').textContent=parts.join(' · ');
}

function openRoomForCurrentCustomer(){
  if(!docsSelectedUserId){alert('거래처를 먼저 선택하세요');return}
  /* 간단 구현: 해당 user가 포함된 상담방 목록에서 첫 번째 열기 */
  tab('rooms');
  /* 실제 연결은 복잡 — 일단 탭 전환만 */
}

function docTypeLabelAdmin(t){
  const map={
    receipt:'🧾 영수증',
    lease:'🏠 임대차',
    payroll:'👥 근로(4대보험)',
    freelancer_payment:'🧑‍💼 프리랜서(3.3%)',
    tax_invoice:'📑 세계산서',
    insurance:'🛡️ 보험',
    utility:'💧 공과금',
    property_tax:'🚗 지방세',
    bank_stmt:'🏦 은행',
    business_reg:'📋 사업자등록',
    identity:'🪪 신분증',
    contract:'📝 계약',
    other:'📄 기타'
  };
  return map[t]||('📄 '+(t||'?'));
}
function docStatusBadge(s){
  const map={pending:{t:'⏳ 대기',bg:'#fef3c7',fg:'#92400e'},approved:{t:'✅ 승인',bg:'#d1fae5',fg:'#065f46'},rejected:{t:'❌ 반려',bg:'#fee2e2',fg:'#991b1b'}};
  const x=map[s]||map.pending;
  return `<span style="display:inline-block;padding:2px 7px;border-radius:6px;background:${x.bg};color:${x.fg};font-size:.78em;font-weight:700;white-space:nowrap">${x.t}</span>`;
}

/* 다가오는 D-day 알림 */
async function loadDocsAlerts(){
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=alerts&days=60');
    const d=await r.json();
    const alerts=d.alerts||[];
    const bar=$g('docsAlertsBar');
    if(!alerts.length){bar.style.display='none';return}
    bar.style.display='block';
    $g('docsAlertsCount').textContent=alerts.length;
    const today=d.today;
    const fmt=n=>n==null?'-':(Number(n)||0).toLocaleString('ko-KR')+'원';
    $g('docsAlertsList').innerHTML=alerts.map(a=>{
      const nm=e(a.real_name||a.name||'#'+a.user_id);
      const dDiff=Math.round((new Date(a.trigger_date)-new Date(today))/86400000);
      const dLabel=dDiff<0?`D+${-dDiff}`:(dDiff===0?'D-DAY':`D-${dDiff}`);
      const dColor=dDiff<0?'#dc2626':(dDiff<=3?'#f59e0b':'#10b981');
      return `<div style="display:flex;gap:10px;padding:8px 10px;background:rgba(255,255,255,.7);border-radius:8px;margin-bottom:4px;align-items:center;font-size:.82em">`
        +`<div style="font-weight:800;color:${dColor};min-width:52px;text-align:center">${dLabel}</div>`
        +`<div style="flex:1;min-width:0">`
        +  `<div style="font-weight:700;color:#92400e">${e(a.title||'알림')}</div>`
        +  `<div style="color:#78350f;font-size:.95em;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nm} · ${e(a.trigger_date)}${a.amount?' · '+fmt(a.amount):''}</div>`
        +`</div>`
        +`<button onclick="dismissAlert(${a.id})" style="background:none;border:none;color:#92400e;cursor:pointer;font-size:1em;font-family:inherit" title="알림 해제">✕</button>`
        +`</div>`;
    }).join('');
  }catch(e){console.error(e)}
}

function toggleDocsAlerts(){
  const list=$g('docsAlertsList');
  const btn=$g('docsAlertsToggleBtn');
  if(list.style.display==='none'){list.style.display='block';btn.textContent='접기 ▴'}
  else{list.style.display='none';btn.textContent='펼치기 ▾'}
}

async function dismissAlert(id){
  if(!confirm('이 알림을 해제하시겠어요?\n(발송되지 않고 종료 처리됩니다)'))return;
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=dismiss_alert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
    const d=await r.json();
    if(d.ok)loadDocsAlerts();
    else alert('실패: '+(d.error||'unknown'));
  }catch(e){alert('오류: '+e.message)}
}

async function runCronAlerts(){
  if(!confirm('트리거 시점 도달한 D-day 알림을 지금 즉시 상담방에 발송합니다.\n\n계속할까요?'))return;
  try{
    const r=await fetch('/api/cron-alerts?key='+encodeURIComponent(KEY),{method:'POST'});
    const d=await r.json();
    if(d.error){alert('실패: '+d.error);return}
    alert('✅ 알림 발송 완료\n조회: '+d.checked+'건 / 발송: '+d.sent+'건');
    loadDocsAlerts();
  }catch(e){alert('오류: '+e.message)}
}



