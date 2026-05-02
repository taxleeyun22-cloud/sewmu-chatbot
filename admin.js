/* ⛳ 디버깅 — 캐시 적용 여부 즉시 확인. 화면 좌상단에 5초간 작은 라벨 표시. */
window.__ADMIN_VERSION='v=127';
try{
  setTimeout(function(){
    try{
      var b=document.createElement('div');
      b.style.cssText='position:fixed;top:0;left:0;background:#10b981;color:#fff;font-size:10px;padding:2px 6px;z-index:99999;font-family:monospace;border-bottom-right-radius:4px';
      b.textContent='✓ '+window.__ADMIN_VERSION;
      (document.body||document.documentElement).appendChild(b);
      setTimeout(function(){try{b.remove()}catch(_){}},5000);
    }catch(_){}
  },300);
}catch(_){}
let KEY='';
/* null-safe getElementById: 없으면 no-op 객체 반환 (admin.html/staff.html 공유용) */
function _noop(){return {style:{},classList:{add:function(){},remove:function(){},toggle:function(){},contains:function(){return false}},dataset:{},children:[],value:'',innerHTML:'',textContent:'',checked:false,disabled:false,className:'',addEventListener:function(){},removeEventListener:function(){},focus:function(){},click:function(){},blur:function(){},scrollIntoView:function(){},closest:function(){return null},querySelector:function(){return null},querySelectorAll:function(){return []},appendChild:function(a){return a},removeChild:function(a){return a},setAttribute:function(){},getAttribute:function(){return null},removeAttribute:function(){},insertAdjacentHTML:function(){}}}
function $g(id){return document.getElementById(id)||_noop()}
function e(t){return String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function escAttr(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\r\n]+/g,' ')}
/* URL 자동링크: escape 된 문자열에만 적용(XSS 안전). http(s)://, www. 만 대상 */
function linkify(s){
  if(!s)return s;
  return String(s).replace(/\b((?:https?:\/\/|www\.)[^\s<>"']+)/gi,function(u){
    var href=/^www\./i.test(u)?'http://'+u:u;
    return '<a href="'+href.replace(/"/g,'&quot;')+'" target="_blank" rel="noopener noreferrer" style="color:#3182f6;text-decoration:underline;word-break:break-all">'+u+'</a>';
  });
}
/* @멘션 하이라이트 — 이미 escaped 된 텍스트에 적용.
   @한글/영문/숫자/_  최대 20자 → 파란색 강조. 본인 언급이면 노란 배경. */
function mentionify(s){
  if(!s)return s;
  return String(s).replace(/(^|[\s(\[])@([가-힣A-Za-z0-9_\.]{1,20})/g, function(_, pre, name){
    const selfName=(typeof ADMIN_SELF_NAME!=='undefined'&&ADMIN_SELF_NAME)?ADMIN_SELF_NAME:null;
    const isMe = selfName && (name===selfName||name===(selfName+'대표'));
    const bg = isMe ? 'background:#fef08a;color:#854d0e;border-radius:4px;padding:0 3px' : 'color:#3182f6';
    return pre+'<span style="'+bg+';font-weight:700" data-mention="'+name.replace(/"/g,'&quot;')+'">@'+name+'</span>';
  });
}
/* 스태프 리스트 캐시 — @ 입력 시 자동완성·본인 감지에 사용 */
let _mentionStaffCache=null;
let ADMIN_SELF_NAME=null;
async function _ensureMentionStaff(){
  if(_mentionStaffCache)return _mentionStaffCache;
  try{
    const r=await fetch('/api/admin-users?key='+encodeURIComponent(KEY)+'&action=staff_list');
    const d=await r.json();
    _mentionStaffCache=(d.staff||[]).map(u=>({id:u.id,name:u.display_name||('ID#'+u.id),is_admin:u.is_admin}));
    /* 본인 식별 — ADMIN_KEY 로그인은 대표 / 스태프 세션은 쿠키 기반 별도 식별 필요. 일단 localStorage 저장 값 활용 */
    try{
      const saved=localStorage.getItem('adminSelfName');
      if(saved)ADMIN_SELF_NAME=saved;
    }catch(_){}
  }catch(_){_mentionStaffCache=[]}
  return _mentionStaffCache;
}

/* ===== @ 자동완성 드롭다운 =====
   roomInput(textarea) 에서 @ 입력 감지 → 스태프 목록 띄움.
   방향키 탐색 / Enter·Tab·클릭 선택 / Esc 닫기.
   본인이 @언급된 메시지는 렌더에서 노란색으로 강조. */
let _mentionBox=null;
let _mentionActive=false;
let _mentionMatches=[];
let _mentionSelIdx=0;
let _mentionStart=-1; /* @ 시작 위치 (textarea value 기준) */
function _mentionEnsureBox(){
  if(_mentionBox)return _mentionBox;
  const b=document.createElement('div');
  b.id='mentionBox';
  b.style.cssText='position:fixed;background:#fff;border:1px solid #e5e8eb;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);padding:4px 0;min-width:160px;max-width:260px;max-height:200px;overflow-y:auto;z-index:12000;display:none;font-family:inherit;font-size:.88em';
  document.body.appendChild(b);
  _mentionBox=b;
  return b;
}
function _mentionClose(){
  _mentionActive=false;
  _mentionMatches=[];
  _mentionSelIdx=0;
  _mentionStart=-1;
  if(_mentionBox)_mentionBox.style.display='none';
}
function _mentionRender(){
  const b=_mentionEnsureBox();
  if(!_mentionMatches.length){_mentionClose();return}
  b.innerHTML=_mentionMatches.map((u,i)=>{
    const sel=i===_mentionSelIdx;
    return '<div data-idx="'+i+'" onclick="_mentionPick('+i+')" style="padding:7px 12px;cursor:pointer;'+(sel?'background:#eff6ff;color:#1e40af':'color:#191f28')+'"><b>@'+e(u.name)+'</b> <span style="font-size:.72em;color:#8b95a1">'+(u.is_admin?'직원':'')+'</span></div>';
  }).join('');
}
function _mentionPosition(input){
  const r=input.getBoundingClientRect();
  const b=_mentionEnsureBox();
  /* 입력창 위에 띄움 (바닥 고정 입력창 위로) */
  b.style.left=Math.max(8, r.left)+'px';
  b.style.bottom=(window.innerHeight - r.top + 4)+'px';
  b.style.top='auto';
}
async function _mentionOnInput(input){
  const v=input.value||'';
  const pos=input.selectionStart||0;
  /* 커서 앞 토큰 찾기 — 공백까지 역방향 */
  let i=pos-1;
  while(i>=0 && !/[\s\n]/.test(v[i]))i--;
  const token=v.slice(i+1, pos); /* 공백 다음 ~ 커서 */
  if(!token.startsWith('@')){_mentionClose();return}
  const q=token.slice(1);
  /* 20자 초과는 보통 오작동 */
  if(q.length>20){_mentionClose();return}
  const staff=await _ensureMentionStaff();
  const qLow=q.toLowerCase();
  _mentionMatches=staff.filter(s=>{
    const n=(s.name||'').toLowerCase();
    return !q || n.startsWith(qLow) || n.includes(qLow);
  }).slice(0,8);
  if(!_mentionMatches.length){_mentionClose();return}
  _mentionActive=true;
  _mentionStart=i+1; /* @ 위치 */
  _mentionSelIdx=0;
  _mentionPosition(input);
  _mentionRender();
  _mentionBox.style.display='block';
}
function _mentionPick(idx){
  const input=document.getElementById('roomInput');
  if(!input)return;
  const u=_mentionMatches[idx];if(!u)return;
  const before=input.value.slice(0,_mentionStart);
  const after=input.value.slice(input.selectionStart||0);
  const insert='@'+u.name+' ';
  input.value=before+insert+after;
  const caret=(before+insert).length;
  input.selectionStart=input.selectionEnd=caret;
  input.focus();
  _mentionClose();
}
function _mentionOnKeydown(input, ev){
  if(!_mentionActive)return false;
  const k=ev.key;
  if(k==='ArrowDown'){_mentionSelIdx=Math.min(_mentionMatches.length-1,_mentionSelIdx+1);_mentionRender();ev.preventDefault();return true}
  if(k==='ArrowUp'){_mentionSelIdx=Math.max(0,_mentionSelIdx-1);_mentionRender();ev.preventDefault();return true}
  if(k==='Enter'||k==='Tab'){_mentionPick(_mentionSelIdx);ev.preventDefault();return true}
  if(k==='Escape'){_mentionClose();ev.preventDefault();return true}
  return false;
}
/* roomInput 리스너 한 번만 등록 */
(function _bindMentionInput(){
  function bind(){
    const input=document.getElementById('roomInput');
    if(!input||input.dataset.mentionBound)return;
    input.dataset.mentionBound='1';
    input.addEventListener('input',function(){_mentionOnInput(input)});
    /* keydown: 드롭다운 활성 시 화살표·Enter·Esc 가로채기. 인라인 onkeydown(sendRoomMessage) 전에 실행됨 */
    input.addEventListener('keydown',function(ev){_mentionOnKeydown(input, ev)}, true);
    input.addEventListener('blur',function(){setTimeout(_mentionClose,180)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);
  else setTimeout(bind,0);
  /* openRoom 호출마다 input 이 새로 붙을 수 있으므로 지연 재바인딩 */
  setInterval(bind, 2000);
})();

/* [REPLY]{json}\n, [IMG], [FILE], [DOC:id] 프리픽스 파싱 */
function parseMsg(content){
  if(!content)return {reply:null,image:null,file:null,doc_id:null,alert:null,chatbot_share:null,text:''};
  let reply=null;
  const mr=/^\[REPLY\](\{[^\n]+\})\n([\s\S]*)$/.exec(content);
  if(mr){
    try{reply=JSON.parse(mr[1]);content=mr[2]}catch{}
  }
  const mc=/^\[CHATBOT_SHARE\](\{[\s\S]+\})$/.exec(content);
  if(mc){
    try{return {reply:reply,image:null,file:null,doc_id:null,alert:null,chatbot_share:JSON.parse(mc[1]),text:''}}catch{}
  }
  const ma=/^\[ALERT\](\{[\s\S]+\})$/.exec(content);
  if(ma){
    try{return {reply:reply,image:null,file:null,doc_id:null,alert:JSON.parse(ma[1]),chatbot_share:null,text:''}}catch{}
  }
  const md=/^\[DOC:(\d+)\](\n([\s\S]*))?$/.exec(content);
  if(md)return {reply:reply,image:null,file:null,doc_id:parseInt(md[1],10),alert:null,chatbot_share:null,text:md[3]||''};
  const mf=/^\[FILE\](\{[^\n]+\})(\n([\s\S]*))?$/.exec(content);
  if(mf){
    try{const obj=JSON.parse(mf[1]);return {reply:reply,image:null,file:obj,doc_id:null,alert:null,chatbot_share:null,text:mf[3]||''}}catch{}
  }
  const m=/^\[IMG\](\S+)(\n([\s\S]*))?$/.exec(content);
  if(m)return {reply:reply,image:m[1],file:null,doc_id:null,alert:null,chatbot_share:null,text:m[3]||''};
  return {reply:reply,image:null,file:null,doc_id:null,alert:null,chatbot_share:null,text:content};
}

/* 영수증 카드 렌더링 — 세무사측 (승인/반려 버튼 포함) */
function renderReceiptCardAdmin(doc){
  if(!doc) return '<div style="padding:10px 12px;border-radius:10px;background:#f2f4f6;font-size:.82em">🧾 문서 (조회 불가)</div>';
  const statusMap={pending:{tx:'⏳ 검토 중',bg:'#fef3c7',fg:'#92400e'},approved:{tx:'✅ 승인',bg:'#d1fae5',fg:'#065f46'},rejected:{tx:'❌ 반려',bg:'#fee2e2',fg:'#991b1b'}};
  const st=statusMap[doc.status]||statusMap.pending;
  const fmt=n=>n==null?'-':(Number(n)||0).toLocaleString('ko-KR')+'원';
  const imgUrl='/api/image?k='+encodeURIComponent(doc.image_key);
  const amb=doc.ocr_confidence!=null&&doc.ocr_confidence<0.7;
  const catOptions=['식비','교통비','숙박비','소모품비','접대비','통신비','공과금','임대료','인건비','기타'];
  const catSel=catOptions.map(c=>`<option value="${c}"${doc.category===c?' selected':''}>${c}</option>`).join('');
  const canEdit=doc.status!=='approved';
  const amb2=amb?` <span style="color:#d97706;font-size:.7em">(인식 낮음 ${Math.round(doc.ocr_confidence*100)}%)</span>`:'';
  /* 프리랜서·급여처럼 placeholder 이미지인 경우 썸네일 숨김 */
  const isPayroll=doc.doc_type==='freelancer_payment'||doc.doc_type==='payroll';
  const typeLabel=docTypeLabelAdmin(doc.doc_type);
  /* extra JSON 파싱 (프리랜서·급여 정보 표시용) */
  let exHTML='';
  if(isPayroll){
    let ex={};try{ex=JSON.parse(doc.ocr_raw||'{}')}catch{}
    /* admin은 documents.extra 컬럼이 들어오면 좋지만 raw에 들어올 수도 */
    try{if(doc.extra)ex=JSON.parse(doc.extra)||ex}catch{}
    if(ex.resident_no_masked)exHTML+=`<div style="font-size:.78em;color:#6b7684">주민번호: ${e(ex.resident_no_masked)}</div>`;
    if(ex.net_amount)exHTML+=`<div style="font-size:.78em;color:#6b7684">실수령: ${fmt(ex.net_amount)}</div>`;
    if(doc.doc_type==='freelancer_payment'&&ex.withholding_tax)exHTML+=`<div style="font-size:.78em;color:#6b7684">원천세 3.3%: ${fmt(ex.withholding_tax)}</div>`;
    if(doc.doc_type==='payroll'&&ex.total_4ins)exHTML+=`<div style="font-size:.78em;color:#6b7684">4대보험: ${fmt(ex.total_4ins)}</div>`;
  }
  /* 액션 버튼 — 상태별 분기 */
  let actionsHTML='';
  if(doc.status==='pending'){
    actionsHTML=`<button onclick="approveDoc(${doc.id},this)" style="background:#10b981;color:#fff;border:none;padding:7px 14px;border-radius:8px;font-size:.85em;font-weight:700;cursor:pointer;font-family:inherit">✅ 승인</button>`
      +`<button onclick="rejectDocPrompt(${doc.id})" style="background:#fff;color:#f04452;border:1px solid #f04452;padding:7px 14px;border-radius:8px;font-size:.85em;font-weight:700;cursor:pointer;font-family:inherit">❌ 반려</button>`;
  } else if(doc.status==='approved'){
    actionsHTML=`<button onclick="revertDocApproval(${doc.id})" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;padding:7px 14px;border-radius:8px;font-size:.85em;font-weight:700;cursor:pointer;font-family:inherit">↺ 승인 취소</button>`;
  } else if(doc.status==='rejected'){
    actionsHTML=`<button onclick="approveDocById(${doc.id})" style="background:#10b981;color:#fff;border:none;padding:7px 14px;border-radius:8px;font-size:.85em;font-weight:700;cursor:pointer;font-family:inherit">✅ 복원</button>`;
  }
  /* 사진·파일로 되돌리기 — 잘못 분류된 경우 */
  if(!isPayroll && doc.status!=='approved'){
    actionsHTML+=`<button onclick="revertDocToPhotoAdmin(${doc.id})" style="background:#fff;color:#3182f6;border:1px solid #3182f6;padding:7px 10px;border-radius:8px;font-size:.8em;cursor:pointer;font-family:inherit" title="일반 사진으로 되돌리기">📷 사진</button>`;
    actionsHTML+=`<button onclick="convertDocToFileAdmin(${doc.id})" style="background:#fff;color:#3182f6;border:1px solid #3182f6;padding:7px 10px;border-radius:8px;font-size:.8em;cursor:pointer;font-family:inherit" title="일반 파일로 되돌리기">📁 파일</button>`;
  }
  /* 완전 삭제 */
  actionsHTML+=`<button onclick="deleteDocAdmin(${doc.id})" style="background:#fff;color:#dc2626;border:1px solid #dc2626;padding:7px 10px;border-radius:8px;font-size:.8em;cursor:pointer;font-family:inherit" title="R2 원본·DB·상담방 메시지 완전 삭제">🗑️ 삭제</button>`;
  /* 반응형: 모바일(≤480px)에선 세로 스택, 데스크톱에선 가로. max-width:100% + box-sizing 으로 폭 보장 */
  const thumb=isPayroll
    ? `<div class="rc-doc-thumb" style="flex-shrink:0;width:46px;height:46px;background:#dbeafe;color:#1d4ed8;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.4em">${doc.doc_type==='payroll'?'👥':'🧑‍💼'}</div>`
    : `<div class="rc-doc-thumb" style="flex-shrink:0;width:88px;height:88px;background:#f3f4f6;border-radius:8px;overflow:hidden;cursor:zoom-in" onclick="openImgViewer('${imgUrl}',['${imgUrl}'])"><img src="${imgUrl}" alt="" style="width:100%;height:100%;object-fit:cover;display:block" loading="lazy" onerror="this.style.display='none'"></div>`;
  return ''
    +`<div data-doc-id="${doc.id}" class="adm-doc-card" style="display:flex;gap:10px;flex-wrap:wrap;width:100%;max-width:380px;box-sizing:border-box;border-radius:12px;background:#fff;border:1px solid #e5e8eb;padding:10px">`
    + thumb
    +  `<div style="flex:1 1 180px;min-width:0;font-size:.8em">`
    +     `<div style="color:#8b95a1;font-size:.82em;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${typeLabel}${isPayroll?'':' · '+(doc.ocr_confidence!=null?Math.round(doc.ocr_confidence*100)+'%':'-')+amb2}</div>`
    +     `<div style="display:grid;grid-template-columns:52px 1fr;gap:4px 6px;align-items:center">`
    +       `<label style="color:#8b95a1;font-size:.88em">${isPayroll?'이름':'가맹점'}</label>`
    +       `<input type="text" value="${escAttr(doc.vendor||'')}" data-field="vendor" ${canEdit?'':'readonly'} style="padding:5px 7px;border:1px solid #e5e8eb;border-radius:5px;font-size:.92em;width:100%;max-width:100%;box-sizing:border-box;font-family:inherit;background:${canEdit?'#fff':'#f9fafb'}">`
    +       `<label style="color:#8b95a1;font-size:.88em">${isPayroll?'세전':'금액'}</label>`
    +       `<input type="number" value="${doc.amount||''}" data-field="amount" ${canEdit?'':'readonly'} style="padding:5px 7px;border:1px solid #e5e8eb;border-radius:5px;font-size:.92em;width:100%;max-width:100%;box-sizing:border-box;font-family:inherit;background:${canEdit?'#fff':'#f9fafb'}">`
    +       `<label style="color:#8b95a1;font-size:.88em">날짜</label>`
    +       `<input type="text" value="${escAttr(doc.receipt_date||'')}" data-field="receipt_date" placeholder="YYYY-MM-DD" ${canEdit?'':'readonly'} style="padding:5px 7px;border:1px solid #e5e8eb;border-radius:5px;font-size:.92em;width:100%;max-width:100%;box-sizing:border-box;font-family:inherit;background:${canEdit?'#fff':'#f9fafb'}">`
    +       (isPayroll?'':`<label style="color:#8b95a1;font-size:.88em">계정</label>`
    +         `<select data-field="category" ${canEdit?'':'disabled'} style="padding:5px 7px;border:1px solid #e5e8eb;border-radius:5px;font-size:.92em;width:100%;max-width:100%;box-sizing:border-box;font-family:inherit;background:${canEdit?'#fff':'#f9fafb'}"><option value="">(선택)</option>${catSel}</select>`)
    +     `</div>`
    +     exHTML
    +     `<div style="margin-top:6px"><span style="display:inline-block;font-size:.76em;padding:2px 8px;border-radius:8px;background:${st.bg};color:${st.fg};font-weight:700">${st.tx}</span></div>`
    +     (doc.reject_reason?`<div style="margin-top:4px;font-size:.8em;color:#991b1b">반려: ${e(doc.reject_reason)}</div>`:'')
    +     `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${actionsHTML}</div>`
    +  `</div>`
    +`</div>`;
}
function fileIconFor(name){
  const ext=(name||'').split('.').pop().toLowerCase();
  if(['pdf'].includes(ext))return '📕';
  if(['xls','xlsx','csv'].includes(ext))return '📊';
  if(['doc','docx'].includes(ext))return '📘';
  if(['ppt','pptx'].includes(ext))return '📽️';
  if(['hwp','hwpx'].includes(ext))return '📄';
  if(['zip'].includes(ext))return '🗜️';
  if(['txt'].includes(ext))return '📝';
  return '📎';
}
function fmtSize(n){
  if(!n)return '';
  if(n<1024)return n+'B';
  if(n<1024*1024)return (n/1024).toFixed(1)+'KB';
  return (n/1024/1024).toFixed(1)+'MB';
}
function renderMsgBody(content, attachedDoc){
  const p=parseMsg(content);
  let h='';
  if(p.reply){
    const s=p.reply.s||'', t=(p.reply.t||'').slice(0,100), ji=p.reply.i||'';
    h+='<div class="rc-quote" data-jump-mid="'+escAttr(String(ji))+'" onclick="jumpToOriginalMsgAdmin(\''+escAttr(String(ji))+'\')" style="cursor:pointer"><div class="rc-quote-sender">↩︎ '+e(s)+'</div><div class="rc-quote-text">'+e(t)+'</div></div>';
  }
  if(p.chatbot_share){
    const cs=p.chatbot_share;
    h+='<div style="border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;overflow:hidden;min-width:260px;max-width:400px">'
      +'<div style="padding:6px 10px;background:#dbeafe;color:#1e40af;font-size:.72em;font-weight:700;display:flex;align-items:center;gap:4px">🤖 챗봇 Q&A 공유 (고객이 챗봇에서 물어봄)</div>'
      +'<div style="padding:8px 10px;border-bottom:1px dashed #bfdbfe">'
      +'<div style="font-size:.7em;color:#3b82f6;font-weight:700;margin-bottom:2px">Q</div>'
      +'<div style="font-size:.88em;color:#1e3a8a;line-height:1.45;white-space:pre-wrap;word-break:break-word">'+e(String(cs.q||'').slice(0,400))+'</div>'
      +'</div>'
      +'<div style="padding:8px 10px">'
      +'<div style="font-size:.7em;color:#3b82f6;font-weight:700;margin-bottom:2px">A (AI 답변)</div>'
      +'<div style="font-size:.85em;color:#1e293b;line-height:1.5;white-space:pre-wrap;word-break:break-word">'+e(String(cs.a||'').slice(0,1500))+'</div>'
      +'</div>'
      +'</div>';
    return h;
  }
  if(p.alert){
    const a=p.alert;
    h+='<div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:12px;background:linear-gradient(135deg,#fff7ed,#fef3c7);border:1px solid #fcd34d;max-width:420px">'
      +'<div style="font-size:1.6em;line-height:1">🔔</div>'
      +'<div style="flex:1;min-width:0">'
      +  '<div style="font-weight:700;font-size:.92em;color:#92400e;margin-bottom:3px">'+e(a.t||'알림')+'</div>'
      +  '<div style="font-size:.82em;color:#78350f;line-height:1.4">'+e(a.m||'')+'</div>'
      +  (a.d?'<div style="font-size:.72em;color:#a16207;margin-top:4px">📅 '+e(a.d)+'</div>':'')
      +'</div></div>';
    return h;
  }
  if(p.doc_id){
    h+=renderReceiptCardAdmin(attachedDoc||null);
    if(p.text)h+='<div style="margin-top:6px">'+linkify(e(p.text))+'</div>';
    return h;
  }
  if(p.image){
    /* 관리자 채널: 이미지 wrapper + 의심 배지 overlay (onload 휴리스틱) */
    h+='<span class="rc-img-wrap" style="position:relative;display:inline-block;line-height:0">'
      +  '<img class="rc-img-msg" src="'+e(p.image)+'" alt="이미지" loading="lazy" style="display:inline-block;max-width:220px;max-height:300px;border-radius:10px;background:rgba(0,0,0,.06);object-fit:cover;cursor:zoom-in" onload="rcCheckDocSuspect(this)" onclick="if(window._lpJustFired){window._lpJustFired=false;return}openImgViewer(this.src,collectImagesNear(this))" onerror="this.outerHTML=\'<div style=\\\'padding:10px;color:#f04452;font-size:.8em\\\'>이미지 로드 실패</div>\'">'
      +  '<span class="rc-doc-badge" style="display:none;position:absolute;top:6px;right:6px;background:rgba(255,255,255,.92);border:1px solid #fcd34d;color:#92400e;font-size:.68em;font-weight:700;padding:2px 7px;border-radius:10px;line-height:1.4;box-shadow:0 1px 3px rgba(0,0,0,.15);pointer-events:none"></span>'
      +'</span>';
  }
  if(p.file){
    const nm=p.file.name||'파일';
    h+='<a href="'+e(p.file.url||'#')+'" download="'+e(nm)+'" onclick="if(!confirm(\'파일을 다운로드 하시겠습니까?\')){event.preventDefault();return false}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(0,0,0,.05);border-radius:10px;text-decoration:none;color:inherit;max-width:260px">'
      +'<div style="font-size:1.8em;line-height:1">'+fileIconFor(nm)+'</div>'
      +'<div style="flex:1;min-width:0;overflow:hidden"><div style="font-weight:600;font-size:.88em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+e(nm)+'</div>'
      +'<div style="font-size:.72em;color:#8b95a1;margin-top:2px">'+fmtSize(p.file.size)+' · 다운로드</div></div></a>';
  }
  if(p.text)h+=((p.image||p.file)?'<div style="margin-top:6px">':'')+mentionify(linkify(e(p.text)))+((p.image||p.file)?'</div>':'');
  return h;
}

async function login(){
var k=$g('keyInput').value.trim();
if(!k)return;
await doLogin(k,true);
}

async function doLogin(k,showErr){
try{
const r=await fetch('/api/conversations?key='+encodeURIComponent(k)+'&page=1');
if(!r.ok)throw 0;
KEY=k;
/* 보안: ADMIN_KEY는 세션 단위(탭 닫히면 삭제)로만 보관. localStorage 영구 저장 금지 */
try{sessionStorage.setItem('admin_key',k)}catch{}
try{localStorage.removeItem('admin_key')}catch{}
$g('loginView').style.display='none';
$g('mainView').style.display='block';
loadList();
refreshPendingBadge();
refreshLiveBadge();
setInterval(refreshPendingBadge,30000);
setInterval(refreshLiveBadge,10000);
/* 이전 탭 복원 (유효한 owner 탭만) */
try{
  var saved=localStorage.getItem('admin_last_tab');
  if(saved&&['chat','live','rooms','users','anal','review','faq'].indexOf(saved)>=0)tab(saved);
}catch{}
return true;
}catch{
try{sessionStorage.removeItem('admin_key')}catch{}
try{localStorage.removeItem('admin_key')}catch{}
if(showErr)$g('err').style.display='block';
return false;
}
}


function logout(){
KEY='';
try{sessionStorage.removeItem('admin_key')}catch{}
try{localStorage.removeItem('admin_key')}catch{}
$g('loginView').style.display='flex';
$g('mainView').style.display='none';
}

/* 세션 기반 사용자가 is_admin=1이면 staff.html로 리다이렉트 (owner 전용 페이지) */
async function tryAdminBySession(){
  try{
    const r=await fetch('/api/auth/me');
    const d=await r.json();
    if(d.logged_in&&d.user&&d.user.is_admin){
      location.replace('/staff.html');
      return true;
    }
  }catch{}
  return false;
}

/* 페이지 로드: 저장된 ADMIN_KEY가 있으면 자동 로그인. 없으면 로그인 폼 표시.
   (staff.html은 자체 staffBoot() 사용하므로 이 IIFE 스킵)
   이전: 저장된 키 없으면 /staff.html 로 자동 리다이렉트했는데,
   이 경우 사장님 본인이 카톡 로그인 상태면 staff로 튕겨서 ADMIN_KEY 입력 기회가 없었음.
   해결: admin.html은 항상 ADMIN_KEY 입력을 기다린다. 직원은 /staff.html 직접 방문 또는 마이페이지 버튼 사용. */
let IS_OWNER=true;
(async function(){
  if(location.pathname.endsWith('/staff.html'))return;
  /* 보안: 세션 스토리지(탭 수명)만 조회. 과거 localStorage 잔존 키는 정리 */
  try{localStorage.removeItem('admin_key')}catch{}
  try{
    var saved=sessionStorage.getItem('admin_key');
    if(saved){IS_OWNER=true;await doLogin(saved,false)}
  }catch{}
})();

/* 🔐 상담방 목록 모드: 'external'(기본) | 'internal'(관리자방) */
function tab(t){
try{localStorage.setItem('admin_last_tab',t)}catch{}
$g('tabChat').className=t==='chat'?'on':'';
$g('tabLive').className=t==='live'?'on':'';
$g('tabRooms').className=t==='rooms'?'on':'';
if($g('tabInternal'))$g('tabInternal').className=t==='internal'?'on':'';
if($g('tabDocs').className!==undefined)$g('tabDocs').className=t==='docs'?'on':'';
$g('tabUsers').className=t==='users'?'on':'';
$g('tabAnal').className=t==='anal'?'on':'';
$g('tabReview').className=t==='review'?'on':'';
$g('tabFaq').className=t==='faq'?'on':'';
$g('chatView').style.display=t==='chat'?'block':'none';
$g('detailView').style.display='none';
$g('liveView').style.display=t==='live'?'block':'none';
/* 상담방/관리자방은 같은 roomsView 재활용하되 모드만 다름 */
$g('roomsView').style.display=(t==='rooms'||t==='internal')?'block':'none';
$g('docsView').style.display=t==='docs'?'block':'none';
document.body.classList.toggle('docs-wide', t==='docs');
$g('usersView').style.display=t==='users'?'block':'none';
$g('analView').style.display=t==='anal'?'block':'none';
$g('reviewView').style.display=t==='review'?'block':'none';
$g('faqView').style.display=t==='faq'?'block':'none';
if(t==='anal')loadAnalytics();
if(t==='users')loadUsers(currentStatus||'pending');
if(t==='review')loadReview('pending');
if(t==='faq'){loadFaqStatus();loadFaqs()}
if(t==='docs')loadDocsTab();
if(t==='live')startLivePolling();
else stopLivePolling();
/* 모드 전환 시 현재 열린 방이 성격이 다르면 해제, 같으면 유지 */
if(t==='rooms'){
  if(_roomsMode!=='external')currentRoomId=null;
  _roomsMode='external';startRoomsPolling();
} else if(t==='internal'){
  if(_roomsMode!=='internal')currentRoomId=null;
  _roomsMode='internal';startRoomsPolling();
} else stopRoomsPolling();
}

/* ===== 🔔 PC 브라우저 알림 (OS 네이티브) =====
   - 설정: localStorage 'pcNotifyOn' (0/1)
   - 권한: Notification.requestPermission()
   - 감지: loadRoomList 주기 polling 결과에서 user_msg_count 증가분
   - 클릭: 해당 방 openRoom + 창 focus
   - 현재 열린 방은 알림 X (이미 보고 있음)
   - 첫 로드(캐시 비어있음) 시엔 알림 X */
const _notifyPrevCounts = {};
let _notifyFirstLoad = true;
function _pcNotifyEnabled(){
  try{return localStorage.getItem('pcNotifyOn')==='1'}catch(_){return false}
}
function _pcNotifySet(on){
  try{localStorage.setItem('pcNotifyOn', on?'1':'0')}catch(_){}
}
function _updatePcNotifyBtn(){
  const b=document.getElementById('pcNotifyBtn');if(!b)return;
  const on=_pcNotifyEnabled();
  const perm=(typeof Notification!=='undefined')?Notification.permission:'denied';
  if(on && perm==='granted'){
    b.innerHTML='🔔 알림';
    b.style.background='#10b981';b.style.color='#fff';
    b.title='PC 알림 켜짐 — 클릭해서 끄기';
  } else if(on && perm!=='granted'){
    b.innerHTML='🔕 알림 (차단)';
    b.style.background='#fef3c7';b.style.color='#92400e';
    b.title='브라우저 알림 권한 거부됨 — 주소창 왼쪽 자물쇠 아이콘에서 허용 필요';
  } else {
    b.innerHTML='🔕 알림';
    b.style.background='';b.style.color='';
    b.title='PC 알림 꺼짐 — 클릭해서 켜기';
  }
}
async function togglePcNotify(){
  if(typeof Notification==='undefined'){alert('이 브라우저는 알림을 지원하지 않습니다');return}
  const nowOn=_pcNotifyEnabled();
  if(nowOn){
    _pcNotifySet(false);
    _updatePcNotifyBtn();
    if(typeof showAdminToast==='function')showAdminToast('🔕 PC 알림 꺼짐');
    return;
  }
  /* 켜기 — 권한 요청 */
  let perm=Notification.permission;
  if(perm==='default'){
    try{perm=await Notification.requestPermission()}catch(_){perm='denied'}
  }
  if(perm!=='granted'){
    alert('브라우저 알림 권한이 필요합니다.\n주소창 왼쪽 자물쇠(🔒) 아이콘 → 알림 → 허용으로 바꿔주세요.');
    _pcNotifySet(false);
    _updatePcNotifyBtn();
    return;
  }
  _pcNotifySet(true);
  _updatePcNotifyBtn();
  /* 시범 알림 — 켜졌다는 피드백 */
  try{
    const n=new Notification('🔔 PC 알림 켜짐', {
      body: '고객에게 새 메시지가 오면 여기 표시됩니다',
      icon: '/logo-icon.png',
      tag: 'pcNotifyTest',
    });
    setTimeout(()=>{try{n.close()}catch(_){}},3000);
  }catch(_){}
  if(typeof showAdminToast==='function')showAdminToast('🔔 PC 알림 켜짐');
}
function _detectNewMessagesForNotify(rooms){
  try{
    if(!Array.isArray(rooms))return;
    const first=_notifyFirstLoad;
    /* 첫 로드는 baseline 만 설정하고 알림 X */
    if(first){
      for(const rm of rooms)_notifyPrevCounts[rm.id]=Number(rm.user_msg_count||0);
      _notifyFirstLoad=false;
      _updatePcNotifyBtn();
      return;
    }
    if(!_pcNotifyEnabled())return;
    if(typeof Notification==='undefined'||Notification.permission!=='granted')return;
    /* 탭이 보이고 해당 방이 열려있으면 알림 X (이미 보고 있음) */
    const visible=(typeof document.visibilityState==='string')?(document.visibilityState==='visible'):true;
    for(const rm of rooms){
      const prev=_notifyPrevCounts[rm.id];
      const now=Number(rm.user_msg_count||0);
      _notifyPrevCounts[rm.id]=now;
      if(prev==null)continue;
      if(now<=prev)continue;
      /* 현재 열린 방 + 탭 보임 상태면 스킵 */
      if(visible && currentRoomId===rm.id)continue;
      /* 알림 생성 */
      const diff=now-prev;
      const who=rm.first_member_name||rm.name||'거래처';
      const preview=String(rm.last_msg_preview||'새 메시지가 있습니다').slice(0,80);
      try{
        const n=new Notification('💬 '+who+(diff>1?' ('+diff+')':''), {
          body: preview,
          icon: '/logo-icon.png',
          tag: 'room-'+rm.id,
          renotify: true,
          requireInteraction: false,
        });
        n.onclick=function(){
          try{window.focus();if(typeof openRoom==='function')openRoom(rm.id);n.close()}catch(_){}
        };
      }catch(_){}
    }
  }catch(_){}
}
/* 초기 버튼 상태 반영 (DOM 준비 후) */
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',_updatePcNotifyBtn);
} else {
  setTimeout(_updatePcNotifyBtn,0);
}

async function setRoomPriority(roomId, value){
  const n = Number(value);
  const p = (n===1 || n===2 || n===3) ? n : null;
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=set_priority',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:roomId, priority:p})});
    const d=await r.json();
    if(d.ok){loadRoomList()}
    else alert('실패: '+(d.error||'unknown'));
  }catch(e){alert('오류: '+e.message)}
}

/* 상담방 햄버거 메뉴 토글 */
function toggleRoomMenu(){
  var el=document.getElementById('roomActions');
  if(!el)return;
  el.style.display = (el.style.display==='none'||!el.style.display) ? 'flex' : 'none';
}

/* 상담방 팝업 (새 창) — PC 멀티태스킹용. 모바일에선 그냥 기존 방식 */
function popoutCurrentRoom(){
  if(!currentRoomId){alert('상담방이 선택돼 있지 않습니다');return}
  /* 세션 기반(직원) 이거나 sessionStorage ADMIN_KEY 있으면 새 창도 자동 로그인 */
  var url=location.pathname+'?popup=1&room='+encodeURIComponent(currentRoomId);
  try{
    window.open(url,'room_'+currentRoomId,'width=520,height=840,resizable=yes,scrollbars=yes');
  }catch(e){
    /* 팝업 차단 대비 */
    window.open(url,'_blank');
  }
}

/* 팝업 모드 초기 진입: ?popup=1 이면 좌측·상단 숨기고 채팅만 풀스크린 */
(function popupBoot(){
  try{
    var p=new URLSearchParams(location.search);
    if(p.get('popup')!=='1')return;
    var roomId=p.get('room');
    if(!roomId)return;
    document.addEventListener('DOMContentLoaded',function(){applyPopupLayout(roomId)});
    if(document.readyState!=='loading')applyPopupLayout(roomId);
  }catch{}
})();
function applyPopupLayout(roomId){
  try{
    /* 상단 헤더 숨김, 다른 탭 숨김 */
    var hdr=document.querySelector('.hdr');if(hdr)hdr.style.display='none';
    var sm=document.getElementById('searchModal');if(sm)sm.style.display='none';
    /* 상담방 탭 자동 전환 + 방 자동 오픈 */
    if(typeof tab==='function')tab('rooms');
    setTimeout(function(){if(typeof openRoom==='function')openRoom(roomId)},200);
    /* 팝업 안에선 목록 숨김 */
    setTimeout(function(){
      var list=document.querySelector('.room-list-panel');if(list)list.style.display='none';
      var chat=document.querySelector('.room-chat-panel');
      if(chat){chat.style.width='100%';chat.style.flex='1'}
      var wrap=document.querySelector('.wrap');
      if(wrap){wrap.style.maxWidth='none';wrap.style.padding='0';wrap.style.margin='0'}
      /* 팝업 창에선 '🔗 새 창' 버튼 감추기 (이미 팝업인데) */
      var btn=document.getElementById('roomPopoutBtn');if(btn)btn.style.display='none';
      /* 팝업에선 햄버거 메뉴 자동으로 펼침 (이미 별도 창이라 화면 여유 있음) */
      var act=document.getElementById('roomActions');if(act)act.style.display='flex';
      /* 팝업 탭 이름 */
      document.title='상담방 · '+roomId+' — 세무회계 이윤';
    },400);
  }catch(err){console.error('popup layout',err)}
}

/* ===== 상담방 정보 모달 (검색·사진·링크·파일·게시판) ===== */
let riSearchTimer=null;
function openRoomInfo(){
  if(!currentRoomId){alert('상담방을 먼저 선택해 주세요');return}
  const m=$g('roomInfoModal');
  $g('riTitle').textContent='상담방 정보';
  $g('riSearchInput').value='';
  $g('riSearchList').innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">검색어를 입력하세요</div>';
  $g('riPhotoGrid').innerHTML='<div style="grid-column:1/-1;text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">불러오는 중...</div>';
  $g('riLinkList').innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">불러오는 중...</div>';
  switchRiTab('search');
  m.style.display='flex';
  loadRoomMedia();
}
function switchRiTab(t){
  document.querySelectorAll('#roomInfoModal .ri-tab').forEach(function(b){b.classList.toggle('on',b.dataset.tab===t)});
  $g('riSearchPanel').style.display=t==='search'?'block':'none';
  $g('riPhotoPanel').style.display=t==='photo'?'block':'none';
  $g('riLinkPanel').style.display=t==='link'?'block':'none';
  $g('riFilePanel').style.display=t==='file'?'block':'none';
  $g('riNoticePanel').style.display=t==='notice'?'block':'none';
  const bm=$g('riBookmarkPanel'); if(bm)bm.style.display=t==='bookmark'?'block':'none';
  if(t==='search')setTimeout(function(){$g('riSearchInput').focus()},100);
  if(t==='file')loadRoomFiles();
  if(t==='notice')loadRoomNotices();
  if(t==='bookmark')loadRoomBookmarks();
}
function onRiSearchInput(){
  if(riSearchTimer)clearTimeout(riSearchTimer);
  riSearchTimer=setTimeout(doRiSearch,250);
}
async function doRiSearch(){
  const q=$g('riSearchInput').value.trim();
  const el=$g('riSearchList');
  if(q.length<2){el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">2자 이상 입력하세요</div>';return}
  el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">검색 중...</div>';
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId)+'&search='+encodeURIComponent(q));
    const d=await r.json();
    if(!d.matches||d.matches.length===0){el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">결과 없음</div>';return}
    const qRe=new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
    const header='<div style="padding:6px 4px 10px;font-size:.78em;color:#6b7280;font-weight:600">총 '+d.matches.length+'건 매칭 — 결과를 누르면 해당 메시지로 이동</div>';
    el.innerHTML=header+d.matches.map(function(m){
      const who=m.role==='human_advisor'?'👨‍💼 세무사':m.role==='assistant'?'🤖 AI':'👤 '+(m.real_name||m.name||'사용자');
      let content=String(m.content||'');
      const imgMatch=content.match(/^\[IMG\]\S+\n?([\s\S]*)$/);
      if(imgMatch)content='[사진] '+imgMatch[1];
      const escaped=e(content).slice(0,200);
      const hi=escaped.replace(qRe,'<mark>$1</mark>');
      return '<div class="ri-match" onclick="jumpFromSearch('+m.id+')" style="cursor:pointer" title="클릭하면 원본 메시지로 이동"><div class="ri-who">'+who+' · '+e(m.created_at||'')+' · <span style="color:#3182f6">↗ 이동</span></div>'+hi+'</div>';
    }).join('');
  }catch(err){el.innerHTML='<div style="color:#f04452;font-size:.8em;padding:20px">오류: '+e(err.message)+'</div>'}
}
/* 검색 결과 클릭 → 정보 패널 닫고 원본 메시지로 스크롤·하이라이트 */
function jumpFromSearch(mid){
  const m=$g('roomInfoModal');
  if(m)m.style.display='none';
  setTimeout(function(){
    if(typeof jumpToOriginalMsgAdmin==='function')jumpToOriginalMsgAdmin(String(mid));
  },80);
}
async function loadRoomMedia(){
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId)+'&view=media');
    const d=await r.json();
    const photoEl=$g('riPhotoGrid');
    const linkEl=$g('riLinkList');
    if(!d.photos||d.photos.length===0){
      photoEl.innerHTML='<div style="grid-column:1/-1;text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">사진 없음</div>';
    } else {
      photoEl.innerHTML=d.photos.map(function(m){
        const match=String(m.content||'').match(/^\[IMG\](\S+)/);
        const url=match?match[1]:'';
        if(!url)return '';
        return '<div class="ri-photo" style="cursor:zoom-in"><img class="rc-img-msg" src="'+e(url)+'" loading="lazy" alt="" style="width:100%;height:100%;object-fit:cover;display:block" onclick="openImgViewer(this.src,collectImagesNear(this))"></div>';
      }).join('');
    }
    if(!d.links||d.links.length===0){
      linkEl.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">링크 없음</div>';
    } else {
      linkEl.innerHTML=d.links.map(function(l){
        const who=l.role==='human_advisor'?'세무사':l.role==='assistant'?'AI':(l.user_name||'사용자');
        return '<div class="ri-link-item"><a href="'+e(l.url)+'" target="_blank" rel="noopener">'+e(l.url)+'</a><div class="ri-meta">'+who+' · '+e(l.created_at||'')+'</div></div>';
      }).join('');
    }
  }catch(err){console.error(err)}
}

async function loadRoomFiles(){
  const el=$g('riFileList');
  el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId)+'&view=files');
    const d=await r.json();
    if(!d.files||d.files.length===0){el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">파일 없음</div>';return}
    el.innerHTML=d.files.map(function(m){
      let obj=null;try{const mm=String(m.content||'').match(/^\[FILE\](\{[^\n]+\})/);if(mm)obj=JSON.parse(mm[1])}catch{}
      if(!obj)return '';
      const who=m.role==='human_advisor'?'세무사':m.role==='assistant'?'AI':(m.real_name||m.name||'사용자');
      const nm=obj.name||'파일';
      return '<a href="'+e(obj.url||'#')+'" download="'+e(nm)+'" onclick="if(!confirm(\'파일을 다운로드 하시겠습니까?\')){event.preventDefault();return false}" class="ri-link-item" style="display:flex;gap:10px;text-decoration:none;color:inherit;align-items:center">'
        +'<div style="font-size:1.7em;line-height:1">'+fileIconFor(nm)+'</div>'
        +'<div style="flex:1;min-width:0"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+e(nm)+'</div>'
        +'<div class="ri-meta">'+fmtSize(obj.size)+' · '+who+' · '+e(m.created_at||'')+'</div></div></a>';
    }).join('');
  }catch(err){el.innerHTML='<div style="color:#f04452;font-size:.8em;padding:20px">오류: '+e(err.message)+'</div>'}
}

async function loadRoomNotices(){
  const el=$g('riNoticeList');
  el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId)+'&view=notices');
    const d=await r.json();
    if(!d.notices||d.notices.length===0){el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">등록된 공지 없음</div>';return}
    el.innerHTML=d.notices.map(function(n){
      const pinMark=n.pinned?'<span style="background:#fef3c7;color:#8b6914;font-size:.68em;padding:2px 7px;border-radius:4px;font-weight:700;margin-right:6px">📌 고정</span>':'';
      const contentEsc=e(n.content||'').replace(/\n/g,'<br>');
      return '<div class="ri-link-item" style="padding:12px">'
        +'<div style="font-weight:700;font-size:.88em;margin-bottom:4px">'+pinMark+e(n.title)+'</div>'
        +'<div style="font-size:.8em;line-height:1.55;margin-bottom:6px">'+contentEsc+'</div>'
        +'<div class="ri-meta">'+e(n.created_at||'')+(n.updated_at&&n.updated_at!==n.created_at?' · (수정 '+e(n.updated_at)+')':'')+'</div>'
        +'<div style="display:flex;gap:6px;margin-top:8px">'
        +'<button onclick="toggleNoticePin('+n.id+','+(n.pinned?0:1)+')" style="flex:1;background:'+(n.pinned?'#fef3c7':'#f2f4f6')+';border:none;padding:6px;border-radius:6px;font-size:.72em;cursor:pointer;font-family:inherit">'+(n.pinned?'고정 해제':'📌 고정')+'</button>'
        +'<button onclick="openNoticeForm('+n.id+',\''+e(n.title).replace(/\'/g,"\\'")+'\',\''+e(n.content).replace(/\'/g,"\\'").replace(/\n/g,"\\n")+'\')" style="flex:1;background:#f2f4f6;border:none;padding:6px;border-radius:6px;font-size:.72em;cursor:pointer;font-family:inherit">수정</button>'
        +'<button onclick="deleteNotice('+n.id+')" style="flex:1;background:#fee2e2;color:#f04452;border:none;padding:6px;border-radius:6px;font-size:.72em;cursor:pointer;font-family:inherit">삭제</button>'
        +'</div></div>';
    }).join('');
  }catch(err){el.innerHTML='<div style="color:#f04452;font-size:.8em;padding:20px">오류: '+e(err.message)+'</div>'}
}

let editingNoticeId=null;
function openNoticeForm(id,title,content){
  editingNoticeId=id;
  $g('nfTitle').textContent=id?'공지 수정':'공지 작성';
  $g('nfTitleInput').value=title||'';
  $g('nfContent').value=content||'';
  $g('noticeFormModal').style.display='flex';
}
async function submitNotice(){
  const title=$g('nfTitleInput').value.trim();
  const content=$g('nfContent').value.trim();
  if(!title||!content){alert('제목과 내용을 입력해 주세요');return}
  const action=editingNoticeId?'notice_update':'notice_create';
  const body={room_id:currentRoomId,title,content};
  if(editingNoticeId)body.notice_id=editingNoticeId;
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action='+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json();
    if(d.ok){$g('noticeFormModal').style.display='none';loadRoomNotices()}
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}
async function toggleNoticePin(id,pinned){
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=notice_pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId,notice_id:id,pinned:pinned})});
    const d=await r.json();
    if(d.ok)loadRoomNotices();
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}
async function deleteNotice(id){
  if(!confirm('공지를 삭제하시겠어요?'))return;
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=notice_delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId,notice_id:id})});
    const d=await r.json();
    if(d.ok)loadRoomNotices();
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

async function renameRoom(){
  if(!currentRoomId)return;
  const current=$g('roomChatTitle').textContent.replace(/\(.*\)/,'').trim();
  const name=prompt('새 상담방 이름:',current);
  if(!name||!name.trim())return;
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId,name:name.trim()})});
    const d=await r.json();
    if(d.ok){loadRoomDetail();loadRoomList()}
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

async function toggleRoomStatus(){
  if(!currentRoomId)return;
  const act=currentRoomStatus==='active'?'close':'reopen';
  if(!confirm(act==='close'?'상담방을 종료하시겠어요? (대화기록은 유지됩니다)':'상담방을 재개하시겠어요?'))return;
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action='+act,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId})});
    const d=await r.json();
    if(d.ok){loadRoomDetail();loadRoomList()}
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

async function deleteCurrentRoom(){
  if(!currentRoomId)return;
  if(!confirm('🗑️ 이 상담방과 모든 대화기록을 영구 삭제합니다.\n(대화·멤버·게시판·메시지 모두 삭제 · 복구 불가)\n계속할까요?'))return;
  if(!confirm('정말 삭제하시겠습니까? 마지막 확인입니다.'))return;
  const rid=currentRoomId;
  try{
    /* POST action=delete_room 우선 시도 — DELETE 메서드가 일부 프록시에서 막히는 경우 대비 */
    let r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=delete_room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:rid})});
    let d;
    try{d=await r.json()}catch(_){d={error:'응답 파싱 실패 (HTTP '+r.status+')'}}
    /* 서버가 action=delete_room 미지원이면 구 DELETE 방식 fallback */
    if(!r.ok && (r.status===400||r.status===404)){
      r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(rid),{method:'DELETE'});
      try{d=await r.json()}catch(_){d={error:'응답 파싱 실패 (HTTP '+r.status+')'}}
    }
    if(!r.ok){
      alert('삭제 실패 (HTTP '+r.status+'): '+(d.error||'unknown')+'\n권한: owner 전용입니다. 직원 계정이면 대표님께 요청하세요.');
      return;
    }
    if(!d.ok){alert('삭제 실패: '+(d.error||'unknown'));return}
    currentRoomId=null;
    try{$g('roomChatTitle').textContent='좌측 상담방을 선택하세요'}catch(_){}
    try{$g('roomMessages').innerHTML=''}catch(_){}
    try{$g('roomMembers').style.display='none'}catch(_){}
    try{$g('roomActions').style.display='none'}catch(_){}
    try{$g('roomInputArea').style.display='none'}catch(_){}
    try{$g('roomsLayout').classList.remove('show-chat')}catch(_){}
    if(roomMsgPollTimer)clearInterval(roomMsgPollTimer);
    _adminShowToast('🗑️ 상담방 삭제됨');
    loadRoomList();
  }catch(err){alert('오류: '+err.message)}
}

/* === 방 생성 모달 === */
async function openCreateRoom(){
  $g('crName').value='';
  $g('crSearch').value='';
  $g('crMaxMembers').value='10';
  $g('crMax').textContent='10';
  crSelectedUsers={};
  $g('crSelectedCount').textContent='0';
  $g('createRoomModal').style.display='flex';
  /* 거래처(기장·일반) 사용자 로딩. 관리자는 방 생성 시 서버에서 자동 참여되므로 선택 리스트에 포함 X */
  try{
    const r=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY)+'&status=approved_client');
    const d1=await r.json();
    const r2=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY)+'&status=approved_guest');
    const d2=await r2.json();
    const users=[...(d1.users||[]),...(d2.users||[])];
    window._crAllUsers=users;
    renderCrUsers(users);
  }catch{$g('crUserList').innerHTML='<div style="padding:10px;color:#f04452">로딩 실패</div>'}
}

function renderCrUsers(users){
  const el=$g('crUserList');
  if(users.length===0){el.innerHTML='<div style="padding:10px;color:#8b95a1;font-size:.8em">사용자 없음</div>';return}
  el.innerHTML=users.map(u=>{
    const nm=u.real_name||u.name||'이름없음';
    const checked=crSelectedUsers[u.id]?'checked':'';
    const badge=u.approval_status==='approved_client'?'<span style="font-size:.65em;background:#e0f5ec;color:#10b981;padding:1px 5px;border-radius:4px;margin-left:4px">기장</span>':'<span style="font-size:.65em;background:#e8f3ff;color:#3182f6;padding:1px 5px;border-radius:4px;margin-left:4px">일반</span>';
    return '<label style="display:flex;align-items:center;gap:8px;padding:8px;cursor:pointer;border-bottom:1px solid #f2f4f6"><input type="checkbox" '+checked+' onchange="toggleCrUser('+u.id+',\''+e(nm).replace(/\'/g,'')+'\')"><span style="font-size:.85em">'+e(nm)+'</span>'+badge+'<span style="font-size:.7em;color:#8b95a1;margin-left:auto">'+e(u.phone||'')+'</span></label>';
  }).join('');
}

function toggleCrUser(uid,nm){
  const max=parseInt($g('crMaxMembers').value,10);
  if(crSelectedUsers[uid]){delete crSelectedUsers[uid]}
  else{
    if(Object.keys(crSelectedUsers).length>=max){alert('최대 '+max+'명까지 선택 가능합니다');renderCrUsers(window._crAllUsers);return}
    crSelectedUsers[uid]=nm;
  }
  $g('crSelectedCount').textContent=Object.keys(crSelectedUsers).length;
}

function filterRoomUsers(){
  const q=$g('crSearch').value.trim();
  const users=window._crAllUsers||[];
  if(!q){renderCrUsers(users);return}
  renderCrUsers(users.filter(u=>((u.real_name||'')+u.name+(u.phone||'')).indexOf(q)>=0));
}

async function createRoom(){
  const name=$g('crName').value.trim();
  const ids=Object.keys(crSelectedUsers).map(Number);
  /* 거래처 0명 허용 — 관리자끼리 틀만 먼저 만들 수도 있음.
     확인만 한 번 더 묻고 진행. 서버는 멤버 0명 허용. 관리자는 자동 참여 */
  if(ids.length===0){
    if(!confirm('거래처를 한 명도 선택하지 않았습니다.\n관리자끼리만 들어있는 빈 방을 먼저 만드시겠어요?\n(나중에 참여자 초대 가능)'))return;
  }
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name||'상담방',max_members:Number($g('crMaxMembers').value),member_user_ids:ids})});
    const d=await r.json();
    if(d.ok){
      $g('createRoomModal').style.display='none';
      await loadRoomList();
      openRoom(d.room_id);
    } else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

/* ===== 👥 상담방 참여자 관리 모달 ===== */
async function openRoomMembersModal(){
  if(!currentRoomId){alert('상담방을 먼저 선택하세요');return}
  const m=$g('roomMembersModal');if(!m)return;
  m.style.display='flex';
  document.body.style.overflow='hidden';
  const rn=$g('rmmRoomName');if(rn)rn.textContent=currentRoomId;
  await _rmmLoad();
}
function closeRoomMembersModal(){
  const m=$g('roomMembersModal');if(m)m.style.display='none';
  document.body.style.overflow='';
}
async function _rmmLoad(){
  const el=$g('rmmBody');if(!el)return;
  el.innerHTML='<div style="text-align:center;color:#8b95a1;padding:40px 0;font-size:.88em">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId));
    const d=await r.json();
    const members=(d.members||[]).filter(m=>!m.left_at);
    currentRoomMembers=members;
    const admins=members.filter(m=>m.role==='admin');
    const others=members.filter(m=>m.role!=='admin');
    let html='';
    html+='<div style="font-size:.76em;font-weight:700;color:#8b6914;margin:6px 2px 4px">👑 관리자 ('+admins.length+')</div>';
    if(admins.length){
      html+='<div style="background:#fff;border:1px solid #e5e8eb;border-radius:10px;overflow:hidden;margin-bottom:14px">'
        +admins.map(function(m){
          const nm=e(m.real_name||m.name||'이름없음');
          const av=m.profile_image?'<img src="'+escAttr(m.profile_image)+'" style="width:32px;height:32px;border-radius:50%;object-fit:cover" alt="">':'<div style="width:32px;height:32px;border-radius:50%;background:#8b6914;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.85em">'+(nm[0]||'?')+'</div>';
          return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid #f2f4f6">'
            +av
            +'<div style="flex:1;min-width:0"><div style="font-size:.9em;font-weight:600">'+nm+(m.role==='admin'?' <span style="font-size:.7em;color:#8b6914">관리자</span>':'')+'</div>'
            +(m.phone?'<div style="font-size:.72em;color:#8b95a1">'+e(m.phone)+'</div>':'')+'</div>'
            +'</div>';
        }).join('').replace(/border-bottom:1px solid #f2f4f6"><\/div>$/,'"></div>')
        +'</div>';
    }
    html+='<div style="font-size:.76em;font-weight:700;color:#1e40af;margin:6px 2px 4px">🏢 거래처 참여자 ('+others.length+')</div>';
    if(!others.length){
      html+='<div style="padding:20px;text-align:center;color:#8b95a1;font-size:.82em;background:#fff;border:1px solid #e5e8eb;border-radius:10px">참여 중인 거래처가 없습니다. 아래 [＋ 참여자 초대] 로 추가하세요.</div>';
    } else {
      html+='<div style="background:#fff;border:1px solid #e5e8eb;border-radius:10px;overflow:hidden">'
        +others.map(function(m){
          const nm=e(m.real_name||m.name||'이름없음');
          const safeName=escAttr(m.real_name||m.name||'');
          const av=m.profile_image?'<img src="'+escAttr(m.profile_image)+'" style="width:32px;height:32px;border-radius:50%;object-fit:cover" alt="">':'<div style="width:32px;height:32px;border-radius:50%;background:#3182f6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.85em">'+(nm[0]||'?')+'</div>';
          return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid #f2f4f6">'
            +av
            +'<div style="flex:1;min-width:0"><div style="font-size:.9em;font-weight:600;cursor:pointer" onclick="closeRoomMembersModal();openCustomerDashboard('+m.user_id+')">'+nm+' <span style="font-size:.7em;color:#3b82f6">📋</span></div>'
            +(m.phone?'<div style="font-size:.72em;color:#8b95a1">'+e(m.phone)+'</div>':'')+'</div>'
            +'<button onclick="removeRoomMember('+m.user_id+',\''+safeName.replace(/\'/g,'')+'\')" title="이 참여자를 상담방에서 내보내기" style="background:#fee2e2;color:#dc2626;border:none;padding:5px 10px;border-radius:6px;font-size:.75em;cursor:pointer;font-family:inherit;flex-shrink:0">🚪 내보내기</button>'
            +'</div>';
        }).join('')
        +'</div>';
    }
    el.innerHTML=html;
  }catch(err){el.innerHTML='<div style="color:#f04452;padding:20px;font-size:.85em">오류: '+e(err.message)+'</div>'}
}
async function removeRoomMember(userId, displayName){
  if(!currentRoomId||!userId)return;
  if(!confirm('🚪 '+(displayName||'이 참여자')+' 을(를) 이 상담방에서 내보냅니다.\n\n(거래처 자체는 유지, 이 방에서만 나가게 됩니다)\n계속할까요?'))return;
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=remove_member',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId,user_id:userId})});
    const d=await r.json();
    if(!d.ok){alert('실패: '+(d.error||'unknown'));return}
    _rmmLoad();
    if(typeof loadRoomDetail==='function')loadRoomDetail();
  }catch(err){alert('오류: '+err.message)}
}

async function addMemberPrompt(){
  if(!currentRoomId)return;
  try{
    const r=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY)+'&status=approved_client');
    const d1=await r.json();
    const r2=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY)+'&status=approved_guest');
    const d2=await r2.json();
    const users=[...(d1.users||[]),...(d2.users||[])];
    // 이미 방에 있는 멤버 제외
    const roomData=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&room_id='+currentRoomId).then(x=>x.json());
    const currentIds=new Set((roomData.members||[]).filter(m=>!m.left_at).map(m=>m.user_id));
    const available=users.filter(u=>!currentIds.has(u.id));
    if(available.length===0){alert('추가 가능한 사용자가 없습니다');return}
    window._amAvailable=available;
    renderAddMemberList(available);
    $g('addMemberModal').style.display='flex';
  }catch(err){alert('오류: '+err.message)}
}

function renderAddMemberList(users){
  const q=($g('amSearch').value||'').trim();
  const filtered=q?users.filter(u=>((u.real_name||'')+u.name+(u.phone||'')).indexOf(q)>=0):users;
  $g('amList').innerHTML=filtered.map(u=>{
    const nm=u.real_name||u.name||'이름없음';
    const badge=u.approval_status==='approved_client'?'<span style="font-size:.65em;background:#e0f5ec;color:#10b981;padding:1px 5px;border-radius:4px;margin-left:4px">기장</span>':'<span style="font-size:.65em;background:#e8f3ff;color:#3182f6;padding:1px 5px;border-radius:4px;margin-left:4px">일반</span>';
    return '<div onclick="addMemberPick('+u.id+',\''+e(nm).replace(/\'/g,'')+'\')" style="display:flex;align-items:center;gap:8px;padding:12px;cursor:pointer;border-bottom:1px solid #f2f4f6;transition:.15s" onmouseover="this.style.background=\'#f2f4f6\'" onmouseout="this.style.background=\'#fff\'">'
      +'<div style="width:32px;height:32px;border-radius:50%;background:#3182f6;color:#fff;display:flex;align-items:center;justify-content:center;font-size:.78em;font-weight:600">'+nm[0]+'</div>'
      +'<div style="flex:1"><div style="font-size:.88em;font-weight:500">'+e(nm)+badge+'</div><div style="font-size:.72em;color:#8b95a1">'+e(u.phone||'-')+'</div></div>'
      +'<div style="color:#3182f6;font-size:1.2em">＋</div></div>';
  }).join('');
  if(filtered.length===0)$g('amList').innerHTML='<div style="padding:20px;text-align:center;color:#8b95a1;font-size:.85em">검색 결과 없음</div>';
}

function filterAddMember(){renderAddMemberList(window._amAvailable||[])}

function _amSyncVisSince(){
  /* 라디오 선택 반영 — 힌트 텍스트 갱신 */
  const el=document.querySelector('input[name=amVisSince]:checked');
  if(!el)return;
  const h=$g('amVisSinceHint');
  if(el.value==='all')h.textContent='이 사람에게 방의 전체 과거 대화가 보입니다.';
  else if(el.value==='now')h.textContent='이 사람은 초대 시점 이후 메시지만 볼 수 있습니다. (민감정보 포함된 과거 대화 숨김 시 권장)';
  else {
    const d=$g('amVisSinceDate').value;
    h.textContent=d?'이 사람은 '+d+' 00:00 이후 메시지부터 볼 수 있습니다.':'날짜를 선택하세요.';
  }
}
function _amVisibleSinceValue(){
  const el=document.querySelector('input[name=amVisSince]:checked');
  if(!el || el.value==='all')return null;
  if(el.value==='now')return 'now';
  if(el.value==='date'){
    const d=$g('amVisSinceDate').value;
    return d||'now';
  }
  return null;
}
async function addMemberPick(userId,nm){
  const vs=_amVisibleSinceValue();
  try{
    const rr=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=add_member',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId,user_id:userId, visible_since:vs})});
    const dd=await rr.json();
    if(dd.ok){
      $g('addMemberModal').style.display='none';
      loadRoomDetail();loadRoomList();
    }
    else alert('실패: '+(dd.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

/* ===== 실시간 대화 개입 ===== */
let liveCurrentSession=null;
let liveCurrentUserId=null;
let livePollTimer=null;
let liveMsgPollTimer=null;

async function refreshLiveBadge(){
  try{
    const r=await fetch('/api/admin-live?key='+encodeURIComponent(KEY));
    const d=await r.json();
    const b=$g('liveBadge');
    const n=d.total_unread||0;
    if(n>0){b.textContent=n;b.style.display='inline-block'}else{b.style.display='none'}
  }catch{}
}

function startLivePolling(){
  loadLiveSessions();
  if(livePollTimer)clearInterval(livePollTimer);
  livePollTimer=setInterval(loadLiveSessions,10000); // 10초마다 세션 목록 갱신
}
function stopLivePolling(){
  if(livePollTimer)clearInterval(livePollTimer);
  if(liveMsgPollTimer)clearInterval(liveMsgPollTimer);
  livePollTimer=null;liveMsgPollTimer=null;
}

async function loadLiveSessions(){
  try{
    const r=await fetch('/api/admin-live?key='+encodeURIComponent(KEY));
    const d=await r.json();
    const el=$g('liveSessionList');
    const totalEl=$g('liveTotalUnread');
    if(d.total_unread>0){totalEl.style.display='inline-block';totalEl.textContent=d.total_unread+' 미확인'}
    else totalEl.style.display='none';
    if(!d.sessions||d.sessions.length===0){el.innerHTML='<div style="padding:20px;text-align:center;color:#8b95a1;font-size:.8em">최근 30분 활성 대화 없음</div>';return}
    el.innerHTML=d.sessions.map(s=>{
      const nm=s.real_name||s.user_name||'이름없음';
      const av=s.profile_image?'<img src="'+e(s.profile_image)+'" style="width:32px;height:32px;border-radius:50%;object-fit:cover">':'<div style="width:32px;height:32px;border-radius:50%;background:#3182f6;color:#fff;display:flex;align-items:center;justify-content:center;font-size:.78em;font-weight:600">'+nm[0]+'</div>';
      const unread=s.advisor_unread>0?'<span style="background:#f04452;color:#fff;border-radius:8px;padding:1px 6px;font-size:.7em">'+s.advisor_unread+'</span>':'';
      const modeIcon=s.ai_mode==='off'?'👨‍💼':'🤖';
      const active=liveCurrentSession===s.session_id&&liveCurrentUserId===s.user_id?'background:#e8f3ff':'';
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;'+active+'">'
        +'<div onclick="openLiveSession(\''+e(s.session_id)+'\','+s.user_id+')" style="display:flex;align-items:center;gap:10px;flex:1;cursor:pointer;min-width:0">'
        +av
        +'<div style="flex:1;min-width:0">'
        +'<div style="display:flex;align-items:center;gap:4px"><span style="font-size:.85em;font-weight:600">'+e(nm)+'</span><span style="font-size:.7em">'+modeIcon+'</span>'+unread+'</div>'
        +'<div style="font-size:.72em;color:#8b95a1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+e(s.last_user_message||'(메시지 없음)')+'</div>'
        +'<div style="font-size:.65em;color:#b0b8c1">'+e(s.last_at||'')+'</div>'
        +'</div></div>'
        +'<button onclick="deleteLiveSession(\''+e(s.session_id)+'\','+s.user_id+',\''+e(nm)+'\')" title="이 대화 삭제" style="background:none;border:none;color:#b0b8c1;font-size:1em;cursor:pointer;padding:6px;border-radius:6px;flex-shrink:0" onmouseover="this.style.background=\'#fee2e2\';this.style.color=\'#f04452\'" onmouseout="this.style.background=\'none\';this.style.color=\'#b0b8c1\'">🗑️</button>'
        +'</div>';
    }).join('');
  }catch(err){$g('liveSessionList').innerHTML='<div style="padding:20px;color:#f04452">오류: '+e(err.message)+'</div>'}
}

async function openLiveSession(sid,uid){
  liveCurrentSession=sid;liveCurrentUserId=uid;
  $g('liveAiToggle').style.display='block';
  $g('liveInputArea').style.display='flex';
  // 제목에 사용자 이름 표시
  try{
    const lst=document.querySelectorAll('#liveSessionList > div');
    lst.forEach(el=>{
      if(el.innerHTML.indexOf('openLiveSession(\\\''+sid+'\\\','+uid)>=0){
        const nameEl=el.querySelector('span');
        if(nameEl)$g('liveChatTitle').innerHTML='<b>'+nameEl.textContent+'</b>';
      }
    });
  }catch{}
  await loadLiveMessages();
  loadLiveSessions();
  if(liveMsgPollTimer)clearInterval(liveMsgPollTimer);
  liveMsgPollTimer=setInterval(loadLiveMessages,2000);
}

async function loadLiveMessages(){
  if(!liveCurrentSession||!liveCurrentUserId)return;
  try{
    const r=await fetch('/api/admin-live?key='+encodeURIComponent(KEY)+'&session='+encodeURIComponent(liveCurrentSession)+'&user_id='+liveCurrentUserId);
    const d=await r.json();
    $g('liveAiOn').checked=d.ai_mode!=='off';
    const container=$g('liveMessages');
    const atBottom=container.scrollHeight-container.scrollTop-container.clientHeight<50;
    container.innerHTML=(d.messages||[]).map(m=>{
      const role=m.role;
      if(role==='user'){
        return '<div style="margin-bottom:10px;display:flex;justify-content:flex-end"><div style="background:#3182f6;color:#fff;padding:10px 14px;border-radius:14px 4px 14px 14px;max-width:70%;font-size:.85em;white-space:pre-wrap">'+renderMsgBody(m.content)+'<div style="font-size:.65em;opacity:.8;margin-top:4px">'+e(m.created_at||'')+'</div></div></div>';
      } else if(role==='assistant'){
        return '<div style="margin-bottom:10px"><div style="display:inline-block;background:#fff;border:1px solid #e5e8eb;padding:10px 14px;border-radius:4px 14px 14px 14px;max-width:70%;font-size:.85em;white-space:pre-wrap">'+renderMsgBody(m.content)+'<div style="font-size:.65em;color:#8b95a1;margin-top:4px">🤖 AI · '+e(m.created_at||'')+'</div></div></div>';
      } else if(role==='human_advisor'){
        return '<div style="margin-bottom:10px"><div style="display:inline-block;background:#e0f5ec;border:1px solid #86efac;padding:10px 14px;border-radius:4px 14px 14px 14px;max-width:70%;font-size:.85em;white-space:pre-wrap">'+renderMsgBody(m.content)+'<div style="font-size:.65em;color:#10b981;margin-top:4px;font-weight:600"><img src="logo-icon.png" alt="" style="width:12px;height:12px;vertical-align:middle;object-fit:contain;margin-right:3px"> 세무사 · '+e(m.created_at||'')+'</div></div></div>';
      }
      return '';
    }).join('');
    if(atBottom||adminForceLiveScrollOnNext)container.scrollTop=container.scrollHeight;
    adminForceLiveScrollOnNext=false;
    // 세션 목록도 unread 초기화 반영
    refreshLiveBadge();
  }catch(err){console.error(err)}
}

async function sendLiveMessage(){
  if(!liveCurrentSession||!liveCurrentUserId)return;
  const input=$g('liveInput');
  const content=input.value.trim();
  if(!content)return;
  input.value='';
  adminForceLiveScrollOnNext=true;
  try{
    const r=await fetch('/api/admin-live?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:liveCurrentSession,user_id:liveCurrentUserId,content:content})});
    const d=await r.json();
    if(d.ok){
      await loadLiveMessages();
      const _c=$g('liveMessages');
      if(_c)_c.scrollTop=_c.scrollHeight;
      setTimeout(function(){const c2=$g('liveMessages');if(c2)c2.scrollTop=c2.scrollHeight;},80);
    } else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

async function deleteLiveSession(sid,uid,nm){
  if(!confirm('"'+nm+'"님의 대화를 완전히 삭제합니다.\n(메시지·기록 복구 불가)\n계속할까요?'))return;
  try{
    const r=await fetch('/api/admin-live?key='+encodeURIComponent(KEY)+'&session='+encodeURIComponent(sid)+'&user_id='+uid,{method:'DELETE'});
    const d=await r.json();
    if(d.ok){
      if(liveCurrentSession===sid&&liveCurrentUserId==uid){
        liveCurrentSession=null;liveCurrentUserId=null;
        $g('liveMessages').innerHTML='';
        $g('liveChatTitle').textContent='좌측 세션을 선택하세요';
        $g('liveAiToggle').style.display='none';
        $g('liveInputArea').style.display='none';
        if(liveMsgPollTimer)clearInterval(liveMsgPollTimer);
      }
      loadLiveSessions();
      refreshLiveBadge();
    } else {
      alert('삭제 실패: '+(d.error||'unknown'));
    }
  }catch(err){alert('오류: '+err.message)}
}

async function toggleAiMode(isOn){
  if(!liveCurrentSession||!liveCurrentUserId)return;
  try{
    const mode=isOn?'on':'off';
    const r=await fetch('/api/admin-live?key='+encodeURIComponent(KEY)+'&action=toggle_ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:liveCurrentSession,user_id:liveCurrentUserId,ai_mode:mode})});
    const d=await r.json();
    if(!d.ok)alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

let currentStatus='pending';
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
/* 👑 관리자 탭 — 관리자 해제만 노출. 관리자가 관리자 거절·종료는 의미 없음 */
actions='<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">'
+(IS_OWNER?'<button onclick="setAdminFlag('+u.id+',0)" style="background:#fff;color:#8b6914;border:1px solid #8b6914;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit;font-weight:600">👑 관리자 해제</button>':'<span style="font-size:.72em;color:#8b95a1">(owner 만 관리 가능)</span>')
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
  ? '<div class="name">🏢 '+e(company)+' <span style="font-weight:500;color:#8b95a1;font-size:.88em">· '+e(nm)+'</span>'+roleBadge+kakaoAlias+adminMark+'</div>'
  : '<div class="name">'+e(nm)+roleBadge+kakaoAlias+adminMark+'</div>';
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
let _apbUser=null;       /* {id, name, phone, action} */
let _apbAllBiz=[];
let _apbSelectedBizId=null;

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
let currentProfileUserId=null;
let currentEditingBizId=null; // null이면 신규, 숫자면 수정

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

/* ===== 검증 탭 (원격 유지) ===== */
let curFilter='pending';
function filt(f){
curFilter=f;
$g('fltPending').className=f==='pending'?'on':'';
$g('fltMedium').className=f==='medium'?'on':'';
$g('fltLow').className=f==='low'?'on':'';
$g('fltReported').className=f==='reported'?'on':'';
$g('fltAll').className=f==='all'?'on':'';
loadReview(f);
}

async function loadReview(f){
const el=$g('reviewList');
el.innerHTML='<div class="empty">로딩 중...</div>';
try{
const r=await fetch('/api/admin-review?key='+encodeURIComponent(KEY)+'&filter='+f);
const d=await r.json();
if(d.error){el.innerHTML='<div class="empty">'+e(d.error)+'</div>';return}
if(!d.items||d.items.length===0){el.innerHTML='<div class="empty">해당 항목 없음</div>';return}
if(f==='pending'){
const bg=$g('reviewBadge');
if(d.items.length>0){bg.style.display='inline-block';bg.textContent=d.items.length}
else bg.style.display='none';
}
el.innerHTML=d.items.map(x=>{
const conf=x.confidence||'미분류';
const confClass=conf==='높음'?'high':conf==='보통'?'medium':conf==='낮음'?'low':'medium';
const reportMark=x.reported?' 🚨자동감지':'';
return '<div class="review-card" id="card_'+x.id+'">'
+'<div class="r-head"><span>'+e(x.user_name||'비로그인')+'</span> · <span>'+e(x.created_at||'')+'</span> <span class="conf '+confClass+'">'+e(conf)+'</span>'+reportMark+'</div>'
+'<div class="r-q">'+e(x.question||'(질문 없음)').substring(0,200)+'</div>'
+'<div class="r-a">'+e(x.content||'')+'</div>'
+'<div class="r-actions">'
+'<button class="btn-ok" onclick="rev('+x.id+',\'mark_reviewed\')">✅ 정답 확인</button>'
+'<button class="btn-fix" onclick="rev('+x.id+',\'report_and_review\')">⚠️ 수정필요 (Claude로)</button>'
+'<select class="conf-set" onchange="setConf('+x.id+',this.value);this.selectedIndex=0">'
+'<option value="">신뢰도 변경…</option>'
+'<option value="높음">↑ 높음으로 승급</option>'
+'<option value="보통">↓ 보통으로 강등</option>'
+'<option value="낮음">↓ 낮음으로 강등</option>'
+'</select>'
+'</div></div>';
}).join('');
}catch(err){el.innerHTML='<div class="empty">오류: '+e(err.message)+'</div>'}
}

async function bulkReview(){
// 현재 필터에 따라 다르게 처리
var act='bulk_review_all_reported';
var msg='신고된 모든 답변을 처리완료 처리합니다.\nClaude가 이미 검토/수정한 후 누르세요. 계속할까요?';
if(curFilter==='pending'){
act='bulk_review_pending';
msg='검증 대기 중인 모든 답변(신뢰도 보통/낮음 + 신고된 것)을 처리완료 처리합니다.\nClaude가 이미 검토/수정한 후 누르세요. 계속할까요?';
}
if(!confirm(msg))return;
try{
const r=await fetch('/api/admin-review?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:act})});
const d=await r.json();
if(d.error){alert('오류: '+d.error);return}
alert('✅ 완료! '+(d.updated||0)+'건 처리되었습니다.');
loadReview(curFilter);
}catch(err){alert('오류: '+err.message)}
}

async function syncGithub(){
if(!confirm('검증 필요 데이터를 GitHub에 올려서 Claude가 처리할 수 있게 합니다.\n계속할까요?'))return;
try{
const r=await fetch('/api/admin-sync-to-github?key='+encodeURIComponent(KEY),{method:'POST'});
const d=await r.json();
if(d.error){alert('오류: '+d.error+'\n\nGITHUB_TOKEN 환경변수가 Cloudflare에 설정되어 있어야 합니다.');return}
alert('✅ 동기화 완료!\n\n'+d.total+'건을 GitHub에 업로드했습니다.\n\n이제 Claude한테 "flagged-items.json 처리해줘"라고 하시면 됩니다.');
}catch(err){alert('오류: '+err.message)}
}

async function migrateConf(){
if(!confirm('기존 답변의 신뢰도를 소급해서 분류합니다. 실행할까요?'))return;
try{
const r=await fetch('/api/admin-migrate-confidence?key='+encodeURIComponent(KEY),{method:'POST'});
const d=await r.json();
if(d.error){alert('오류: '+d.error);return}
alert('완료!\n검사: '+d.total_checked+'건\n업데이트: '+d.updated+'건\n높음: '+d.stats.high+' / 보통: '+d.stats.medium+' / 낮음: '+d.stats.low+' / 미표시: '+d.stats.none);
loadReview(curFilter);
}catch(err){alert('오류: '+err.message)}
}

async function rev(id,action){
try{
await fetch('/api/admin-review?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action})});
const c=$g('card_'+id);
if(c)c.style.opacity='.3';
setTimeout(()=>{loadReview(curFilter)},500);
}catch(err){alert('오류: '+err.message)}
}

async function setConf(id,conf){
if(!conf)return;
const downgrade=(conf==='보통'||conf==='낮음');
const msg=downgrade
?'신뢰도를 "'+conf+'"(으)로 강등합니다.\n검증 파이프라인 재투입 (reviewed=0, reported=1) → 다음 Claude 호출 시 flagged-items.json 포함.\n계속할까요?'
:'신뢰도를 "높음"으로 승급합니다. 계속할까요?';
if(!confirm(msg))return;
try{
const r=await fetch('/api/admin-review?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action:'set_confidence',confidence:conf})});
const d=await r.json();
if(d.error){alert('오류: '+d.error);return}
const c=$g('card_'+id);
if(c)c.style.opacity='.3';
setTimeout(()=>{loadReview(curFilter)},500);
}catch(err){alert('오류: '+err.message)}
}

async function loadList(){
const r=await fetch('/api/conversations?key='+encodeURIComponent(KEY)+'&page=1');
const d=await r.json();
const el=$g('list');
if(!d.sessions||d.sessions.length===0){el.innerHTML='<div class="empty">대화 없음</div>';return}
el.innerHTML=d.sessions.map(s=>{
const nm=s.user_name||'비로그인';
const av=s.user_profile_image
?'<img src="'+e(s.user_profile_image)+'" alt="">'
:nm[0];
const pv=s.user_provider||'';
let confBadges='';
if(s.count_high>0)confBadges+='<span class="conf high">높음 '+s.count_high+'</span>';
if(s.count_medium>0)confBadges+='<span class="conf medium">보통 '+s.count_medium+'</span>';
if(s.count_low>0)confBadges+='<span class="conf low">낮음 '+s.count_low+'</span>';
return '<div class="item" onclick="detail(\''+e(s.group_id)+'\')">'
+'<div class="avatar">'+av+'</div>'
+'<div class="info"><div class="name">'+e(nm)+confBadges+'</div>'
+'<div class="meta">'+(pv?'<span class="badge">'+pv+'</span> ':'')+e(s.last_at||s.started_at||'')+'</div></div>'
+'<div class="right"><div class="cnt">'+s.message_count+'건</div></div>'
+'</div>';
}).join('');
}

async function detail(gid){
const r=await fetch('/api/conversation-detail?key='+encodeURIComponent(KEY)+'&session='+encodeURIComponent(gid));
const d=await r.json();
$g('chatView').style.display='none';
$g('detailView').style.display='block';
const el=$g('msgs');
if(!d.messages||d.messages.length===0){el.innerHTML='<div class="empty">메시지 없음</div>';return}
el.innerHTML=d.messages.filter(m=>m.role==='user'||m.role==='assistant').map(m=>{
let conf='';
if(m.role==='assistant'){
const cm=String(m.content||'').match(/\[신뢰도:\s*(높음|보통|낮음)/);
if(cm){const c=cm[1];const cls=c==='높음'?'high':c==='보통'?'medium':'low';conf=' <span class="conf '+cls+'">'+c+'</span>';}
}
return '<div class="msg '+e(m.role)+'">'+renderMsgBody(m.content)+'<div class="ts">'+(m.role==='user'?'사용자':'AI')+conf+' · '+e(m.created_at||'')+'</div></div>';
}).join('');
/* 최신 메시지로 스크롤 (카톡 스타일) */
setTimeout(function(){
  el.scrollTop=el.scrollHeight;
  window.scrollTo(0,document.body.scrollHeight);
},50);
}

function backToList(){
$g('detailView').style.display='none';
$g('chatView').style.display='block';
}

async function loadAnalytics(){
const el=$g('analView');
el.innerHTML='<div class="empty">분석 중...</div>';
try{
const r=await fetch('/api/analytics?key='+encodeURIComponent(KEY));
const d=await r.json();
if(d.error){el.innerHTML='<div class="empty">'+e(d.error)+'</div>';return}
const s=d.summary;
const mx=Math.max(...d.categories.map(c=>c.count),1);
let h='<div class="stats">'
+'<div class="stat"><div class="n">'+s.total_messages+'</div><div class="l">메시지</div></div>'
+'<div class="stat"><div class="n">'+s.total_sessions+'</div><div class="l">세션</div></div>'
+'<div class="stat"><div class="n">'+s.total_users+'</div><div class="l">사용자</div></div>'
+'<div class="stat"><div class="n">'+s.total_questions+'</div><div class="l">질문</div></div>'
+'</div>';
h+='<div class="sec">질문 유형</div>';
d.categories.filter(c=>c.count>0).forEach(c=>{
const w=Math.max(c.count/mx*100,4);
h+='<div class="bar-item"><span class="bar-label">'+e(c.name)+'</span><div class="bar-track"><div class="bar-fill" style="width:'+w+'%">'+c.count+'</div></div><span class="bar-cnt">'+c.count+'건</span></div>';
});
if(d.topKeywords&&d.topKeywords.length>0){
h+='<div class="sec">인기 키워드</div><div class="kw-wrap">';
d.topKeywords.forEach(k=>{h+='<span class="kw">'+e(k.keyword)+'<b>'+k.count+'</b></span>'});
h+='</div>';
}
el.innerHTML=h;
}catch(err){el.innerHTML='<div class="empty">오류</div>'}
}

/* ===== FAQ 관리 (RAG) ===== */
let faqSearchTimer=null;
let editingFaqId=null;

function onFaqSearchInput(){
  if(faqSearchTimer)clearTimeout(faqSearchTimer);
  faqSearchTimer=setTimeout(loadFaqs,250);
}

async function loadFaqStatus(){
  try{
    const r=await fetch('/api/admin-faq-migrate?key='+encodeURIComponent(KEY));
    const d=await r.json();
    if(d.error){$g('faqStatus').textContent='오류: '+d.error;return}
    $g('faqStatus').textContent='DB '+d.db_total+'건 (활성 '+d.db_active+', 임베딩 '+d.db_embedded+') · _faq.js 하드코딩 '+d.faq_js_count+'건';
  }catch(e){$g('faqStatus').textContent='상태 확인 실패: '+e.message}
}

async function loadFaqs(){
  const el=$g('faqList');
  el.innerHTML='<div class="empty">불러오는 중...</div>';
  try{
    const q=$g('faqSearchInput').value.trim();
    const cat=$g('faqCatFilter').value;
    const ver=$g('faqVerifiedFilter').value;
    const params=new URLSearchParams({key:KEY});
    if(q)params.set('search',q);
    if(cat&&cat!=='all')params.set('category',cat);
    if(ver&&ver!=='all')params.set('verified',ver);
    const r=await fetch('/api/admin-faq?'+params.toString());
    const d=await r.json();
    if(d.error){el.innerHTML='<div class="empty">'+e(d.error)+'</div>';return}
    /* 카테고리 드롭다운 갱신 */
    const sel=$g('faqCatFilter');
    const cur=sel.value;
    sel.innerHTML='<option value="all">전체 카테고리</option>'+(d.categories||[]).map(c=>'<option value="'+e(c.category||'기타')+'">'+e(c.category||'기타')+' ('+c.n+')</option>').join('');
    sel.value=cur||'all';
    if(!d.faqs||d.faqs.length===0){el.innerHTML='<div class="empty">FAQ 없음 — "🚀 마이그레이션" 버튼으로 _faq.js 에서 가져오세요</div>';return}
    /* 검증 카운트 배지도 업데이트 */
    if(d.verified_counts){
      const vc=d.verified_counts;
      const stElm=$g('faqStatus');
      const prev=stElm.textContent||'';
      stElm.innerHTML=prev+' <span style="margin-left:8px">❓'+vc.unchecked+' ✅'+vc.verified+' 🟡'+vc.suspicious+' ❌'+vc.wrong+'</span>';
    }
    el.innerHTML=d.faqs.map(f=>{
      const embMark=f.has_embedding?'<span style="background:#e0f5ec;color:#10b981;font-size:.68em;padding:1px 6px;border-radius:5px;font-weight:700">임베딩 ✓</span>':'<span style="background:#fee2e2;color:#f04452;font-size:.68em;padding:1px 6px;border-radius:5px;font-weight:700">임베딩 ✗</span>';
      const actMark=f.active?'':'<span style="background:#e5e8eb;color:#8b95a1;font-size:.68em;padding:1px 6px;border-radius:5px;font-weight:700;margin-left:4px">비활성</span>';
      const catMark=f.category?'<span style="background:#e8f3ff;color:#3182f6;font-size:.68em;padding:1px 6px;border-radius:5px;font-weight:700;margin-right:4px">'+e(f.category)+'</span>':'';
      /* 검증 상태 배지 */
      const vs=f.verified_status||'unchecked';
      const verBadge=vs==='verified'?'<span style="background:#e0f5ec;color:#10b981;font-size:.68em;padding:1px 6px;border-radius:5px;font-weight:700;margin-right:4px">✅ 통과</span>':
        vs==='suspicious'?'<span style="background:#fef3c7;color:#b45309;font-size:.68em;padding:1px 6px;border-radius:5px;font-weight:700;margin-right:4px">🟡 의심</span>':
        vs==='wrong'?'<span style="background:#fee2e2;color:#f04452;font-size:.68em;padding:1px 6px;border-radius:5px;font-weight:700;margin-right:4px">❌ 틀림</span>':
        '<span style="background:#e5e8eb;color:#8b95a1;font-size:.68em;padding:1px 6px;border-radius:5px;font-weight:700;margin-right:4px">❓ 미검증</span>';
      const noteLine=f.verified_note?'<div class="meta" style="color:#b45309;margin-top:3px">📝 '+e(f.verified_note).slice(0,120)+'</div>':'';
      return '<div class="item" onclick="openFaqForm('+f.id+')" style="align-items:flex-start">'
        +'<div style="flex-shrink:0;background:#f2f4f6;color:#6b7684;width:42px;height:42px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-weight:700;font-size:.78em">Q'+(f.q_number||'?')+'</div>'
        +'<div class="info">'
          +'<div class="name">'+verBadge+catMark+e(f.question)+actMark+'</div>'
          +'<div class="meta" style="overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;white-space:normal">'+e(String(f.answer||'').slice(0,150))+'</div>'
          +(f.law_refs?'<div class="meta" style="color:#3182f6;margin-top:3px">📖 '+e(f.law_refs)+'</div>':'')
          +noteLine
        +'</div>'
        +'<div class="right">'+embMark+'</div>'
        +'</div>';
    }).join('');
  }catch(err){el.innerHTML='<div class="empty">오류: '+e(err.message)+'</div>'}
}

function openFaqForm(id){
  editingFaqId=id;
  $g('faqFormErr').style.display='none';
  if(id){
    $g('faqFormTitle').textContent='FAQ 수정';
    $g('faqFormDeleteBtn').style.display='inline-block';
    $g('faqFormActiveLabel').style.display='flex';
    $g('faqFormVerifiedWrap').style.display='block';
    /* 상세 로드 */
    fetch('/api/admin-faq?key='+encodeURIComponent(KEY)+'&id='+id).then(r=>r.json()).then(d=>{
      if(!d.faq)return;
      $g('faqFormQnum').value=d.faq.q_number||'';
      $g('faqFormCat').value=d.faq.category||'기타';
      $g('faqFormQ').value=d.faq.question||'';
      $g('faqFormA').value=d.faq.answer||'';
      $g('faqFormLaw').value=d.faq.law_refs||'';
      $g('faqFormActive').checked=d.faq.active!==0;
      $g('faqFormVerifiedStatus').value=d.faq.verified_status||'unchecked';
      $g('faqFormVerifiedNote').value=d.faq.verified_note||'';
    });
  } else {
    $g('faqFormTitle').textContent='새 FAQ 추가';
    $g('faqFormDeleteBtn').style.display='none';
    $g('faqFormActiveLabel').style.display='none';
    $g('faqFormVerifiedWrap').style.display='none';
    $g('faqFormQnum').value='';
    $g('faqFormCat').value='기타';
    $g('faqFormQ').value='';
    $g('faqFormA').value='';
    $g('faqFormLaw').value='';
    $g('faqFormActive').checked=true;
    $g('faqFormVerifiedStatus').value='unchecked';
    $g('faqFormVerifiedNote').value='';
  }
  $g('faqFormModal').style.display='flex';
}

async function submitFaq(){
  console.log('[submitFaq] clicked, editingFaqId=', editingFaqId);
  const err=$g('faqFormErr');err.style.display='none';
  const question=$g('faqFormQ').value.trim();
  const answer=$g('faqFormA').value.trim();
  console.log('[submitFaq] Q len:', question.length, 'A len:', answer.length);
  if(!question||!answer){err.textContent='질문과 답변을 입력해 주세요';err.style.display='block';alert('질문과 답변을 모두 입력해 주세요');return}
  const payload={
    q_number:$g('faqFormQnum').value?Number($g('faqFormQnum').value):null,
    category:$g('faqFormCat').value,
    question,answer,
    law_refs:$g('faqFormLaw').value.trim()||null,
    active:$g('faqFormActive').checked?1:0,
  };
  if(editingFaqId)payload.id=editingFaqId;
  const action=editingFaqId?'update':'create';
  console.log('[submitFaq] payload:', payload, 'action:', action, 'KEY set?', !!KEY);
  try{
    const r=await fetch('/api/admin-faq?key='+encodeURIComponent(KEY)+'&action='+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    console.log('[submitFaq] response status:', r.status);
    const d=await r.json();
    console.log('[submitFaq] response body:', d);
    if(!d.ok){
      const msg=d.error||'저장 실패 (status '+r.status+')';
      err.textContent=msg;err.style.display='block';
      alert('저장 실패: '+msg);
      return;
    }
    if(d.warning)alert('⚠️ 저장은 됐지만 경고: '+d.warning);
    /* 수정 모드면 검증 상태도 별도 업데이트 */
    if(editingFaqId){
      try{
        await fetch('/api/admin-faq?key='+encodeURIComponent(KEY)+'&action=set_verified',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:editingFaqId,status:$g('faqFormVerifiedStatus').value,note:$g('faqFormVerifiedNote').value.trim()})});
      }catch(e){console.error('set_verified fail',e)}
    }
    $g('faqFormModal').style.display='none';
    loadFaqStatus();loadFaqs();
    alert('✅ 저장 완료');
  }catch(er){
    console.error('[submitFaq] exception:', er);
    err.textContent='오류: '+er.message;err.style.display='block';
    alert('네트워크 오류: '+er.message);
  }
}

async function deleteFaq(){
  if(!editingFaqId)return;
  if(!confirm('이 FAQ를 영구 삭제합니다. 계속할까요?'))return;
  try{
    const r=await fetch('/api/admin-faq?key='+encodeURIComponent(KEY)+'&action=delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:editingFaqId})});
    const d=await r.json();
    if(d.ok){$g('faqFormModal').style.display='none';loadFaqStatus();loadFaqs()}
    else alert('실패: '+(d.error||'unknown'));
  }catch(er){alert('오류: '+er.message)}
}

async function migrateFaqs(){
  if(!confirm('_faq.js 하드코딩 FAQ를 D1로 이관하고 임베딩을 생성합니다.\n기존 동일 내용은 스킵, 변경된 것만 재임베딩.\n\n계속할까요?'))return;
  const btn=event?event.target:null;
  if(btn){btn.disabled=true;btn.textContent='마이그레이션 중...'}
  try{
    const r=await fetch('/api/admin-faq-migrate?key='+encodeURIComponent(KEY),{method:'POST'});
    const d=await r.json();
    if(d.error){alert('실패: '+d.error);return}
    alert('✅ 완료\n\n파싱: '+d.parsed_count+'건\n신규: '+d.inserted+'건\n수정: '+d.updated+'건\n임베딩: '+d.embedded+'건\n스킵: '+d.skipped+'건\n실패: '+d.failed+'건');
    loadFaqStatus();loadFaqs();
  }catch(er){alert('오류: '+er.message)}
  finally{if(btn){btn.disabled=false;btn.textContent='🚀 마이그레이션'}}
}

async function seedFaqs(batchId){
  if(!confirm('배치 '+batchId+' 의 FAQ를 일괄 추가합니다.\n(중복 질문은 자동 스킵)\n\n계속할까요?'))return;
  const btn=event?event.target:null;
  if(btn){btn.disabled=true;btn.textContent='추가 중...'}
  try{
    const r=await fetch('/api/admin-faq-seed?key='+encodeURIComponent(KEY)+'&batch='+encodeURIComponent(batchId),{method:'POST'});
    const d=await r.json();
    if(d.error){alert('실패: '+d.error);return}
    alert('✅ 완료\n\n배치: '+d.batch_name+'\n총: '+d.total_in_batch+'건\n신규: '+d.inserted+'건\n스킵(중복): '+d.skipped+'건\n임베딩: '+d.embedded+'건\n실패: '+d.failed+'건');
    loadFaqStatus();loadFaqs();
  }catch(er){alert('오류: '+er.message)}
  finally{if(btn){btn.disabled=false;btn.textContent='📦 배치 1 추가'}}
}

async function syncFaqsToGithub(){
  if(!confirm('의심·틀림 상태 FAQ 전체를 GitHub의 flagged-faqs.json 에 업로드합니다.\n이후 Claude한테 "flagged-faqs.json 처리해줘" 하시면 재검토 후 수정됩니다.\n\n계속할까요?'))return;
  const btn=event?event.target:null;
  if(btn){btn.disabled=true;btn.textContent='업로드 중...'}
  try{
    const r=await fetch('/api/admin-faq-sync-to-github?key='+encodeURIComponent(KEY),{method:'POST'});
    const d=await r.json();
    if(d.error){alert('실패: '+d.error+'\n\nGITHUB_TOKEN 환경변수 확인 필요');return}
    alert('✅ 업로드 완료\n\n의심·틀림 FAQ '+d.total+'건을 GitHub에 올렸습니다.\n\n이제 Claude한테 "flagged-faqs.json 처리해줘"라고 말씀하시면\n각 항목 법령 확인 → 수정 → DB 반영 → 상태를 verified로 변경합니다.\n\n파일 위치: '+(d.github_url||'GitHub 레포 루트'));
  }catch(er){alert('오류: '+er.message)}
  finally{if(btn){btn.disabled=false;btn.textContent='🚀 Claude 재검토 요청'}}
}

function downloadBackup(){
  if(!confirm('전체 데이터 백업 JSON을 다운로드합니다.\n(users, conversations, rooms, faqs, client 등 포함)\n\n계속할까요?'))return;
  location.href='/api/admin-backup?key='+encodeURIComponent(KEY);
}

async function applyReverifyV1(){
  if(!confirm('Claude 재검증 V1 결과를 적용합니다.\n- 의심 11건을 verified로 승격\n- 4건은 답변 내용 수정 + 재임베딩 (Q38, Q63, Q67, Q70, Q123)\n- 1건(Q93)은 삭제(active=0)\n\n계속할까요?'))return;
  const btn=event?event.target:null;
  if(btn){btn.disabled=true;btn.textContent='적용 중...'}
  try{
    const r=await fetch('/api/admin-faq-reverify-apply?key='+encodeURIComponent(KEY),{method:'POST'});
    const d=await r.json();
    if(d.error){alert('실패: '+d.error);return}
    let msg='✅ 재검증 V1 적용 완료\n\n';
    msg+='리포트 총: '+d.total_in_report+'건\n';
    msg+='verified 승격: '+d.verified_count+'건\n';
    msg+='내용 수정: '+d.content_updated+'건\n';
    msg+='재임베딩: '+d.reembedded+'건\n';
    msg+='삭제(비활성): '+d.deleted+'건\n';
    msg+='스킵: '+d.skipped+'건';
    if(d.missing_q&&d.missing_q.length>0)msg+='\n매칭 안된 q: '+d.missing_q.join(', ');
    alert(msg);
    loadFaqStatus();loadFaqs();
  }catch(er){alert('오류: '+er.message)}
  finally{if(btn){btn.disabled=false;btn.textContent='✨ 재검증 V1 적용'}}
}

async function applyVerifyReport(){
  if(!confirm('Claude 삼중체크 검증 리포트를 FAQ 전체에 일괄 적용합니다.\n각 FAQ에 verified/suspicious/wrong 상태 + 메모가 기록됩니다.\n\n계속할까요?'))return;
  const btn=event?event.target:null;
  if(btn){btn.disabled=true;btn.textContent='적용 중...'}
  try{
    const r=await fetch('/api/admin-faq-verify-apply?key='+encodeURIComponent(KEY),{method:'POST'});
    const d=await r.json();
    if(d.error){alert('실패: '+d.error);return}
    let msg='✅ 검증 적용 완료\n\n';
    msg+='리포트 총: '+d.total_in_report+'건\n';
    msg+='적용: '+d.applied+'건\n';
    msg+='스킵: '+d.skipped+'건\n';
    if(d.missing_q&&d.missing_q.length>0){
      msg+='\n⚠️ 매칭 안된 q_number: '+d.missing_q.slice(0,20).join(', ');
      if(d.missing_q.length>20)msg+=' 외 '+(d.missing_q.length-20)+'건';
      msg+='\n(해당 Q 번호의 FAQ가 DB에 없음 - 파싱 누락/삭제 가능성)';
    }
    alert(msg);
    loadFaqStatus();loadFaqs();
  }catch(er){alert('오류: '+er.message)}
  finally{if(btn){btn.disabled=false;btn.textContent='🔍 Claude 검증 적용'}}
}

async function reembedAllFaqs(){
  if(!confirm('활성 FAQ 전체를 재임베딩합니다.\n(API 비용 소량 발생 + 시간 걸림)\n\n계속할까요?'))return;
  const btn=event?event.target:null;
  if(btn){btn.disabled=true;btn.textContent='재임베딩 중...'}
  try{
    const r=await fetch('/api/admin-faq?key='+encodeURIComponent(KEY)+'&action=reembed_all',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const d=await r.json();
    if(d.error){alert('실패: '+d.error);return}
    alert('✅ 완료\n\n재임베딩: '+d.reembedded+'건\n실패: '+d.failed+'건');
    loadFaqStatus();loadFaqs();
  }catch(er){alert('오류: '+er.message)}
  finally{if(btn){btn.disabled=false;btn.textContent='♻️ 전체 재임베딩'}}
}

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
let docsReloadTimer=null;
let docsCustomers=[]; // 거래처 요약 목록
let docsSelectedUserId=null;
let docsCustSort='pending'; // pending|recent|name
let docsCustSearchQ='';

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

/* 손상 문서(R2 빈 파일) 점검 */
/* ===== 상담방 AI 대화 요약 =====
   자동 요약 제거 — 모달 open 시 fetch 안 함.
   기간 선택(selectSummaryRange) → '✨ 요약 생성' 버튼(runRoomSummary) 눌러야 fetch 실행.
   2026-04-21: summary_json (섹션 구조화) 우선 렌더, 없으면 마크다운 폴백. */
let _lastSummaryText='';
let _lastSummaryJson=null;
let _lastSummaryRange='recent';
let _lastSummaryFrom='';
let _lastSummaryTo='';
function _setSummaryRangeUI(range){
  document.querySelectorAll('.rs-range').forEach(b=>{
    const on=b.getAttribute('data-range')===range;
    b.style.background=on?'#191f28':'#e5e8eb';
    b.style.color=on?'#fff':'#555';
    b.style.fontWeight=on?'600':'400';
  });
  /* custom 기간 입력 영역 표시/숨김 */
  const box=$g('rsCustomBox');
  if(box)box.style.display=range==='custom'?'flex':'none';
}
function openRoomSummary(){
  if(!currentRoomId){alert('상담방을 먼저 선택하세요');return}
  const modal=$g('roomSummaryModal');
  const body=$g('rsBody');
  const meta=$g('rsMeta');
  modal.style.display='flex';
  document.body.style.overflow='hidden';
  _lastSummaryText='';
  _lastSummaryJson=null;
  body.innerHTML='<div style="text-align:center;padding:40px 20px;color:#8b95a1;font-size:.9em;line-height:1.7">기간을 선택한 뒤<br><b style="color:#10b981">✨ 요약 생성</b> 버튼을 눌러주세요.<br><span style="font-size:.85em;color:#adb5bd">※ 내부 담당자용 실무 정리표가 생성됩니다 (고객에게 자동 공개 X)</span></div>';
  meta.textContent='';
  /* custom 기간 기본값: 오늘·오늘 */
  const today=new Date(Date.now()+9*60*60*1000).toISOString().substring(0,10);
  const fromEl=$g('rsFrom'),toEl=$g('rsTo');
  if(fromEl&&!fromEl.value)fromEl.value=_lastSummaryFrom||today;
  if(toEl&&!toEl.value)toEl.value=_lastSummaryTo||today;
  _setSummaryRangeUI(_lastSummaryRange||'recent');
}
function selectSummaryRange(range){
  _lastSummaryRange=range||'recent';
  _setSummaryRangeUI(_lastSummaryRange);
}
let _rsGenerating=false;
async function runRoomSummary(){
  if(!currentRoomId){alert('상담방을 먼저 선택하세요');return}
  if(_rsGenerating)return; /* 중복 호출 방지 */
  const range=_lastSummaryRange||'recent';
  const body=$g('rsBody');
  const meta=$g('rsMeta');
  let extraQS='';
  let rangeLabel={recent:'최근 50건',week:'최근 7일',month:'이번달',all:'전체'}[range]||range;
  if(range==='custom'){
    const fromEl=$g('rsFrom'),toEl=$g('rsTo');
    const f=fromEl?fromEl.value:'',t=toEl?toEl.value:'';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(f)||!/^\d{4}-\d{2}-\d{2}$/.test(t)){alert('시작일·종료일을 모두 선택하세요');return}
    if(f>t){alert('시작일이 종료일보다 늦습니다');return}
    _lastSummaryFrom=f;_lastSummaryTo=t;
    extraQS='&from='+encodeURIComponent(f)+'&to='+encodeURIComponent(t);
    rangeLabel=f+' ~ '+t;
  }
  /* 버튼 잠금 — 중복 호출·사용자 혼동 방지 */
  _rsGenerating=true;
  _rsToggleButtons(true);
  body.innerHTML='<div style="text-align:center;padding:40px 0;color:#8b95a1"><div style="display:inline-block;width:22px;height:22px;border:3px solid #e5e8eb;border-top-color:#10b981;border-radius:50%;animation:rsSpin .7s linear infinite;vertical-align:middle;margin-right:8px"></div>🤖 내부 실무 요약 생성 중... (5~20초)</div><style>@keyframes rsSpin{to{transform:rotate(360deg)}}</style>';
  meta.textContent='';
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=summarize&room_id='+encodeURIComponent(currentRoomId)+'&range='+encodeURIComponent(range)+extraQS);
    const d=await r.json();
    if(d.error){
      body.innerHTML='<div style="padding:30px 20px;text-align:center;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b"><div style="font-size:1.1em;margin-bottom:8px">⚠️ 요약 생성 실패</div><div style="font-size:.85em;color:#7f1d1d;margin-bottom:12px">'+e(d.error)+'</div><button onclick="runRoomSummary()" style="background:#fff;color:#991b1b;border:1px solid #fecaca;padding:7px 16px;border-radius:6px;font-size:.85em;cursor:pointer;font-family:inherit">🔄 다시 시도</button></div>';
      return;
    }
    _lastSummaryText=d.summary||'';
    _lastSummaryJson=d.summary_json||null;
    /* 빈 데이터 상태 (메시지 0건) 별도 안내 */
    if((d.message_count||0)===0){
      body.innerHTML='<div style="padding:40px 20px;text-align:center;color:#8b95a1"><div style="font-size:1.1em;margin-bottom:6px">📭 해당 기간에 대화가 없습니다</div><div style="font-size:.85em;color:#adb5bd">다른 기간을 선택하고 다시 시도해주세요.</div></div>';
      meta.textContent='['+rangeLabel+'] 메시지 0건';
      return;
    }
    /* summary_json 있으면 섹션 카드, 없으면 기존 마크다운 폴백 */
    if(_lastSummaryJson){
      body.innerHTML=_renderSummaryJson(_lastSummaryJson);
    } else if(_lastSummaryText){
      body.innerHTML=renderMarkdownLite(_lastSummaryText);
    } else {
      body.innerHTML='<div style="padding:30px 20px;text-align:center;color:#8b95a1">요약 결과가 비어있습니다.</div>';
    }
    const actualRange=(d.first_at&&d.last_at)?(' · 🗓️ '+d.first_at+' ~ '+d.last_at):'';
    meta.textContent='['+rangeLabel+'] 메시지 '+(d.message_count||0)+'건'+actualRange+' · 비용 ₩'+Math.round((d.cost_cents||0)*14);
  }catch(err){
    body.innerHTML='<div style="padding:30px 20px;text-align:center;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b"><div style="font-size:1.1em;margin-bottom:8px">⚠️ 오류</div><div style="font-size:.85em;color:#7f1d1d;margin-bottom:12px">'+e(err.message)+'</div><button onclick="runRoomSummary()" style="background:#fff;color:#991b1b;border:1px solid #fecaca;padding:7px 16px;border-radius:6px;font-size:.85em;cursor:pointer;font-family:inherit">🔄 다시 시도</button></div>';
  }finally{
    _rsGenerating=false;
    _rsToggleButtons(false);
  }
}
/* 요약 관련 버튼 잠금/해제 (생성/복사/게시/다시) */
function _rsToggleButtons(busy){
  const sel=['#roomSummaryModal button[onclick*="runRoomSummary"]',
             '#roomSummaryModal button[onclick*="copyRoomSummary"]',
             '#roomSummaryModal button[onclick*="postSummaryToRoom"]',
             '#roomSummaryModal button[onclick*="regenerateRoomSummary"]'].join(',');
  document.querySelectorAll(sel).forEach(b=>{
    b.disabled=!!busy;
    b.style.opacity=busy?'.55':'';
    b.style.cursor=busy?'wait':'';
  });
  /* 기간 탭도 잠그기 — 생성 중 기간 바꿔 다시 누르는 실수 방지 */
  document.querySelectorAll('.rs-range').forEach(b=>{
    b.disabled=!!busy;
    b.style.opacity=busy?'.55':'';
    b.style.cursor=busy?'wait':'';
  });
}
function closeRoomSummary(){
  /* 거래처/업체 단위 요약 모드 리셋 (openCustomerSummary / _bdRunBusinessSummary 로 열렸을 경우) */
  if(typeof _summaryMode!=='undefined')_summaryMode='room';
  if(typeof _customerSummaryUserId!=='undefined')_customerSummaryUserId=null;
  if(typeof _customerSummaryBusinessId!=='undefined')_customerSummaryBusinessId=null;
  const modal=$g('roomSummaryModal');
  if(modal)modal.style.display='none';
  document.body.style.overflow='';
}
/* 하위 호환: 외부에서 regenerateRoomSummary를 부르던 곳 유지 */
function regenerateRoomSummary(){runRoomSummary()}
async function copyRoomSummary(){
  /* 마크다운 우선, 없으면 JSON 직렬화 */
  let text=_lastSummaryText||'';
  if(!text && _lastSummaryJson){
    try{text=JSON.stringify(_lastSummaryJson,null,2)}catch{}
  }
  try{
    await navigator.clipboard.writeText(text);
    const btn=$g('rsCopyBtn');
    if(btn){const o=btn.textContent;btn.textContent='✅ 복사됨';setTimeout(()=>{btn.textContent=o},1500)}
  }catch(err){alert('복사 실패: '+err.message)}
}

/* 섹션 카드형 렌더 — summary_json 기반 내부 실무 정리표.
   항목은 {text, msgIds} 객체 또는 구형 string 둘 다 허용 (역호환). */
function _renderSummaryJson(j){
  if(!j)return '';
  function _esc(x){return e(String(x==null?'':x))}
  function _normItem(it){
    if(it==null)return null;
    if(typeof it==='string')return {text:it.trim(), msgIds:[]};
    if(typeof it==='object'){
      const t=String(it.text||'').trim();
      if(!t)return null;
      const ids=Array.isArray(it.msgIds)?it.msgIds.filter(x=>Number.isInteger(x)||/^\d+$/.test(String(x))).map(Number):[];
      return {text:t, msgIds:ids};
    }
    return null;
  }
  function _anchors(ids){
    if(!ids||!ids.length)return '';
    return ' '+ids.map(id=>'<a href="javascript:void(0)" onclick="jumpToRoomMessage('+id+')" style="color:#3182f6;text-decoration:none;font-size:.85em;background:#eff6ff;border:1px solid #bfdbfe;padding:0 5px;border-radius:4px;margin-left:3px" title="원본 메시지로 이동">#'+id+'</a>').join('');
  }
  function _sec(title, icon, color, items){
    const arr=(Array.isArray(items)?items:[]).map(_normItem).filter(Boolean);
    const bodyHtml=arr.length
      ? '<ul style="margin:0;padding-left:18px;line-height:1.8;color:#191f28">'+arr.map(it=>'<li style="margin-bottom:3px">'+_esc(it.text)+_anchors(it.msgIds)+'</li>').join('')+'</ul>'
      : '<div style="color:#adb5bd;font-size:.88em">- 없음</div>';
    return '<section style="margin-bottom:14px">'
      +'<div style="font-weight:700;font-size:.92em;color:'+color+';margin-bottom:6px;display:flex;align-items:center;gap:6px">'
      +'<span>'+icon+'</span><span>'+_esc(title)+'</span>'
      +'<span style="margin-left:auto;font-size:.75em;color:#adb5bd;font-weight:500">'+arr.length+'건</span>'
      +'</div>'
      +'<div style="background:#f9fafb;border:1px solid #e5e8eb;border-radius:8px;padding:10px 12px">'+bodyHtml+'</div>'
      +'</section>';
  }
  const o=j.overview||{};
  const overviewHtml='<section style="margin-bottom:14px">'
    +'<div style="font-weight:700;font-size:.92em;color:#191f28;margin-bottom:6px">📋 상담 개요</div>'
    +'<div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:.88em;line-height:1.6;color:#0f172a">'
    +(o.period?'<div style="color:#64748b">기간</div><div>'+_esc(o.period)+'</div>':'')
    +(o.messageCount!=null?'<div style="color:#64748b">메시지 수</div><div>'+_esc(String(o.messageCount))+'건</div>':'')
    +(o.customerName?'<div style="color:#64748b">고객</div><div>'+_esc(o.customerName)+'</div>':'')
    +(o.purpose?'<div style="color:#64748b">상담 목적</div><div>'+_esc(o.purpose)+'</div>':'')
    +'</div></section>';
  return '<div style="font-size:.9em">'
    +overviewHtml
    +_sec('확정된 핵심 사실','✅','#065f46',j.confirmedFacts)
    +_sec('고객 요청 / 질문','💬','#1e40af',j.customerRequests)
    +_sec('자료 업로드 / 제출 흐름','📎','#6b21a8',j.uploadedMaterials)
    +_sec('확인 필요 사항','❓','#b45309',j.needCheck)
    +_sec('다음 액션','➡️','#be123c',j.nextActions)
    +_sec('특이사항 / 주의사항','⚠️','#334155',j.risks)
    +'</div>';
}
/* 섹션 항목 → 원본 메시지 스크롤·하이라이트 (요약 모달 닫고 방 열기) */
function jumpToRoomMessage(mid){
  if(!mid)return;
  const modal=document.getElementById('roomSummaryModal');
  if(modal)modal.style.display='none';
  document.body.style.overflow='';
  if(typeof jumpToOriginalMsgAdmin==='function'){
    setTimeout(()=>jumpToOriginalMsgAdmin(mid), 120);
  }
}
/* 요약 이력 — 과거 생성된 요약 리스트 중 하나 불러와서 다시 렌더 */
async function openSummaryHistory(){
  if(!currentRoomId){alert('상담방을 먼저 선택하세요');return}
  const body=$g('rsBody');if(!body)return;
  body.innerHTML='<div style="text-align:center;padding:30px 0;color:#8b95a1">🕘 이력 불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=summary_history&room_id='+encodeURIComponent(currentRoomId));
    const d=await r.json();
    const arr=d.summaries||[];
    if(!arr.length){
      body.innerHTML='<div style="text-align:center;padding:40px 16px;color:#8b95a1;font-size:.9em">🕘 저장된 요약 이력이 없습니다.<br><span style="font-size:.85em;color:#adb5bd">기간 선택 후 ✨ 요약 생성 하면 자동 저장됩니다.</span></div>';
      return;
    }
    const rangeLabel={recent:'최근 50건',week:'최근 7일',month:'이번달',all:'전체',custom:'지정기간'};
    body.innerHTML='<div style="padding:4px 0 8px;font-size:.82em;color:#6b7280">이전 요약 ('+arr.length+'건) — 클릭해서 불러오기</div>'
      +arr.map(s=>{
        const lab=rangeLabel[s.range_type]||s.range_type;
        return '<div onclick="loadSummaryFromHistory('+s.id+')" style="padding:10px 12px;border:1px solid #e5e8eb;border-radius:8px;margin-bottom:6px;cursor:pointer;background:#fff" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'#fff\'">'
          +'<div style="display:flex;align-items:center;gap:6px;font-size:.78em;color:#4b5563;margin-bottom:3px">'
          +'<span style="background:#eff6ff;color:#1e40af;padding:1px 8px;border-radius:10px;font-weight:700">'+e(lab)+'</span>'
          +'<span>'+e((s.generated_at||'').substring(0,16))+'</span>'
          +'<span>·</span><span>메시지 '+(s.source_message_count||0)+'건</span>'
          +(s.source_memo_count?'<span>·</span><span>메모 '+s.source_memo_count+'건</span>':'')
          +'</div>'
          +'<div style="font-size:.82em;color:#191f28;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+e((s.summary_text||'').substring(0,120))+'</div>'
          +'</div>';
      }).join('');
    _historyCache={};
    arr.forEach(s=>_historyCache[s.id]=s);
  }catch(err){body.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(err.message)+'</div>'}
}
let _historyCache={};
function loadSummaryFromHistory(id){
  const s=_historyCache[id];if(!s)return;
  _lastSummaryText=s.summary_text||'';
  _lastSummaryJson=s.summary_json||null;
  const body=$g('rsBody'), meta=$g('rsMeta');
  if(_lastSummaryJson){
    body.innerHTML=_renderSummaryJson(_lastSummaryJson);
  } else if(_lastSummaryText){
    body.innerHTML=renderMarkdownLite(_lastSummaryText);
  }
  const rangeLabel={recent:'최근 50건',week:'최근 7일',month:'이번달',all:'전체',custom:'지정기간'};
  const lab=rangeLabel[s.range_type]||s.range_type;
  const rangePart=(s.range_start&&s.range_end)?(' · 🗓️ '+s.range_start+' ~ '+s.range_end):'';
  if(meta)meta.textContent='🕘 ['+lab+'] '+e((s.generated_at||'').substring(0,16))+' · 메시지 '+(s.source_message_count||0)+'건'+rangePart;
}

/* 요약을 상담방에 세무사 메시지로 게시 — 내부용 요약이므로 2단계 경고 */
async function postSummaryToRoom(){
  if(!currentRoomId){alert('상담방이 열려있지 않아요');return}
  if(!_lastSummaryText && !_lastSummaryJson){alert('먼저 "✨ 요약 생성" 버튼을 눌러 요약을 생성하세요');return}
  const warn='⚠️ 이 요약은 내부 담당자용 실무 정리입니다.\n상담방에 올리면 고객도 볼 수 있습니다.\n\n정말 고객에게도 그대로 보여도 괜찮나요?';
  if(!confirm(warn))return;
  if(!confirm('한 번 더 확인합니다.\n내부용 표현이 그대로 고객에게 노출됩니다.\n계속 게시하시겠습니까?'))return;
  const msg='📝 상담 요약 (세무사 기록)\n\n'+(_lastSummaryText||'(구조화 데이터만 있음)')+'\n\n(이 메시지는 AI가 지금까지 대화를 정리한 것입니다.)';
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=send',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({room_id:currentRoomId, content:msg})
    });
    const d=await r.json();
    if(d.ok){
      if(typeof showAdminToast==='function')showAdminToast('✅ 상담방에 게시됨');
      else alert('✅ 게시 완료');
      closeRoomSummary();
      if(typeof loadRoomDetail==='function')loadRoomDetail();
    } else alert('게시 실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}


/* ===== 📥 owner 전용 전체 내보내기 (사장님 명령 2026-04-30) =====
 * "관리자도 내보내기 기능 — 이거 나만 할 수 있어야 하고 세무사만"
 * IS_OWNER 시에만 admin.html 거래처 탭 헤더의 #ownerExportBtn 표시.
 * 클릭 → 3가지 CSV 선택 (사용자 / 업체 / 메모) confirm 후 download. */
function _refreshOwnerExportBtn(){
  const btn = document.getElementById('ownerExportBtn');
  if(!btn) return;
  /* IS_OWNER 는 admin.js 의 전역 변수 (true 면 ADMIN_KEY 사장님). */
  btn.style.display = (typeof IS_OWNER !== 'undefined' && IS_OWNER) ? 'inline-block' : 'none';
}
/* IS_OWNER 변경 시점에 호출 — 부트 + login */
(function(){
  if(window._ownerExportBtnTimer) clearTimeout(window._ownerExportBtnTimer);
  window._ownerExportBtnTimer = setInterval(_refreshOwnerExportBtn, 1500);
})();

function openOwnerExport(){
  if(typeof IS_OWNER !== 'undefined' && !IS_OWNER){
    alert('owner(사장님) 권한 필요');
    return;
  }
  const choice = prompt(
    '📥 전체 내보내기 — 무엇을 받으시겠습니까?\n\n' +
    '1 = 거래처(사용자) CSV\n' +
    '2 = 업체 CSV\n' +
    '3 = 메모 전체 CSV\n\n' +
    '번호 입력 (1/2/3):',
    '1'
  );
  if(!choice) return;
  let type = '';
  if(choice === '1') type = 'users';
  else if(choice === '2') type = 'businesses';
  else if(choice === '3') type = 'memos';
  else { alert('1, 2, 3 중 하나'); return; }
  /* 새 탭으로 다운로드 (Content-Disposition: attachment 라 자동 다운) */
  const url = '/api/admin-export?type=' + type + '&key=' + encodeURIComponent(KEY || '');
  window.location.href = url;
}

/* ===== 📋 내 할 일 대시보드 — 전체 방 + 개인 일정 통합 뷰 =====
   Purpose: 방 150개 일일이 클릭 안 해도 오늘·내일·이번주 할 일 한 번에 파악
   Data source: /api/memos?scope=my (미완료 할 일만, 방 정보 JOIN) */
let _myTodosCache=[];
async function openMyTodos(){
  const m=$g('myTodosModal');if(!m)return;
  m.style.display='flex';
  document.body.style.overflow='hidden';
  if($g('mtNewContent'))$g('mtNewContent').value='';
  if($g('mtNewDue'))$g('mtNewDue').value='';
  await loadMyTodos();
}
function closeMyTodos(){
  const m=$g('myTodosModal');if(m)m.style.display='none';
  document.body.style.overflow='';
}
async function loadMyTodos(){
  const list=$g('myTodosList');if(!list)return;
  list.innerHTML='<div style="text-align:center;color:#8b95a1;padding:40px 0;font-size:.88em">불러오는 중...</div>';
  const onlyMine=$g('mtOnlyMine')?.checked?1:0;
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&scope=my&only_mine='+onlyMine);
    const d=await r.json();
    if(d.error){list.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(d.error)+'</div>';return}
    _myTodosCache=(d.memos||[]).map(m=>({...m, _t:_normType(m.memo_type_display||m.memo_type)}));
    _renderMyTodos();
    _updateMyTodosBadge();
  }catch(err){list.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(err.message)+'</div>'}
}
/* 기한 그룹핑: 지남 / 오늘 / 내일 / 이번주(2~7일) / 다음주이후 / 기한없음 */
function _bucketByDue(due){
  if(!due||!/^\d{4}-\d{2}-\d{2}$/.test(due))return 'none';
  const today=new Date(Date.now()+9*60*60*1000).toISOString().substring(0,10);
  const diff=Math.round((new Date(due+'T00:00:00')-new Date(today+'T00:00:00'))/86400000);
  if(diff<0)return 'overdue';
  if(diff===0)return 'today';
  if(diff===1)return 'tomorrow';
  if(diff<=7)return 'week';
  return 'later';
}
function _renderMyTodos(){
  const list=$g('myTodosList');if(!list)return;
  if(!_myTodosCache.length){
    list.innerHTML='<div style="text-align:center;padding:50px 20px;color:#8b95a1;font-size:.9em">📭 처리할 일이 없습니다<br><span style="font-size:.85em;color:#adb5bd">위 입력창에서 개인 일정을 추가하거나<br>상담방 📒 메모에서 할 일을 작성하세요</span></div>';
    $g('mtMeta').textContent='0건';
    return;
  }
  const groups={overdue:[],today:[],tomorrow:[],week:[],later:[],none:[]};
  for(const m of _myTodosCache)groups[_bucketByDue(m.due_date)].push(m);
  const labels=[
    ['overdue','🔴 지남','#dc2626'],
    ['today','🟠 오늘','#ea580c'],
    ['tomorrow','🟡 내일','#ca8a04'],
    ['week','🟢 이번주','#059669'],
    ['later','🔵 다음주 이후','#2563eb'],
    ['none','⚪ 기한 없음','#6b7280'],
  ];
  let html='';
  const total=_myTodosCache.length;
  for(const [k,lab,col] of labels){
    const arr=groups[k];if(!arr.length)continue;
    html+='<div style="margin-bottom:14px">'
      +'<div style="font-size:.82em;font-weight:700;color:'+col+';margin-bottom:6px;padding:3px 0;border-bottom:2px solid '+col+'">'+e(lab)+' <span style="font-weight:500;color:#6b7280">('+arr.length+')</span></div>'
      +arr.map(_todoRow).join('')
      +'</div>';
  }
  list.innerHTML=html;
  $g('mtMeta').textContent=total+'건';
}
function _todoRow(m){
  const isPersonal=!m.room_id;
  const roomBadge=isPersonal
    ? '<span style="background:#fef3c7;color:#92400e;padding:1px 7px;border-radius:8px;font-size:.7em;font-weight:700">📍 개인</span>'
    : '<a href="javascript:void(0)" onclick="event.stopPropagation();jumpToRoomFromTodo(\''+escAttr(m.room_id)+'\')" style="background:#dbeafe;color:#1e40af;padding:1px 7px;border-radius:8px;font-size:.7em;font-weight:700;text-decoration:none" title="이 방으로 이동">📍 '+e(m.room_name||m.room_id)+'</a>';
  const dueLbl=m.due_date?'<span style="font-size:.7em;color:#6b7280">📅 '+e(m.due_date)+'</span>':'';
  const linkBtn=m.linked_message_id
    ? '<a href="javascript:void(0)" onclick="event.stopPropagation();jumpToRoomFromTodo(\''+escAttr(m.room_id||'')+'\','+m.linked_message_id+')" style="color:#3182f6;font-size:.72em;text-decoration:none" title="원본 메시지">🔗#'+m.linked_message_id+'</a>'
    : '';
  return '<div style="display:flex;gap:9px;padding:8px 10px;border:1px solid #fde68a;border-radius:7px;margin-bottom:5px;background:#fffef5;align-items:flex-start">'
    +'<input type="checkbox" onchange="completeTodo('+m.id+')" style="width:18px;height:18px;cursor:pointer;accent-color:#10b981;flex-shrink:0;margin-top:1px">'
    +'<div style="flex:1;min-width:0">'
    +'<div style="font-size:.88em;color:#191f28;line-height:1.45;word-break:break-word">'+e(m.content||'')+'</div>'
    +'<div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap">'
    +roomBadge+dueLbl+linkBtn
    +'<span style="font-size:.7em;color:#9ca3af;margin-left:auto">'+e(m.author_name||'')+'</span>'
    +'<button onclick="deleteTodoFromDashboard('+m.id+')" style="background:none;border:none;color:#f04452;font-size:.76em;cursor:pointer;font-family:inherit;padding:0 2px" title="삭제">🗑️</button>'
    +'</div></div></div>';
}
async function completeTodo(id){
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&id='+id,{
      method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({memo_type:'완료'})
    });
    const d=await r.json();
    if(!d.ok){alert('완료 처리 실패: '+(d.error||'unknown'));return}
    /* 즉시 UI 제거 (캐시에서 빼고 리렌더) */
    _myTodosCache=_myTodosCache.filter(m=>m.id!==id);
    _renderMyTodos();
    _updateMyTodosBadge();
  }catch(err){alert('오류: '+err.message)}
}
async function deleteTodoFromDashboard(id){
  if(!confirm('이 할 일을 삭제할까요?'))return;
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&id='+id,{method:'DELETE'});
    const d=await r.json();
    if(!d.ok){alert('삭제 실패: '+(d.error||'unknown'));return}
    _myTodosCache=_myTodosCache.filter(m=>m.id!==id);
    _renderMyTodos();
    _updateMyTodosBadge();
  }catch(err){alert('오류: '+err.message)}
}
async function addPersonalTask(){
  const content=($g('mtNewContent')?.value||'').trim();
  const due=($g('mtNewDue')?.value||'').trim();
  if(!content){alert('일정 내용을 입력하세요');return}
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({memo_type:'할 일', content, due_date: due||null}) /* room_id 없음 = 개인 일정 */
    });
    const d=await r.json();
    if(!d.ok){alert('추가 실패: '+(d.error||'unknown'));return}
    $g('mtNewContent').value='';
    $g('mtNewDue').value='';
    await loadMyTodos();
  }catch(err){alert('오류: '+err.message)}
}
/* 대시보드에서 방 점프 — 모달 닫고 방 열기 */
function jumpToRoomFromTodo(roomId, msgId){
  if(!roomId)return;
  closeMyTodos();
  if(typeof openRoom==='function'){
    setTimeout(()=>{
      openRoom(roomId);
      if(msgId){
        setTimeout(()=>jumpToRoomMessage(msgId), 500);
      }
    }, 100);
  }
}
/* 📋 할 일 버튼 뱃지 (미완료 총 개수) */
function _updateMyTodosBadge(){
  const b=$g('myTodosBadge');if(!b)return;
  const n=_myTodosCache.filter(m=>m._t==='할 일').length;
  if(n>0){b.textContent=n;b.style.display='inline-block'}
  else{b.style.display='none'}
}
/* 초기 로드 — 헤더 뱃지 표시용 조용히 한 번 조회 */
async function _silentLoadMyTodos(){
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&scope=my');
    const d=await r.json();
    if(d.memos){
      _myTodosCache=d.memos.map(m=>({...m, _t:_normType(m.memo_type_display||m.memo_type)}));
      _updateMyTodosBadge();
    }
  }catch(_){}
}
/* 페이지 로드 후 한 번 + 이후 60초마다 뱃지 갱신 */
setTimeout(_silentLoadMyTodos, 2000);
setInterval(_silentLoadMyTodos, 60000);

/* ===== 📒 담당자 메모 (내부 전용 · 재설계 2026-04-22) =====
   타입 3종: '할 일' (방 or 개인) / '완료' (체크상태) / '거래처 정보' (영구, user_id 기반)
   체크박스: 할 일 ↔ 완료 토글 (PATCH memo_type)
   거래처 정보: AI 요약 시 항상 상단 주입 → 인수인계·기본사항 자동 반영
   기한(due_date) + 연결 메시지(#ID) + D-day 하이라이트 */
const _MEMO_TYPES=['할 일','거래처 정보','완료'];
const _MEMO_COLORS={'할 일':'#b45309','완료':'#64748b','거래처 정보':'#1e40af','참고':'#1e40af'};
const _MEMO_ICONS={'할 일':'📌','완료':'✅','거래처 정보':'🏢','참고':'📝'};
/* 구 타입 → 신 타입 매핑 */
const _MEMO_LEGACY={
  '사실메모':'거래처 정보','확인필요':'할 일','고객요청':'할 일',
  '담당자판단':'거래처 정보','주의사항':'거래처 정보','완료처리':'완료',
  '참고':'거래처 정보',
};
function _normType(t){return _MEMO_LEGACY[t]||t||'할 일'}
let _memoSelectedType='할 일';
let _memoEditingId=null;
let _memoFilter='todo'; /* todo | ref | done | all */
let _memoCache=[];

async function openRoomMemos(){
  if(!currentRoomId){alert('상담방을 먼저 선택하세요');return}
  const modal=$g('memoModal');
  if(!modal)return;
  /* 팝업 창이면 사이드 도킹용 공간 확보 — 자동 폭 확장 */
  try{
    const isPopup=new URLSearchParams(location.search).get('popup')==='1';
    if(isPopup && window.innerWidth<1100){
      window.resizeTo(1100, Math.max(window.innerHeight, 780));
    }
  }catch(_){}
  /* 사이드 도킹 모드: 대화창과 나란히 볼 수 있게. PC(≥1024px)에선 우측 패널, 모바일은 바텀 시트.
     body 스크롤은 유지 (채팅 스크롤 되도록) — PC 사이드 모드에선 배경 투명이라 밖 클릭도 채팅에 전달됨. */
  modal.classList.add('side-dock');
  modal.style.display='flex';
  document.body.classList.add('memo-side-open');
  /* 모바일에선 화면 가리므로 body overflow 잠금 유지 */
  if(window.matchMedia('(max-width:1023px)').matches){
    document.body.style.overflow='hidden';
  } else {
    document.body.style.overflow='';
  }
  _memoEditingId=null;
  _memoSelectedType='할 일';
  _memoFilter='todo';
  if($g('memoInput'))$g('memoInput').value='';
  if($g('memoDueDate'))$g('memoDueDate').value='';
  if($g('memoLinkMsg'))$g('memoLinkMsg').value='';
  _renderMemoTypeTabs();
  _updateMemoEditBanner();
  _renderMemoFilterTabs();
  await loadRoomMemos();
}
function closeMemoModal(){
  const m=$g('memoModal');if(m)m.style.display='none';
  if(m)m.classList.remove('side-dock');
  document.body.classList.remove('memo-side-open');
  document.body.style.overflow='';
}
/* 창 크기 변화 시 body overflow 조정 (PC ↔ 모바일 전환) */
window.addEventListener('resize',function(){
  const m=document.getElementById('memoModal');
  if(!m||m.style.display!=='flex')return;
  document.body.style.overflow=window.matchMedia('(max-width:1023px)').matches?'hidden':'';
});
/* ESC 로 메모 패널 닫기 (한 번만 등록) */
(function(){
  if(window._memoEscBound)return;
  window._memoEscBound=true;
  document.addEventListener('keydown',function(ev){
    if(ev.key!=='Escape')return;
    const m=document.getElementById('memoModal');
    if(!m||m.style.display!=='flex')return;
    /* 입력 중이면 기본 동작(포커스 해제) 보존하되 모달 닫기도 */
    closeMemoModal();
  });
})();
function _renderMemoTypeTabs(){
  const box=$g('memoTypeTabs');if(!box)return;
  box.innerHTML='<span style="font-size:.72em;color:#6b7280;margin-right:4px">종류:</span>'
    +_MEMO_TYPES.map(t=>{
      const on=t===_memoSelectedType;
      const c=_MEMO_COLORS[t]||'#334155';
      return '<button onclick="selectMemoType(\''+t+'\')" style="background:'+(on?c:'#fff')+';color:'+(on?'#fff':'#334155')+';border:1px solid '+(on?c:'#e5e8eb')+';padding:4px 10px;border-radius:14px;font-size:.74em;cursor:pointer;font-family:inherit;font-weight:'+(on?'700':'500')+'">'+_MEMO_ICONS[t]+' '+e(t)+'</button>';
    }).join('');
}
function selectMemoType(t){
  if(_MEMO_TYPES.indexOf(t)<0)return;
  _memoSelectedType=t;
  _renderMemoTypeTabs();
}
function setMemoFilter(f){
  _memoFilter=f;
  _renderMemoFilterTabs();
  _renderMemoList();
}
function _renderMemoFilterTabs(){
  document.querySelectorAll('.memo-filter').forEach(b=>{
    const on=b.getAttribute('data-filter')===_memoFilter;
    b.style.background=on?'#191f28':'#e5e8eb';
    b.style.color=on?'#fff':'#555';
    b.style.fontWeight=on?'700':'500';
  });
}
async function loadRoomMemos(){
  const list=$g('memoList');
  if(!list||!currentRoomId)return;
  list.innerHTML='<div style="text-align:center;color:#8b95a1;padding:30px 0;font-size:.85em">불러오는 중...</div>';
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId));
    const d=await r.json();
    if(d.error){list.innerHTML='<div style="color:#f04452;padding:20px 0">불러오기 실패: '+e(d.error)+'</div>';return}
    _memoCache=(d.memos||[]).map(m=>({...m, _t:_normType(m.memo_type_display||m.memo_type)}));
    _updateMemoCounts();
    _renderMemoList();
    /* 📒 메뉴 버튼에 할 일 건수 뱃지 (존재하면) */
    _updateRoomMemoBadge();
  }catch(err){list.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(err.message)+'</div>'}
}
function _updateMemoCounts(){
  const counts={'할 일':0,'거래처 정보':0,'완료':0,total:_memoCache.length};
  _memoCache.forEach(m=>{counts[m._t]=(counts[m._t]||0)+1});
  if($g('memoCountTodo'))$g('memoCountTodo').textContent=counts['할 일']?'('+counts['할 일']+')':'';
  if($g('memoCountRef'))$g('memoCountRef').textContent=counts['거래처 정보']?'('+counts['거래처 정보']+')':'';
  if($g('memoCountDone'))$g('memoCountDone').textContent=counts['완료']?'('+counts['완료']+')':'';
  if($g('memoCountAll'))$g('memoCountAll').textContent=counts.total?'('+counts.total+')':'';
}
function _filterMemos(){
  if(_memoFilter==='todo')return _memoCache.filter(m=>m._t==='할 일');
  if(_memoFilter==='ref') return _memoCache.filter(m=>m._t==='거래처 정보');
  if(_memoFilter==='done')return _memoCache.filter(m=>m._t==='완료');
  return _memoCache;
}
function _dDayLabel(due){
  if(!due)return null;
  const today=new Date(Date.now()+9*60*60*1000).toISOString().substring(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(due))return null;
  const diff=Math.round((new Date(due+'T00:00:00')-new Date(today+'T00:00:00'))/86400000);
  let color='#64748b', label='';
  if(diff<0){color='#991b1b';label='지남 '+(-diff)+'일'}
  else if(diff===0){color='#dc2626';label='D-DAY'}
  else if(diff<=3){color='#ea580c';label='D-'+diff}
  else if(diff<=7){color='#b45309';label='D-'+diff}
  else {color='#64748b';label='D-'+diff}
  return '<span style="background:'+color+';color:#fff;padding:1px 7px;border-radius:10px;font-size:.7em;font-weight:700;margin-left:4px">📅 '+due+' · '+label+'</span>';
}
function _renderMemoList(){
  const list=$g('memoList');if(!list)return;
  const memos=_filterMemos();
  if(!memos.length){
    const hint=_memoFilter==='todo'?'지금 할 일이 없습니다. 입력창에서 새 메모를 추가하세요.'
              :_memoFilter==='done'?'완료된 메모가 없습니다.'
              :_memoFilter==='ref' ?'참고 메모가 없습니다.'
              :'메모가 없습니다.';
    list.innerHTML='<div style="text-align:center;color:#8b95a1;padding:40px 16px;font-size:.88em">📭 '+e(hint)+'</div>';
    return;
  }
  list.innerHTML=memos.map(m=>{
    const typ=m._t;
    const c=_MEMO_COLORS[typ]||'#334155';
    const icon=_MEMO_ICONS[typ]||'📌';
    const isDone=typ==='완료';
    const edited=m.is_edited?'<span style="font-size:.68em;color:#8b95a1;margin-left:3px">·수정</span>':'';
    const dueBadge=_dDayLabel(m.due_date)||'';
    const linkBadge=m.linked_message_id
      ? '<a href="javascript:void(0)" onclick="event.stopPropagation();jumpToRoomMessage('+m.linked_message_id+')" style="color:#3182f6;text-decoration:none;background:#eff6ff;border:1px solid #bfdbfe;padding:0 5px;border-radius:4px;font-size:.7em;margin-left:4px">🔗 #'+m.linked_message_id+'</a>'
      : '';
    const contentStyle=isDone
      ? 'font-size:.88em;color:#9ca3af;text-decoration:line-through;white-space:pre-wrap;word-break:break-word;line-height:1.55'
      : 'font-size:.88em;color:#191f28;white-space:pre-wrap;word-break:break-word;line-height:1.55';
    /* 체크박스: 할 일 ↔ 완료 토글. 참고는 체크박스 대신 인디케이터만 */
    const checkbox = (typ==='할 일' || typ==='완료')
      ? '<label style="display:flex;align-items:center;cursor:pointer;flex-shrink:0"><input type="checkbox" '+(isDone?'checked':'')+' onchange="toggleMemoDone('+m.id+','+(!isDone)+')" style="width:18px;height:18px;cursor:pointer;accent-color:#10b981"></label>'
      : '<span style="width:18px;display:inline-block;flex-shrink:0;text-align:center;color:'+c+'">'+icon+'</span>';
    const bg=isDone?'#fafbfc':(typ==='할 일'?'#fffef5':'#fff');
    const borderColor=isDone?'#e5e8eb':(typ==='할 일'?'#fde68a':'#e5e8eb');
    return '<div style="display:flex;gap:10px;padding:9px 11px;border:1px solid '+borderColor+';border-radius:8px;margin-bottom:6px;background:'+bg+';align-items:flex-start">'
      +checkbox
      +'<div style="flex:1;min-width:0">'
      +'<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;font-size:.7em;color:#6b7280;flex-wrap:wrap">'
      +  (typ!=='할 일' && typ!=='완료' ? '<span style="background:'+c+';color:#fff;padding:1px 7px;border-radius:10px;font-weight:700">'+icon+' '+e(typ)+'</span>' : '')
      +  '<span>'+e(m.author_name||'담당자')+'</span>'
      +  '<span>·</span>'
      +  '<span>'+e((m.created_at||'').substring(5,16).replace('T',' '))+'</span>'
      +  edited
      +  dueBadge
      +  linkBadge
      +  '<div style="flex:1"></div>'
      +  '<button onclick="startEditMemo('+m.id+')" style="background:none;border:none;color:#3182f6;font-size:.76em;cursor:pointer;font-family:inherit;padding:1px 4px" title="수정">✏️</button>'
      +  '<button onclick="deleteMemo('+m.id+')" style="background:none;border:none;color:#f04452;font-size:.76em;cursor:pointer;font-family:inherit;padding:1px 4px" title="삭제">🗑️</button>'
      +'</div>'
      +'<div style="'+contentStyle+'">'+e(m.content||'')+'</div>'
      +'</div></div>';
  }).join('');
}
function _updateMemoEditBanner(){
  const b=$g('memoEditBanner'), c=$g('memoCancelBtn'), s=$g('memoSubmitBtn');
  if(_memoEditingId){
    if(b)b.style.display='inline';
    if(c)c.style.display='inline-block';
    if(s)s.textContent='수정 저장';
  } else {
    if(b)b.style.display='none';
    if(c)c.style.display='none';
    if(s)s.textContent='저장';
  }
}
/* 체크박스 클릭 — 할 일 ↔ 완료 PATCH */
async function toggleMemoDone(id, done){
  const newType=done?'완료':'할 일';
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&id='+id,{
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({memo_type:newType})
    });
    const d=await r.json();
    if(!d.ok){alert('상태 변경 실패: '+(d.error||'unknown'));return}
    await loadRoomMemos();
  }catch(err){alert('오류: '+err.message)}
}
/* id 만 받아서 캐시에서 본문·타입·기한·연결 추출 */
function startEditMemo(id){
  const m=_memoCache.find(x=>x.id===id);
  if(!m)return;
  _memoEditingId=id;
  _memoSelectedType=m._t;
  if($g('memoInput'))$g('memoInput').value=String(m.content||'');
  if($g('memoDueDate'))$g('memoDueDate').value=m.due_date||'';
  if($g('memoLinkMsg'))$g('memoLinkMsg').value=m.linked_message_id||'';
  _renderMemoTypeTabs();
  _updateMemoEditBanner();
  if($g('memoInput'))$g('memoInput').focus();
}
function cancelMemoEdit(){
  _memoEditingId=null;
  if($g('memoInput'))$g('memoInput').value='';
  if($g('memoDueDate'))$g('memoDueDate').value='';
  if($g('memoLinkMsg'))$g('memoLinkMsg').value='';
  _memoSelectedType='할 일';
  _renderMemoTypeTabs();
  _updateMemoEditBanner();
}
async function submitMemo(){
  if(!currentRoomId){alert('상담방이 선택되지 않았습니다');return}
  const input=$g('memoInput'), content=input.value.trim();
  if(!content){alert('메모 내용을 입력하세요');return}
  const due=($g('memoDueDate')?.value||'').trim();
  const linkIdRaw=($g('memoLinkMsg')?.value||'').trim();
  const linkId=linkIdRaw?parseInt(linkIdRaw,10):null;
  const btn=$g('memoSubmitBtn');
  if(btn){btn.disabled=true;btn.style.opacity='.55';}
  try{
    const payload={memo_type:_memoSelectedType, content, due_date: due||null, linked_message_id: linkId||null};
    let r;
    if(_memoEditingId){
      r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&id='+_memoEditingId,{
        method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
      });
    } else {
      r=await fetch('/api/memos?key='+encodeURIComponent(KEY),{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...payload, room_id:currentRoomId})
      });
    }
    const d=await r.json();
    if(!d.ok){alert('저장 실패: '+(d.error||'unknown'));return}
    cancelMemoEdit();
    await loadRoomMemos();
  }catch(err){alert('오류: '+err.message)}
  finally{if(btn){btn.disabled=false;btn.style.opacity='';}}
}
async function deleteMemo(id){
  if(!confirm('이 메모를 삭제할까요?'))return;
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&id='+id,{method:'DELETE'});
    const d=await r.json();
    if(!d.ok){alert('삭제 실패: '+(d.error||'unknown'));return}
    await loadRoomMemos();
  }catch(err){alert('오류: '+err.message)}
}
/* 📒 버튼에 미완료(할 일) 건수 뱃지 표시 — 찾을 수 있으면만 */
function _updateRoomMemoBadge(){
  try{
    const todo=_memoCache.filter(m=>m._t==='할 일').length;
    const btns=document.querySelectorAll('button[onclick="openRoomMemos()"]');
    btns.forEach(b=>{
      b.innerHTML='📒 메모'+(todo?' <span style="background:#dc2626;color:#fff;border-radius:10px;padding:1px 6px;font-size:.7em;font-weight:700">'+todo+'</span>':'');
    });
  }catch(_){}
}

/* ===== D안: 입력창 옆 빠른 메모 토글 ===== */
let _quickMemoMode=false;
function toggleQuickMemoMode(){
  _quickMemoMode=!_quickMemoMode;
  const input=$g('roomInput'), btn=$g('roomQuickMemoBtn'), sendBtn=$g('roomSendBtn');
  if(!input)return;
  if(_quickMemoMode){
    input.dataset._origPlaceholder=input.placeholder||'';
    input.placeholder='📒 내부 메모 (고객에게 안 보임) — Enter로 저장';
    input.style.background='#fffbeb';
    input.style.border='2px solid #f59e0b';
    if(btn){btn.style.background='#f59e0b';btn.style.color='#fff';btn.title='메모 모드 해제'}
    if(sendBtn){sendBtn.textContent='저장';sendBtn.style.background='#f59e0b'}
    input.focus();
  } else {
    input.placeholder=input.dataset._origPlaceholder||'메시지 입력...';
    input.style.background='';
    input.style.border='1px solid #e5e8eb';
    if(btn){btn.style.background='';btn.style.color='';btn.title='빠른 메모 (내부 전용)'}
    if(sendBtn){sendBtn.textContent='전송';sendBtn.style.background='#3182f6'}
  }
}
async function submitQuickMemo(){
  if(!currentRoomId){alert('상담방이 선택되지 않았습니다');return}
  const input=$g('roomInput');
  const content=(input?.value||'').trim();
  if(!content){toggleQuickMemoMode();return}
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({room_id:currentRoomId, memo_type:'할 일', content})
    });
    const d=await r.json();
    if(!d.ok){alert('메모 저장 실패: '+(d.error||'unknown'));return}
    input.value='';
    input.style.height='auto';
    if(typeof showAdminToast==='function')showAdminToast('📒 메모 저장됨');
    /* 메모 모드 그대로 유지 — 여러 건 연속 입력 편의. 해제는 버튼으로 */
    /* 열린 메모 모달이 있으면 리로드 */
    if($g('memoModal')?.style.display==='flex') await loadRoomMemos();
    /* 버튼 뱃지 갱신을 위해 조용히 호출 */
    else _refreshMemoBadgeSilent();
  }catch(err){alert('오류: '+err.message)}
}
async function _refreshMemoBadgeSilent(){
  if(!currentRoomId)return;
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId));
    const d=await r.json();
    _memoCache=(d.memos||[]).map(m=>({...m, _t:_normType(m.memo_type_display||m.memo_type)}));
    _updateRoomMemoBadge();
  }catch(_){}
}

/* ===== 거래처 종합 대시보드 (C안) — admin-customer-dash.js 로 분리 (Step 2, 2026-04-30) =====
 * 원본 5012~5210 라인. 모두 admin-customer-dash.js 에 이전됨.
 * 분리 함수: openCustomerDashboard / _loadCdAutoSummary / _loadCdTodosAndSummaries
 *           / _cdCompleteTodo / _cdOpenSummary / closeCustomerDashboard / cdGotoDocs
 *           / cdGotoRoom / cdExportCsv / openCustomerDashboardFromRoom
 *           / openCustomerSummary / _cdCurrentCustomerName
 * 분리 상태: _cdCurrentUserId / _cdUserCache / _summaryMode
 *           / _customerSummaryUserId / _customerSummaryBusinessId
 * 의존: KEY, e, escAttr, $g, docsSelectedUserId, openBusinessDashboard, _normType,
 *       openRoom, openRoomSummary, openSummaryHistory, selectCustomer,
 *       openRoomForCurrentCustomer, exportWehago, currentRoomId, _lastSummaryText,
 *       _lastSummaryJson, _lastSummaryRange, _setSummaryRangeUI, tab, openCustSidePanel,
 *       openAddBizForUser, openBizDocsPanel
 * (admin.js 그대로 cross-script 공유) */
/* (intentional empty — 실제 함수는 admin-customer-dash.js) */
/* (intentional empty — 실제 함수는 admin-customer-dash.js) */
/* ===== 공통 유틸: 개업연도 기준 N기 자동 계산 =====
   올해 기준 (2026년 개업 → 1기 / 2025년 개업 → 2기 / 2024년 → 3기 ...) */
function _calcFiscalTerm(estDate){
  if(!estDate)return '';
  var m=/^(\d{4})/.exec(String(estDate));
  if(!m)return '';
  var y=parseInt(m[1],10);
  if(!y||isNaN(y))return '';
  var cur=new Date().getFullYear();
  var term=cur-y+1;
  return term>0?String(term):'';
}

/* ===== ➕ 수동 거래처 등록 (위하고 수임처 신규생성 스타일) ===== */
async function openManualClientModal(){
  const m=$g('manualClientModal');if(!m)return;
  m.style.display='flex';
  document.body.style.overflow='hidden';
  /* 👤 사람 정보 */
  ['mcRealName','mcPhone','mcCompany','mcCeo','mcBizNo','mcSubBiz','mcCorpNo',
   'mcAddr1','mcAddr2','mcBizPhone','mcIndustryCode','mcBizCategory','mcIndustry',
   'mcEstDate','mcFiscalTerm','mcNotes'].forEach(id=>{const el=$g(id);if(el)el.value=''});
  if($g('mcForm'))$g('mcForm').value='0.법인사업자';
  /* 📊 기수·인사연도 — 올해 기본값 */
  var curYear=new Date().getFullYear();
  if($g('mcFiscalStart'))$g('mcFiscalStart').value=curYear+'-01-01';
  if($g('mcFiscalEnd'))$g('mcFiscalEnd').value=curYear+'-12-31';
  if($g('mcHrYear'))$g('mcHrYear').value=String(curYear);
  if($g('mcAutoRoom'))$g('mcAutoRoom').checked=true;
  /* 담당자 라벨 select 채우기 */
  const sel=$g('mcPriority');
  if(sel){
    sel.innerHTML='<option value="">— 미지정</option><option value="" disabled>불러오는 중...</option>';
    try{
      const labels=await _ensureRoomLabels(true);
      sel.innerHTML='<option value="">— 미지정</option>'
        +labels.map(lb=>'<option value="'+lb.id+'" style="background:'+escAttr(lb.color||'#fff')+'">'+e(lb.name)+'</option>').join('');
    }catch(_){}
  }
  setTimeout(()=>$g('mcRealName')?.focus(),50);
}
function closeManualClientModal(){
  const m=$g('manualClientModal');if(m)m.style.display='none';
  document.body.style.overflow='';
  /* addBiz 모드 정리 — 다음 신규 거래처 등록 시 readonly·hidden 잔존 방지 */
  if(_mcMode==='addBiz'){
    _mcMode='newClient'; _mcAddBizUserId=null;
    const rn=$g('mcRealName'); if(rn){rn.readOnly=false; rn.style.background=''; rn.style.cursor=''}
    const ph=$g('mcPhone'); if(ph){ph.readOnly=false; ph.style.background=''; ph.style.cursor=''}
    const ar=$g('mcAutoRoom'); if(ar){const lbl=ar.closest('label'); if(lbl)lbl.style.display=''}
    const titleEl=document.querySelector('#manualClientModal div[style*="font-weight:700"]');
    if(titleEl)titleEl.innerHTML='➕ 수동 거래처 등록 <span style="font-size:.72em;color:#8b95a1;font-weight:500;margin-left:6px">로그인 없는 관리용</span>';
    const btn=$g('mcSubmitBtn');
    if(btn){btn.textContent='➕ 등록'; btn.disabled=false; btn.style.opacity='1'}
  }
}

/* 🏢 user dashboard [+ 사업장 추가] → 기존 manualClientModal 재활용.
   사람 정보(이름·전화) 는 readonly 잠그고 사업장 부분만 입력. submit 분기로 add_to_user API 호출. */
let _mcMode='newClient';
let _mcAddBizUserId=null;
async function openAddBizForUser(userId, userName, userPhone){
  if(!userId){alert('user_id 누락');return}
  _mcMode='addBiz';
  _mcAddBizUserId=Number(userId);
  await openManualClientModal();
  const rn=$g('mcRealName');
  if(rn){rn.value=userName||''; rn.readOnly=true; rn.style.background='#f3f4f6'; rn.style.cursor='not-allowed'}
  const ph=$g('mcPhone');
  if(ph){ph.value=userPhone||''; ph.readOnly=true; ph.style.background='#f3f4f6'; ph.style.cursor='not-allowed'}
  const ar=$g('mcAutoRoom');
  if(ar){ar.checked=false; const lbl=ar.closest('label'); if(lbl)lbl.style.display='none'}
  const titleEl=document.querySelector('#manualClientModal div[style*="font-weight:700"]');
  if(titleEl)titleEl.innerHTML='🏢 사업장 추가 <span style="font-size:.72em;color:#8b95a1;font-weight:500;margin-left:6px">['+e(userName||'#'+userId)+'] 매핑</span>';
  const btn=$g('mcSubmitBtn');
  if(btn)btn.textContent='🏢 사업장 추가';
  setTimeout(()=>$g('mcCompany')?.focus(),60);
}
async function submitAddBizForUser(userId){
  const company=($g('mcCompany')?.value||'').trim();
  if(!company){alert('회사명 (수임처명) 은 필수입니다');return}
  const addr1=($g('mcAddr1')?.value||'').trim();
  const addr2=($g('mcAddr2')?.value||'').trim();
  const body={
    user_id:Number(userId),
    role:'대표자',
    is_primary:false,
    company_name:company,
    business_number:($g('mcBizNo')?.value||'').trim()||null,
    ceo_name:($g('mcCeo')?.value||'').trim()||null,
    company_form:$g('mcForm')?.value||null,
    sub_business_number:($g('mcSubBiz')?.value||'').trim()||null,
    corporate_number:($g('mcCorpNo')?.value||'').trim()||null,
    business_category:($g('mcBizCategory')?.value||'').trim()||null,
    industry:($g('mcIndustry')?.value||'').trim()||null,
    industry_code:($g('mcIndustryCode')?.value||'').trim()||null,
    address:[addr1,addr2].filter(Boolean).join(' ')||null,
    phone:($g('mcBizPhone')?.value||'').trim()||null,
    establishment_date:$g('mcEstDate')?.value||null,
    fiscal_year_start:$g('mcFiscalStart')?.value||null,
    fiscal_year_end:$g('mcFiscalEnd')?.value||null,
    fiscal_term:$g('mcFiscalTerm')?.value?Number($g('mcFiscalTerm').value):null,
    hr_year:$g('mcHrYear')?.value?Number($g('mcHrYear').value):null,
    notes:($g('mcNotes')?.value||'').trim()||null,
  };
  const btn=$g('mcSubmitBtn');
  if(btn){btn.disabled=true;btn.style.opacity='.55';btn.textContent='추가 중...'}
  try{
    const r=await fetch('/api/admin-businesses?action=add_to_user&key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
    });
    const d=await r.json();
    if(!d.ok){alert('추가 실패: '+(d.error||'unknown'));return}
    alert('✅ 사업장 매핑됨 ('+(d.merged?'기존 업체에 연결':'신규 업체 등록 후 연결')+')');
    closeManualClientModal();
    /* dashboard 강제 새로고침 — modal 닫고 다시 열어야 cdBizDocs 가 새 매핑 가져옴 */
    const cm=$g('custDashModal');
    if(cm){cm.style.display='none'; document.body.style.overflow=''}
    setTimeout(()=>{
      if(typeof openCustomerDashboard==='function')openCustomerDashboard(Number(userId));
    }, 100);
  }catch(err){alert('오류: '+err.message)}
  finally{if(btn){btn.disabled=false;btn.style.opacity='1';btn.textContent='🏢 사업장 추가'}}
}
/* 🔍 카카오 주소검색 — 수동 거래처용 */
function _mcOpenAddressSearch(){
  if(typeof daum==='undefined'||!daum.Postcode){
    alert('주소검색 스크립트가 아직 로드 중입니다. 잠시 후 다시 시도해주세요.');return;
  }
  new daum.Postcode({
    oncomplete:function(data){
      var full=data.roadAddress||data.jibunAddress||data.address||'';
      if(data.buildingName)full+=' ('+data.buildingName+')';
      $g('mcAddr1').value=full;
      var d2=$g('mcAddr2');if(d2)d2.focus();
    }
  }).open();
}
/* 개업일 변경 시 N기 자동 계산 */
function _mcUpdateFiscalTerm(){
  var t=_calcFiscalTerm($g('mcEstDate')?.value);
  var el=$g('mcFiscalTerm');if(el)el.value=t;
}
async function submitManualClient(){
  /* user dashboard 의 [+ 🏢 사업장 추가] 모드면 별도 분기 */
  if(_mcMode==='addBiz' && _mcAddBizUserId){
    return submitAddBizForUser(_mcAddBizUserId);
  }
  const realName=($g('mcRealName')?.value||'').trim();
  if(!realName){alert('이름(실명)은 필수입니다');return}
  const phone=($g('mcPhone')?.value||'').trim();
  const company=($g('mcCompany')?.value||'').trim();
  const ceo=($g('mcCeo')?.value||'').trim()||realName;
  const bizNo=($g('mcBizNo')?.value||'').trim();
  const notes=($g('mcNotes')?.value||'').trim();
  const autoRoom=$g('mcAutoRoom')?.checked?true:false;
  const priorityRaw=$g('mcPriority')?.value||'';
  const priority=priorityRaw?Number(priorityRaw):null;
  /* 위하고 호환 필드 */
  const addr1=($g('mcAddr1')?.value||'').trim();
  const addr2=($g('mcAddr2')?.value||'').trim();
  const body={
    name:realName, real_name:realName, phone,
    company_name:company, ceo_name:ceo, business_number:bizNo, notes,
    auto_create_room: autoRoom, priority: priority,
    company_form:$g('mcForm')?.value||null,
    sub_business_number:($g('mcSubBiz')?.value||'').trim()||null,
    corporate_number:($g('mcCorpNo')?.value||'').trim()||null,
    address:[addr1,addr2].filter(Boolean).join(' ')||null,
    biz_phone:($g('mcBizPhone')?.value||'').trim()||null,
    industry_code:($g('mcIndustryCode')?.value||'').trim()||null,
    business_category:($g('mcBizCategory')?.value||'').trim()||null,
    industry:($g('mcIndustry')?.value||'').trim()||null,
    establishment_date:$g('mcEstDate')?.value||null,
    fiscal_year_start:$g('mcFiscalStart')?.value||null,
    fiscal_year_end:$g('mcFiscalEnd')?.value||null,
    fiscal_term:$g('mcFiscalTerm')?.value?Number($g('mcFiscalTerm').value):null,
    hr_year:$g('mcHrYear')?.value?Number($g('mcHrYear').value):null,
  };
  const btn=$g('mcSubmitBtn');
  if(btn){btn.disabled=true;btn.style.opacity='.55';btn.textContent='등록 중...'}
  try{
    const r=await fetch('/api/admin-clients?key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    const d=await r.json();
    if(!d.ok){alert('등록 실패: '+(d.error||'unknown'));return}
    let msg='✅ 거래처 등록됨 (ID #'+d.user_id+')';
    if(d.room_id) msg+=' · 상담방 '+d.room_id+' 생성';
    if(typeof showAdminToast==='function')showAdminToast(msg);
    else alert(msg);
    closeManualClientModal();
    if(typeof userStatus==='function')userStatus('approved_client');
    if(typeof loadRoomList==='function')loadRoomList();
  }catch(err){alert('오류: '+err.message)}
  finally{if(btn){btn.disabled=false;btn.style.opacity='';btn.textContent='➕ 등록'}}
}

/* ===== 📅 신고 Case — 거래처 × 신고종류 × 기간 단위 업무 묶음 ===== */
async function _loadCdFilings(userId){
  const box=$g('cdFilings');if(!box||!userId)return;
  box.innerHTML='<div style="color:#8b95a1;padding:10px 0;font-size:.85em">불러오는 중...</div>';
  try{
    const r=await fetch('/api/tax-filings?key='+encodeURIComponent(KEY)+'&user_id='+userId+'&status=all');
    const d=await r.json();
    const arr=d.filings||[];
    if(!arr.length){
      box.innerHTML='<div style="color:#adb5bd;padding:10px 0;font-size:.85em;line-height:1.6">아직 생성된 신고 Case 가 없습니다.<br>우측 "+ 새 Case" 로 부가세/종소세/법인세 등 신고 건을 시작하세요.</div>';
      return;
    }
    box.innerHTML=arr.map(f=>_renderFilingCard(f, userId)).join('');
  }catch(err){box.innerHTML='<div style="color:#f04452">오류: '+e(err.message)+'</div>'}
}
function _renderFilingCard(f, userId){
  const items=f.items||[];
  const done=items.filter(i=>i.is_checked).length;
  const total=items.length;
  const pct=total>0?Math.round(done/total*100):0;
  /* D-day 뱃지 */
  let dueBadge='';
  if(f.due_date){
    const today=new Date(Date.now()+9*60*60*1000).toISOString().substring(0,10);
    const diff=Math.round((new Date(f.due_date+'T00:00:00')-new Date(today+'T00:00:00'))/86400000);
    let bgColor='#64748b';let label='';
    if(diff<0){bgColor='#991b1b';label='D+'+(-diff)+' 지남'}
    else if(diff===0){bgColor='#dc2626';label='D-DAY'}
    else if(diff<=3){bgColor='#ea580c';label='D-'+diff}
    else if(diff<=7){bgColor='#b45309';label='D-'+diff}
    else if(diff<=30){bgColor='#059669';label='D-'+diff}
    else {bgColor='#2563eb';label='D-'+diff}
    dueBadge='<span style="background:'+bgColor+';color:#fff;padding:1px 7px;border-radius:10px;font-size:.7em;font-weight:700;margin-left:6px">📅 '+f.due_date+' · '+label+'</span>';
  }
  const statusBadge=f.status==='completed'?'<span style="background:#d1fae5;color:#065f46;padding:1px 7px;border-radius:10px;font-size:.7em;font-weight:700;margin-left:6px">✅ 완료</span>':(f.status==='cancelled'?'<span style="background:#fee2e2;color:#991b1b;padding:1px 7px;border-radius:10px;font-size:.7em;font-weight:700;margin-left:6px">취소</span>':'');
  const opacity=f.status==='cancelled'?0.55:1;
  const progressBar=total>0?'<div style="height:6px;background:#e5e8eb;border-radius:3px;overflow:hidden;margin:4px 0 8px"><div style="height:100%;background:'+(pct===100?'#10b981':'#3182f6')+';width:'+pct+'%"></div></div>':'';
  /* 체크리스트 (접힘 가능) */
  const itemsHtml=items.map(it=>{
    const checked=it.is_checked?'checked':'';
    const textStyle=it.is_checked?'color:#9ca3af;text-decoration:line-through':'color:#191f28';
    return '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:.85em">'
      +'<input type="checkbox" '+checked+' onchange="toggleFilingItem('+it.id+','+f.user_id+')" style="width:14px;height:14px;cursor:pointer;accent-color:#10b981;flex-shrink:0">'
      +'<span style="flex:1;'+textStyle+'">'+e(it.item_text||'')+'</span>'
      +(it.is_checked&&it.checked_by?'<span style="font-size:.7em;color:#8b95a1;flex-shrink:0">'+e(it.checked_by)+'</span>':'')
      +'<button onclick="deleteFilingItem('+it.id+','+f.user_id+')" style="background:none;border:none;color:#f04452;font-size:.76em;cursor:pointer;font-family:inherit;padding:0 2px;flex-shrink:0" title="삭제">✕</button>'
      +'</div>';
  }).join('');
  const headerId='fhdr-'+f.id;
  return '<div style="border:1px solid #e5e8eb;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fafbfc;opacity:'+opacity+'">'
    +'<div style="display:flex;align-items:center;gap:6px;cursor:pointer;flex-wrap:wrap" onclick="_toggleFilingBody('+f.id+')">'
    +  '<span style="font-size:1.05em">'+(f.filing_type==='부가세'?'💰':f.filing_type==='종소세'?'📊':f.filing_type==='법인세'?'🏢':f.filing_type==='원천세'?'💼':f.filing_type==='양도세'?'🏠':'📄')+'</span>'
    +  '<span style="font-weight:700;font-size:.92em">'+e(f.filing_type)+' · '+e(f.period)+'</span>'
    +  dueBadge+statusBadge
    +  '<span style="margin-left:auto;font-size:.78em;color:#4b5563;font-weight:600">'+done+'/'+total+' ('+pct+'%)</span>'
    +'</div>'
    +progressBar
    +'<div id="'+headerId+'" style="display:none;margin-top:6px">'
    +  (f.title&&f.title!==f.filing_type+' · '+f.period?'<div style="font-size:.8em;color:#4b5563;margin-bottom:4px">'+e(f.title)+'</div>':'')
    +  itemsHtml
    +  '<div style="display:flex;gap:4px;margin-top:8px;padding-top:6px;border-top:1px dashed #e5e8eb">'
    +    '<input id="nfAddItem-'+f.id+'" type="text" placeholder="+ 항목 추가" style="flex:1;padding:4px 8px;border:1px solid #e5e8eb;border-radius:5px;font-size:.82em;font-family:inherit;outline:none" onkeydown="if(event.key===&quot;Enter&quot;){event.preventDefault();addFilingItem('+f.id+','+f.user_id+')}">'
    +    (f.status==='active'?'<button onclick="toggleFilingStatus('+f.id+',\'completed\','+f.user_id+')" style="background:#10b981;color:#fff;border:none;padding:4px 10px;border-radius:5px;font-size:.76em;cursor:pointer;font-family:inherit">✅ 완료</button>':'<button onclick="toggleFilingStatus('+f.id+',\'active\','+f.user_id+')" style="background:#e5e8eb;border:none;padding:4px 10px;border-radius:5px;font-size:.76em;cursor:pointer;font-family:inherit">재개</button>')
    +    '<button onclick="deleteFiling('+f.id+','+f.user_id+')" style="background:none;border:1px solid #f04452;color:#f04452;padding:4px 8px;border-radius:5px;font-size:.76em;cursor:pointer;font-family:inherit" title="Case 삭제">🗑️</button>'
    +  '</div>'
    +'</div>'
    +'</div>';
}
function _toggleFilingBody(fid){
  const el=document.getElementById('fhdr-'+fid);
  if(!el)return;
  el.style.display=(el.style.display==='none'||!el.style.display)?'block':'none';
}
function openNewFilingModal(){
  if(!_cdCurrentUserId){alert('거래처를 먼저 선택하세요');return}
  const m=$g('newFilingModal');if(!m)return;
  m.style.display='flex';
  $g('nfType').value='부가세';
  $g('nfPeriod').value='';
  $g('nfDue').value='';
  setTimeout(()=>$g('nfPeriod')?.focus(),50);
}
function closeNewFilingModal(){
  const m=$g('newFilingModal');if(m)m.style.display='none';
}
async function submitNewFiling(){
  const userId=_cdCurrentUserId;
  if(!userId){alert('거래처가 선택되지 않았습니다');return}
  const filing_type=$g('nfType').value;
  const period=($g('nfPeriod').value||'').trim();
  const due=($g('nfDue').value||'').trim();
  if(!period){alert('기간을 입력하세요 (예: 2026-1기)');return}
  const btn=$g('nfSubmitBtn');if(btn){btn.disabled=true;btn.style.opacity='.55'}
  try{
    const r=await fetch('/api/tax-filings?key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({user_id:userId, filing_type, period, due_date:due||null})
    });
    const d=await r.json();
    if(!d.ok){alert('생성 실패: '+(d.error||'unknown'));return}
    closeNewFilingModal();
    await _loadCdFilings(userId);
  }catch(err){alert('오류: '+err.message)}
  finally{if(btn){btn.disabled=false;btn.style.opacity=''}}
}
async function toggleFilingItem(itemId, userId){
  try{
    await fetch('/api/tax-filings?key='+encodeURIComponent(KEY)+'&action=toggle_item&item_id='+itemId,{method:'POST'});
    await _loadCdFilings(userId);
  }catch(err){alert('오류: '+err.message)}
}
async function deleteFilingItem(itemId, userId){
  if(!confirm('이 체크리스트 항목을 삭제할까요?'))return;
  try{
    await fetch('/api/tax-filings?key='+encodeURIComponent(KEY)+'&action=del_item&item_id='+itemId,{method:'DELETE'});
    await _loadCdFilings(userId);
  }catch(err){alert('오류: '+err.message)}
}
async function addFilingItem(filingId, userId){
  const input=$g('nfAddItem-'+filingId);if(!input)return;
  const text=(input.value||'').trim();
  if(!text)return;
  try{
    const r=await fetch('/api/tax-filings?key='+encodeURIComponent(KEY)+'&action=add_item&filing_id='+filingId,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({item_text:text})
    });
    const d=await r.json();
    if(!d.ok){alert('추가 실패: '+(d.error||'unknown'));return}
    input.value='';
    await _loadCdFilings(userId);
  }catch(err){alert('오류: '+err.message)}
}
async function toggleFilingStatus(filingId, newStatus, userId){
  try{
    await fetch('/api/tax-filings?key='+encodeURIComponent(KEY)+'&id='+filingId,{
      method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({status:newStatus})
    });
    await _loadCdFilings(userId);
  }catch(err){alert('오류: '+err.message)}
}
async function deleteFiling(filingId, userId){
  if(!confirm('이 신고 Case 를 삭제할까요? (모든 체크리스트 항목 포함)'))return;
  try{
    await fetch('/api/tax-filings?key='+encodeURIComponent(KEY)+'&id='+filingId,{method:'DELETE'});
    await _loadCdFilings(userId);
  }catch(err){alert('오류: '+err.message)}
}

/* 거래처 통합 메모 (cdMemo*) — admin-memos.js 로 분리 (2026-04-30 Step 1)
 * 함수: _loadCustomerInfo / _loadCdAllMemos / _renderCdMemos / _renderCdDDayBadge
 *       _renderCdAttachments / cdMemoFilter / onCdMemoFileSelect / addCdMemo / deleteCdMemo
 *       addCustomerInfo / deleteCustomerInfo (alias)
 * 상태: _cdMemosCache / _cdMemoCategory / _cdPendingAttachments
 * 의존: KEY / _cdCurrentUserId / e() / escAttr() / $g() — admin.js 에서 그대로 공유 */

/* 거래처 대시보드 chunk 2 — admin-customer-dash.js 로 분리 (Step 2)
 * _loadCdTodosAndSummaries / _cdCompleteTodo / _cdOpenSummary
 * _cdUserCache (const) / closeCustomerDashboard / cdGotoDocs / cdGotoRoom / cdExportCsv
 * openCustomerDashboardFromRoom / openCustomerSummary / _cdCurrentCustomerName
 * _summaryMode / _customerSummaryUserId / _customerSummaryBusinessId
 * (모두 admin-customer-dash.js 에 var/function 으로 정의 — classic script global 공유) */
/* runRoomSummary 가 _summaryMode 분기해서 fetch 대상 바꾸도록 — 기존 함수 wrap */
const _origRunRoomSummary = (typeof runRoomSummary==='function') ? runRoomSummary : null;
async function runRoomSummary(){
  if(_summaryMode==='room'){return _origRunRoomSummary&&_origRunRoomSummary()}
  /* 거래처(사람) 또는 업체 단위 모드 */
  const isBusiness=(_summaryMode==='business');
  if(isBusiness && !_customerSummaryBusinessId){alert('업체 미선택');return}
  if(!isBusiness && !_customerSummaryUserId){alert('거래처 미선택');return}
  if(_rsGenerating)return;
  _rsGenerating=true;
  const range=_lastSummaryRange||'recent';
  const body=$g('rsBody'), meta=$g('rsMeta');
  let extraQS='', rangeLabel={recent:'최근',week:'최근 7일',month:'이번달',all:'전체'}[range]||range;
  if(range==='custom'){
    const f=$g('rsFrom')?.value||'',t=$g('rsTo')?.value||'';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(f)||!/^\d{4}-\d{2}-\d{2}$/.test(t)){alert('시작·종료일 선택');_rsGenerating=false;return}
    extraQS='&from='+encodeURIComponent(f)+'&to='+encodeURIComponent(t);
    rangeLabel=f+' ~ '+t;
  }
  if(typeof _rsToggleButtons==='function')_rsToggleButtons(true);
  const loadingLabel=isBusiness?'🏢 업체 요약 생성 중...':'🤖 거래처 요약 생성 중...';
  if(body)body.innerHTML='<div style="text-align:center;padding:40px 0;color:#8b95a1"><div style="display:inline-block;width:22px;height:22px;border:3px solid #e5e8eb;border-top-color:#10b981;border-radius:50%;animation:rsSpin .7s linear infinite;vertical-align:middle;margin-right:8px"></div>'+loadingLabel+' (5~20초)</div>';
  if(meta)meta.textContent='';
  try{
    const idQS=isBusiness?('business_id='+_customerSummaryBusinessId):('user_id='+_customerSummaryUserId);
    const r=await fetch('/api/admin-customer-summary?key='+encodeURIComponent(KEY)+'&'+idQS+'&range='+encodeURIComponent(range)+extraQS);
    const d=await r.json();
    if(d.error){
      if(body)body.innerHTML='<div style="padding:30px 20px;text-align:center;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b"><div style="font-size:1.1em;margin-bottom:8px">⚠️ 요약 실패</div><div style="font-size:.85em">'+e(d.error)+'</div></div>';
      return;
    }
    _lastSummaryText=d.summary||'';
    _lastSummaryJson=d.summary_json||null;
    if(_lastSummaryJson){
      body.innerHTML=_renderSummaryJson(_lastSummaryJson);
    } else if(_lastSummaryText){
      body.innerHTML=renderMarkdownLite(_lastSummaryText);
    } else {
      body.innerHTML='<div style="padding:30px 20px;text-align:center;color:#8b95a1">결과가 비어있습니다</div>';
    }
    const actualRange=(d.first_at&&d.last_at)?(' · 🗓️ '+d.first_at+' ~ '+d.last_at):'';
    if(meta)meta.textContent='[거래처 단위 · '+rangeLabel+'] '+e(d.customer_name||'')+' · 방 '+(d.room_count||0)+'개 · 메시지 '+(d.message_count||0)+'건'+actualRange+' · 비용 ₩'+Math.round((d.cost_cents||0)*14);
  }catch(err){
    if(body)body.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(err.message)+'</div>';
  }finally{
    _rsGenerating=false;
    if(typeof _rsToggleButtons==='function')_rsToggleButtons(false);
  }
}
/* closeRoomSummary 모드 리셋은 원본 함수(line 3709)에 직접 넣음 —
   이전에 재선언(function)으로 덮어쓰면서 _origCloseRoomSummary 가
   호이스팅으로 자기 자신을 가리켜 무한 재귀되는 버그가 있었음 */

/* ===== ⚙️ 담당자 라벨 관리 (room_labels CRUD) ===== */
let _roomLabelsCache=null;
let _roomLabelsCacheAt=0;
async function _ensureRoomLabels(force){
  const now=Date.now();
  if(!force && _roomLabelsCache && now-_roomLabelsCacheAt<60000) return _roomLabelsCache;
  try{
    const r=await fetch('/api/admin-room-labels?key='+encodeURIComponent(KEY));
    const d=await r.json();
    _roomLabelsCache=(d.labels||[]).filter(l=>l.active).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    _roomLabelsCacheAt=now;
  }catch(_){_roomLabelsCache=[]}
  return _roomLabelsCache;
}
async function openLabelManageModal(){
  const m=$g('labelManageModal');if(!m)return;
  m.style.display='flex';
  document.body.style.overflow='hidden';
  $g('newLabelName').value='';
  $g('newLabelColor').value='#3182f6';
  await _renderLabelList();
}
function closeLabelManageModal(){
  const m=$g('labelManageModal');if(m)m.style.display='none';
  document.body.style.overflow='';
  /* 라벨 변경됐으면 방 목록 리로드 */
  _ensureRoomLabels(true).then(()=>{if(typeof loadRoomList==='function')loadRoomList()});
}
async function _renderLabelList(){
  const box=$g('labelList');if(!box)return;
  box.innerHTML='<div style="color:#8b95a1;padding:20px 0;text-align:center">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-room-labels?key='+encodeURIComponent(KEY));
    const d=await r.json();
    const labels=d.labels||[];
    if(!labels.length){
      box.innerHTML='<div style="color:#adb5bd;padding:20px 0;text-align:center;font-size:.88em">라벨이 없습니다. 아래에서 첫 라벨을 추가하세요.</div>';
      return;
    }
    box.innerHTML=labels.map(lb=>{
      return '<div data-lid="'+lb.id+'" style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #e5e8eb;border-radius:8px;margin-bottom:6px;background:#fafbfc">'
        +'<span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:'+(lb.color||'#6b7280')+';flex-shrink:0"></span>'
        +'<input type="text" value="'+escAttr(lb.name)+'" onblur="updateLabelName('+lb.id+',this.value)" style="flex:1;padding:5px 8px;border:1px solid #e5e8eb;border-radius:5px;font-size:.85em;font-family:inherit">'
        +'<input type="color" value="'+(lb.color||'#6b7280')+'" onchange="updateLabelColor('+lb.id+',this.value)" style="width:36px;height:30px;border:1px solid #e5e8eb;border-radius:5px;cursor:pointer;padding:1px" title="색 변경">'
        +'<input type="number" value="'+(lb.sort_order||0)+'" onblur="updateLabelSort('+lb.id+',this.value)" title="정렬 순서" style="width:50px;padding:5px;border:1px solid #e5e8eb;border-radius:5px;font-size:.82em;font-family:inherit;text-align:center">'
        +'<button onclick="deleteLabel('+lb.id+')" style="background:none;border:1px solid #f04452;color:#f04452;padding:5px 9px;border-radius:5px;font-size:.78em;cursor:pointer;font-family:inherit">삭제</button>'
        +'</div>';
    }).join('');
  }catch(err){box.innerHTML='<div style="color:#f04452">오류: '+e(err.message)+'</div>'}
}
async function addLabel(){
  const name=($g('newLabelName')?.value||'').trim();
  const color=($g('newLabelColor')?.value||'#3182f6');
  if(!name){alert('라벨 이름을 입력하세요');return}
  try{
    const r=await fetch('/api/admin-room-labels?key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,color})
    });
    const d=await r.json();
    if(!d.ok){alert('추가 실패: '+(d.error||'unknown'));return}
    $g('newLabelName').value='';
    _roomLabelsCache=null;
    await _renderLabelList();
  }catch(err){alert('오류: '+err.message)}
}
async function updateLabelName(id, name){
  name=String(name||'').trim();if(!name)return;
  try{
    await fetch('/api/admin-room-labels?key='+encodeURIComponent(KEY)+'&id='+id,{
      method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})
    });
    _roomLabelsCache=null;
  }catch(_){}
}
async function updateLabelColor(id, color){
  try{
    await fetch('/api/admin-room-labels?key='+encodeURIComponent(KEY)+'&id='+id,{
      method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({color})
    });
    _roomLabelsCache=null;
    await _renderLabelList();
  }catch(_){}
}
async function updateLabelSort(id, sort_order){
  const n=Number(sort_order);if(!Number.isFinite(n))return;
  try{
    await fetch('/api/admin-room-labels?key='+encodeURIComponent(KEY)+'&id='+id,{
      method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({sort_order:n})
    });
    _roomLabelsCache=null;
    await _renderLabelList();
  }catch(_){}
}
async function deleteLabel(id){
  if(!confirm('이 라벨을 삭제할까요?\n(사용중이면 해당 방은 미분류로 전환됩니다)'))return;
  try{
    let r=await fetch('/api/admin-room-labels?key='+encodeURIComponent(KEY)+'&id='+id,{method:'DELETE'});
    let d=await r.json();
    if(!d.ok && d.in_use){
      if(!confirm(d.in_use+'개 방에서 사용중입니다. 강제 삭제하시겠습니까?'))return;
      r=await fetch('/api/admin-room-labels?key='+encodeURIComponent(KEY)+'&id='+id+'&force=1',{method:'DELETE'});
      d=await r.json();
    }
    if(!d.ok){alert('삭제 실패: '+(d.error||'unknown'));return}
    _roomLabelsCache=null;
    await _renderLabelList();
  }catch(err){alert('오류: '+err.message)}
}

/* ===== 🏢 거래처 간략 사이드 패널 =====
   거래처 버튼 클릭 시 메모 패널처럼 우측에 도킹 (PC) / 바텀시트 (모바일).
   내용: 이름·전화·업종·최근 노트 3건·진행중 Case·할 일 N건 / [자세히 →] 풀 대시보드 */
let _csCurrentUserId=null;
async function openCustSidePanel(userId){
  if(!userId)return;
  _csCurrentUserId=userId;
  const modal=$g('custSidePanel');if(!modal)return;
  modal.classList.add('side-dock');
  modal.style.display='flex';
  document.body.classList.add('cust-side-open');
  if(window.matchMedia('(max-width:1023px)').matches)document.body.style.overflow='hidden';
  else document.body.style.overflow='';
  $g('csName').textContent='불러오는 중...';
  $g('csSub').textContent='';
  $g('csBody').innerHTML='<div style="text-align:center;color:#8b95a1;padding:30px 0">불러오는 중...</div>';
  try{
    const q=(p)=>'/api/'+p+(p.includes('?')?'&':'?')+'key='+encodeURIComponent(KEY);
    const [custRes, infoRes, filingsRes, memosRes] = await Promise.all([
      fetch(q('admin-approve?status=all')).then(r=>r.json()).catch(()=>({users:[]})),
      fetch(q('memos?scope=customer_info&user_id='+userId)).then(r=>r.json()).catch(()=>({memos:[]})),
      fetch(q('tax-filings?user_id='+userId+'&status=active')).then(r=>r.json()).catch(()=>({filings:[]})),
      fetch(q('memos?scope=my&only_mine=0')).then(r=>r.json()).catch(()=>({memos:[]})),
    ]);
    const u=(custRes.users||[]).find(x=>x.id===userId);
    const nm=u?(u.real_name||u.name||'#'+userId):'#'+userId;
    $g('csName').textContent=nm;
    $g('csSub').textContent=(u?((u.phone||'연락처 미등록')):'ID #'+userId);
    /* 이 거래처 관련 미완료 할 일 (본인 방 필터는 간략화 — 전체 에서 user 매칭 어려우니 생략) */
    const activeFilings=filingsRes.filings||[];
    const infoMemos=(infoRes.memos||[]).slice(0,4);
    const _filingIcon=(t)=>({'부가세':'💰','종소세':'📊','법인세':'🏢','원천세':'💼','양도세':'🏠'})[t]||'📄';
    function _dday(due){
      if(!due)return '';
      const today=new Date(Date.now()+9*60*60*1000).toISOString().substring(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(due))return '';
      const diff=Math.round((new Date(due+'T00:00:00')-new Date(today+'T00:00:00'))/86400000);
      let c='#64748b',lab='';
      if(diff<0){c='#991b1b';lab='D+'+(-diff)}
      else if(diff===0){c='#dc2626';lab='D-DAY'}
      else if(diff<=3){c='#ea580c';lab='D-'+diff}
      else if(diff<=7){c='#b45309';lab='D-'+diff}
      else {c='#059669';lab='D-'+diff}
      return '<span style="background:'+c+';color:#fff;padding:1px 6px;border-radius:8px;font-size:.68em;font-weight:700;margin-left:4px">'+lab+'</span>';
    }
    let html='';
    /* 기본 정보 */
    html+='<section style="margin-bottom:14px">'
      +'<div style="font-weight:700;font-size:.9em;margin-bottom:5px;color:#191f28">👤 기본</div>'
      +'<div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:9px 11px;font-size:.85em;line-height:1.6;color:#0f172a">'
      +'<div><b>'+e(nm)+'</b></div>'
      +(u&&u.phone?'<div>📞 '+e(u.phone)+'</div>':'<div style="color:#8b95a1">📞 연락처 미등록</div>')
      +(u&&u.email?'<div>✉️ '+e(u.email)+'</div>':'')
      +(u?('<div style="font-size:.85em;color:#4b5563;margin-top:3px">'+(u.approval_status==='approved_client'?'🏢 기장거래처':u.approval_status==='approved_guest'?'✅ 일반':'⏳ '+(u.approval_status||'pending'))+'</div>'):'')
      +'</div></section>';
    /* 거래처 노트 */
    html+='<section style="margin-bottom:14px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">'
      +'<div style="font-weight:700;font-size:.9em;color:#1e40af">🏢 거래처 노트 <span style="font-size:.72em;color:#8b95a1;font-weight:500;margin-left:3px">('+infoMemos.length+')</span></div>'
      +'</div>';
    if(!infoMemos.length){
      html+='<div style="background:#f9fafb;border:1px dashed #e5e8eb;border-radius:8px;padding:8px 10px;color:#adb5bd;font-size:.82em">기본 정보 없음 — 자세히 화면에서 추가</div>';
    } else {
      html+='<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 10px">'
        +infoMemos.map(m=>'<div style="padding:3px 0;font-size:.85em;color:#1e3a8a;white-space:pre-wrap;word-break:break-word;line-height:1.5">• '+e(m.content||'')+'</div>').join('')
        +'</div>';
    }
    html+='</section>';
    /* 진행중 신고 Case */
    html+='<section style="margin-bottom:14px">'
      +'<div style="font-weight:700;font-size:.9em;margin-bottom:5px;color:#065f46">📅 진행중 신고 <span style="font-size:.72em;color:#8b95a1;font-weight:500">('+activeFilings.length+')</span></div>';
    if(!activeFilings.length){
      html+='<div style="background:#f9fafb;border:1px dashed #e5e8eb;border-radius:8px;padding:8px 10px;color:#adb5bd;font-size:.82em">진행중인 신고 Case 없음</div>';
    } else {
      html+=activeFilings.slice(0,5).map(f=>{
        const items=f.items||[];const done=items.filter(i=>i.is_checked).length;const total=items.length;
        const pct=total>0?Math.round(done/total*100):0;
        return '<div style="background:#ecfdf5;border:1px solid #86efac;border-radius:8px;padding:7px 10px;margin-bottom:5px;display:flex;align-items:center;gap:6px;font-size:.85em">'
          +'<span>'+_filingIcon(f.filing_type)+'</span>'
          +'<span style="font-weight:600">'+e(f.filing_type)+' · '+e(f.period)+'</span>'
          +_dday(f.due_date)
          +'<span style="margin-left:auto;color:#4b5563;font-size:.88em">'+done+'/'+total+' ('+pct+'%)</span>'
          +'</div>';
      }).join('');
    }
    html+='</section>';
    /* 안내 */
    html+='<div style="font-size:.75em;color:#8b95a1;margin-top:6px;line-height:1.5">전체 할 일·요약 이력·문서·재무 등은 상단 <b>자세히 →</b> 버튼으로 풀 대시보드에서 확인하세요.</div>';
    $g('csBody').innerHTML=html;
  }catch(err){
    $g('csBody').innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(err.message)+'</div>';
  }
}
function closeCustSidePanel(){
  const m=$g('custSidePanel');if(m){m.style.display='none';m.classList.remove('side-dock')}
  document.body.classList.remove('cust-side-open');
  document.body.style.overflow='';
}
function _csOpenFull(){
  const uid=_csCurrentUserId;
  if(!uid)return;
  closeCustSidePanel();
  setTimeout(()=>{if(typeof openCustomerDashboard==='function')openCustomerDashboard(uid)},120);
}

/* ===== 거래처 서류 확인 (신분증·사업자등록증·홈택스 ID) ===== */
async function openBizDocsPanel(){
  if(!docsSelectedUserId){alert('거래처를 먼저 선택하세요');return}
  const cust=docsCustomers.find(c=>c.user_id===docsSelectedUserId);
  $g('bdTitle').textContent=cust?(cust.real_name||cust.name||('#'+docsSelectedUserId)):('#'+docsSelectedUserId);
  $g('bizDocsModal').style.display='flex';
  document.body.style.overflow='hidden';
  const body=$g('bdBody');
  body.innerHTML='<div style="text-align:center;color:#8b95a1;padding:30px 0">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-biz-docs?key='+encodeURIComponent(KEY)+'&user_id='+docsSelectedUserId);
    const d=await r.json();
    if(d.error){body.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(d.error)+'</div>';return}
    if(!(d.businesses||[]).length){
      body.innerHTML='<div style="text-align:center;color:#8b95a1;padding:40px 0">등록된 사업장이 없습니다. 먼저 거래처 사업장을 등록해주세요.</div>';
      return;
    }
    body.innerHTML=d.businesses.map(b=>renderBizDocCard(b)).join('');
  }catch(err){body.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(err.message)+'</div>'}
}
function closeBizDocsPanel(){
  $g('bizDocsModal').style.display='none';
  document.body.style.overflow='';
}
function renderBizDocCard(b){
  const keyq='&key='+encodeURIComponent(KEY);
  const primaryBadge=b.is_primary?' <span style="background:#fef3c7;color:#92400e;font-size:.7em;padding:2px 6px;border-radius:6px;font-weight:700">⭐ 주사업장</span>':'';
  const bn=b.business_number?b.business_number:'';
  const bnFmt=bn&&bn.length===10?bn.slice(0,3)+'-'+bn.slice(3,5)+'-'+bn.slice(5):bn;
  const idCard=b.docs.id_card;
  const bizReg=b.docs.biz_reg;
  const hometax=b.docs.hometax;
  function imgCell(label, info, url){
    if(info.uploaded){
      const fullUrl=url+keyq;
      return `<div style="flex:1;min-width:150px">
        <div style="font-size:.78em;font-weight:700;color:#065f46;margin-bottom:4px">✅ ${label}</div>
        <div style="position:relative;aspect-ratio:1/1;max-width:160px;background:#f3f4f6;border-radius:8px;overflow:hidden;cursor:zoom-in" onclick="openImgViewer('${fullUrl}',['${fullUrl}'])">
          <img src="${fullUrl}" alt="${label}" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.style.display='none';this.parentNode.innerHTML+='<div style=&quot;padding:20px;text-align:center;color:#8b95a1;font-size:.8em&quot;>PDF 또는 미리보기 불가<br><a href=&quot;${fullUrl}&quot; target=_blank style=&quot;color:#3182f6&quot;>열기</a></div>'">
        </div>
        <div style="font-size:.7em;color:#8b95a1;margin-top:3px">업로드: ${e(info.at||'-')}</div>
      </div>`;
    }
    return `<div style="flex:1;min-width:150px">
      <div style="font-size:.78em;font-weight:700;color:#991b1b;margin-bottom:4px">⚠️ ${label}</div>
      <div style="aspect-ratio:1/1;max-width:160px;background:#fef2f2;border:1px dashed #fca5a5;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#991b1b;font-size:.8em">미등록</div>
    </div>`;
  }
  return `<div style="border:1px solid #e5e8eb;border-radius:12px;padding:14px;margin-bottom:14px;background:#fafafa">
    <div style="font-weight:700;font-size:1em;margin-bottom:4px">${e(b.company_name||'사업장 #'+b.id)}${primaryBadge}</div>
    <div style="font-size:.78em;color:#8b95a1;margin-bottom:12px">${e(b.ceo_name||'')} ${bnFmt?'· 사업자 '+e(bnFmt):''}</div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px">
      ${imgCell('🪪 신분증', idCard, idCard.image_url||'')}
      ${imgCell('📋 사업자등록증', bizReg, bizReg.image_url||'')}
    </div>
    <div style="padding:10px 12px;background:#fff;border:1px solid #e5e8eb;border-radius:8px">
      <div style="font-size:.78em;color:#8b95a1;margin-bottom:3px">🏛️ 홈택스 ID</div>
      <div style="font-weight:600;font-size:.92em">${hometax.saved?e(hometax.hometax_id):'<span style="color:#991b1b">미등록</span>'}</div>
      ${hometax.saved&&hometax.at?'<div style="font-size:.7em;color:#8b95a1;margin-top:2px">업데이트: '+e(hometax.at)+'</div>':''}
      <div style="font-size:.7em;color:#8b95a1;margin-top:6px">※ 비밀번호는 앱에 저장되지 않습니다. 거래처에게 별도 전달 요청.</div>
    </div>
  </div>`;
}

/* ===== 거래처 재무 데이터 (매출/매입/세금) ===== */
let _finCurrentUserId=null;
let _finRows=[];
async function openFinancePanel(){
  if(!docsSelectedUserId){alert('거래처를 먼저 선택하세요');return}
  _finCurrentUserId=docsSelectedUserId;
  const cust=docsCustomers.find(c=>c.user_id===_finCurrentUserId);
  $g('finCustName').textContent=cust?(cust.real_name||cust.name||('#'+_finCurrentUserId)):('#'+_finCurrentUserId);
  $g('financeModal').style.display='flex';
  document.body.style.overflow='hidden';
  await loadFinanceRows();
}
function closeFinancePanel(){
  $g('financeModal').style.display='none';
  document.body.style.overflow='';
}
async function loadFinanceRows(){
  const body=$g('finBody');
  body.innerHTML='<div style="text-align:center;color:#8b95a1;padding:30px 0">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-finance?key='+encodeURIComponent(KEY)+'&user_id='+_finCurrentUserId);
    const d=await r.json();
    if(d.error){body.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(d.error)+'</div>';return}
    _finRows=d.rows||[];
    if(!_finRows.length){
      body.innerHTML='<div style="text-align:center;color:#8b95a1;padding:50px 0;font-size:.88em">'
        +'재무 데이터가 없습니다. <b>+ 항목 추가</b>로 직접 입력하거나,<br>'
        +'<code style="background:#f9fafb;padding:2px 6px;border-radius:4px">finance_pdfs/'+_finCurrentUserId+'/</code> 폴더에 PDF 푸시 후<br>'
        +'세무사님이 Claude한테 "거래처 PDF 처리해줘 [거래처명]" 요청하시면 자동 입력됩니다.'
        +'</div>';
      return;
    }
    const fmt=n=>n==null?'-':(Number(n)||0).toLocaleString('ko-KR');
    const ptLabel={monthly:'월',quarterly:'분기',yearly:'연',vat_period:'부가세'};
    body.innerHTML='<table style="width:100%;border-collapse:collapse;font-size:.82em">'
      +'<thead style="background:#f9fafb;position:sticky;top:0">'
      +'<tr>'
      +'<th style="padding:8px;text-align:left;border-bottom:1px solid #e5e8eb">기간</th>'
      +'<th style="padding:8px;text-align:right;border-bottom:1px solid #e5e8eb">매출</th>'
      +'<th style="padding:8px;text-align:right;border-bottom:1px solid #e5e8eb">매입</th>'
      +'<th style="padding:8px;text-align:right;border-bottom:1px solid #e5e8eb">부가세</th>'
      +'<th style="padding:8px;text-align:right;border-bottom:1px solid #e5e8eb">소득세</th>'
      +'<th style="padding:8px;text-align:right;border-bottom:1px solid #e5e8eb">인건비</th>'
      +'<th style="padding:8px;text-align:left;border-bottom:1px solid #e5e8eb">출처</th>'
      +'<th style="padding:8px;border-bottom:1px solid #e5e8eb"></th>'
      +'</tr></thead><tbody>'
      +_finRows.map(r=>{
        const src=r.source==='pdf'?'📄 PDF':(r.source==='wehago'?'📊 위하고':'✏️ 수동');
        return '<tr style="border-bottom:1px solid #f2f4f6">'
          +'<td style="padding:7px 8px;font-weight:600">'+e(r.period)+' <span style="font-size:.85em;color:#8b95a1">('+(ptLabel[r.period_type]||r.period_type||'')+')</span></td>'
          +'<td style="padding:7px 8px;text-align:right">'+fmt(r.revenue)+'</td>'
          +'<td style="padding:7px 8px;text-align:right">'+fmt(r.cost)+'</td>'
          +'<td style="padding:7px 8px;text-align:right;color:#dc2626">'+fmt(r.vat_payable)+'</td>'
          +'<td style="padding:7px 8px;text-align:right;color:#dc2626">'+fmt(r.income_tax)+'</td>'
          +'<td style="padding:7px 8px;text-align:right">'+fmt(r.payroll_total)+'</td>'
          +'<td style="padding:7px 8px;font-size:.85em;color:#8b95a1">'+src+'</td>'
          +'<td style="padding:7px 8px;text-align:right"><button onclick="openFinanceEditRow('+r.id+')" style="background:#e5e8eb;border:none;padding:3px 9px;border-radius:5px;font-size:.85em;cursor:pointer;font-family:inherit">수정</button></td>'
          +'</tr>';
      }).join('')
      +'</tbody></table>';
  }catch(err){body.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(err.message)+'</div>'}
}
function _finFillForm(row){
  $g('finRowId').value=row?row.id:'';
  $g('finPeriod').value=row?row.period||'':'';
  $g('finPeriodType').value=row?row.period_type||'monthly':'monthly';
  $g('finRevenue').value=row?(row.revenue==null?'':row.revenue):'';
  $g('finCost').value=row?(row.cost==null?'':row.cost):'';
  $g('finVatPayable').value=row?(row.vat_payable==null?'':row.vat_payable):'';
  $g('finVatInput').value=row?(row.vat_input==null?'':row.vat_input):'';
  $g('finVatOutput').value=row?(row.vat_output==null?'':row.vat_output):'';
  $g('finIncomeTax').value=row?(row.income_tax==null?'':row.income_tax):'';
  $g('finTaxableIncome').value=row?(row.taxable_income==null?'':row.taxable_income):'';
  $g('finPayrollTotal').value=row?(row.payroll_total==null?'':row.payroll_total):'';
  $g('finNotes').value=row?row.notes||'':'';
  $g('finRowTitle').textContent=row?'재무 항목 수정 — '+row.period:'재무 항목 추가';
  $g('finDelBtn').style.display=row?'inline-block':'none';
  $g('finRowModal').style.display='flex';
}
function openFinanceAddRow(){
  if(!_finCurrentUserId){alert('거래처가 선택되지 않았습니다');return}
  const today=new Date(Date.now()+9*60*60*1000);
  const yyyymm=today.getUTCFullYear()+'-'+String(today.getUTCMonth()+1).padStart(2,'0');
  _finFillForm(null);
  $g('finPeriod').value=yyyymm;
}
function openFinanceEditRow(id){
  const row=_finRows.find(x=>x.id===id);
  if(!row){alert('항목을 찾을 수 없습니다');return}
  _finFillForm(row);
}
function closeFinanceRow(){$g('finRowModal').style.display='none'}
async function saveFinanceRow(){
  const period=$g('finPeriod').value.trim();
  if(!period){alert('기간(예: 2026-04, 2026-Q1, 2026)을 입력해 주세요');return}
  const id=$g('finRowId').value;
  const num=v=>{const t=v.trim();if(!t)return null;const n=parseInt(t.replace(/[^\d-]/g,''),10);return isNaN(n)?null:n};
  const body={
    user_id:_finCurrentUserId,
    period:period,
    period_type:$g('finPeriodType').value||'monthly',
    revenue:num($g('finRevenue').value),
    cost:num($g('finCost').value),
    vat_payable:num($g('finVatPayable').value),
    vat_input:num($g('finVatInput').value),
    vat_output:num($g('finVatOutput').value),
    income_tax:num($g('finIncomeTax').value),
    taxable_income:num($g('finTaxableIncome').value),
    payroll_total:num($g('finPayrollTotal').value),
    notes:$g('finNotes').value.trim()||null,
    source:'manual',
  };
  try{
    const r=await fetch('/api/admin-finance?key='+encodeURIComponent(KEY)+'&action=upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json();
    if(!d.ok){alert('저장 실패: '+(d.error||'unknown'));return}
    closeFinanceRow();
    loadFinanceRows();
  }catch(err){alert('오류: '+err.message)}
}
async function deleteFinanceRow(){
  const id=$g('finRowId').value;
  if(!id)return;
  if(!confirm('이 항목을 삭제하시겠어요?'))return;
  try{
    const r=await fetch('/api/admin-finance?key='+encodeURIComponent(KEY)+'&action=delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:Number(id)})});
    const d=await r.json();
    if(!d.ok){alert('삭제 실패: '+(d.error||'unknown'));return}
    closeFinanceRow();
    loadFinanceRows();
  }catch(err){alert('오류: '+err.message)}
}

/* 간단 마크다운 렌더 (## 헤더, - 리스트, 볼드) */
function renderMarkdownLite(md){
  if(!md)return '';
  return md
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^## (.+)$/gm,'<h3 style="font-size:1.05em;font-weight:800;margin:18px 0 6px;color:#191f28">$1</h3>')
    .replace(/^\s*- (.+)$/gm,'<li style="margin-left:20px">$1</li>')
    .replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')
    .replace(/---+/g,'<hr style="border:0;border-top:1px solid #e5e8eb;margin:10px 0">')
    .replace(/\n\n/g,'<br><br>')
    .replace(/\n/g,'<br>');
}

async function runDocsHealthCheck(){
  if(!confirm('초기 버그로 원본이 손상된 영수증을 스캔합니다 (최근 30일).\n\n스캔만 먼저 할까요?'))return;
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=health_check');
    const d=await r.json();
    if(d.error){alert('실패: '+d.error);return}
    if(d.broken===0){alert('✅ 손상된 문서 없습니다.\n\n스캔: '+d.scanned+'건');return}
    if(!confirm(`⚠️ 손상 문서 ${d.broken}건 발견 (스캔 ${d.scanned}건 중)\n\n자동 처리:\n- 해당 문서를 '반려' 상태로 변경\n- 각 상담방에 "재업로드 요청" 알림 메시지 전송\n\n계속할까요?`))return;
    const r2=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=health_check&fix=1');
    const d2=await r2.json();
    alert('✅ 처리 완료\n\n손상: '+d2.broken+'건 / 반려+알림 전송: '+d2.fixed+'건');
    loadDocsTab();
  }catch(e){alert('오류: '+e.message)}
}

async function loadDocsTab(){
  // 거래처 목록 항상 로드 (좌측 패널)
  loadDocsCustomers();
  loadDocsAlerts();

  const userId=$g('docsFilterUser').value.trim();
  // 거래처 미선택 시 우측 패널 빈 상태
  if(!userId){
    renderDocsTable([]);
    updateDocsStats({});
    return;
  }

  const status=$g('docsFilterStatus').value;
  const docType=$g('docsFilterType').value;
  const month=$g('docsFilterMonth').value;
  const params=['key='+encodeURIComponent(KEY)];
  if(status)params.push('status='+encodeURIComponent(status));
  if(docType)params.push('doc_type='+encodeURIComponent(docType));
  if(month)params.push('month='+encodeURIComponent(month));
  params.push('user_id='+encodeURIComponent(userId));
  params.push('limit=300');
  try{
    const r=await fetch('/api/admin-documents?'+params.join('&'));
    const d=await r.json();
    if(d.error){alert('조회 실패: '+d.error);return}
    renderDocsTable(d.documents||[]);
    updateDocsStats(d.counts||{});
    const monthParam=month||new Date().toISOString().substring(0,7);
    fetchDocsStats(monthParam);
  }catch(e){alert('오류: '+e.message)}
}

async function fetchDocsStats(month){
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=stats&month='+encodeURIComponent(month));
    const d=await r.json();
    if(d.usage){
      $g('docsStatCost').textContent='₩'+(d.usage.cost_krw||0).toLocaleString('ko-KR')+' ('+(d.usage.calls||0)+'회)';
    }
  }catch{}
}

function updateDocsStats(counts){
  const p=counts.pending||0, a=counts.approved||0, r=counts.rejected||0;
  $g('docsStatPending').textContent=p;
  $g('docsStatApproved').textContent=a;
  $g('docsStatRejected').textContent=r;
  $g('docsStatTotal').textContent=(p+a+r);
  const b=$g('docsPendingBadge');
  if(b&&b.style){
    if(p>0){b.style.display='inline-block';b.textContent=p}
    else b.style.display='none';
  }
}

/* AG-Grid 엑셀 스타일 그리드 — 문서 목록 (문서 타입별 탭) */
let docsGridApi=null;
let docsCurrentType='all'; // 선택된 문서 타입 탭
let docsRawList=[];        // 전체 원본 (거래처의 모든 문서)

// 타입별 탭 정의 — [key, 라벨, 아이콘]
const DOC_TYPE_TABS = [
  ['all',                '전체',           '📋'],
  ['receipt',            '영수증',          '🧾'],
  ['tax_invoice',        '세금계산서',       '📑'],
  ['lease',              '임대차',          '🏠'],
  ['insurance',          '보험',            '🛡️'],
  ['utility',            '공과금',          '💧'],
  ['property_tax',       '지방세',          '🚗'],
  ['payroll',            '근로(4대보험)',    '👥'],
  ['freelancer_payment', '프리랜서(3.3%)',  '🧑‍💼'],
  ['bank_stmt',          '은행',            '🏦'],
  ['business_reg',       '사업자등록',       '📋'],
  ['identity',           '신분증',          '🪪'],
  ['contract',           '계약',            '📝'],
  ['other',              '기타',            '📄'],
];

// 공통 컬럼 (모든 타입 앞·뒤 공통)
const DOC_TYPE_KEYS = ['receipt','tax_invoice','lease','insurance','utility','property_tax','payroll','freelancer_payment','bank_stmt','business_reg','identity','contract','other'];

/* approved 면 잠금, pending/rejected 면 편집 가능 */
function _docEditable(p){ return p.data.status !== 'approved'; }

function commonColsLeft(){
  return [
    { headerCheckboxSelection:true, checkboxSelection:true, width:40, pinned:'left', filter:false, sortable:false, resizable:false },
    { headerName:'일자', field:'date', width:115, pinned:'left', filter:'agDateColumnFilter',
      editable: _docEditable,
      valueSetter: p => {
        // 일자 편집 시 receipt_date 도 함께 저장되도록 매핑
        p.data.date = p.newValue;
        p.data.receipt_date = p.newValue;
        return true;
      }
    },
    { headerName:'타입', field:'doc_type', width:130,
      editable: _docEditable,
      cellEditor:'agSelectCellEditor',
      cellEditorParams:{ values: DOC_TYPE_KEYS },
      valueFormatter: p => docTypeLabelAdmin(p.value),
      cellStyle: p => !_docEditable(p) ? { color:'#8b95a1' } : {}
    },
  ];
}
function commonColsRight(){
  return [
    {
      headerName:'신뢰도', field:'confidence', width:80,
      valueFormatter: p => p.value!=null ? p.value+'%' : '-',
      cellStyle: p => p.value!=null && p.value<70 ? { color:'#d97706', fontWeight:'700', textAlign:'center' } : { color:'#10b981', fontWeight:'700', textAlign:'center' }
    },
    {
      headerName:'상태', field:'status', width:90, filter:true,
      cellRenderer: p => {
        const map={pending:{t:'⏳ 대기',bg:'#fef3c7',fg:'#92400e'},approved:{t:'✅ 승인',bg:'#d1fae5',fg:'#065f46'},rejected:{t:'❌ 반려',bg:'#fee2e2',fg:'#991b1b'}};
        const x=map[p.value]||map.pending;
        return `<span style="display:inline-block;padding:2px 7px;border-radius:6px;background:${x.bg};color:${x.fg};font-size:.8em;font-weight:700">${x.t}</span>`;
      }
    },
    { headerName:'메모', field:'note', flex:1, minWidth:150,
      editable:true, cellEditor:'agLargeTextCellEditor',
      cellStyle: p => p.value ? { background:'#fffbeb' } : {} },
    {
      headerName:'원본', field:'image_key', width:60, sortable:false, filter:false,
      cellRenderer: p => `<button onclick="openImgViewer('/api/image?k=${encodeURIComponent(p.value)}',['/api/image?k=${encodeURIComponent(p.value)}'])" style="background:#f2f4f6;border:none;padding:3px 8px;border-radius:6px;font-size:.85em;cursor:pointer;font-family:inherit">📷</button>`
    },
    {
      headerName:'액션', width:260, sortable:false, filter:false, pinned:'right',
      cellRenderer: p => {
        const d=p.data;
        const base='padding:3px 6px;border-radius:5px;font-size:.74em;cursor:pointer;font-family:inherit;margin-right:2px;white-space:nowrap';
        let h='';
        if(d.status==='pending'){
          h+=`<button onclick="approveDocById(${d.id})" title="승인" style="background:#10b981;color:#fff;border:none;${base};font-weight:700">✅</button>`;
          h+=`<button onclick="rejectDocPrompt(${d.id})" title="반려" style="background:#fff;color:#f04452;border:1px solid #f04452;${base};font-weight:700">❌</button>`;
        } else if(d.status==='approved'){
          h+=`<button onclick="revertDocApproval(${d.id})" title="승인 취소" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;${base};font-weight:700">↺</button>`;
        } else if(d.status==='rejected'){
          h+=`<button onclick="approveDocById(${d.id})" title="복원" style="background:#10b981;color:#fff;border:none;${base};font-weight:700">✅</button>`;
        }
        /* 변환 버튼 (승인된 것 제외) */
        if(d.status!=='approved'){
          h+=`<button onclick="revertDocToPhotoAdmin(${d.id})" title="일반 사진으로 변환" style="background:#fff;color:#3182f6;border:1px solid #3182f6;${base}">📷</button>`;
          h+=`<button onclick="convertDocToFileAdmin(${d.id})" title="일반 파일로 변환" style="background:#fff;color:#3182f6;border:1px solid #3182f6;${base}">📁</button>`;
        }
        /* 완전 삭제 */
        h+=`<button onclick="deleteDocAdmin(${d.id})" title="완전 삭제 (R2 포함)" style="background:#fff;color:#dc2626;border:1px solid #dc2626;${base}">🗑️</button>`;
        return h;
      }
    },
  ];
}

// 타입별 중간 컬럼
function colsForType(type){
  const amtCol = (name, field) => ({
    headerName:name, field, width:115, type:'numericColumn',
    editable: _docEditable,
    valueFormatter: p => p.value!=null ? (Number(p.value)||0).toLocaleString('ko-KR') : '-',
    cellStyle: { fontWeight:'600', textAlign:'right' }
  });
  const dateCol = (name, field) => ({
    headerName:name, field, width:115,
    editable: _docEditable
  });
  const textCol = (name, field, w=140) => ({
    headerName:name, field, width:w, filter:true,
    editable: _docEditable
  });

  switch(type){
    case 'receipt':
      return [
        textCol('가맹점','vendor',160),
        textCol('사업자번호','vendor_biz_no',120),
        amtCol('금액','amount'),
        amtCol('부가세','vat_amount'),
        { headerName:'카테고리', field:'category', width:105, editable:p=>p.data.status==='pending',
          cellEditor:'agSelectCellEditor',
          cellEditorParams:{ values:['','식비','교통비','숙박비','소모품비','접대비','통신비','공과금','임대료','보험료','기타'] } },
      ];
    case 'tax_invoice':
      return [
        textCol('공급자','ex_supplier',140),
        textCol('공급받는자','ex_buyer',130),
        amtCol('공급가액','ex_supply_amount'),
        amtCol('세액','ex_tax_amount'),
        textCol('품목','ex_items_preview',150),
      ];
    case 'lease':
      return [
        textCol('임대인','ex_lessor',110),
        textCol('임차인','ex_lessee',110),
        textCol('물건지','ex_property_address',200),
        amtCol('보증금','ex_deposit'),
        amtCol('월세','ex_monthly_rent'),
        amtCol('관리비','ex_maintenance_fee'),
        dateCol('시작일','ex_start_date'),
        dateCol('만료일','ex_end_date'),
      ];
    case 'insurance':
      return [
        textCol('보험사','ex_insurer',120),
        textCol('보험종류','ex_insurance_type',130),
        textCol('증권번호','ex_policy_no',130),
        amtCol('보험료','ex_premium'),
        { headerName:'납부주기', field:'ex_payment_cycle', width:100, editable:p=>p.data.status==='pending',
          cellEditor:'agSelectCellEditor', cellEditorParams:{ values:['','lump','monthly','annual'] } },
        dateCol('만기일','ex_end_date'),
      ];
    case 'utility':
      return [
        { headerName:'공과금', field:'ex_utility_type', width:100, editable:p=>p.data.status==='pending',
          cellEditor:'agSelectCellEditor', cellEditorParams:{ values:['','electric','water','gas','internet','phone','other'] } },
        textCol('고객번호','ex_customer_no',120),
        textCol('사용량','ex_usage',100),
        textCol('사용기간','ex_billing_period',140),
        amtCol('청구금액','amount'),
        dateCol('납부기한','ex_due_date'),
      ];
    case 'property_tax':
      return [
        textCol('세목','ex_tax_name',130),
        textCol('귀속연도','ex_tax_year',100),
        amtCol('세액','amount'),
        dateCol('납부기한','ex_due_date'),
        textCol('고지번호','ex_notice_no',130),
      ];
    case 'payroll':
      return [
        textCol('근로자','ex_employee_name',110),
        textCol('사업주','ex_employer',130),
        dateCol('입사일','ex_start_date'),
        amtCol('월급','ex_monthly_salary'),
        textCol('근무시간','ex_work_hours',130),
      ];
    case 'bank_stmt':
      return [
        textCol('계좌(뒷4)','ex_account_no',110),
        textCol('조회기간','ex_period',150),
        { headerName:'건수', field:'ex_transaction_count', width:80, type:'numericColumn' },
      ];
    case 'business_reg':
      return [
        textCol('상호','ex_business_name',150),
        textCol('사업자번호','ex_registration_no',130),
        textCol('대표자','ex_representative',100),
        textCol('업태','ex_business_type',120),
        textCol('종목','ex_business_category',120),
        dateCol('개업일','ex_open_date'),
      ];
    case 'identity':
      return [
        textCol('구분','ex_id_type',120),
        textCol('성명','ex_full_name',100),
        textCol('은행','ex_bank_name',100),
        textCol('계좌(마스킹)','ex_account_no_masked',150),
      ];
    case 'contract':
      return [
        textCol('갑','ex_party_a',130),
        textCol('을','ex_party_b',130),
        textCol('계약내용','ex_contract_subject',200),
        amtCol('계약금액','ex_contract_amount'),
        dateCol('시작일','ex_start_date'),
        dateCol('종료일','ex_end_date'),
      ];
    case 'all':
    default:
      return [
        textCol('가맹점/업체','vendor',160),
        amtCol('금액','amount'),
        { headerName:'카테고리', field:'category', width:100 },
      ];
  }
}

// rowData 변환 — extra JSON 펼치기
function buildRowData(docs){
  return docs.map(d => {
    let ex = {};
    try { ex = d.extra ? JSON.parse(d.extra) : {}; } catch {}
    const row = {
      id: d.id,
      date: d.receipt_date || (d.created_at||'').substring(0,10),
      doc_type: d.doc_type,
      doc_type_label: docTypeLabelAdmin(d.doc_type),
      user_id: d.user_id,
      user_name: d.real_name || d.name || ('#'+d.user_id),
      vendor: d.vendor || '',
      vendor_biz_no: d.vendor_biz_no || '',
      amount: d.amount,
      vat_amount: d.vat_amount,
      category: d.category || '',
      confidence: d.ocr_confidence!=null ? Math.round(d.ocr_confidence*100) : null,
      status: d.status,
      image_key: d.image_key,
      note: d.note || '',
      created_at: d.created_at,
    };
    // ex.* 를 ex_* 로 펼침
    for (const k in ex) {
      const v = ex[k];
      if (Array.isArray(v)) row['ex_'+k+'_preview'] = v.slice(0,3).join(', ');
      else row['ex_'+k] = v;
    }
    return row;
  });
}

function renderDocsTypeTabs(){
  const el = $g('docsTypeTabs');
  if(!el || !el.innerHTML === undefined)return;
  const counts = {};
  for(const d of docsRawList){ counts[d.doc_type] = (counts[d.doc_type]||0)+1; }
  const visibleTabs = DOC_TYPE_TABS.filter(([k])=>k==='all'||counts[k]>0);
  el.innerHTML = visibleTabs.map(([k,label,icon])=>{
    const c = k==='all' ? docsRawList.length : (counts[k]||0);
    const on = k===docsCurrentType;
    const bg = on ? '#3182f6' : 'transparent';
    const fg = on ? '#fff' : '#6b7684';
    const fw = on ? '700' : '500';
    return `<button onclick="setDocsTypeTab('${k}')" style="background:${bg};color:${fg};border:none;padding:7px 13px;border-radius:8px;font-size:.85em;font-weight:${fw};cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0">${icon} ${label} <span style="opacity:.75;font-size:.85em;margin-left:2px">${c}</span></button>`;
  }).join('');
}

function setDocsTypeTab(type){
  docsCurrentType = type;
  renderDocsTypeTabs();
  rebuildDocsGrid();
}

function rebuildDocsGrid(){
  const filtered = docsCurrentType==='all'
    ? docsRawList
    : docsRawList.filter(d => d.doc_type === docsCurrentType);
  const empty = $g('docsEmpty');
  if(!filtered.length){
    empty.style.display='block';
    if(docsGridApi){
      docsGridApi.setGridOption('columnDefs', [...commonColsLeft(), ...colsForType(docsCurrentType), ...commonColsRight()]);
      docsGridApi.setGridOption('rowData', []);
    }
    return;
  }
  empty.style.display='none';

  const rowData = buildRowData(filtered);
  const columnDefs = [...commonColsLeft(), ...colsForType(docsCurrentType), ...commonColsRight()];

  if(docsGridApi){
    docsGridApi.setGridOption('columnDefs', columnDefs);
    docsGridApi.setGridOption('rowData', rowData);
    return;
  }

  const gridDiv = $g('docsGrid');
  if(!gridDiv)return;
  /* AG-Grid 라이브러리 로드 실패 시 fallback — 단순 HTML 테이블로라도 데이터 표시 */
  if(typeof agGrid === 'undefined'){
    const cols=[
      {f:'_typeLabel',l:'타입'},
      {f:'vendor',l:'가맹점'},
      {f:'amount',l:'금액',fmt:v=>v==null?'':Number(v).toLocaleString('ko-KR')+'원'},
      {f:'receipt_date',l:'날짜'},
      {f:'category',l:'계정'},
      {f:'_statusLabel',l:'상태'},
    ];
    const typeLabelMap=(t)=>docTypeLabelAdmin(t);
    const stLabel=(s)=>({pending:'⏳ 대기',approved:'✅ 승인',rejected:'❌ 반려',reverted:'↩︎ 취소'})[s]||s;
    const rows=rowData.map(r=>{
      r._typeLabel=typeLabelMap(r.doc_type);
      r._statusLabel=stLabel(r.status);
      return r;
    });
    let html='<div style="background:#fff7ed;border:1px solid #fcd34d;color:#92400e;padding:10px 14px;border-radius:8px;margin-bottom:10px;font-size:.82em">⚠️ 스프레드시트 라이브러리 로드 실패. 기본 테이블로 표시합니다. 네트워크 확인 후 새로고침.</div>';
    html+='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.85em;background:#fff">'
      +'<thead style="background:#f9fafb"><tr>'+cols.map(c=>'<th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e5e8eb;font-weight:700">'+c.l+'</th>').join('')+'</tr></thead>'
      +'<tbody>'+rows.map(r=>'<tr style="border-bottom:1px solid #f2f4f6">'
        +cols.map(c=>{const v=c.fmt?c.fmt(r[c.f]):(r[c.f]==null?'':r[c.f]);return '<td style="padding:8px 10px">'+e(String(v))+'</td>'}).join('')
        +'</tr>').join('')
      +'</tbody></table></div>';
    gridDiv.innerHTML=html;
    return;
  }

  const gridOptions = {
    columnDefs,
    rowData,
    defaultColDef: { sortable:true, filter:true, resizable:true },
    rowSelection: 'multiple',
    suppressRowClickSelection: true,
    animateRows: true,
    pagination: true,
    paginationPageSize: 50,
    paginationPageSizeSelector: [25, 50, 100, 200],
    enableCellTextSelection: true,
    onCellValueChanged: async (e) => {
      const d = e.data;
      let field = e.colDef.field;
      let newVal = e.newValue;
      const body = { id: d.id };
      if (field && field.startsWith('ex_')) {
        body.extra_patch = { [field.slice(3)]: newVal };
      } else {
        body[field] = newVal;
      }
      try{
        await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=update',{
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify(body)
        });
        // doc_type 바뀌면 raw 리스트 업데이트 + 탭 재계산
        if(field==='doc_type'){
          const idx=docsRawList.findIndex(x=>x.id===d.id);
          if(idx>=0)docsRawList[idx].doc_type=newVal;
          renderDocsTypeTabs();
          // 현재 탭에 해당 타입이 아니면 row 사라져야 하니 재빌드
          rebuildDocsGrid();
        }
      }catch(err){ alert('저장 실패: '+err.message) }
    },
  };
  docsGridApi = agGrid.createGrid(gridDiv, gridOptions);
}

function renderDocsTable(docs){
  docsRawList = docs || [];
  renderDocsTypeTabs();
  rebuildDocsGrid();
}

// 승인 취소 — 편집 가능한 pending 상태로 복원
async function revertDocApproval(docId){
  if(!docId)return;
  if(!confirm('이 문서의 승인을 취소하시겠어요?\n(편집 가능한 \'대기\' 상태로 돌아갑니다)'))return;
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=revert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:docId})});
    const d=await r.json();
    if(d.ok){
      if(typeof showAdminToast==='function')showAdminToast('↺ 승인 취소됨 — 편집 가능');
      loadDocsTab();
    } else alert('실패: '+(d.error||'unknown'));
  }catch(e){alert('오류: '+e.message)}
}

// 문서로 잘못 분류된 것을 일반 사진으로 되돌리기 (관리자)
async function revertDocToPhotoAdmin(docId){
  if(!docId)return;
  if(!confirm('이 문서 분류를 취소하고 일반 사진으로 되돌리시겠어요?\n(상담방 메시지가 [DOC]에서 [IMG]로 바뀝니다)'))return;
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=revert_to_photo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:docId})});
    const d=await r.json();
    if(d.ok){
      if(typeof showAdminToast==='function')showAdminToast('📷 사진으로 되돌렸습니다');
      if(typeof loadRoomDetail==='function')loadRoomDetail();
      if(typeof loadDocsTab==='function')loadDocsTab();
    } else alert('실패: '+(d.error||'unknown'));
  }catch(e){alert('오류: '+e.message)}
}
async function convertDocToFileAdmin(docId){
  if(!docId)return;
  if(!confirm('이 영수증을 일반 파일 메시지로 변환할까요?'))return;
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=convert_to_file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:docId})});
    const d=await r.json();
    if(d.ok){
      if(typeof showAdminToast==='function')showAdminToast('📁 파일로 변환됨');
      if(typeof loadRoomDetail==='function')loadRoomDetail();
      if(typeof loadDocsTab==='function')loadDocsTab();
    } else alert('실패: '+(d.error||'unknown'));
  }catch(e){alert('오류: '+e.message)}
}
async function deleteDocAdmin(docId){
  if(!docId)return;
  if(!confirm('이 문서를 완전 삭제할까요?\n\nR2 원본 파일 + DB 기록 + 상담방 메시지 모두 제거됩니다.\n(되돌릴 수 없음)'))return;
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:docId})});
    const d=await r.json();
    if(d.ok){
      if(typeof showAdminToast==='function')showAdminToast('🗑️ 삭제 완료');
      if(typeof loadRoomDetail==='function')loadRoomDetail();
      if(typeof loadDocsTab==='function')loadDocsTab();
    } else alert('실패: '+(d.error||'unknown'));
  }catch(e){alert('오류: '+e.message)}
}
async function convertMsgToReceiptAdmin(messageId){
  hideMsgCtxMenu();
  if(!messageId||!currentRoomId)return;
  if(!confirm('이 메시지를 영수증으로 변환할까요?\n(사진은 AI가 자동 인식, 파일은 수동 편집)'))return;
  if(typeof showAdminToast==='function')showAdminToast('🤖 변환 중...');
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=convert_to_receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message_id:messageId, room_id:currentRoomId})});
    const d=await r.json();
    if(d.ok){
      if(typeof showAdminToast==='function')showAdminToast('🧾 영수증으로 변환됨');
      if(typeof loadRoomDetail==='function')loadRoomDetail();
    } else alert('실패: '+(d.error||'unknown'));
  }catch(e){alert('오류: '+e.message)}
}

// AG-Grid cellRenderer에서 호출되는 래퍼 (btnEl 없이 id만으로 승인)
async function approveDocById(docId){
  if(!docId)return;
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:docId})});
    const d=await r.json();
    if(d.ok){
      let msg='✅ 승인 완료';
      if(d.alerts_created>0)msg+=` (${d.alerts_created}개 D-day 알림 예약)`;
      if(typeof showAdminToast==='function')showAdminToast(msg);
      else console.log(msg);
      loadDocsTab();
    }
    else alert('승인 실패: '+(d.error||'unknown'));
  }catch(e){alert('오류: '+e.message)}
}

function showAdminToast(msg){
  let t=document.getElementById('adminToast');
  if(!t){
    t=document.createElement('div');t.id='adminToast';
    t.style.cssText='position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:rgba(0,0,0,.82);color:#fff;padding:10px 18px;border-radius:20px;font-size:.85em;z-index:11001;pointer-events:none;opacity:0;transition:opacity .2s';
    document.body.appendChild(t);
  }
  t.textContent=msg;t.style.opacity='1';
  setTimeout(()=>{t.style.opacity='0'},1800);
}

async function openDocDetailAdmin(id){
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&id='+id);
    const d=await r.json();
    if(d.error){alert(d.error);return}
    const doc=d.document;
    const imgUrl='/api/image?k='+encodeURIComponent(doc.image_key||'');
    const info=[
      '타입: '+docTypeLabelAdmin(doc.doc_type),
      '상태: '+(doc.status||''),
      '가맹점: '+(doc.vendor||'-'),
      '금액: '+(doc.amount!=null?(doc.amount).toLocaleString('ko-KR')+'원':'-'),
      '날짜: '+(doc.receipt_date||'-'),
      '카테고리: '+(doc.category||'-'),
      '신뢰도: '+(doc.ocr_confidence!=null?Math.round(doc.ocr_confidence*100)+'%':'-'),
      doc.reject_reason?'반려사유: '+doc.reject_reason:'',
      doc.note?'메모: '+doc.note:'',
    ].filter(Boolean).join('\n');
    if(confirm(info+'\n\n[확인] 원본사진 보기 / [취소] 닫기'))openImgViewer(imgUrl,[imgUrl]);
  }catch(e){alert('오류: '+e.message)}
}

/* 위하고 표준 전표 CSV export — 가능하면 "다른 이름으로 저장" 대화창 */
async function exportWehago(){
  const month=$g('docsFilterMonth').value||new Date().toISOString().substring(0,7);
  const userId=$g('docsFilterUser').value.trim();
  if(!confirm('['+month+'] 월 승인된 문서를 위하고 전표 CSV로 다운로드합니다.\n계속할까요?'))return;
  try{
    let url='/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=export&format=wehago&month='+encodeURIComponent(month);
    if(userId)url+='&user_id='+encodeURIComponent(userId);
    const r=await fetch(url);
    if(!r.ok){const t=await r.text();alert('export 실패: '+t);return}
    const blob=await r.blob();
    const filename='wehago_'+month+(userId?'_u'+userId:'')+'.csv';
    await saveBlobAs(blob, filename, 'text/csv');
  }catch(e){alert('오류: '+e.message)}
}

/* 파일 저장 헬퍼 — Chrome/Edge는 Save As 대화창, 그 외는 기본 다운로드 */
async function saveBlobAs(blob, suggestedName, mimeType){
  // Chrome/Edge Save As picker
  if(window.showSaveFilePicker){
    try{
      const ext = suggestedName.split('.').pop();
      const types = [];
      if(mimeType==='text/csv') types.push({description:'CSV 파일',accept:{'text/csv':['.csv']}});
      else if(mimeType&&mimeType.indexOf('image')===0) types.push({description:'이미지',accept:{[mimeType]:['.'+ext]}});
      else types.push({description:'파일',accept:{'application/octet-stream':['.'+ext]}});
      const handle = await window.showSaveFilePicker({ suggestedName, types });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      if(typeof showAdminToast==='function')showAdminToast('💾 저장 완료: '+handle.name);
      return;
    }catch(err){
      if(err && err.name==='AbortError') return; // 사용자 취소
      // 폴백
    }
  }
  // Fallback: 기본 다운로드
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=suggestedName;
  document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},200);
}

/* ===== ⭐ 메시지 북마크 (#6) ===== */
async function doToggleBookmark(messageId){
  if(!currentRoomId||!messageId){hideMsgCtxMenu();return}
  hideMsgCtxMenu();
  /* 이미 북마크인지 확인하려고 목록 조회 — 작은 방이라 OK. 큰 방은 개선 여지 */
  try{
    const listR=await fetch('/api/admin-bookmark?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId));
    const listD=await listR.json();
    const exists=(listD.items||[]).some(it=>Number(it.message_id)===Number(messageId));
    if(exists){
      const r=await fetch('/api/admin-bookmark?key='+encodeURIComponent(KEY)+'&action=remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message_id:messageId})});
      const d=await r.json();
      if(d.ok)_adminShowToast('⭐ 북마크 해제');
      else alert('실패: '+(d.error||'unknown'));
    } else {
      const r=await fetch('/api/admin-bookmark?key='+encodeURIComponent(KEY)+'&action=add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId, message_id:messageId})});
      const d=await r.json();
      if(d.ok)_adminShowToast('⭐ 북마크 저장');
      else alert('실패: '+(d.error||'unknown'));
    }
    /* 현재 열린 북마크 패널이면 목록 새로고침 */
    const bm=document.getElementById('riBookmarkPanel');
    if(bm && bm.style.display!=='none')loadRoomBookmarks();
  }catch(err){alert('오류: '+err.message)}
}
async function loadRoomBookmarks(){
  const el=$g('riBookmarkList');if(!el||!currentRoomId)return;
  el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-bookmark?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId));
    const d=await r.json();
    const items=(d.items||[]).filter(it=>it.content!=null);
    if(!items.length){el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">북마크한 메시지가 없습니다.<br>메시지를 꾹 누르면 "⭐ 북마크" 메뉴가 나옵니다.</div>';return}
    el.innerHTML=items.map(function(it){
      const who=it.role==='human_advisor'?'👨‍💼 세무사':it.role==='assistant'?'🤖 AI':'👤 '+(it.real_name||it.name||'사용자');
      let content=String(it.content||'');
      const imgMatch=content.match(/^\[IMG\]\S+\n?([\s\S]*)$/);
      if(imgMatch)content='[사진] '+imgMatch[1];
      const fileMatch=content.match(/^\[FILE\](\{[^\n]+\})\n?([\s\S]*)$/);
      if(fileMatch){try{const o=JSON.parse(fileMatch[1]);content='[파일] '+(o.name||'')+' '+(fileMatch[2]||'')}catch{}}
      const preview=e(content).slice(0,200);
      return '<div style="padding:10px 12px;background:#fff;border:1px solid #e5e8eb;border-radius:8px;margin-bottom:8px;display:flex;gap:8px">'
        +'<div style="flex:1;min-width:0;cursor:pointer" onclick="jumpFromBookmark('+it.message_id+')" title="클릭하면 원본 메시지로 이동">'
        +'<div style="font-size:.72em;color:#8b95a1;margin-bottom:4px">'+who+' · '+e(it.created_at||'')+' · <span style="color:#3182f6">↗ 이동</span></div>'
        +'<div style="font-size:.85em;color:#191f28;white-space:pre-wrap;word-break:break-word">'+preview+'</div>'
        +'</div>'
        +'<button onclick="removeBookmark('+it.message_id+')" style="background:#fee2e2;color:#f04452;border:none;padding:4px 10px;border-radius:6px;font-size:.72em;cursor:pointer;font-family:inherit;flex-shrink:0;align-self:flex-start">해제</button>'
        +'</div>';
    }).join('');
  }catch(err){el.innerHTML='<div style="color:#f04452;font-size:.8em;padding:20px">오류: '+e(err.message)+'</div>'}
}
async function removeBookmark(messageId){
  try{
    const r=await fetch('/api/admin-bookmark?key='+encodeURIComponent(KEY)+'&action=remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message_id:messageId})});
    const d=await r.json();
    if(d.ok)loadRoomBookmarks();
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}
function jumpFromBookmark(mid){
  const m=$g('roomInfoModal');if(m)m.style.display='none';
  setTimeout(function(){if(typeof jumpToOriginalMsgAdmin==='function')jumpToOriginalMsgAdmin(String(mid))},80);
}

/* ===== 🕒 예약 발송 (#4) ===== */
function _pad2(n){return String(n).padStart(2,'0')}
function _fmtDateLocal(d){return d.getFullYear()+'-'+_pad2(d.getMonth()+1)+'-'+_pad2(d.getDate())}
function _fmtTimeLocal(d){return _pad2(d.getHours())+':'+_pad2(d.getMinutes())}
function openScheduleSend(){
  if(!currentRoomId){alert('상담방을 먼저 선택하세요');return}
  const inp=$g('roomInput');
  const content=(inp&&inp.value||'').trim();
  if(!content){alert('예약할 내용을 입력창에 먼저 쓰신 뒤 🕒 를 눌러주세요');return}
  $g('schedPreview').textContent=content;
  /* 기본: 15분 뒤 */
  const d=new Date(Date.now()+15*60*1000);
  $g('schedDate').value=_fmtDateLocal(d);
  $g('schedTime').value=_fmtTimeLocal(d);
  $g('scheduleSendModal').style.display='flex';
  loadScheduledList();
}
function closeScheduleSend(){
  const m=$g('scheduleSendModal');if(m)m.style.display='none';
}
function schedQuick(minutes){
  const d=new Date(Date.now()+minutes*60*1000);
  $g('schedDate').value=_fmtDateLocal(d);
  $g('schedTime').value=_fmtTimeLocal(d);
}
function schedQuickAt(hour, daysAhead){
  const d=new Date();
  d.setDate(d.getDate()+(daysAhead||0));
  d.setHours(hour,0,0,0);
  $g('schedDate').value=_fmtDateLocal(d);
  $g('schedTime').value=_fmtTimeLocal(d);
}
async function submitScheduleSend(){
  if(!currentRoomId)return;
  const date=$g('schedDate').value;
  const time=$g('schedTime').value;
  const content=$g('schedPreview').textContent;
  if(!date||!time){alert('날짜·시각을 입력하세요');return}
  const when=date+' '+time+':00';
  const target=new Date(date+'T'+time+':00').getTime();
  if(target<=Date.now()){alert('예약 시각은 현재 이후여야 합니다');return}
  try{
    const r=await fetch('/api/admin-schedule?key='+encodeURIComponent(KEY)+'&action=create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId, content:content, scheduled_at:when})});
    const d=await r.json();
    if(!d.ok){alert('예약 실패: '+(d.error||'unknown'));return}
    /* 입력창 비우고 모달 유지 (목록 갱신) */
    const inp=$g('roomInput');if(inp){inp.value='';inp.style.height='auto'}
    $g('schedPreview').textContent='';
    _adminShowToast('🕒 예약 등록됨 ('+when+')');
    loadScheduledList();
  }catch(err){alert('오류: '+err.message)}
}
async function loadScheduledList(){
  const el=$g('schedList');if(!el||!currentRoomId)return;
  el.innerHTML='불러오는 중...';
  try{
    const r=await fetch('/api/admin-schedule?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId));
    const d=await r.json();
    const items=(d.items||[]);
    if(!items.length){el.innerHTML='<div style="color:#8b95a1">예약된 항목 없음</div>';return}
    el.innerHTML=items.map(function(it){
      const preview=String(it.content||'').slice(0,80).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return '<div style="padding:8px 10px;background:#f9fafb;border:1px solid #e5e8eb;border-radius:8px;margin-bottom:6px;display:flex;gap:8px;align-items:flex-start">'
        +'<div style="flex:1;min-width:0"><div style="font-size:.78em;color:#3182f6;font-weight:700">🕒 '+e(it.scheduled_at||'')+'</div>'
        +'<div style="font-size:.82em;color:#191f28;white-space:pre-wrap;word-break:break-word;margin-top:3px">'+preview+(it.content.length>80?'...':'')+'</div></div>'
        +'<button onclick="cancelScheduled('+it.id+')" style="background:#fee2e2;color:#f04452;border:none;padding:4px 10px;border-radius:6px;font-size:.72em;cursor:pointer;font-family:inherit;flex-shrink:0">취소</button>'
        +'</div>';
    }).join('');
  }catch(err){el.innerHTML='<div style="color:#f04452">오류: '+e(err.message)+'</div>'}
}
async function cancelScheduled(id){
  if(!confirm('이 예약을 취소할까요?'))return;
  try{
    const r=await fetch('/api/admin-schedule?key='+encodeURIComponent(KEY)+'&action=cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id})});
    const d=await r.json();
    if(!d.ok){alert('취소 실패: '+(d.error||'unknown'));return}
    loadScheduledList();
  }catch(err){alert('오류: '+err.message)}
}

/* 예약 발송 트리거: 주기적으로 서버에 '만료된 것 실행' 요청.
   Cloudflare Pages 자체 cron 미지원 이슈 회피 — 관리자가 열어둔 동안 클라이언트가 cron 역할 */
async function runDueSchedules(){
  try{
    const r=await fetch('/api/admin-schedule?key='+encodeURIComponent(KEY)+'&action=run_due',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const d=await r.json();
    if(d && d.sent>0){
      /* 발송된 것이 있으면 현재 방 메시지 새로고침 */
      if(typeof loadRoomDetail==='function' && currentRoomId)loadRoomDetail();
      if(typeof loadRoomList==='function')loadRoomList();
    }
  }catch(_){}
}
(function(){
  if(window._schedRunBound)return;window._schedRunBound=true;
  /* 로드 직후 1회, 이후 60초마다 */
  setTimeout(runDueSchedules, 3000);
  setInterval(runDueSchedules, 60*1000);
})();

/* ===== 👤 상담방 멤버 꾹 눌러 거래 종료 메뉴 (d) ===== */
function _bindRoomMemberLongPress(){
  const root=document.getElementById('roomMembers');if(!root)return;
  if(root.dataset.mlpBound)return;
  root.dataset.mlpBound='1';
  let lpTimer=null, lpTarget=null, lpX=0, lpY=0;
  root.addEventListener('touchstart',function(e){
    const sp=e.target.closest('.room-member');if(!sp)return;
    const t=e.touches[0];lpX=t.clientX;lpY=t.clientY;lpTarget=sp;
    lpTimer=setTimeout(()=>{lpTimer=null;window._lpJustFired=true;setTimeout(()=>{window._lpJustFired=false},600);_showMemberCtx(sp, lpX, lpY)},500);
  },{passive:true});
  root.addEventListener('touchmove',function(e){
    if(lpTimer){const t=e.touches[0];if(Math.abs(t.clientX-lpX)>8||Math.abs(t.clientY-lpY)>8){clearTimeout(lpTimer);lpTimer=null}}
  },{passive:true});
  root.addEventListener('touchend',()=>{if(lpTimer){clearTimeout(lpTimer);lpTimer=null}});
  root.addEventListener('contextmenu',function(e){
    const sp=e.target.closest('.room-member');if(!sp)return;
    e.preventDefault();
    _showMemberCtx(sp, e.clientX, e.clientY);
  });
}
function _showMemberCtx(spanEl, x, y){
  const uid=parseInt(spanEl.getAttribute('data-uid')||'0',10);
  const nm=spanEl.getAttribute('data-name')||'';
  if(!uid)return;
  let m=document.getElementById('memberCtxMenu');
  if(!m){
    m=document.createElement('div');m.id='memberCtxMenu';
    m.style.cssText='position:fixed;min-width:170px;background:#fff;border:1px solid #e5e8eb;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.14);z-index:12000;padding:4px;display:none';
    document.body.appendChild(m);
    document.addEventListener('click',function(ev){
      if(ev.target.closest('#memberCtxMenu'))return;
      m.style.display='none';
    });
  }
  m.innerHTML='<div style="padding:8px 10px;font-size:.8em;color:#6b7280;border-bottom:1px solid #f2f4f6">'+e(nm||'user#'+uid)+'</div>'
    +'<button onclick="document.getElementById(\'memberCtxMenu\').style.display=\'none\';openCustomerDashboard('+uid+')" style="display:block;width:100%;text-align:left;background:none;border:none;padding:8px 10px;font-size:.85em;cursor:pointer;font-family:inherit">📋 거래처 정보</button>'
    +'<button onclick="document.getElementById(\'memberCtxMenu\').style.display=\'none\';terminateUser('+uid+',\''+escAttr(nm).replace(/\'/g,'')+'\')" style="display:block;width:100%;text-align:left;background:none;border:none;padding:8px 10px;font-size:.85em;cursor:pointer;font-family:inherit;color:#dc2626">🚫 거래 종료</button>';
  m.style.display='block';
  const rect=m.getBoundingClientRect();
  const vw=window.innerWidth, vh=window.innerHeight;
  const left=Math.max(8, Math.min(x-rect.width/2, vw-rect.width-8));
  let top=Math.max(8, Math.min(y-rect.height-8, vh-rect.height-8));
  if(y-rect.height-8<8)top=Math.min(y+8, vh-rect.height-8);
  m.style.left=left+'px';m.style.top=top+'px';
  if(navigator.vibrate)try{navigator.vibrate(15)}catch{}
}

/* ===== 🏢 거래처 탭 업체/사용자 모드 토글 + 업체 대시보드 — admin-business-tab.js 분리 (Step 3) =====
 * setClientTabMode / _clientTabMode / _bizListCache 모두 admin-business-tab.js 로 이전.
 * 의존: $g, _doClientSearch 는 admin.js cross-script. */

/* 업체 list / 새 업체 모달 / 업체 dashboard / _bd* 헬퍼 — admin-business-tab.js 로 분리 (Step 3)
 * 분리 함수: onBizSearchInput / loadBusinessList / _renderBizList
 *           openNewBusinessModal / closeNewBusinessModal / _nbOpenAddressSearch / _nbUpdateFiscalTerm / submitNewBusiness
 *           openBusinessDashboard / _openBusinessDashboardLegacy
 *           _bdLoadMemos / _bdAddMemo / _bdCloseMemoModal / _bdSubmitMemo / _bdDeleteMemo + ESC handler
 *           _bdRunBusinessSummary / _bdKV / closeBusinessDashboard / _bdEditBasic
 *           _bdAddMember / _bdChangeRole / _bdTogglePrimary / _bdRemoveMember
 * 분리 상태: _bizSearchT / _bdCurrent (var, classic script global)
 * 의존: KEY / $g / e / escAttr / _ensureRoomLabels / _calcFiscalTerm / openRoom / tab
 *       / _summaryMode / _customerSummaryUserId / _customerSummaryBusinessId
 *       / _lastSummaryText / _lastSummaryJson / _lastSummaryRange / _setSummaryRangeUI */
async function _legacyBusinessTabRemoved(){
  /* 본문 통째 admin-business-tab.js 에 이전 — 본 placeholder 는 라인 번호 보호용. */
  return null;
}
/* (loadBusinessList / _renderBizList / openNewBusinessModal / closeNewBusinessModal / _nbOpenAddressSearch / _nbUpdateFiscalTerm / submitNewBusiness — admin-business-tab.js 로 이전됨) */

/* (openBusinessDashboard / _openBusinessDashboardLegacy / _bd* / closeBusinessDashboard — admin-business-tab.js 로 이전됨) */

/* ===== 🚫 거래 종료 요청 큐 (owner 전용 승인 플로우) ===== */
async function _refreshTermReqBadge(){
  try{
    const r=await fetch('/api/admin-termination-requests?key='+encodeURIComponent(KEY)+'&status=pending');
    const d=await r.json();
    const btn=$g('termReqBtn'); const bd=$g('termReqBadge');
    const n=d.pending_count||0;
    if(!btn)return;
    /* owner 에게만 표시. IS_OWNER 플래그는 admin.js 초기에 세팅됨 */
    if(typeof IS_OWNER!=='undefined' && IS_OWNER && n>0){
      btn.style.display='inline-flex';
      if(bd)bd.textContent=String(n);
    } else {
      btn.style.display='none';
    }
  }catch(_){}
}
(function(){
  if(window._termReqBadgeBound)return;window._termReqBadgeBound=true;
  setTimeout(_refreshTermReqBadge, 2500);
  setInterval(_refreshTermReqBadge, 60*1000);
})();
async function openTerminationRequests(){
  /* Phase 5-20: owner 전용 — 직원이 거래종료 요청 직접 처리하면 안 됨 (CLAUDE.md 절대 규칙) */
  if(!IS_OWNER){alert('거래 종료 요청은 사장님(owner)만 처리할 수 있습니다');return}
  const m=$g('termReqModal');if(!m)return;
  m.style.display='flex';
  document.body.style.overflow='hidden';
  await _loadTermReqList();
}
function closeTerminationRequests(){
  const m=$g('termReqModal');if(m)m.style.display='none';
  document.body.style.overflow='';
}
async function _loadTermReqList(){
  const el=$g('termReqList');if(!el)return;
  el.innerHTML='<div style="text-align:center;color:#8b95a1;padding:40px 0;font-size:.88em">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-termination-requests?key='+encodeURIComponent(KEY)+'&status=pending');
    const d=await r.json();
    const items=d.items||[];
    $g('termReqCount').textContent='('+items.length+'건 대기)';
    if(!items.length){el.innerHTML='<div style="text-align:center;color:#8b95a1;padding:40px 0;font-size:.88em">🎉 승인 대기 중인 종료 요청이 없습니다</div>';return}
    el.innerHTML=items.map(function(it){
      const target=e(it.real_name||it.name||'#'+it.user_id);
      const phone=it.phone?' · '+e(it.phone):'';
      const req=e(it.requested_by_name||'직원');
      const reason=it.reason?'<div style="margin-top:6px;padding:7px 10px;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;font-size:.82em;color:#92400e"><b>요청 사유:</b> '+e(it.reason)+'</div>':'';
      return '<div style="padding:12px;border:1px solid #e5e8eb;border-radius:10px;margin-bottom:10px;background:#fff">'
        +'<div style="display:flex;align-items:flex-start;gap:8px">'
        +'<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:.95em">🏢 '+target+phone+'</div>'
        +'<div style="font-size:.75em;color:#6b7280;margin-top:2px">👤 '+req+' 직원 요청 · '+e(it.requested_at||'')+'</div>'
        +reason+'</div>'
        +'</div>'
        +'<div style="display:flex;gap:6px;margin-top:10px">'
        +'<button onclick="_termReqAction('+it.id+',\'approve\',\''+target.replace(/\'/g,'')+'\')" style="flex:1;background:#dc2626;color:#fff;border:none;padding:8px;border-radius:6px;font-size:.82em;font-weight:700;cursor:pointer;font-family:inherit">✅ 승인 (거래 종료 실행)</button>'
        +'<button onclick="_termReqAction('+it.id+',\'reject\',\''+target.replace(/\'/g,'')+'\')" style="flex:1;background:#fff;color:#6b7280;border:1px solid #6b7280;padding:8px;border-radius:6px;font-size:.82em;cursor:pointer;font-family:inherit">반려</button>'
        +'</div></div>';
    }).join('');
  }catch(err){el.innerHTML='<div style="color:#f04452;padding:20px;font-size:.85em">오류: '+e(err.message)+'</div>'}
}
async function _termReqAction(id, action, targetName){
  const actLabel=action==='approve'?'✅ 승인':'❌ 반려';
  const warn=action==='approve'?'\n\n⚠️ 승인하면 '+targetName+' 의 앱 접근이 즉시 차단되고 모든 상담방이 종료됩니다. 되돌리려면 거래처 탭에서 "🔄 거래 재개" 필요.':'';
  if(!confirm(actLabel+' 처리하시겠습니까?'+warn))return;
  const note=prompt('사유·메모 (선택):','')||null;
  try{
    const r=await fetch('/api/admin-termination-requests?key='+encodeURIComponent(KEY)+'&action='+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id, note:note})});
    const d=await r.json();
    if(!d.ok){alert('실패: '+(d.error||'unknown'));return}
    _loadTermReqList();
    _refreshTermReqBadge();
    if(typeof loadUsers==='function')loadUsers(currentStatus);
    if(typeof loadRoomList==='function')loadRoomList();
  }catch(err){alert('오류: '+err.message)}
}

/* terminateUser 호출 시 직원이면 서버가 큐 응답 반환 → 알림 */
(function wrapTerminateUser(){
  if(window._termUserWrapped)return;window._termUserWrapped=true;
  const orig=window.terminateUser;
  if(typeof orig!=='function')return;
  window.terminateUser=async function(id, displayName){
    /* 기존 로직 그대로 호출 — alert 메시지 차별화만 서버 응답 보고 */
    /* 단순화: 원본 함수는 response.d.ok 만 검사하므로 여기서 한 번 fetch 선행해 queued 확인 */
    const nm=displayName||'이 거래처';
    if(!confirm('🚫 '+nm+' 와의 거래를 종료 요청합니다.\n\n- owner(대표)는 즉시 실행됨\n- 직원은 대표 승인 대기 큐에 등록됨\n\n계속할까요?'))return;
    const reason=prompt('종료 사유 (내부 기록용, 선택):','')||null;
    try{
      const r=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:id, action:'terminate', reason:reason})});
      const d=await r.json();
      if(!d.ok){alert('실패: '+(d.error||'unknown'));return}
      if(d.queued){
        alert('✅ 거래 종료 요청이 대표 승인 대기 큐에 등록되었습니다'+(d.already_pending?' (이미 같은 대상 요청 있음)':'')+'.\n요청 ID #'+(d.request_id||'-'));
      } else {
        alert('✅ 거래 종료 완료');
      }
      if(typeof loadUsers==='function')loadUsers(currentStatus);
      if(typeof loadRoomList==='function')loadRoomList();
      if(typeof _refreshTermReqBadge==='function')_refreshTermReqBadge();
    }catch(err){alert('오류: '+err.message)}
  };
})();

/* 🔍 상담방 목록 검색 — 디바운스 */
let _roomListSearchT=null;
function onRoomListSearchInput(){
  if(_roomListSearchT)clearTimeout(_roomListSearchT);
  _roomListSearchT=setTimeout(function(){if(typeof loadRoomList==='function')loadRoomList()}, 200);
}

/* 🏠 관리자 → 챗봇: 카톡 세션 제거 후 이동 — 본인 계정에 얽매이지 않게 */
function goToChatbotAsAdmin(){
  try{
    document.cookie='session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
    /* PWA 등에서 캐시된 user id 등도 지움 */
    try{localStorage.removeItem('currentUserId')}catch(_){}
    try{sessionStorage.removeItem('currentUserId')}catch(_){}
  }catch(_){}
  location.href='/';
}

/* ===== 🧹 중복 사업장 정리 (일회성 유틸) ===== */
async function cleanDupBiz(){
  try{
    const r=await fetch('/api/admin-clean-duplicate-businesses?key='+encodeURIComponent(KEY));
    const d=await r.json();
    if(!d.ok){alert('조회 실패: '+(d.error||'unknown'));return}
    if(!d.total_removable){alert('🎉 정리할 중복 사업장이 없습니다.');return}
    /* 요약 텍스트 */
    const lines=[];
    lines.push('🧹 중복 사업장 감지 결과');
    lines.push('영향 받는 거래처: '+d.total_users_affected+'명');
    lines.push('삭제 예정 사업장: '+d.total_removable+'개');
    lines.push('');
    for(const u of d.users.slice(0,12)){
      lines.push('• '+(u.user_name||'user#'+u.user_id));
      for(const g of u.groups){
        const keepDesc=(g.keep.company_name||'(이름없음)')+(g.keep.business_number?' · '+g.keep.business_number:'');
        lines.push('   ↳ 유지: '+keepDesc);
        for(const rm of g.remove){
          const d2=(rm.company_name||'(이름없음)')+(rm.business_number?' · '+rm.business_number:'');
          lines.push('   ✖ 삭제: '+d2);
        }
      }
    }
    if(d.users.length>12)lines.push('... (외 '+(d.users.length-12)+'명)');
    lines.push('');
    lines.push('⚠️ 실제 삭제하려면 확인하세요.');
    if(!confirm(lines.join('\n')))return;
    if(!confirm('마지막 확인: '+d.total_removable+'개 사업장을 실제로 삭제합니다. 되돌릴 수 없습니다.\n\n계속할까요?'))return;
    const r2=await fetch('/api/admin-clean-duplicate-businesses?key='+encodeURIComponent(KEY)+'&action=execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true})});
    const d2=await r2.json();
    if(!d2.ok){alert('실행 실패: '+(d2.error||'unknown'));return}
    alert('✅ '+d2.deleted+'개 사업장 삭제 완료'+(d2.primary_reassigned&&d2.primary_reassigned.length?'\n주 사업장 재지정: '+d2.primary_reassigned.length+'건':''));
    /* 현재 열린 거래처 대시보드가 있으면 새로고침 */
    if(typeof currentProfileUserId!=='undefined' && currentProfileUserId && typeof openCustomerDashboard==='function'){
      openCustomerDashboard(currentProfileUserId);
    }
  }catch(err){alert('오류: '+err.message)}
}

/* 📱 관리자/스태프 상담방 입력창 '+' 첨부 시트 — 모바일에서만 활성 */
function toggleRoomAttachSheet(){
  const sheet=document.getElementById('roomAttachSheet');
  const btn=document.getElementById('roomAttachBtn');
  if(!sheet)return;
  if(sheet.classList.contains('open')){
    closeRoomAttachSheet();
  }else{
    sheet.classList.add('open');
    if(btn)btn.classList.add('on');
  }
}
function closeRoomAttachSheet(){
  const sheet=document.getElementById('roomAttachSheet');
  const btn=document.getElementById('roomAttachBtn');
  if(sheet)sheet.classList.remove('open');
  if(btn)btn.classList.remove('on');
}
